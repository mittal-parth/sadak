/**
 * Ledge detection and the rooted mantle / vault motion.
 *
 * Detection is done entirely with `physics` capsule sweeps and rays — this file
 * never touches triangles itself. Three questions have to be answered before a
 * mantle may commit, and all three are asked every time:
 *
 *   1. is there a near-vertical face in front of me?           (forward sweep)
 *   2. where is its lip, and is the lip a walkable surface?     (downward ray)
 *   3. can my capsule actually stand on the far side of it?     (capsule check)
 *
 * If any answer is no we fall through and the player keeps running into the
 * wall, which is the correct failure mode — a mantle that teleports you into
 * geometry is far worse than one that does not trigger.
 *
 * The motion itself is *rooted*: once committed, the capsule is driven along a
 * parametric curve and collision is not consulted again (the destination was
 * already proven clear). That is how every shooter does it; sweeping during the
 * climb catches the very lip you are climbing.
 */

import * as THREE from 'three';
import { MOVE } from './tuning.js';
import { clamp01, smootherstep, smoothstep, DEG } from './springs.js';

export const LEDGE_NONE = 0;
export const LEDGE_VAULT = 1; // over the obstacle, land on the far side
export const LEDGE_MANTLE = 2; // up onto the top face

export class LedgeProbe {
  constructor(physics) {
    this.physics = physics;
    // Preallocated query scratch — nothing here allocates per probe.
    this._p0 = new THREE.Vector3();
    this._p1 = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._down = new THREE.Vector3(0, -1, 0);
    this._origin = new THREE.Vector3();

    /** Last successful result. Reused; copy anything you keep. */
    this.result = {
      kind: LEDGE_NONE,
      fast: false,
      obstacleHeight: 0,
      topY: 0,
      lipX: 0,
      lipZ: 0,
      landX: 0,
      landY: 0,
      landZ: 0,
      distance: 0,
      surface: 'concrete',
    };
  }

  /**
   * @param {object} c   the CharacterController (read-only here)
   * @param {number} fx  forward x (unit, horizontal)
   * @param {number} fz  forward z (unit, horizontal)
   * @param {number} standHeight height the player will occupy after the climb
   * @returns {number} LEDGE_NONE | LEDGE_VAULT | LEDGE_MANTLE
   */
  probe(c, fx, fz, standHeight) {
    const phys = this.physics;
    const m = MOVE.mantle;
    const r = this.result;
    r.kind = LEDGE_NONE;
    if (!phys) return LEDGE_NONE;

    const feetY = c.position.y;
    const radius = c.radius;
    const mask = phys.MASK.CHARACTER;

    // ---- 1. a face in front of us -------------------------------------
    // A short capsule at shin-to-chest height. Kept clear of the very bottom so
    // a kerb the step-offset already handles never reads as a ledge.
    const lo = feetY + Math.max(0.14, m.minHeight * 0.5) + radius * 0.6;
    const hi = feetY + Math.min(m.maxHeight + 0.1, standHeight - 0.12);
    if (hi <= lo) return LEDGE_NONE;
    this._p0.set(c.position.x, lo, c.position.z);
    this._p1.set(c.position.x, Math.max(lo, hi), c.position.z);
    this._dir.set(fx, 0, fz);

    const wall = phys.capsuleCast(this._p0, this._p1, radius * 0.86, this._dir, m.reach, mask);
    if (!wall.hit) return LEDGE_NONE;
    // Must be a wall, not a ramp or a ceiling, and must face us.
    if (Math.abs(wall.normal.y) > 0.55) return LEDGE_NONE;
    if (wall.normal.x * fx + wall.normal.z * fz > -0.3) return LEDGE_NONE;

    const wallDist = wall.distance;
    r.surface = wall.surface;

    // ---- 2. find the lip ----------------------------------------------
    // Probe just past the face. 6 cm of bite is enough to land on the top slab
    // without reaching over a thin lip and finding the floor behind it.
    const lipX = c.position.x + fx * (wallDist + radius * 0.86 + 0.06);
    const lipZ = c.position.z + fz * (wallDist + radius * 0.86 + 0.06);
    const above = feetY + m.maxHeight + 0.35;
    const top = phys.raycast(lipX, above, lipZ, 0, -1, 0, m.maxHeight + 1.4, phys.MASK.WORLD);
    if (!top.hit || top.normal.y < 0.62) return LEDGE_NONE;

    const topY = top.point.y;
    const obstacleHeight = topY - feetY;
    if (obstacleHeight < m.minHeight || obstacleHeight > m.maxHeight) return LEDGE_NONE;
    r.surface = top.surface;

    // ---- 3. is the far side standable? --------------------------------
    // How deep is the top face? A thin obstacle (railing, window sill, low wall)
    // is vaulted clean over; a deep one is mantled onto.
    const deepX = lipX + fx * m.landDepth;
    const deepZ = lipZ + fz * m.landDepth;
    const deep = phys.raycast(deepX, topY + 0.35, deepZ, 0, -1, 0, 2.6, phys.MASK.WORLD);
    const deepSupported = deep.hit && deep.point.y > topY - 0.14 && deep.normal.y > 0.6;

    const stand = standHeight;
    let kind = LEDGE_NONE;

    if (deepSupported) {
      // Wide ledge: stand on top of it.
      if (c.checkCapsule(deepX, topY + 0.02, deepZ, stand)) {
        kind = LEDGE_MANTLE;
        r.landX = deepX;
        r.landY = topY;
        r.landZ = deepZ;
      } else if (c.checkCapsule(lipX + fx * 0.3, topY + 0.02, lipZ + fz * 0.3, Math.min(stand, 1.2))) {
        // Only crouch-height clearance up there — still worth mantling.
        kind = LEDGE_MANTLE;
        r.landX = lipX + fx * 0.3;
        r.landY = topY;
        r.landZ = lipZ + fz * 0.3;
      }
    } else {
      // Thin obstacle: hop the far side. Find the floor beyond it.
      const overX = lipX + fx * (m.landDepth + 0.28);
      const overZ = lipZ + fz * (m.landDepth + 0.28);
      const floor = phys.raycast(overX, topY + 0.3, overZ, 0, -1, 0, 3.2, phys.MASK.WORLD);
      if (floor.hit && floor.normal.y > 0.55 && topY - floor.point.y < 2.4) {
        const ly = floor.point.y;
        if (c.checkCapsule(overX, ly + 0.02, overZ, stand)) {
          kind = LEDGE_VAULT;
          r.landX = overX;
          r.landY = ly;
          r.landZ = overZ;
        }
      }
      if (kind === LEDGE_NONE && c.checkCapsule(lipX + fx * 0.24, topY + 0.02, lipZ + fz * 0.24, stand)) {
        kind = LEDGE_MANTLE;
        r.landX = lipX + fx * 0.24;
        r.landY = topY;
        r.landZ = lipZ + fz * 0.24;
      }
    }
    if (kind === LEDGE_NONE) return LEDGE_NONE;

    // Head clearance directly over the lip — do not climb into a soffit.
    if (!c.checkCapsule(lipX, topY + 0.02, lipZ, Math.min(stand, 1.15))) return LEDGE_NONE;

    r.kind = kind;
    r.fast = obstacleHeight <= m.autoVaultMax;
    r.obstacleHeight = obstacleHeight;
    r.topY = topY;
    r.lipX = lipX;
    r.lipZ = lipZ;
    r.distance = wallDist;
    return kind;
  }
}

/**
 * The rooted climb. Evaluates a position on the curve plus the camera garnish
 * that sells it: a dip as the hands go up, a roll onto the leading shoulder and
 * a pull toward the wall at the top.
 */
export class MantleMotion {
  constructor() {
    this.active = false;
    this.kind = LEDGE_NONE;
    this.t = 0;
    this.duration = 0.6;
    this.startX = 0;
    this.startY = 0;
    this.startZ = 0;
    this.topY = 0;
    this.landX = 0;
    this.landY = 0;
    this.landZ = 0;
    this.fx = 0;
    this.fz = 1;
    this.side = 1;
    this.height = 0;
    this.exitSpeed = 0;
    this.surface = 'concrete';

    /** Output — written by `evaluate()`, read by the controller and camera. */
    this.px = 0;
    this.py = 0;
    this.pz = 0;
    this.camY = 0;
    this.camForward = 0;
    this.camPitch = 0;
    this.camRoll = 0;
  }

  /** @param {object} ledge a LedgeProbe.result */
  begin(ledge, c, fx, fz, side, speed) {
    const m = MOVE.mantle;
    this.active = true;
    this.t = 0;
    this.kind = ledge.kind;
    this.startX = c.position.x;
    this.startY = c.position.y;
    this.startZ = c.position.z;
    this.topY = ledge.topY;
    this.landX = ledge.landX;
    this.landY = ledge.landY;
    this.landZ = ledge.landZ;
    this.height = ledge.obstacleHeight;
    this.surface = ledge.surface;
    this.fx = fx;
    this.fz = fz;
    this.side = side || 1;

    if (ledge.kind === LEDGE_VAULT) {
      this.duration = ledge.fast ? m.vaultTime : m.vaultTime * 1.45;
      this.exitSpeed = Math.max(2.6, speed * 0.88);
    } else if (ledge.fast) {
      this.duration = m.vaultTime * 1.12;
      this.exitSpeed = Math.max(1.8, speed * 0.72);
    } else {
      // Tall mantles are slower — the weight of hauling yourself up.
      const f = clamp01((ledge.obstacleHeight - m.autoVaultMax) / (m.maxHeight - m.autoVaultMax));
      this.duration = m.mantleTime + (m.highMantleTime - m.mantleTime) * f;
      this.exitSpeed = 1.35;
    }
    this.evaluate(0);
  }

  end() {
    this.active = false;
    this.kind = LEDGE_NONE;
    this.camY = 0;
    this.camForward = 0;
    this.camPitch = 0;
    this.camRoll = 0;
  }

  get progress() {
    return this.duration > 0 ? clamp01(this.t / this.duration) : 1;
  }

  /** Advance and write the curve outputs. Returns true while still climbing. */
  step(dt) {
    if (!this.active) return false;
    this.t += dt;
    this.evaluate(this.progress);
    return this.t < this.duration;
  }

  evaluate(u) {
    if (this.kind === LEDGE_VAULT) this._evalVault(u);
    else this._evalMantle(u);
  }

  /** Up first, then in — the shape of pulling yourself onto a roof. */
  _evalMantle(u) {
    const rise = smootherstep(clamp01(u / 0.62));
    const settle = smootherstep(clamp01((u - 0.58) / 0.42));
    const peak = this.topY + 0.06;
    let y = this.startY + (peak - this.startY) * rise;
    y += (this.landY - peak) * settle;

    // 18 % of the horizontal travel happens during the rise (hands reaching in),
    // the rest once the hips clear the lip.
    const lead = smoothstep(clamp01(u / 0.62)) * 0.18;
    const pull = smootherstep(clamp01((u - 0.42) / 0.58)) * 0.82;
    const h = clamp01(lead + pull);
    this.px = this.startX + (this.landX - this.startX) * h;
    this.pz = this.startZ + (this.landZ - this.startZ) * h;
    this.py = y;

    // Camera: dip as the arms load, ride up with a shoulder roll, tiny settle.
    const load = Math.sin(clamp01(u / 0.34) * Math.PI) * (1 - smoothstep(clamp01((u - 0.5) / 0.5)));
    this.camY = -0.075 * load + 0.03 * Math.sin(clamp01((u - 0.55) / 0.45) * Math.PI);
    this.camForward = 0.05 * Math.sin(clamp01(u) * Math.PI);
    this.camPitch = -5.2 * DEG * load + 2.1 * DEG * smoothstep(clamp01((u - 0.6) / 0.4));
    this.camRoll = this.side * 3.2 * DEG * Math.sin(clamp01(u) * Math.PI);
  }

  /** A single low arc that carries momentum through — a hurdle, not a climb. */
  _evalVault(u) {
    const h = smoothstep(u);
    this.px = this.startX + (this.landX - this.startX) * h;
    this.pz = this.startZ + (this.landZ - this.startZ) * h;

    const clearance = this.topY + 0.14;
    const upT = clamp01(u / 0.42);
    const downT = clamp01((u - 0.42) / 0.58);
    let y = this.startY + (clearance - this.startY) * smootherstep(upT);
    y += (this.landY - clearance) * smootherstep(downT) * (u > 0.42 ? 1 : 0);
    this.py = y;

    const arc = Math.sin(clamp01(u) * Math.PI);
    this.camY = -0.045 * arc;
    this.camForward = 0.04 * arc;
    this.camPitch = -3.1 * DEG * arc;
    this.camRoll = this.side * 2.3 * DEG * arc;
  }
}

export function ledgeKindName(kind) {
  return kind === LEDGE_VAULT ? 'vault' : kind === LEDGE_MANTLE ? 'mantle' : 'none';
}
