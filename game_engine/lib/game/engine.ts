import * as THREE from "three";
import {
  buildCity, roadLines, CHOWK, WORLD_LIMIT, ROAD_W,
  type Box, type SignalMast,
} from "./city";
import type { Clutter } from "./clutter";
import { makeAuto, setSignalPhase, mulberry32 } from "./props";
import { makeMissionShopStall, makeStreetMandir } from "./assets/index";
import { makePerson, makeIdlePose, setWalkPhase, type PersonPreset } from "./people";
import {
  createVehicleMaterials, makeCar, TRAFFIC_KINDS,
  type CarKind, type VehicleMaterials,
} from "./vehicles";
import type { District } from "./districts";
import { type StreetTask, type TaskKind } from "./tasks";
import { createMaterialLibrary, type MaterialLibrary } from "./materials";
import { createRenderPipeline, type RenderPipeline } from "./render";

export type TaskSnapshot = {
  id: string;
  kind: TaskKind;
  x: number;
  z: number;
  done: boolean;
};

export type Telemetry = {
  /** Task the player can interact with right now, if any. */
  nearby: string | null;
  playerX: number;
  playerZ: number;
  /** Camera yaw in radians. The minimap rotates with it. */
  heading: number;
  tasks: TaskSnapshot[];
  speed: number;
};

const TALK_RADIUS = 4.5;
const PLAYER_RADIUS = 0.55;
const TURN_SPEED = 2.1; // radians/sec for keyboard camera turn

/**
 * GTA-style sky: a vertical gradient painted onto an inward-facing sphere.
 *
 * Resolution matters more than it looks: this strip is stretched over a
 * kilometre-wide dome, so every texel is metres tall on screen and a 256-step
 * ramp shows its steps. The grade pass dithers the final frame (see
 * fx/gradeShader.ts) which removes the rest of the banding.
 */
function makeSky(stops: readonly string[]): THREE.Mesh {
  const H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, H);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  return new THREE.Mesh(
    new THREE.SphereGeometry(WORLD_LIMIT * 2.2, 32, 24),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false })
  );
}

/**
 * Dresses each mission NPC to their job. A constable in a shirt and trousers
 * is just another pedestrian; the uniform is how the player finds them.
 */
function presetForRole(role: string): PersonPreset {
  const r = role.toLowerCase();
  if (r.includes("constable") || r.includes("police") || r.includes("officer")) return "uniform";
  if (r.includes("delivery") || r.includes("rider")) return "delivery_rider";
  if (r.includes("seller") || r.includes("amma") || r.includes("akka")) return "sari";
  if (r.includes("driver") || r.includes("wallah") || r.includes("vendor")) return "lungi";
  return "kurta_pyjama";
}

function markerColourForKind(kind: TaskKind): number {
  switch (kind) {
    case "auto":
      return 0xf5c518;
    case "shop":
      return 0xe67e22;
    case "temple":
      return 0xe74c3c;
    case "bus":
      return 0x3498db;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Vertical alpha ramp shared by every corona: bright at the ground, fading to
 * nothing at the top, so the light column reads as a glow rather than a tube
 * with a hard lid. One 2x64 canvas, built once.
 */
let coronaRamp: THREE.CanvasTexture | null = null;
function getCoronaRamp(): THREE.CanvasTexture {
  if (coronaRamp) return coronaRamp;
  const H = 64;
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, H);
  coronaRamp = new THREE.CanvasTexture(canvas);
  return coronaRamp;
}

/**
 * Classic GTA:SA mission corona: a tall additive column of light standing on a
 * glowing ground ring. Additive blending is what sells it — the column
 * brightens whatever is behind it instead of dimming it, so it reads as light,
 * and it stays visible from the far end of the street where a flat ground
 * circle is edge-on to the camera and disappears.
 */
function makeTaskBlip(color: number): THREE.Group {
  const g = new THREE.Group();
  const ramp = getCoronaRamp();

  // Two nested open cylinders (inner brighter, outer wider and fainter) fake
  // the soft radial falloff of a volumetric beam for two draw calls.
  const coronaMat = (radius: number, opacity: number) =>
    new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 5.5, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        map: ramp,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      })
    );

  const coronaInner = coronaMat(0.55, 0.85);
  coronaInner.position.y = 2.75;
  g.add(coronaInner);

  const coronaOuter = coronaMat(0.85, 0.4);
  coronaOuter.position.y = 2.75;
  g.add(coronaOuter);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 1.0, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);

  const core = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  core.rotation.x = -Math.PI / 2;
  core.position.y = 0.05;
  g.add(core);

  g.userData.coronaInner = coronaInner;
  g.userData.coronaOuter = coronaOuter;
  g.userData.blipRing = ring;
  g.userData.blipCore = core;
  return g;
}

/** Stable numeric seed from an NPC id, so a character looks the same every run. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Traffic lane offset from the road centreline. Sits inboard of the parking
 * strip (city.ts parks at ROAD_W/2 - 1.1) with a couple of metres of clearance,
 * so moving traffic never clips a parked car.
 */
const LANE_OFF = ROAD_W * 0.22;

/** Minimum bumper-to-bumper gap traffic will close to before it slows. */
const FOLLOW_GAP = 7;

/** Signal cycle, in seconds: z green, z amber, x green, x amber. */
const SIGNAL_CYCLE = [13, 2, 13, 2];

type Vehicle = {
  mesh: THREE.Group;
  line: number;
  axis: "x" | "z";
  dir: 1 | -1;
  /** Lane identity, so following logic only compares vehicles sharing tarmac. */
  laneKey: string;
  /** Free-flow speed, m/s. */
  cruise: number;
  /** Current speed, eased toward whatever the road ahead allows. */
  speed: number;
  halfLength: number;
  wheels: THREE.Object3D[];
  wheelRadius: number;
};

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private district: District;

  private player = new THREE.Group();
  private playerPos = new THREE.Vector3(CHOWK.x, 0, CHOWK.z - 16);
  private velocity = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0.28;
  private walkPhase = 0;

  private colliders: Box[] = [];
  private vehicles: Vehicle[] = [];
  private lanes = new Map<string, Vehicle[]>();
  private signals: SignalMast[] = [];
  private clutter: Clutter | null = null;
  private taskAnchors = new Map<string, THREE.Group>();
  private hostMeshes = new Map<string, THREE.Group>();
  private markers = new Map<string, THREE.Group>();
  private tasks: StreetTask[] = [];

  private keys = new Set<string>();
  /** Normalized -1..1 from an on-screen joystick (mobile). */
  private virtualFwd = 0;
  private virtualStrafe = 0;
  /** -1, 0, or 1 from mobile turn buttons (unused when VirtualJoystick is active). */
  private virtualTurn = 0;
  private touchLookId: number | null = null;
  private touchLookLastX = 0;
  private raf = 0;
  private disposed = false;
  private dragging = false;
  private done = new Set<string>();
  private canvas: HTMLCanvasElement;

  /** Set while a dialogue overlay is open, so input is ignored. */
  public paused = false;

  private onTelemetry: (t: Telemetry) => void;
  private materials!: MaterialLibrary;
  private vehicleMats = createVehicleMaterials();
  private pipeline: RenderPipeline | null = null;
  private sun!: THREE.DirectionalLight;

  constructor(
    canvas: HTMLCanvasElement,
    district: District,
    tasks: StreetTask[],
    onTelemetry: (t: Telemetry) => void
  ) {
    this.canvas = canvas;
    this.district = district;
    this.onTelemetry = onTelemetry;
    this.tasks = tasks;

    const theme = district.theme;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = theme.exposure;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, WORLD_LIMIT * 5);

    this.scene.add(makeSky(theme.sky));
    // Atmosphere is owned by the render pipeline's depth haze. Leaving
    // scene.fog on as well double-fogs and drowns the whole frame in beige.
    this.scene.fog = null;

    this.materials = createMaterialLibrary(this.renderer);
    this.buildLights();
    this.buildWorld();
    this.buildPlayer();
    this.bindInput();
  }

  /* ---------------- setup ---------------- */

  private buildLights() {
    const t = this.district.theme;

    this.scene.add(new THREE.AmbientLight(0xffffff, t.ambient));
    this.scene.add(new THREE.HemisphereLight(t.hemiSky, t.hemiGround, 0.55));

    const sun = new THREE.DirectionalLight(t.sunColour, t.sunIntensity);
    this.sun = sun;
    sun.position.set(60, 90, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);

    // Without these the ground, one huge flat quad, self-shadows across its
    // whole surface and renders solid black.
    sun.shadow.normalBias = 0.06;
    sun.shadow.bias = -0.0004;

    const c = sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -90; c.right = 90; c.top = 90; c.bottom = -90;
    // Tight near/far around the lit region keeps depth precision high.
    c.near = 20; c.far = 320;

    // Follow the player so shadows stay resolved wherever they walk.
    sun.target.position.set(CHOWK.x, 0, CHOWK.z);
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  private buildWorld() {
    const theme = this.district.theme;

    const city = buildCity(theme, this.materials, this.vehicleMats);
    this.scene.add(city.group);
    this.colliders = city.colliders;
    this.signals = city.signals;
    this.clutter = city.clutter;

    const rand = mulberry32(77);
    this.buildTraffic(rand);

    // Story NPCs stay out of the world; errands are the interactables.
    this.buildTaskSites();
  }

  /** Parked autos, stalls, temple sellers, and bus stops — each is a mission. */
  private buildTaskSites() {
    const theme = this.district.theme;

    for (const task of this.tasks) {
      const x = CHOWK.x + task.pos[0];
      const z = CHOWK.z + task.pos[1];
      const anchor = new THREE.Group();
      anchor.position.set(x, 0, z);

      const preset = presetForRole(task.role);
      const host = makePerson(
        { preset, seed: hashId(task.id), cloth1: task.colour },
        this.materials
      );
      makeIdlePose(host);
      host.position.set(0, 0.26, 0);
      anchor.add(host);
      this.hostMeshes.set(task.id, host);

      if (task.kind === "auto") {
        const auto = makeAuto(theme.autoCanopy);
        auto.rotation.y = -Math.PI / 5;
        auto.position.set(-2.2, 0.02, 0.6);
        anchor.add(auto);
        this.colliders.push({ x: x - 2.2, z: z + 0.6, hw: 1.2, hd: 2.0 });
      } else if (task.kind === "shop") {
        const canopy = theme.canopies[hashId(task.id) % theme.canopies.length];
        const stall = makeMissionShopStall(
          task.districtId,
          task.role,
          canopy,
          hashId(task.id),
          this.materials
        );
        stall.rotation.y = Math.PI / 6;
        stall.position.set(-1.4, 0, -0.8);
        anchor.add(stall);
        this.colliders.push({ x: x - 1.4, z: z - 0.8, hw: 1.4, hd: 1.2 });
      } else if (task.kind === "temple") {
        // Entrance (torana, local +z) faces the marker so the player walks up
        // to the front, not the back wall; the old Math.PI flip faced it away.
        const mandir = makeStreetMandir(undefined, hashId(task.id));
        mandir.position.set(0, 0, -2.6);
        anchor.add(mandir);
        this.colliders.push({ x, z: z - 2.6, hw: 1.9, hd: 1.7 });
        // Priest stands beside the entrance, clear of the plinth, instead of
        // on top of it inside the temple's own collider.
        host.position.set(1.5, 0.26, -0.6);
      } else if (task.kind === "bus") {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8),
          new THREE.MeshLambertMaterial({ color: 0x2c3e50 })
        );
        pole.position.set(-1.5, 1.6, 0);
        anchor.add(pole);
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.5, 0.08),
          new THREE.MeshLambertMaterial({ color: 0x2980b9 })
        );
        sign.position.set(-1.5, 2.8, 0);
        anchor.add(sign);
        this.colliders.push({ x: x - 1.5, z, hw: 0.5, hd: 0.5 });
      }

      this.scene.add(anchor);
      this.taskAnchors.set(task.id, anchor);

      const marker = makeTaskBlip(markerColourForKind(task.kind));
      marker.position.set(x, 0, z);
      this.scene.add(marker);
      this.markers.set(task.id, marker);
    }
  }

  /**
   * Traffic is placed into LANE SLOTS rather than scattered at random points on
   * the grid. There are 28 lanes (7 road lines x 2 axes x 2 directions) and
   * only a dozen or so vehicles, so dealing one vehicle per lane before
   * doubling up guarantees they start spread across the whole city instead of
   * clumping three-deep on one street — which is what the old random placement
   * did, and why the road felt simultaneously empty and congested.
   */
  private buildTraffic(rand: () => number) {
    const theme = this.district.theme;
    const lines = roadLines();

    type Lane = { line: number; axis: "x" | "z"; dir: 1 | -1 };
    const lanes: Lane[] = [];
    for (const line of lines) {
      for (const axis of ["x", "z"] as const) {
        for (const dir of [1, -1] as const) lanes.push({ line, axis, dir });
      }
    }
    // Fisher-Yates on the seeded PRNG, so the layout is stable per reload.
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }

    const fleet: ("auto" | CarKind)[] = [];
    for (let i = 0; i < theme.autos; i++) fleet.push("auto");
    for (let i = 0; i < theme.cars; i++) {
      fleet.push(TRAFFIC_KINDS[Math.floor(rand() * TRAFFIC_KINDS.length)]);
    }
    for (let i = fleet.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [fleet[i], fleet[j]] = [fleet[j], fleet[i]];
    }

    const span = WORLD_LIMIT * 2;
    const perLane = new Map<string, number>();

    fleet.forEach((kind, i) => {
      const lane = lanes[i % lanes.length];
      const key = `${lane.axis}:${lane.line}:${lane.dir}`;
      const nth = perLane.get(key) ?? 0;
      perLane.set(key, nth + 1);

      const mesh =
        kind === "auto"
          ? makeAuto(theme.autoCanopy)
          : makeCar(this.vehicleMats, { kind, seed: Math.floor(rand() * 1e6) });

      // Second and later vehicles in a lane start half a world away from the
      // first, so even a doubled-up lane is never a convoy.
      const along = -WORLD_LIMIT + ((nth * 0.5 + rand() * 0.4) % 1) * span;
      // Keep left, like actual Indian traffic.
      const off = lane.dir === 1 ? -LANE_OFF : LANE_OFF;

      if (lane.axis === "z") {
        mesh.position.set(lane.line + off, 0.02, along);
        mesh.rotation.y = lane.dir === 1 ? 0 : Math.PI;
      } else {
        mesh.position.set(along, 0.02, lane.line - off);
        mesh.rotation.y = lane.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      }

      const cruise = (kind === "auto" ? 6.5 : 8.5) + rand() * 4;
      const v: Vehicle = {
        mesh,
        line: lane.line,
        axis: lane.axis,
        dir: lane.dir,
        laneKey: key,
        cruise,
        speed: cruise,
        halfLength: (mesh.userData.halfLength as number) ?? 2,
        wheels: (mesh.userData.wheels as THREE.Object3D[]) ?? [],
        wheelRadius: (mesh.userData.wheelRadius as number) ?? 0.33,
      };

      this.scene.add(mesh);
      this.vehicles.push(v);
      if (!this.lanes.has(key)) this.lanes.set(key, []);
      this.lanes.get(key)!.push(v);
    });
  }

  private buildPlayer() {
    this.player = makePerson(
      {
        preset: "shirt_trousers",
        seed: 4242,
        cloth1: 0x2980b9,
        skin: 0xa0673b,
        carryProp: false,
      },
      this.materials
    );
    makeIdlePose(this.player);
    this.player.position.copy(this.playerPos);
    this.scene.add(this.player);
  }

  private bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.canvas.addEventListener("touchend", this.onTouchEnd);
    this.canvas.addEventListener("touchcancel", this.onTouchEnd);
    window.addEventListener("resize", this.onResize);
  }

  /** Drive movement from a virtual joystick (values in roughly -1..1). */
  public setVirtualMove(fwd: number, strafe: number) {
    this.virtualFwd = fwd;
    this.virtualStrafe = strafe;
  }

  public setMobileTurn(dir: number) {
    this.virtualTurn = dir;
  }

  public applyTouchLook(dx: number, _dy: number) {
    this.yaw -= dx * 0.004;
  }

  /** One-finger drag on the canvas (mobile look). */
  public setTouchLook(id: number | null, clientX?: number) {
    if (id === null) {
      this.touchLookId = null;
      return;
    }
    if (this.touchLookId === null && clientX !== undefined) {
      this.touchLookId = id;
      this.touchLookLastX = clientX;
      return;
    }
    if (this.touchLookId === id && clientX !== undefined) {
      const dx = clientX - this.touchLookLastX;
      this.touchLookLastX = clientX;
      this.yaw -= dx * 0.004;
    }
  }

  /**
   * True when the player is typing. The engine listens on window, so without
   * this it swallows Space and the arrow keys while the chat input has focus.
   */
  private static isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (Game.isTyping(e)) return;

    this.keys.add(e.code);

    // Stop Space and the arrows scrolling the page behind the canvas, but only
    // while the world actually has input.
    if (
      !this.paused &&
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)
    ) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    // Always clear, even mid-typing, so a key held before focusing the input
    // does not stay stuck down.
    this.keys.delete(e.code);
  };

  private onMouseDown = () => {
    if (this.paused) return;
    this.dragging = true;
    if (!Game.prefersTouch()) this.canvas.requestPointerLock?.();
  };

  private static prefersTouch(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  }

  private onTouchStart = (e: TouchEvent) => {
    if (this.paused || Game.prefersTouch() === false) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    this.setTouchLook(t.identifier, t.clientX);
  };

  private onTouchMove = (e: TouchEvent) => {
    if (this.paused || this.touchLookId === null) return;
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      if (t.identifier === this.touchLookId) {
        e.preventDefault();
        this.setTouchLook(t.identifier, t.clientX);
        break;
      }
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    if (this.touchLookId === null) return;
    const stillDown = Array.from(e.touches).some((t) => t.identifier === this.touchLookId);
    if (!stillDown) this.setTouchLook(null);
  };

  private onMouseUp = () => {
    this.dragging = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.paused) return;
    // Works both with pointer lock and as a plain drag, so looking around
    // never depends on the lock being granted.
    if (!document.pointerLockElement && !this.dragging) return;
    this.yaw -= e.movementX * 0.0024;
    this.pitch = THREE.MathUtils.clamp(this.pitch + e.movementY * 0.0018, -0.15, 0.85);
  };

  private onResize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline?.resize(w, h);
  };

  /* ---------------- collision ---------------- */

  private blocked(x: number, z: number): boolean {
    if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return true;
    if (
      this.colliders.some(
        (b) =>
          Math.abs(x - b.x) < b.hw + PLAYER_RADIUS &&
          Math.abs(z - b.z) < b.hd + PLAYER_RADIUS
      )
    ) {
      return true;
    }
    return this.vehicles.some((v) => {
      const px = v.mesh.position.x;
      const pz = v.mesh.position.z;
      const hw = v.axis === "z" ? 1.05 : v.halfLength;
      const hd = v.axis === "z" ? v.halfLength : 1.05;
      return (
        Math.abs(x - px) < hw + PLAYER_RADIUS &&
        Math.abs(z - pz) < hd + PLAYER_RADIUS
      );
    });
  }

  /* ---------------- loop ---------------- */

  public start() {
    this.onResize();

    // Built here rather than in the constructor: the composer's render targets
    // must be sized from the real canvas, which onResize() has just set.
    if (!this.pipeline) {
      this.pipeline = createRenderPipeline(
        this.renderer,
        this.scene,
        this.camera,
        this.sun,
        this.district.id
      );
    }
    const tick = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      // Clamped so an alt-tabbed tab doesn't teleport everything on return.
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.update(dt);

      // Keep the shadow frustum on the player, otherwise a frustum wide enough
      // for the whole city gives soft mush everywhere.
      this.pipeline?.focusShadows(this.playerPos);

      if (this.pipeline) this.pipeline.render(dt);
      else this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  private update(dt: number) {
    const t = this.clock.elapsedTime;

    this.updateSignals();
    this.updateTraffic(dt);

    if (!this.paused) {
      this.updateLook(dt);
      this.updatePlayer(dt);
      this.resolveVehicleOverlap();
    }
    this.updateCamera(dt);

    for (const [id, m] of this.markers) {
      const done = this.done.has(id);
      const colour = done
        ? 0x2ecc71
        : markerColourForKind(this.tasks.find((tk) => tk.id === id)?.kind ?? "auto");
      const pulse = 0.5 + Math.sin(t * 2.8) * 0.12;

      const ring = m.userData.blipRing as THREE.Mesh | undefined;
      const core = m.userData.blipCore as THREE.Mesh | undefined;
      const inner = m.userData.coronaInner as THREE.Mesh | undefined;
      const outer = m.userData.coronaOuter as THREE.Mesh | undefined;

      // Slow counter-rotation of the two corona shells: the moving seams are
      // what make the column shimmer like light instead of sitting like glass.
      if (inner) {
        inner.rotation.y = t * 0.7;
        (inner.material as THREE.MeshBasicMaterial).color.setHex(colour);
        (inner.material as THREE.MeshBasicMaterial).opacity = done ? 0.3 : 0.7 + pulse * 0.3;
      }
      if (outer) {
        outer.rotation.y = -t * 0.45;
        (outer.material as THREE.MeshBasicMaterial).color.setHex(colour);
        (outer.material as THREE.MeshBasicMaterial).opacity = done ? 0.15 : 0.3 + pulse * 0.2;
        outer.scale.set(1 + pulse * 0.1, 1, 1 + pulse * 0.1);
      }
      if (ring) {
        (ring.material as THREE.MeshBasicMaterial).color.setHex(colour);
        (ring.material as THREE.MeshBasicMaterial).opacity = done ? 0.3 : 0.45 + pulse * 0.3;
        ring.scale.setScalar(0.95 + pulse * 0.18);
      }
      if (core) {
        (core.material as THREE.MeshBasicMaterial).color.setHex(colour);
        (core.material as THREE.MeshBasicMaterial).opacity = done ? 0.25 : 0.4 + pulse * 0.25;
      }
    }

    // Errand hosts turn to face the player when they are close enough to talk.
    for (const [id, mesh] of this.hostMeshes) {
      const anchor = this.taskAnchors.get(id)!;
      const wx = anchor.position.x;
      const wz = anchor.position.z;
      const d = Math.hypot(this.playerPos.x - wx, this.playerPos.z - wz);
      if (d < TALK_RADIUS * 2.2) {
        mesh.rotation.y = Math.atan2(this.playerPos.x - wx, this.playerPos.z - wz);
      }
    }

    this.emit();
  }

  /**
   * Left/right arrows swing the camera, so looking around never depends on the
   * mouse. (E is the talk key, so the usual Q/E turn pair is off the table.)
   */
  private updateLook(dt: number) {
    let turn = 0;
    if (this.keys.has("ArrowLeft")) turn += 1;
    if (this.keys.has("ArrowRight")) turn -= 1;
    if (this.virtualTurn !== 0) turn += this.virtualTurn;
    if (turn !== 0) this.yaw += turn * TURN_SPEED * dt;
  }

  private updatePlayer(dt: number) {
    const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = sprint ? 11 : 5.2;

    let fwd = this.virtualFwd;
    let strafe = this.virtualStrafe;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) fwd += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) fwd -= 1;
    if (this.keys.has("KeyA")) strafe -= 1;
    if (this.keys.has("KeyD")) strafe += 1;

    const mag = Math.hypot(fwd, strafe);
    if (mag > 1) {
      fwd /= mag;
      strafe /= mag;
    }

    // forward = (sin yaw, 0, cos yaw); right = cross(forward, up) = (-cos yaw, 0, sin yaw).
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * fwd - Math.cos(this.yaw) * strafe,
      0,
      Math.cos(this.yaw) * fwd + Math.sin(this.yaw) * strafe
    );

    const moving = dir.lengthSq() > 0.0001;
    if (moving) dir.normalize();

    this.velocity.lerp(dir.multiplyScalar(speed), 1 - Math.exp(-12 * dt));

    // Resolve each axis separately so we slide along walls instead of sticking.
    const nx = this.playerPos.x + this.velocity.x * dt;
    if (!this.blocked(nx, this.playerPos.z)) this.playerPos.x = nx;

    const nz = this.playerPos.z + this.velocity.z * dt;
    if (!this.blocked(this.playerPos.x, nz)) this.playerPos.z = nz;

    this.player.position.set(this.playerPos.x, 0.26, this.playerPos.z);

    if (moving) {
      this.player.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
      // Stride rate follows actual ground speed, so a sprint does not look like
      // a walk played fast.
      this.walkPhase += dt * (this.velocity.length() * 1.7 + 1.2);
      setWalkPhase(this.player, this.walkPhase);
    } else if (this.walkPhase !== 0) {
      this.walkPhase = 0;
      makeIdlePose(this.player);
    }
  }

  /**
   * blocked() only stops the player from walking into a vehicle — it does
   * nothing when a moving vehicle drives into a player who is standing
   * still. Push the player out to the nearest edge of any vehicle box they
   * end up inside, along whichever axis needs the smaller nudge.
   */
  private resolveVehicleOverlap() {
    for (const v of this.vehicles) {
      const px = v.mesh.position.x;
      const pz = v.mesh.position.z;
      const hw = (v.axis === "z" ? 1.05 : v.halfLength) + PLAYER_RADIUS;
      const hd = (v.axis === "z" ? v.halfLength : 1.05) + PLAYER_RADIUS;

      const dx = this.playerPos.x - px;
      const dz = this.playerPos.z - pz;
      if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;

      const overlapX = hw - Math.abs(dx);
      const overlapZ = hd - Math.abs(dz);
      if (overlapX < overlapZ) {
        this.playerPos.x = px + Math.sign(dx || 1) * hw;
      } else {
        this.playerPos.z = pz + Math.sign(dz || 1) * hd;
      }
    }
    this.player.position.set(this.playerPos.x, 0.26, this.playerPos.z);
  }

  private updateCamera(dt: number) {
    const dist = 9;
    // Kept shallow, and aimed above the player's head, a steeper angle fills
    // the lower half of the frame with empty road.
    const height = 2.8 + this.pitch * 5;

    const target = new THREE.Vector3(
      this.playerPos.x - Math.sin(this.yaw) * dist,
      height,
      this.playerPos.z - Math.cos(this.yaw) * dist
    );

    this.camera.position.lerp(target, 1 - Math.exp(-9 * dt));
    this.camera.lookAt(this.playerPos.x, 2.3, this.playerPos.z);
  }

  /**
   * Which aspect each axis of travel is showing right now. One global cycle
   * drives every junction: with a grid this regular, per-junction phases would
   * only mean a vehicle clearing one green straight into a red at the next.
   */
  private signalPhase(axis: "x" | "z"): 0 | 1 | 2 {
    const total = SIGNAL_CYCLE.reduce((a, b) => a + b, 0);
    let t = this.clock.elapsedTime % total;
    let stage = 0;
    while (t >= SIGNAL_CYCLE[stage]) {
      t -= SIGNAL_CYCLE[stage];
      stage++;
    }
    // stage: 0 z-green, 1 z-amber, 2 x-green, 3 x-amber.
    if (axis === "z") return stage === 0 ? 2 : stage === 1 ? 1 : 0;
    return stage === 2 ? 2 : stage === 3 ? 1 : 0;
  }

  private updateSignals() {
    for (const s of this.signals) setSignalPhase(s.group, this.signalPhase(s.axis));
  }

  /**
   * Traffic drives its lane, stops for its signal, and does not drive through
   * the vehicle in front. That last rule is why lanes are indexed: comparing
   * every vehicle against every other is quadratic for no benefit, since only
   * vehicles sharing a lane can ever conflict.
   */
  private updateTraffic(dt: number) {
    const lines = roadLines();
    const along = (v: Vehicle) => (v.axis === "z" ? v.mesh.position.z : v.mesh.position.x);

    for (const [, lane] of this.lanes) {
      // Sorted in the direction of travel, so index i+1 is always the vehicle
      // in front of index i.
      lane.sort((a, b) => (along(a) - along(b)) * a.dir);

      for (let i = 0; i < lane.length; i++) {
        const v = lane[i];
        const pos = along(v);
        let target = v.cruise;

        // --- signal ahead
        if (this.signalPhase(v.axis) !== 2) {
          let nearest = Infinity;
          for (const L of lines) {
            const d = (L - pos) * v.dir;
            if (d > 0 && d < nearest) nearest = d;
          }
          const stopDist = nearest - (ROAD_W / 2 + 0.9 + v.halfLength);
          if (stopDist > -0.2 && stopDist < 26) {
            target = Math.min(target, v.cruise * THREE.MathUtils.clamp(stopDist / 12, 0, 1));
            if (stopDist < 0.4) target = 0;
          }
        }

        // --- vehicle in front
        const lead = lane[i + 1];
        if (lead) {
          const gap = (along(lead) - pos) * v.dir - (v.halfLength + lead.halfLength);
          if (gap < FOLLOW_GAP) {
            target = Math.min(target, lead.speed * THREE.MathUtils.clamp(gap / FOLLOW_GAP, 0, 1));
          }
        }

        // Ease rather than snap: an instant stop reads as a glitch, and the
        // nose-dive of a car easing off is most of what sells traffic as
        // physical.
        const rate = target < v.speed ? 6 : 2.2;
        v.speed += (target - v.speed) * (1 - Math.exp(-rate * dt));

        const move = v.speed * dt * v.dir;
        if (v.axis === "z") {
          v.mesh.position.z += move;
          if (v.mesh.position.z > WORLD_LIMIT) v.mesh.position.z = -WORLD_LIMIT;
          if (v.mesh.position.z < -WORLD_LIMIT) v.mesh.position.z = WORLD_LIMIT;
        } else {
          v.mesh.position.x += move;
          if (v.mesh.position.x > WORLD_LIMIT) v.mesh.position.x = -WORLD_LIMIT;
          if (v.mesh.position.x < -WORLD_LIMIT) v.mesh.position.x = WORLD_LIMIT;
        }

        // Wheels roll at the speed the body is actually travelling.
        const spin = (v.speed * dt) / v.wheelRadius;
        for (const w of v.wheels) w.rotation.x -= spin;

        // Suspension jitter, scaled by speed so a stopped vehicle sits still.
        const jitter = Math.min(1, v.speed / v.cruise);
        v.mesh.position.y =
          0.02 + Math.sin(this.clock.elapsedTime * 11 + v.line) * 0.018 * jitter;
      }
    }
  }

  private emit() {
    let nearby: string | null = null;
    let best = TALK_RADIUS;

    const tasks: TaskSnapshot[] = this.tasks.map((task) => {
      const anchor = this.taskAnchors.get(task.id)!;
      const wx = anchor.position.x;
      const wz = anchor.position.z;
      const d = Math.hypot(this.playerPos.x - wx, this.playerPos.z - wz);
      if (d < best && !this.done.has(task.id)) {
        best = d;
        nearby = task.id;
      }
      return {
        id: task.id,
        kind: task.kind,
        x: wx,
        z: wz,
        done: this.done.has(task.id),
      };
    });

    this.onTelemetry({
      nearby,
      playerX: this.playerPos.x,
      playerZ: this.playerPos.z,
      heading: this.yaw,
      tasks,
      speed: this.velocity.length(),
    });
  }

  /* ---------------- public API ---------------- */

  /** Position readout, used by the headless end-to-end checks to navigate. */
  public get debugState() {
    return { x: this.playerPos.x, z: this.playerPos.z, yaw: this.yaw };
  }

  public markDone(npcId: string) {
    this.done.add(npcId);
  }

  public releasePointer() {
    this.dragging = false;
    this.setTouchLook(null);
    this.setVirtualMove(0, 0);
    document.exitPointerLock?.();
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);

    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("touchstart", this.onTouchStart);
    this.canvas.removeEventListener("touchmove", this.onTouchMove);
    this.canvas.removeEventListener("touchend", this.onTouchEnd);
    this.canvas.removeEventListener("touchcancel", this.onTouchEnd);
    window.removeEventListener("resize", this.onResize);

    // Instanced clutter owns its own geometry/material lifetimes; let it clean
    // up before the scene walk, which does not understand InstancedMesh.
    this.clutter?.dispose();
    this.vehicleMats.dispose();

    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });

    this.pipeline?.dispose();
    this.materials?.dispose();
    this.renderer.dispose();
  }
}
