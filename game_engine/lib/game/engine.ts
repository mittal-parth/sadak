import * as THREE from "three";
import { createTransitMaterial } from "./transit";
import { makeAuto } from "./props";
import { buildWorld, type World } from "./world";
import { Rides } from "./rides";
import { Parts } from "./world/vc";
import { taskSpot, type MapData, type Spot } from "./world/mapData";
import { knockFrom } from "./knock";
import { attireFor } from "./attire";
import { makeHero, HeroAnimator, type HeroRig } from "./hero";
import { newBody, stepBody, SPRINT_SPEED } from "./movement";
import { makeMissionShopStall, makeStreetMandir } from "./assets/index";
import { makeBarberShop } from "./assets/barber";
import { BARBER_ENTER_RADIUS, BARBER_FACING, barberSignFor } from "./barber";
import {
  makePerson,
  makeIdlePose,
  setIdlePhase,
} from "./people";
import { createVehicleMaterials } from "./vehicles";
import type { District } from "./districts";
import { type StreetTask, type TaskKind } from "./tasks";
import { createMaterialLibrary, type MaterialLibrary } from "./materials";
import { createRenderPipeline, type RenderPipeline } from "./render";
import { presetFor } from "./fx/presets";
import { createCelifier } from "./fx/toon";
import { createSky, type SkyRig } from "./fx/sky";

export type TaskSnapshot = {
  id: string;
  kind: TaskKind;
  x: number;
  z: number;
  done: boolean;
  /** The errand's own colour, CSS hex: marker, map dot and list chip. */
  colour: string;
};

export type Telemetry = {
  /** Task the player can interact with right now, if any. */
  nearby: string | null;
  /** True when the player is in range of the barber shop (vibes-only landmark). */
  nearBarber: boolean;
  /** World position of the barber shop, for the minimap blip. */
  barber: { x: number; z: number };
  playerX: number;
  playerZ: number;
  /** Camera yaw in radians. The minimap rotates with it. */
  heading: number;
  tasks: TaskSnapshot[];
  speed: number;
  /** Where the player is being driven, while on an auto or bus. */
  ride: string | null;
};

/**
 * Per-frame player state, for consumers that need 60Hz without a React
 * render — the minimap, essentially.
 *
 * This is a single object mutated in place, never reallocated, and it is
 * deliberately NOT React state. Telemetry used to be pushed into setState on
 * every frame, which re-rendered the whole HUD tree 60 times a second inside
 * the rAF callback. Anything that needs smooth motion reads this and draws
 * from its own rAF; anything that changes rarely comes through Telemetry.
 */
export type LiveState = {
  x: number;
  z: number;
  heading: number;
  speed: number;
};

/** How often the React-facing telemetry is pushed. Changes that matter for
 *  input (the nearby task) bypass this and emit immediately. */
const TELEMETRY_HZ = 10;

const TALK_RADIUS = 4.5;
const PLAYER_RADIUS = 0.55;
const TURN_SPEED = 2.1; // radians/sec for keyboard camera turn

/** Height on the player the camera aims at. */
const PLAYER_LOOK_H = 2.3;
/** Feet sit this far above the walkable surface. */
const PLAYER_BASE_Y = 0.03;


/** Shortest-arc angular damp. Without the wrap, turning past ±π spins the
 *  long way round — the classic "character pirouettes on a heading flip". */
function dampAngle(current: number, target: number, k: number, dt: number): number {
  let delta = target - current;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  return current + delta * (1 - Math.exp(-k * dt));
}

function damp(current: number, target: number, k: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-k * dt));
}

/**
 * The marker over an errand's host: a chunky arrow pointing down at them in
 * the errand's own colour (the same colour as its dot on the map and its chip
 * in the errand list), with a dark rim so it reads against sky and wall.
 * Unlit, so the cel pass leaves the colour exactly as chosen.
 */
function makeTaskArrow(colour: number): THREE.Group {
  const shape = new THREE.Shape();
  shape.moveTo(-0.15, 0.6);
  shape.lineTo(0.15, 0.6);
  shape.lineTo(0.15, 0.2);
  shape.lineTo(0.36, 0.2);
  shape.lineTo(0, -0.26);
  shape.lineTo(-0.36, 0.2);
  shape.lineTo(-0.15, 0.2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  geo.center();
  const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colour }));
  const rim = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x14161a, side: THREE.BackSide }));
  rim.scale.setScalar(1.14);
  const g = new THREE.Group();
  g.add(rim, body);
  return g;
}

/** A ticket window: a kiosk with a counter, an open window (the clerk shows
 *  through it), a roof and a sign band. */
function makeTicketBooth(colour: number): THREE.Group {
  const P = new Parts();
  P.box(3.2, 1.1, 1.8, 0, 0.55, 0, 0xd9d2c3);
  P.box(3.4, 0.08, 0.5, 0, 1.12, 0.85, 0x8a6a4a);
  for (const x of [-1.55, -0.52, 0.52, 1.55]) P.box(0.1, 1.4, 0.1, x, 1.8, 0.62, 0x5d6168);
  P.box(3.2, 0.1, 0.1, 0, 2.45, 0.62, 0x5d6168);
  for (const x of [-1.55, 1.55]) P.box(0.08, 1.4, 1.5, x, 1.8, -0.1, 0xd9d2c3);
  P.box(3.2, 1.4, 0.08, 0, 1.8, -0.9, 0xd9d2c3);
  P.box(3.6, 0.15, 2.3, 0, 2.6, 0, 0x5d6168);
  P.box(3.2, 0.45, 0.08, 0, 2.9, 0.9, colour);
  const g = new THREE.Group();
  const m = P.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  if (m) g.add(m);
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

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private district: District;

  private player = new THREE.Group();
  private playerPos = new THREE.Vector3();
  /** Walkable surface under the player, damped so steps are climbed, not
   *  teleported up. */
  private groundY = 0;
  private velocity = new THREE.Vector3();
  private yaw = 0;
  // Lower than it was (0.28). Camera height is 2.8 + pitch * 5 while the aim
  // stays at 2.3, so a bigger pitch tilts the view further DOWN and fills the
  // bottom half of the frame with empty road — and crops the tops off the
  // landmarks the player is meant to be looking at.
  private pitch = 0.16;
  /** Facing of the body, from the movement model (movement.ts). */
  private facing = 0;
  /** The player's body: speed, heading, jump (movement.ts). */
  private body = newBody();
  /** Drives the hero's rig (hero.ts). */
  private heroAnim!: HeroAnimator;
  /** 0..1 stumble blend while knocked aside. */
  private stumble = 0;
  /** Mouse deltas accumulated between frames — see onMouseMove. */
  private pendingYaw = 0;
  private pendingPitch = 0;
  /** Damped keyboard/virtual turn rate, so arrow-turns ease in and out. */
  private turnRate = 0;
  /** Height of the feet above the ground (mirrors body.y for the camera). */
  private jumpY = 0;
  /** Set by the Space keydown, consumed on the next tick. */
  private jumpQueued = false;
  /** 0 grounded, 1 fully airborne — blends the tucked-legs pose. */
  private air = 0;

  // Scratch vectors. These run every frame; allocating them fresh was pure GC
  // churn at 60Hz.
  private tmpMarker = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpCam = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private camFov = 55;
  /** Fraction of the full chase distance the camera may use (see updateCamera). */
  private camReach = 1;

  private map: MapData;
  private world!: World;
  private rides!: Rides;
  /** Each auto errand's auto, which the player rides once it is done. */
  private taskAutos = new Map<string, THREE.Object3D>();
  private spawn: Spot;
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
  /** See LiveState — mutated every frame, read by the minimap's own rAF. */
  public readonly live: LiveState = { x: 0, z: 0, heading: 0, speed: 0 };
  private telemetryAccum = 0;
  private lastNearby: string | null = null;
  private lastNearBarber = false;
  /** Shove from a vehicle, m/s, decaying; and how long the stumble lasts. */
  private knock = new THREE.Vector3();
  private stagger = 0;
  private knockCooldown = 0;
  private barberWorld = { x: 0, z: 0 };
  private materials!: MaterialLibrary;
  private vehicleMats = createVehicleMaterials();
  /** Vertex-colour material shared by every bus body and two-wheeler. */
  private transitMat = createTransitMaterial();
  private pipeline: RenderPipeline | null = null;
  private sun!: THREE.DirectionalLight;
  private skyRig: SkyRig;

  constructor(
    canvas: HTMLCanvasElement,
    district: District,
    tasks: StreetTask[],
    onTelemetry: (t: Telemetry) => void,
    map: MapData
  ) {
    this.canvas = canvas;
    this.map = map;
    this.spawn = map.spawn;
    this.playerPos.set(map.spawn.x, 0, map.spawn.z);
    this.yaw = map.spawn.yaw;
    this.facing = map.spawn.yaw;
    this.body = newBody(map.spawn.yaw);
    this.lookTarget.set(map.spawn.x, PLAYER_LOOK_H, map.spawn.z);
    this.district = district;
    this.onTelemetry = onTelemetry;
    // Tasks stand where the district map puts them. Task packs in the
    // database may still carry the old grid's chowk offsets.
    this.tasks = tasks.map((t) => {
      const s = taskSpot(map, t);
      return { ...t, pos: [s.x, s.z] as [number, number] };
    });

    const theme = district.theme;

    // No MSAA: the pipeline renders into its own targets, where the canvas
    // antialias flag does nothing. AA is supersampling plus FXAA, and the
    // pipeline owns pixel ratio and tone mapping (see render.ts).
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, map.half * 5);

    this.skyRig = createSky(theme.sky, theme.buildings, {
      radius: map.half * 2.2,
      skylineInner: map.half + 25,
    });
    this.scene.add(this.skyRig.sky);
    this.scene.add(this.skyRig.skyline);
    // Atmosphere is owned by the render pipeline's depth haze. Leaving
    // scene.fog on as well double-fogs and drowns the whole frame in beige.
    this.scene.fog = null;

    this.materials = createMaterialLibrary(this.renderer);
    // Everything is built with ordinary lit materials and converted to cel
    // shading in one pass at the end. Building detail streams in later, so
    // the world gets the converter to use on the materials it will need.
    const celifier = createCelifier({
      shadowTint: new THREE.Color(presetFor(district.id).celShadowTint),
    });
    this.buildLights();
    this.buildWorld(celifier.convert);
    this.buildPlayer();
    celifier.apply(this.scene);

    this.bindInput();
  }

  /* ---------------- setup ---------------- */

  private buildLights() {
    const t = this.district.theme;

    // Cel lighting: one strong warm key that casts the only shadows, and a
    // cool fill from the opposite quarter that carries most of what the
    // shadow side looks like. Shadows are *coloured* by that fill and the
    // violet hemisphere ground, never just darker. A big flat ambient term
    // instead is what made every district read washed out.
    this.scene.add(new THREE.AmbientLight(0xffffff, t.ambient * 0.3));

    const hemiGround = new THREE.Color(t.hemiGround).lerp(new THREE.Color(0x8a80b8), 0.55);
    this.scene.add(new THREE.HemisphereLight(t.hemiSky, hemiGround, t.hemiIntensity));

    const sun = new THREE.DirectionalLight(t.sunColour, t.sunIntensity * 1.1);
    this.sun = sun;
    sun.position.set(this.spawn.x + 60, 90, this.spawn.z + 30);
    sun.castShadow = true;
    sun.target.position.set(this.spawn.x, 0, this.spawn.z);
    this.scene.add(sun);
    this.scene.add(sun.target);

    const fillColour = new THREE.Color(t.hemiSky).lerp(new THREE.Color(0xa99ce0), 0.4);
    const fill = new THREE.DirectionalLight(fillColour, t.sunIntensity * 0.42);
    fill.position.set(-70, 40, -55);
    this.scene.add(fill);

    // Low warm bounce off the street, so undersides (awnings, balconies,
    // chhajjas) are not the flattest thing in the frame.
    const bounce = new THREE.DirectionalLight(t.hemiGround, t.sunIntensity * 0.12);
    bounce.position.set(-30, -20, 60);
    this.scene.add(bounce);
  }

  private buildWorld(toon: (m: THREE.Material) => THREE.Material) {
    this.world = buildWorld(this.map, this.district, {
      mats: this.materials,
      vehicleMats: this.vehicleMats,
      transitMat: this.transitMat,
      toon,
    });
    this.scene.add(this.world.group);
    this.rides = new Rides(this.scene, this.world, this.map, this.district, this.vehicleMats, this.transitMat);
    this.buildTaskSites();
    this.buildBarberSite();
    this.world.prime(this.playerPos);
  }

  /** Vibes-only barber shop, in the gap the map compiler left for it in a
   *  street frontage near the spawn, facing the street. */
  private buildBarberSite() {
    const { x, z, yaw } = this.map.barber;
    this.barberWorld = { x, z };

    const anchor = new THREE.Group();
    anchor.position.set(x, this.world.height.at(x, z), z);
    anchor.rotation.y = yaw;

    const shop = makeBarberShop(barberSignFor(this.district.language));
    shop.rotation.y = BARBER_FACING;
    anchor.add(shop);
    this.scene.add(anchor);

    this.world.collide.box(x, z, 2.15, 1.75, yaw);
  }

  /** Parked autos, stalls, temple sellers, and bus stops — each is a mission. */
  private buildTaskSites() {
    const theme = this.district.theme;

    const collide = this.world.collide;
    for (const task of this.tasks) {
      const x = task.pos[0];
      const z = task.pos[1];
      const anchor = new THREE.Group();
      anchor.position.set(x, this.world.height.at(x, z), z);
      // Turn the set piece the way its spot faces (toward its temple, its road).
      const yaw = taskSpot(this.map, task).yaw;
      anchor.rotation.y = yaw;
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      /** Local offset in the anchor's frame -> world. */
      const at = (u: number, v: number) => [x + u * c + v * sn, z - u * sn + v * c] as const;

      // Dressed for the job, the city and the voice they speak in.
      const host = makePerson(attireFor(task, theme.landmark, hashId(task.id)), this.materials);
      makeIdlePose(host);
      host.position.set(0, PLAYER_BASE_Y, 0);
      anchor.add(host);
      this.hostMeshes.set(task.id, host);

      // Temple errands happen inside the real temple, mosque, church or
      // gurdwara: the host stands in the mandapa or courtyard, up the steps.
      const inner = task.kind === "temple" ? this.world.innerNear(x, z, 120) : null;
      if (inner) {
        anchor.position.set(inner.x, this.world.height.at(inner.x, inner.z), inner.z);
        anchor.rotation.y = inner.yaw;
      }

      if (task.kind === "auto") {
        const auto = makeAuto(theme.autoCanopy);
        auto.rotation.y = -Math.PI / 5;
        auto.position.set(-2.2, 0.02, 0.6);
        anchor.add(auto);
        this.taskAutos.set(task.id, auto);
        collide.box(...at(-2.2, 0.6), 1.2, 2.0, yaw);
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
        collide.box(...at(-1.4, -0.8), 1.4, 1.2, yaw + Math.PI / 6);
      } else if (task.kind === "temple" && !inner) {
        // No temple building nearby: a wayside shrine. Entrance (torana,
        // local +z) faces the marker so the player walks up to the front.
        const mandir = makeStreetMandir(undefined, hashId(task.id));
        mandir.position.set(0, 0, -2.6);
        anchor.add(mandir);
        collide.box(...at(0, -2.6), 1.9, 1.7, yaw);
        // Priest stands beside the entrance, clear of the plinth, instead of
        // on top of it inside the temple's own collider.
        host.position.set(1.5, PLAYER_BASE_Y, -0.6);
      } else if (task.kind === "bus") {
        // The stop's shelter is part of the street (world/street.ts); the
        // conductor arrives on the bus (see rides.ts).
        host.visible = false;
      } else if (task.kind === "counter") {
        // A ticket window backed onto the station or jetty (local +z), its
        // glass to the pavement: the clerk stands behind it, the queue in front.
        const booth = makeTicketBooth(task.colour);
        booth.rotation.y = Math.PI;
        booth.position.set(0, 0, 1.4);
        anchor.add(booth);
        host.position.set(0, PLAYER_BASE_Y, 1.5);
        host.rotation.y = Math.PI;
        collide.box(...at(0, 1.4), 1.6, 0.9, yaw);
      }

      this.scene.add(anchor);
      this.taskAnchors.set(task.id, anchor);

      const marker = makeTaskArrow(task.colour);
      marker.position.copy(anchor.position);
      this.scene.add(marker);
      this.markers.set(task.id, marker);
    }

  }

  private buildPlayer() {
    this.player = makeHero();
    this.heroAnim = new HeroAnimator(this.player.userData.hero as HeroRig);
    this.poseHero(0, { sit: 0 });
    this.player.position.copy(this.playerPos);
    this.scene.add(this.player);
  }

  /** Standing (or sitting) still, for when the body isn't being driven. */
  private poseHero(dt: number, opts: { sit: number }) {
    this.heroAnim.update({
      dt,
      t: this.clock.elapsedTime,
      speed: 0,
      accel: 0,
      turn: 0,
      air: 0,
      vy: 0,
      crouch: 0,
      stumble: 0,
      look: 0,
      sit: opts.sit,
    });
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

    // Queue on the edge rather than reading the held key in updatePlayer, so
    // holding Space is a single hop and not a pogo stick.
    if (e.code === "Space" && !e.repeat && !this.paused) this.jumpQueued = true;
    if (e.code === "KeyE" && !e.repeat && this.rides?.riding()) this.rides.skip();

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
    // Accumulate only; updateLook() applies these once per frame.
    this.pendingYaw += e.movementX;
    this.pendingPitch += e.movementY;
  };

  private onResize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // The pipeline owns the canvas size because it owns the supersample factor.
    if (this.pipeline) this.pipeline.resize(w, h);
    else this.renderer.setSize(w, h, false);
  };

  /* ---------------- collision ---------------- */

  private blocked(x: number, z: number): boolean {
    const edge = this.map.half - 1;
    if (Math.abs(x) > edge || Math.abs(z) > edge) return true;
    return this.world.collide.blocked(x, z, PLAYER_RADIUS) || this.world.traffic.hit(x, z, PLAYER_RADIUS) !== null;
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
      this.onResize();
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
      this.skyRig.follow(this.camera);

      if (this.pipeline) this.pipeline.render(dt);
      else this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  private update(dt: number) {
    const t = this.clock.elapsedTime;

    this.world.update(dt, t, this.playerPos);

    const ride = this.rides.update(dt, this.playerPos, this.tasks, this.done, this.hostMeshes);
    if (ride && "kind" in ride) {
      // Stepped off: back on foot at the kerb.
      this.playerPos.set(ride.x, 0, ride.z);
      this.velocity.set(0, 0, 0);
      this.body = newBody(ride.yaw);
      this.player.visible = true;
      this.facing = ride.yaw;
      this.groundY = this.world.height.at(ride.x, ride.z);
    } else if (ride) {
      // Riding: the camera follows the vehicle and the player sits in it.
      this.playerPos.set(ride.x, 0, ride.z);
      this.velocity.set(0, 0, 0);
      this.yaw = dampAngle(this.yaw, ride.yaw, 2.5, dt);
      this.groundY = 0;
      this.player.visible = ride.seat !== null;
      if (ride.seat) {
        this.player.position.copy(ride.seat);
        this.player.rotation.y = ride.yaw;
        this.poseHero(dt, { sit: 1 });
      }
    }

    if (!this.paused && !ride) {
      this.updateLook(dt);
      this.updatePlayer(dt);
      this.resolveVehicleOverlap();
    }
    this.updateCamera(dt);

    // Arrows float over the hosts' heads (over the stop for a bus that has
    // not come yet), bobbing and turning, and grow with distance so a far
    // errand still shows over the rooftops. A finished errand's goes.
    for (const [id, m] of this.markers) {
      m.visible = !this.done.has(id);
      if (!m.visible) continue;
      const host = this.hostMeshes.get(id);
      if (host?.visible) host.getWorldPosition(this.tmpMarker);
      else this.tmpMarker.copy(this.taskAnchors.get(id)!.position);
      const d = Math.hypot(this.tmpMarker.x - this.playerPos.x, this.tmpMarker.z - this.playerPos.z);
      const s = Math.min(3.2, Math.max(1, d / 18));
      m.position.set(this.tmpMarker.x, this.tmpMarker.y + 2.1 + 0.4 * s + Math.sin(t * 2.4 + id.length) * 0.1 * s, this.tmpMarker.z);
      m.rotation.y = t * 1.6;
      m.scale.setScalar(s);
    }

    // Errand hosts turn to face the player when they are close enough to talk,
    // and breathe the rest of the time. Without the idle driver the whole
    // street population stands frozen from spawn to exit.
    let phaseOffset = 0;
    for (const [id, mesh] of this.hostMeshes) {
      const anchor = this.taskAnchors.get(id)!;
      const wx = anchor.position.x;
      const wz = anchor.position.z;
      const d = Math.hypot(this.playerPos.x - wx, this.playerPos.z - wz);
      if (d < TALK_RADIUS * 2.2) {
        const target = Math.atan2(this.playerPos.x - wx, this.playerPos.z - wz);
        mesh.rotation.y = dampAngle(mesh.rotation.y, target, 7, dt);
      }
      // Stagger the phase so a row of NPCs doesn't breathe in unison.
      setIdlePhase(mesh, t + phaseOffset);
      phaseOffset += 1.7;
    }

    this.emit(dt);
  }

  /**
   * Left/right arrows swing the camera, so looking around never depends on the
   * mouse. (E is the talk key, so the usual Q/E turn pair is off the table.)
   */
  private updateLook(dt: number) {
    // Mouse deltas accumulated since the last frame. Applying them per-event
    // meant a 1000Hz mouse advanced yaw a dozen times between renders while
    // the camera only integrated once, which reads as tearing on the turn.
    this.yaw -= this.pendingYaw * 0.0024;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + this.pendingPitch * 0.0018,
      -0.15,
      0.85
    );
    this.pendingYaw = 0;
    this.pendingPitch = 0;

    let turn = 0;
    if (this.keys.has("ArrowLeft")) turn += 1;
    if (this.keys.has("ArrowRight")) turn -= 1;
    if (this.virtualTurn !== 0) turn += this.virtualTurn;

    // Ease the turn in and out instead of stepping straight to full rate.
    this.turnRate = damp(this.turnRate, THREE.MathUtils.clamp(turn, -1, 1), 11, dt);
    if (Math.abs(this.turnRate) > 1e-4) this.yaw += this.turnRate * TURN_SPEED * dt;
  }

  private updatePlayer(dt: number) {
    const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");

    let fwd = this.virtualFwd;
    let strafe = this.virtualStrafe;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) fwd += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) fwd -= 1;
    if (this.keys.has("KeyA")) strafe -= 1;
    if (this.keys.has("KeyD")) strafe += 1;

    // Knocked aside by a vehicle: no control until the stumble is over.
    this.stagger = Math.max(0, this.stagger - dt);
    this.knockCooldown = Math.max(0, this.knockCooldown - dt);

    const mag = Math.hypot(fwd, strafe);
    if (mag > 1) {
      fwd /= mag;
      strafe /= mag;
    }
    // forward = (sin yaw, 0, cos yaw); right = cross(forward, up) = (-cos yaw, 0, sin yaw).
    const dx = Math.sin(this.yaw) * fwd - Math.cos(this.yaw) * strafe;
    const dz = Math.cos(this.yaw) * fwd + Math.sin(this.yaw) * strafe;

    const b = this.body;
    const move = stepBody(
      b,
      {
        dx,
        dz,
        sprint,
        jumpPressed: this.jumpQueued,
        jumpHeld: this.keys.has("Space"),
        control: this.stagger > 0 ? 0 : 1,
      },
      dt
    );
    this.jumpQueued = false;

    // Resolve each axis separately so we slide along walls instead of sticking.
    // Zeroing the blocked component matters as much as the position clamp: if
    // velocity keeps its full magnitude while pressed into a wall, the stride
    // driver keeps advancing and the character foot-slides on the spot.
    const nx = this.playerPos.x + b.vx * dt;
    if (this.blocked(nx, this.playerPos.z)) b.vx = 0;
    else this.playerPos.x = nx;
    const nz = this.playerPos.z + b.vz * dt;
    if (this.blocked(this.playerPos.x, nz)) b.vz = 0;
    else this.playerPos.z = nz;
    this.velocity.set(b.vx, 0, b.vz);

    // The shove plays out as a slide that stops at walls, bleeding off fast.
    if (this.knock.lengthSq() > 0.0004) {
      const kx = this.playerPos.x + this.knock.x * dt;
      if (this.world.collide.blocked(kx, this.playerPos.z, PLAYER_RADIUS)) this.knock.x = 0;
      else this.playerPos.x = kx;
      const kz = this.playerPos.z + this.knock.z * dt;
      if (this.world.collide.blocked(this.playerPos.x, kz, PLAYER_RADIUS)) this.knock.z = 0;
      else this.playerPos.z = kz;
      this.knock.multiplyScalar(Math.exp(-5 * dt));
    } else {
      this.knock.set(0, 0, 0);
    }

    this.jumpY = b.y;
    // Ramp in fast on takeoff, ease out on landing so the tuck unfolds.
    this.air = damp(this.air, b.y > 0.02 ? 1 : 0, b.y > 0.02 ? 18 : 9, dt);
    this.stumble = damp(this.stumble, this.stagger > 0 ? 1 : 0, this.stagger > 0 ? 20 : 5, dt);

    // Climb kerbs and steps smoothly rather than popping up them.
    this.groundY = damp(this.groundY, this.world.height.at(this.playerPos.x, this.playerPos.z), 14, dt);
    this.player.position.set(this.playerPos.x, this.groundY + PLAYER_BASE_Y + this.jumpY, this.playerPos.z);
    this.facing = b.facing;
    this.player.rotation.y = this.facing;

    this.heroAnim.update({
      dt,
      t: this.clock.elapsedTime,
      speed: Math.hypot(b.vx, b.vz),
      accel: move.accel,
      turn: move.turn,
      air: this.air,
      vy: b.vy,
      crouch: move.crouch,
      stumble: this.stumble,
      look: this.lookAtNearby(),
    });
  }

  /** Head turn toward the nearest errand host or the barber, if close and
   *  roughly ahead; 0 otherwise. */
  private lookAtNearby(): number {
    let best = 7;
    let yaw = 0;
    const consider = (x: number, z: number) => {
      const d = Math.hypot(x - this.playerPos.x, z - this.playerPos.z);
      if (d > best || d < 0.8) return;
      const bearing = Math.atan2(x - this.playerPos.x, z - this.playerPos.z) - this.facing;
      const rel = Math.atan2(Math.sin(bearing), Math.cos(bearing));
      if (Math.abs(rel) > 1.6) return;
      best = d;
      yaw = Math.max(-1.1, Math.min(1.1, rel));
    };
    for (const t of this.tasks) if (!this.done.has(t.id)) consider(t.pos[0], t.pos[1]);
    consider(this.barberWorld.x, this.barberWorld.z);
    return yaw;
  }

  /**
   * blocked() only stops the player from walking into a vehicle — it does
   * nothing when a vehicle drives into a player who is standing still. A
   * moving vehicle knocks them aside: out across its path (never along it,
   * which carried them off on the bumper), with a shove, a stumble and a
   * moment before the controls come back. A parked or crawling one just
   * nudges them out of its box.
   */
  private resolveVehicleOverlap() {
    for (const v of this.world.traffic.vehicles) {
      const k = knockFrom(
        { x: v.mesh.position.x, z: v.mesh.position.z, yaw: v.yaw, halfWidth: v.halfWidth, halfLength: v.halfLength, speed: v.speed },
        this.playerPos.x,
        this.playerPos.z,
        PLAYER_RADIUS,
        (x, z) => this.world.collide.blocked(x, z, PLAYER_RADIUS)
      );
      if (!k) continue;
      this.playerPos.x = k.x;
      this.playerPos.z = k.z;
      if (k.shove && this.knockCooldown <= 0) {
        this.knock.set(k.shove.x, 0, k.shove.z);
        this.velocity.set(0, 0, 0);
        this.stagger = 0.45;
        this.knockCooldown = 0.8;
        // A stumble off the ground.
        if (this.body.y <= 0) {
          this.body.vy = 2.6;
          this.body.y = 1e-4;
        }
      }
    }
    this.player.position.set(this.playerPos.x, this.groundY + PLAYER_BASE_Y + this.jumpY, this.playerPos.z);
  }

  private updateCamera(dt: number) {
    const dist = 9;
    // Kept shallow, and aimed above the player's head, a steeper angle fills
    // the lower half of the frame with empty road.
    // Follows the jump at a fraction of its height, so a hop reads as vertical
    // movement without the whole frame lurching with it.
    const height = this.groundY + 2.8 + this.pitch * 5 + this.jumpY * 0.6;

    const speed = this.velocity.length();
    const speed01 = THREE.MathUtils.clamp(speed / SPRINT_SPEED, 0, 1);

    // Slight offset to the right of dead-centre. A camera perfectly behind the
    // player puts the thing you are walking toward directly behind their head.
    const rightX = -Math.cos(this.yaw);
    const rightZ = Math.sin(this.yaw);
    const shoulder = 0.9;

    // Pull the camera in when a wall stands between it and the player (a
    // narrow gully, the building behind a pavement), marching out from the
    // player so it stops short of the first obstruction. Eased, so it
    // slides in and back out rather than popping.
    const bx = -Math.sin(this.yaw) * dist + rightX * shoulder;
    const bz = -Math.cos(this.yaw) * dist + rightZ * shoulder;
    let clear = 1;
    for (let f = 0.08; f <= 1; f += 0.04) {
      if (this.world.collide.blocked(this.playerPos.x + bx * f, this.playerPos.z + bz * f, 0.3)) {
        clear = Math.max(0.18, f - 0.08);
        break;
      }
    }
    this.camReach = damp(this.camReach, clear, clear < this.camReach ? 18 : 3, dt);
    const target = this.tmpCam.set(
      this.playerPos.x + bx * this.camReach,
      height - (1 - this.camReach) * 1.2,
      this.playerPos.z + bz * this.camReach
    );

    this.camera.position.lerp(target, 1 - Math.exp(-9 * dt));

    // The aim used to snap to playerPos every frame while the position lagged
    // behind at k=9. A lagging body with an instant aim is exactly what reads
    // as "swimmy but jerky" — damp both, and lead the aim into the direction
    // of travel so the camera anticipates rather than chases.
    const lead = 0.35;
    this.lookTarget.x = damp(
      this.lookTarget.x,
      this.playerPos.x + this.velocity.x * lead,
      7,
      dt
    );
    this.lookTarget.y = damp(this.lookTarget.y, this.groundY + PLAYER_LOOK_H + this.jumpY * 0.6, 7, dt);
    this.lookTarget.z = damp(
      this.lookTarget.z,
      this.playerPos.z + this.velocity.z * lead,
      7,
      dt
    );
    this.camera.lookAt(this.lookTarget);

    // Roll into the turn, scaled by how fast we're actually moving so the
    // camera doesn't tilt while spinning on the spot.
    this.camera.rotateZ(-this.turnRate * 0.035 * speed01);

    // Speed FOV. Small — 55 to ~62 — but it's most of the sensation of pace.
    const targetFov = 55 + speed01 * 7;
    if (Math.abs(this.camFov - targetFov) > 0.01) {
      this.camFov = damp(this.camFov, targetFov, 4, dt);
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Which aspect each axis of travel is showing right now. One global cycle
   * drives every junction: with a grid this regular, per-junction phases would
   * only mean a vehicle clearing one green straight into a red at the next.
   */
  /** Nearest interactable task, or null. Cheap enough to run every frame. */
  private findNearby(): string | null {
    if (this.rides.riding()) return null;
    let nearby: string | null = null;
    let best = TALK_RADIUS;
    for (const task of this.tasks) {
      if (this.done.has(task.id)) continue;
      // The ticket is bought from the conductor, so only with a bus in.
      if (task.kind === "bus" && !this.rides.busReady(task.id)) continue;
      const anchor = this.taskAnchors.get(task.id)!;
      const d = Math.hypot(
        this.playerPos.x - anchor.position.x,
        this.playerPos.z - anchor.position.z
      );
      if (d < best) {
        best = d;
        nearby = task.id;
      }
    }
    return nearby;
  }

  private findNearBarber(): boolean {
    const d = Math.hypot(
      this.playerPos.x - this.barberWorld.x,
      this.playerPos.z - this.barberWorld.z
    );
    return d < BARBER_ENTER_RADIUS;
  }

  /**
   * Publishes to React. Called at TELEMETRY_HZ, or immediately whenever the
   * nearby task changes so the "press E to talk" prompt still feels instant.
   */
  private emit(dt: number) {
    this.live.x = this.playerPos.x;
    this.live.z = this.playerPos.z;
    this.live.heading = this.yaw;
    this.live.speed = this.velocity.length();

    const nearby = this.findNearby();
    const nearBarber = this.findNearBarber();
    this.telemetryAccum += dt;

    const due = this.telemetryAccum >= 1 / TELEMETRY_HZ;
    if (!due && nearby === this.lastNearby && nearBarber === this.lastNearBarber) return;

    this.telemetryAccum = 0;
    this.lastNearby = nearby;
    this.lastNearBarber = nearBarber;

    const tasks: TaskSnapshot[] = this.tasks.map((task) => {
      const anchor = this.taskAnchors.get(task.id)!;
      return {
        id: task.id,
        kind: task.kind,
        x: anchor.position.x,
        z: anchor.position.z,
        done: this.done.has(task.id),
        colour: `#${task.colour.toString(16).padStart(6, "0")}`,
      };
    });

    this.onTelemetry({
      nearby,
      nearBarber,
      barber: this.barberWorld,
      playerX: this.live.x,
      playerZ: this.live.z,
      heading: this.live.heading,
      tasks,
      speed: this.live.speed,
      ride: this.rides.riding(),
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

  /** Jump to the end of the current ride, if any. */
  public skipRide() {
    this.rides.skip();
  }

  /** After an auto or bus errand: ride it. */
  public startRide(taskId: string) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.kind === "auto") {
      const auto = this.taskAutos.get(taskId);
      if (auto) this.rides.startAuto(task, auto, this.tasks, this.done);
    } else if (task.kind === "bus") {
      this.rides.startBus(task);
    }
  }

  /** Snap back to the spawn pose (position, facing, camera). */
  public recenter() {
    const sp = this.spawn;
    this.playerPos.set(sp.x, 0, sp.z);
    this.velocity.set(0, 0, 0);
    this.yaw = sp.yaw;
    this.facing = sp.yaw;
    this.pitch = 0.16;
    this.pendingYaw = 0;
    this.pendingPitch = 0;
    this.turnRate = 0;
    this.jumpY = 0;
    this.jumpQueued = false;
    this.air = 0;
    this.body = newBody(sp.yaw);
    this.stumble = 0;
    this.setVirtualMove(0, 0);

    this.groundY = this.world.height.at(sp.x, sp.z);
    this.player.position.set(sp.x, this.groundY + PLAYER_BASE_Y, sp.z);
    this.player.rotation.y = sp.yaw;

    const dist = 9;
    const shoulder = 0.9;
    const height = this.groundY + 2.8 + this.pitch * 5;
    this.camera.position.set(
      sp.x - Math.sin(sp.yaw) * dist - Math.cos(sp.yaw) * shoulder,
      height,
      sp.z - Math.cos(sp.yaw) * dist + Math.sin(sp.yaw) * shoulder
    );
    this.lookTarget.set(sp.x, this.groundY + PLAYER_LOOK_H, sp.z);
    this.camera.lookAt(this.lookTarget);
    this.camFov = 55;
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();

    this.live.x = sp.x;
    this.live.z = sp.z;
    this.live.heading = sp.yaw;
    this.live.speed = 0;
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
    this.world.dispose();
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
