/**
 * Rides: the auto that actually takes you somewhere, and the bus you wait
 * for, board and ride.
 *
 * Auto: when the auto errand is done, the player climbs into that auto and
 * it drives the real streets (world/route.ts) to their next errand, then
 * drops them at the kerb.
 *
 * Bus: the bus errand has no conductor standing about. Walk up to the stop
 * and a bus in the city's livery pulls in; the conductor is at the door, and
 * the ticket conversation happens there. Buy the ticket and you board, ride
 * to the next stop along the road, and step off.
 *
 * Either ride can be skipped with E.
 */

import * as THREE from "three";
import type { District } from "./districts";
import type { StreetTask } from "./tasks";
import type { VehicleMaterials } from "./vehicles";
import { CITY_TRAFFIC, makeBus } from "./transit";
import type { World } from "./world";
import type { MapData, Pt } from "./world/mapData";
import { planRoute } from "./world/route";

type Path = { pts: Pt[]; cum: number[]; len: number };

function toPath(pts: Pt[]): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}

function sample(p: Path, s: number): { x: number; z: number; yaw: number } {
  const t = Math.max(0, Math.min(p.len, s));
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < t) i++;
  const seg = p.cum[i] - p.cum[i - 1] || 1;
  const f = (t - p.cum[i - 1]) / seg;
  const [ax, az] = p.pts[i - 1];
  const [bx, bz] = p.pts[i];
  return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, yaw: Math.atan2(bx - ax, bz - az) };
}

type Moving = {
  vehicle: THREE.Group;
  path: Path;
  s: number;
  speed: number;
  cruise: number;
  yaw: number;
};

function drive(m: Moving, dt: number) {
  // Ease off for the last 25m and into sharp bends.
  const ahead = sample(m.path, m.s + 8);
  const here = sample(m.path, m.s);
  let bend = Math.abs(Math.atan2(Math.sin(ahead.yaw - here.yaw), Math.cos(ahead.yaw - here.yaw)));
  bend = Math.min(1, bend / 1.2);
  const toEnd = m.path.len - m.s;
  const target = Math.min(m.cruise * (1 - bend * 0.6), Math.max(0.6, toEnd * 0.45));
  m.speed += (target - m.speed) * (1 - Math.exp(-dt * 2));
  m.s = Math.min(m.path.len, m.s + m.speed * dt);
  // Pulled up: stop dead rather than creeping on the last few centimetres.
  if (m.s >= m.path.len) m.speed = 0;
  const p = sample(m.path, m.s);
  let d = p.yaw - m.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  m.yaw += d * (1 - Math.exp(-dt * 6));
  m.vehicle.position.set(p.x, 0.03, p.z);
  m.vehicle.rotation.y = m.yaw;
}

export type RidePose = {
  x: number;
  z: number;
  yaw: number;
  /** Where the player's body goes: seated in an auto, or out of sight in a bus. */
  seat: THREE.Vector3 | null;
};

export type RideEvent = { kind: "ended"; x: number; z: number; yaw: number };

export class Rides {
  private ride: (Moving & { taskId: string; to: string; seat: THREE.Vector3 | null; linger: number }) | null = null;
  private bus: (Moving & { taskId: string; state: "arriving" | "waiting"; conductor: THREE.Object3D | null }) | null = null;
  private busLeaving: (Moving & { t: number }) | null = null;

  constructor(
    private scene: THREE.Scene,
    private world: World,
    private map: MapData,
    private district: District,
    private vehicleMats: VehicleMaterials,
    private transitMat: THREE.Material
  ) {}

  /** Destination label while riding, for the HUD. */
  riding(): string | null {
    return this.ride ? this.ride.to : null;
  }

  /** The bus errand can only be started with a bus at the stop. */
  busReady(taskId: string): boolean {
    return this.bus?.taskId === taskId && this.bus.state === "waiting";
  }

  skip() {
    if (this.ride) this.ride.s = this.ride.path.len;
  }

  /** Where the next errand is, for the auto's destination. */
  private nextStop(from: StreetTask, tasks: StreetTask[], done: Set<string>): { x: number; z: number; label: string } {
    const open = tasks.filter((t) => t.id !== from.id && !done.has(t.id) && t.kind !== "auto");
    const pick = open.sort(
      (a, b) =>
        Math.hypot(a.pos[0] - from.pos[0], a.pos[1] - from.pos[1]) - Math.hypot(b.pos[0] - from.pos[0], b.pos[1] - from.pos[1])
    )[0];
    if (pick) return { x: pick.pos[0], z: pick.pos[1], label: pick.title };
    const lm = this.map.landmarks[0];
    return lm ? { x: lm.x, z: lm.z, label: lm.name } : { x: this.map.spawn.x, z: this.map.spawn.z, label: "the square" };
  }

  /** Put the player in the errand's auto and drive to the next errand. */
  startAuto(task: StreetTask, auto: THREE.Object3D, tasks: StreetTask[], done: Set<string>) {
    const pos = auto.getWorldPosition(new THREE.Vector3());
    const dest = this.nextStop(task, tasks, done);
    const path = planRoute(this.map, pos.x, pos.z, dest.x, dest.z, 4.2, 1.6);
    if (!path) {
      console.warn(`[rides] no route for the auto from ${task.id} to ${dest.label}`);
      return;
    }
    // Lift the auto out of the errand's set piece into the world.
    const vehicle = new THREE.Group();
    this.scene.add(vehicle);
    auto.removeFromParent();
    auto.position.set(0, 0, 0);
    auto.rotation.set(0, 0, 0);
    vehicle.add(auto);
    const p = toPath(path);
    const start = sample(p, 0);
    this.ride = {
      vehicle,
      path: p,
      s: 0,
      speed: 0,
      cruise: 8.5,
      yaw: start.yaw,
      taskId: task.id,
      to: dest.label,
      // The auto's back seat.
      seat: new THREE.Vector3(0, 0.45, -0.55),
      linger: 0,
    };
    drive(this.ride, 0);
  }

  /** Board the waiting bus and ride it to the next stop along. */
  startBus(task: StreetTask) {
    const bus = this.bus;
    if (!bus || bus.taskId !== task.id) return;
    const from = bus.vehicle.position;
    // The next stop: the nearest mapped stop far enough to be a ride that a
    // bus can actually reach, else somewhere onward along a bus-wide road.
    const stops = this.map.pois
      .filter((p) => p.kind === "bus_stop" && Math.hypot(p.x - from.x, p.z - from.z) > 140)
      .sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))
      .map((p) => ({ x: p.x, z: p.z, name: p.name ?? "the next stop" }));
    const onward = [0, 0.8, -0.8, 1.6, -1.6, Math.PI].map((turn) => ({
      x: from.x + Math.sin(bus.yaw + turn) * 200,
      z: from.z + Math.cos(bus.yaw + turn) * 200,
      name: "the next stop",
    }));
    let path: Pt[] | null = null;
    let dest = onward[0];
    for (const c of [...stops, ...onward]) {
      path = this.busRoute(from.x, from.z, c.x, c.z);
      // A ride has to go somewhere: the nearest point of a far target can
      // still be round the corner.
      if (path && toPath(path).len > 80) {
        dest = c;
        break;
      }
      path = null;
    }
    if (!path) {
      console.warn(`[rides] no onward route for the bus at ${task.id}`);
      return;
    }
    bus.conductor?.removeFromParent();
    this.ride = {
      vehicle: bus.vehicle,
      path: toPath(path),
      s: 0,
      speed: 0,
      cruise: 7,
      yaw: bus.yaw,
      taskId: task.id,
      to: dest.name,
      seat: null,
      linger: 0,
    };
    this.bus = null;
  }

  /**
   * Runs the bus service and any ride. Returns the player's pose while
   * riding, an "ended" event on the frame they step off, or null.
   */
  update(
    dt: number,
    player: THREE.Vector3,
    tasks: StreetTask[],
    done: Set<string>,
    hosts: Map<string, THREE.Object3D>
  ): RidePose | RideEvent | null {
    this.serviceBus(dt, player, tasks, done, hosts);

    if (this.busLeaving) {
      drive(this.busLeaving, dt);
      this.busLeaving.t -= dt;
      if (this.busLeaving.t <= 0 || this.busLeaving.s >= this.busLeaving.path.len) {
        this.busLeaving.vehicle.removeFromParent();
        this.busLeaving = null;
      }
    }

    const r = this.ride;
    if (!r) return null;
    drive(r, dt);
    if (r.s >= r.path.len - 0.05) {
      r.linger += dt;
      if (r.linger > 0.6) {
        // Step off on the kerb side (left of travel).
        const x = r.vehicle.position.x + Math.cos(r.yaw) * 2.2;
        const z = r.vehicle.position.z - Math.sin(r.yaw) * 2.2;
        if (!r.seat) {
          // The bus pulls away; the auto stays parked where it stopped.
          const on = planRoute(this.map, r.vehicle.position.x, r.vehicle.position.z, r.vehicle.position.x + Math.sin(r.yaw) * 160, r.vehicle.position.z + Math.cos(r.yaw) * 160, 7.5, 2.2);
          if (on) this.busLeaving = { vehicle: r.vehicle, path: toPath(on), s: 0, speed: 0, cruise: 7, yaw: r.yaw, t: 25 };
          else r.vehicle.removeFromParent();
        }
        this.ride = null;
        return { kind: "ended", x, z, yaw: r.yaw };
      }
    }
    return { x: r.vehicle.position.x, z: r.vehicle.position.z, yaw: r.yaw, seat: r.seat ? r.vehicle.localToWorld(r.seat.clone()) : null };
  }

  /** A bus road if there is one; old-city stops get squeezed into. */
  private busRoute(fx: number, fz: number, tx: number, tz: number): Pt[] | null {
    return (
      planRoute(this.map, fx, fz, tx, tz, 7.5, 2.2) ??
      planRoute(this.map, fx, fz, tx, tz, 6, 1.8) ??
      planRoute(this.map, fx, fz, tx, tz, 5, 1.3)
    );
  }

  /** Brings a bus to the stop while the player is near an open bus errand. */
  private serviceBus(dt: number, player: THREE.Vector3, tasks: StreetTask[], done: Set<string>, hosts: Map<string, THREE.Object3D>) {
    const task = tasks.find((t) => t.kind === "bus" && !done.has(t.id));
    if (this.ride || !task) return;
    const [sx, sz] = task.pos;
    const near = Math.hypot(player.x - sx, player.z - sz);

    if (!this.bus) {
      if (near > 38) return;
      // Start a couple of blocks back up the road and drive in.
      const src = this.map.nodes
        .map((n) => ({ n, d: Math.hypot(n.x - sx, n.z - sz) }))
        .filter((q) => q.d > 90 && q.d < 170)
        .sort((a, b) => a.d - b.d);
      for (const { n } of src) {
        // A proper bus road if there is one, else whatever the stop is on.
        const path = this.busRoute(n.x, n.z, sx, sz);
        if (!path) continue;
        const vehicle = new THREE.Group();
        vehicle.add(makeBus(this.vehicleMats, this.transitMat, CITY_TRAFFIC[this.district.theme.landmark].bus, 77));
        this.scene.add(vehicle);
        const p = toPath(path);
        this.bus = { vehicle, path: p, s: 0, speed: 7, cruise: 7, yaw: sample(p, 0).yaw, taskId: task.id, state: "arriving", conductor: null };
        const host = hosts.get(task.id);
        if (host) host.visible = false;
        break;
      }
      return;
    }

    const bus = this.bus;
    if (bus.state === "arriving") {
      drive(bus, dt);
      if (bus.s >= bus.path.len) {
        bus.state = "waiting";
        // The conductor steps down at the front door, kerb side.
        const host = hosts.get(task.id);
        if (host) {
          host.visible = true;
          const anchor = host.parent;
          const door = bus.vehicle.localToWorld(new THREE.Vector3(2.0, 0, 3.6));
          if (anchor) {
            anchor.position.set(door.x, this.world.height.at(door.x, door.z), door.z);
            anchor.rotation.y = 0;
            host.position.set(0, 0.03, 0);
          }
          bus.conductor = null;
        }
      }
    } else if (near > 90) {
      // Nobody boarded: the bus goes on its way and another will come.
      const host = hosts.get(task.id);
      if (host) host.visible = false;
      this.busLeaving = { ...bus, t: 20 };
      const on = planRoute(this.map, bus.vehicle.position.x, bus.vehicle.position.z, bus.vehicle.position.x + Math.sin(bus.yaw) * 160, bus.vehicle.position.z + Math.cos(bus.yaw) * 160, 7.5, 2.2);
      if (on) {
        this.busLeaving.path = toPath(on);
        this.busLeaving.s = 0;
      }
      this.bus = null;
    }
  }
}
