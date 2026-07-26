import * as THREE from "three";
import { buildCity, roadLines, CHOWK, WORLD_LIMIT, ROAD_W, type Box } from "./city";
import { makeAuto, makeCow, makeCharacter, mulberry32 } from "./props";
import type { District } from "./districts";
import { createMaterialLibrary, type MaterialLibrary } from "./materials";
import { createRenderPipeline, type RenderPipeline } from "./render";

export type NpcSnapshot = { id: string; x: number; z: number; done: boolean; locked: boolean };

export type Telemetry = {
  /** NPC the player can talk to right now, if any. */
  nearby: string | null;
  playerX: number;
  playerZ: number;
  /** Camera yaw in radians. The minimap rotates with it. */
  heading: number;
  npcs: NpcSnapshot[];
  speed: number;
};

const TALK_RADIUS = 4.5;
const PLAYER_RADIUS = 0.55;
const TURN_SPEED = 2.1; // radians/sec for keyboard camera turn

/** GTA-style sky: a vertical gradient painted onto an inward-facing sphere. */
function makeSky(stops: readonly string[]): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  return new THREE.Mesh(
    new THREE.SphereGeometry(WORLD_LIMIT * 2.2, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false })
  );
}

type Vehicle = {
  mesh: THREE.Group;
  line: number;
  axis: "x" | "z";
  dir: 1 | -1;
  speed: number;
};

type Wanderer = {
  mesh: THREE.Group;
  heading: number;
  speed: number;
  turnIn: number;
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
  private cows: Wanderer[] = [];
  private npcMeshes = new Map<string, THREE.Group>();
  private markers = new Map<string, THREE.Mesh>();

  private keys = new Set<string>();
  private raf = 0;
  private disposed = false;
  private dragging = false;
  private done = new Set<string>();
  private canvas: HTMLCanvasElement;

  /** Set while a dialogue overlay is open, so input is ignored. */
  public paused = false;
  /** Clues collected so far. Gates the final NPC. */
  public clues = 0;

  private onTelemetry: (t: Telemetry) => void;
  private materials!: MaterialLibrary;
  private pipeline: RenderPipeline | null = null;
  private sun!: THREE.DirectionalLight;

  constructor(
    canvas: HTMLCanvasElement,
    district: District,
    onTelemetry: (t: Telemetry) => void
  ) {
    this.canvas = canvas;
    this.district = district;
    this.onTelemetry = onTelemetry;

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

    const city = buildCity(theme, this.materials);
    this.scene.add(city.group);
    this.colliders = city.colliders;

    const rand = mulberry32(77);
    const lines = roadLines();

    for (let i = 0; i < theme.autos; i++) {
      const axis: "x" | "z" = rand() > 0.5 ? "x" : "z";
      const line = lines[Math.floor(rand() * lines.length)];
      const dir: 1 | -1 = rand() > 0.5 ? 1 : -1;
      // Keep left, like actual Indian traffic.
      const lane = dir === 1 ? -ROAD_W / 4 : ROAD_W / 4;

      const mesh = makeAuto(theme.autoCanopy);
      const along = (rand() - 0.5) * WORLD_LIMIT * 2;

      if (axis === "z") {
        mesh.position.set(line + lane, 0.02, along);
        mesh.rotation.y = dir === 1 ? 0 : Math.PI;
      } else {
        mesh.position.set(along, 0.02, line - lane);
        mesh.rotation.y = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      }

      this.scene.add(mesh);
      this.vehicles.push({ mesh, line, axis, dir, speed: 7 + rand() * 6 });
    }

    // Cows wander near the chowk, ignore traffic, and are generally in the way.
    for (let i = 0; i < theme.cows; i++) {
      const mesh = makeCow();
      mesh.position.set(
        CHOWK.x + (rand() - 0.5) * 90,
        0.22,
        CHOWK.z + (rand() - 0.5) * 90
      );
      mesh.rotation.y = rand() * Math.PI * 2;
      this.scene.add(mesh);
      this.cows.push({
        mesh,
        heading: rand() * Math.PI * 2,
        speed: 0.4 + rand() * 0.5,
        turnIn: rand() * 5,
      });
    }

    // Mission NPCs plus their floating markers. Positions are chowk offsets.
    for (const npc of this.district.npcs) {
      const x = CHOWK.x + npc.pos[0];
      const z = CHOWK.z + npc.pos[1];

      const mesh = makeCharacter(npc.colour);
      mesh.position.set(x, 0.24, z);
      this.scene.add(mesh);
      this.npcMeshes.set(npc.id, mesh);

      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 1.1, 4),
        new THREE.MeshBasicMaterial({ color: 0xffd23f })
      );
      marker.rotation.x = Math.PI; // point down at the NPC
      marker.position.set(x, 3.6, z);
      this.scene.add(marker);
      this.markers.set(npc.id, marker);
    }
  }

  private buildPlayer() {
    this.player = makeCharacter(0x2980b9, 0xa0673b);
    this.player.position.copy(this.playerPos);
    this.scene.add(this.player);
  }

  private bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("resize", this.onResize);
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
    this.canvas.requestPointerLock?.();
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
    return this.colliders.some(
      (b) =>
        Math.abs(x - b.x) < b.hw + PLAYER_RADIUS &&
        Math.abs(z - b.z) < b.hd + PLAYER_RADIUS
    );
  }

  /** True when this NPC is still gated behind uncollected clues. */
  private locked(npcId: string): boolean {
    const npc = this.district.npcs.find((n) => n.id === npcId);
    return !!npc?.requiresClues && this.clues < npc.requiresClues;
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

    if (!this.paused) {
      this.updateLook(dt);
      this.updatePlayer(dt);
    }
    this.updateCamera(dt);
    this.updateTraffic(dt);
    this.updateCows(dt);

    for (const [id, m] of this.markers) {
      m.rotation.z = t * 1.6;
      m.position.y = 3.5 + Math.sin(t * 2.4) * 0.22;
      (m.material as THREE.MeshBasicMaterial).color.setHex(
        this.done.has(id) ? 0x2ecc71 : this.locked(id) ? 0x7f8c8d : 0xffd23f
      );
    }

    // NPCs turn to face the player when they are close enough to talk.
    for (const [, mesh] of this.npcMeshes) {
      const d = Math.hypot(this.playerPos.x - mesh.position.x, this.playerPos.z - mesh.position.z);
      if (d < TALK_RADIUS * 2.2) {
        mesh.rotation.y = Math.atan2(
          this.playerPos.x - mesh.position.x,
          this.playerPos.z - mesh.position.z
        );
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
    if (turn !== 0) this.yaw += turn * TURN_SPEED * dt;
  }

  private updatePlayer(dt: number) {
    const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = sprint ? 11 : 5.2;

    let fwd = 0;
    let strafe = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) fwd += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) fwd -= 1;
    if (this.keys.has("KeyA")) strafe -= 1;
    if (this.keys.has("KeyD")) strafe += 1;

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

    this.player.position.set(this.playerPos.x, 0.24, this.playerPos.z);

    if (moving) {
      this.player.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
      this.walkPhase += dt * (sprint ? 14 : 9);
      // Cheap bob so the blocky character reads as walking.
      this.player.position.y = 0.24 + Math.abs(Math.sin(this.walkPhase)) * 0.08;
    } else {
      this.walkPhase = 0;
    }
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

  private updateTraffic(dt: number) {
    for (const v of this.vehicles) {
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

      // Suspension jitter, Indian roads are not smooth.
      v.mesh.position.y = 0.02 + Math.sin(this.clock.elapsedTime * 11 + v.line) * 0.022;
    }
  }

  private updateCows(dt: number) {
    for (const c of this.cows) {
      c.turnIn -= dt;
      if (c.turnIn <= 0) {
        c.heading += (Math.random() - 0.5) * 2.2;
        c.turnIn = 2 + Math.random() * 5;
      }

      const nx = c.mesh.position.x + Math.sin(c.heading) * c.speed * dt;
      const nz = c.mesh.position.z + Math.cos(c.heading) * c.speed * dt;

      // Cows are content to stand in the road, but not inside a wall.
      if (!this.blocked(nx, nz)) {
        c.mesh.position.x = nx;
        c.mesh.position.z = nz;
      } else {
        c.heading += Math.PI * 0.6;
      }

      c.mesh.rotation.y = c.heading;
      c.mesh.position.y = 0.22 + Math.sin(this.clock.elapsedTime * 1.5 + c.speed * 10) * 0.02;
    }
  }

  private emit() {
    let nearby: string | null = null;
    let best = TALK_RADIUS;

    const npcs: NpcSnapshot[] = this.district.npcs.map((npc) => {
      const m = this.npcMeshes.get(npc.id)!;
      const d = Math.hypot(this.playerPos.x - m.position.x, this.playerPos.z - m.position.z);
      if (d < best && !this.done.has(npc.id)) {
        best = d;
        nearby = npc.id;
      }
      return {
        id: npc.id,
        x: m.position.x,
        z: m.position.z,
        done: this.done.has(npc.id),
        locked: this.locked(npc.id),
      };
    });

    this.onTelemetry({
      nearby,
      playerX: this.playerPos.x,
      playerZ: this.playerPos.z,
      heading: this.yaw,
      npcs,
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
    window.removeEventListener("resize", this.onResize);

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
