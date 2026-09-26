/**
 * Pigeons where the city feeds them: a flock pecking on the Kabutar Khana's
 * platform, in the great mosques' courtyards and round Charminar. Walk into
 * them and they burst up and wheel overhead, then settle again; a few are
 * always circling. Two instanced meshes (folded on the ground, wings out in
 * the air), a few hundred birds at most per district.
 */

import * as THREE from "three";
import { mulberry32 } from "../props";
import type { MapData } from "./mapData";
import type { InnerSpot } from "./landmarks";
import { Parts } from "./vc";

/** Where birds gather: a ring of ground, the height it sits at, a flock size. */
export type FlockSite = { x: number; z: number; r0: number; r1: number; y: number; count: number };

type Bird = {
  site: FlockSite;
  x: number;
  z: number;
  y: number;
  yaw: number;
  /** Seconds left in the air; 0 on the ground. Circlers never land. */
  air: number;
  circler: boolean;
  /** Orbit around the site while flying. */
  angle: number;
  radius: number;
  alt: number;
  speed: number;
  phase: number;
  /** Seconds to the next hop on the ground. */
  hop: number;
  colour: number;
};

const COLOURS = [0x7c7f8a, 0x7c7f8a, 0x6d7280, 0x8b8e98, 0xefefef, 0x8a7563];

/** The places each map's pigeons gather at. */
export function flockSites(map: MapData, inners: InnerSpot[], groundAt: (x: number, z: number) => number): FlockSite[] {
  const sites: FlockSite[] = [];
  for (const l of map.landmarks) {
    if (l.model === "kabutar_khana") {
      // On the railed platform (0.5m up) and spilling round its foot.
      const r = Math.min(l.w, l.d) * 0.45;
      sites.push({ x: l.x, z: l.z, r0: 1, r1: r - 0.4, y: groundAt(l.x, l.z) + 0.5, count: 70 });
    } else if (l.model === "jama_masjid") {
      const inner = inners.find((s) => s.name === l.name);
      if (!inner) continue;
      sites.push({ x: inner.x, z: inner.z, r0: 2, r1: Math.min(l.w, l.d) * 0.18, y: groundAt(inner.x, inner.z), count: 45 });
    } else if (l.model === "charminar") {
      sites.push({ x: l.x, z: l.z, r0: Math.max(l.w, l.d) / 2 + 1.5, r1: Math.max(l.w, l.d) / 2 + 9, y: groundAt(l.x, l.z), count: 40 });
    }
  }
  return sites;
}

function pigeonGeometry(wings: boolean): THREE.BufferGeometry {
  const P = new Parts();
  P.add(new THREE.IcosahedronGeometry(0.12, 0).scale(1, 0.85, 1.6).translate(0, 0.14, 0), 0xffffff);
  P.add(new THREE.IcosahedronGeometry(0.065, 0).translate(0, 0.25, 0.16), 0xffffff);
  P.box(0.03, 0.02, 0.05, 0, 0.24, 0.23, 0xe0a060);
  P.box(0.12, 0.02, 0.12, 0, 0.15, -0.2, 0xffffff);
  if (wings) for (const s of [1, -1]) P.box(0.34, 0.02, 0.16, s * 0.2, 0.17, 0, 0xffffff);
  else P.box(0.04, 0.05, 0.04, 0, 0.025, 0, 0xe0a060).box(0.2, 0.06, 0.26, 0, 0.17, -0.02, 0xffffff);
  // A shade over life size, so a flock reads from across the street.
  return P.geometry()!.scale(1.3, 1.3, 1.3);
}

export type Flocks = { group: THREE.Group; update(dt: number, t: number, focus: THREE.Vector3): void; dispose(): void };

export function createFlocks(sites: FlockSite[], seed = 5501): Flocks {
  const group = new THREE.Group();
  group.name = "pigeons";
  const rand = mulberry32(seed);
  const birds: Bird[] = [];
  for (const site of sites) {
    for (let i = 0; i < site.count; i++) {
      const a = rand() * Math.PI * 2;
      const rr = site.r0 + rand() * (site.r1 - site.r0);
      const circler = rand() < 0.15;
      birds.push({
        site,
        x: site.x + Math.cos(a) * rr,
        z: site.z + Math.sin(a) * rr,
        y: site.y,
        yaw: rand() * Math.PI * 2,
        air: circler ? Infinity : 0,
        circler,
        angle: rand() * Math.PI * 2,
        radius: site.r1 + 4 + rand() * 10,
        alt: 7 + rand() * 9,
        speed: (0.35 + rand() * 0.25) * (rand() < 0.5 ? 1 : -1),
        phase: rand() * 10,
        hop: 1 + rand() * 6,
        colour: COLOURS[Math.floor(rand() * COLOURS.length)],
      });
    }
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const groundGeo = pigeonGeometry(false);
  const airGeo = pigeonGeometry(true);
  const ground = new THREE.InstancedMesh(groundGeo, mat, Math.max(1, birds.length));
  const air = new THREE.InstancedMesh(airGeo, mat, Math.max(1, birds.length));
  for (const m of [ground, air]) {
    m.frustumCulled = false;
    m.count = 0;
    group.add(m);
  }
  const colour = new THREE.Color();
  birds.forEach((b, i) => {
    ground.setColorAt(i, colour.setHex(b.colour));
    air.setColorAt(i, colour.setHex(b.colour));
  });

  const dummy = new THREE.Object3D();
  const scatterR = 3.5;

  return {
    group,
    update(dt, t, focus) {
      let g = 0;
      let a = 0;
      for (const b of birds) {
        const s = b.site;
        // Nobody animates pigeons a street away.
        if (Math.hypot(s.x - focus.x, s.z - focus.z) > 140) continue;
        if (b.air > 0) {
          b.air -= dt;
          b.angle += b.speed * dt;
          const tx = s.x + Math.cos(b.angle) * b.radius;
          const tz = s.z + Math.sin(b.angle) * b.radius;
          // Climb out, circle, glide down onto a new patch of the ring.
          const landing = !b.circler && b.air < 2.5;
          const ty = landing ? s.y : s.y + b.alt + Math.sin(t * 0.7 + b.phase) * 1.2;
          const k = 1 - Math.exp(-(landing ? 1.6 : 2.2) * dt);
          // Pick the patch to land on as the glide starts.
          if (landing && b.air < 2.4 && b.air + dt >= 2.4) {
            b.angle = rand() * Math.PI * 2;
            b.radius = s.r0 + rand() * (s.r1 - s.r0);
          }
          const nx = b.x + (tx - b.x) * k;
          const nz = b.z + (tz - b.z) * k;
          b.yaw = Math.atan2(nx - b.x, nz - b.z) || b.yaw;
          b.x = nx;
          b.z = nz;
          b.y += (ty - b.y) * k;
          if (b.air <= 0) {
            b.air = 0;
            b.y = s.y;
          }
          const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 13 + b.phase));
          dummy.position.set(b.x, b.y, b.z);
          dummy.rotation.set(0, b.yaw, -Math.sign(b.speed) * 0.35);
          dummy.scale.set(flap, 1, 1);
          dummy.updateMatrix();
          air.setMatrixAt(a++, dummy.matrix);
          continue;
        }
        // On the ground: peck, hop now and then, burst up if walked into.
        if (Math.hypot(b.x - focus.x, b.z - focus.z) < scatterR) {
          b.air = 6 + rand() * 7;
          b.angle = Math.atan2(b.z - s.z, b.x - s.x);
          b.radius = Math.max(b.radius, Math.hypot(b.x - s.x, b.z - s.z) + 3);
        }
        b.hop -= dt;
        if (b.hop <= 0) {
          b.hop = 1 + rand() * 5;
          b.yaw += (rand() - 0.5) * 2;
          const step = 0.3 + rand() * 0.5;
          const nx = b.x + Math.sin(b.yaw) * step;
          const nz = b.z + Math.cos(b.yaw) * step;
          const d = Math.hypot(nx - s.x, nz - s.z);
          if (d >= s.r0 && d <= s.r1) {
            b.x = nx;
            b.z = nz;
          }
        }
        const peck = Math.max(0, Math.sin(t * 5 + b.phase * 3)) * 0.45;
        dummy.position.set(b.x, b.y, b.z);
        dummy.rotation.set(peck, b.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ground.setMatrixAt(g++, dummy.matrix);
      }
      ground.count = g;
      air.count = a;
      ground.instanceMatrix.needsUpdate = true;
      air.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      groundGeo.dispose();
      airGeo.dispose();
      mat.dispose();
    },
  };
}

/** Birds currently on the ground and in the air (for tests). */
export function flockCounts(f: Flocks): { ground: number; air: number } {
  const [ground, air] = f.group.children as THREE.InstancedMesh[];
  return { ground: ground.count, air: air.count };
}
