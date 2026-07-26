/**
 * AI — navigation and cover.
 *
 * NAVIGATION is a dense walkability grid sampled straight out of the physics
 * BVH at boot: one downward ray per cell finds the floor, one upward ray checks
 * standing clearance, and the floor normal gives the slope. That is a navmesh's
 * worth of information for a fraction of the code, and it stays correct for a
 * level the `world` system generated procedurally without any authoring pass.
 *
 *   • A* over the 8-connected grid with a heap, slope and step penalties
 *   • string pulling against a line-of-walk test, so paths hug corners instead
 *     of zig-zagging cell to cell
 *   • per-agent local avoidance so a squad flows around itself
 *
 * COVER is derived from the same grid. Every walkable cell next to a blocker
 * becomes a cover point with a direction and a height class (full / crouch),
 * plus a peek offset that has line of sight past the edge. At runtime cover is
 * scored against the live threat direction, the agent's distance, and what the
 * rest of the squad has already claimed.
 */

import * as THREE from 'three';

const SQRT2 = Math.SQRT2;

/* ------------------------------------------------------------------ */
/* Binary heap for A*                                                  */
/* ------------------------------------------------------------------ */

class Heap {
  constructor(cap) {
    this.idx = new Int32Array(cap);
    this.key = new Float32Array(cap);
    this.n = 0;
  }

  clear() {
    this.n = 0;
  }

  push(i, k) {
    if (this.n >= this.idx.length) return;
    let c = this.n++;
    this.idx[c] = i;
    this.key[c] = k;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.key[p] <= this.key[c]) break;
      const ti = this.idx[p], tk = this.key[p];
      this.idx[p] = this.idx[c]; this.key[p] = this.key[c];
      this.idx[c] = ti; this.key[c] = tk;
      c = p;
    }
  }

  pop() {
    const top = this.idx[0];
    this.n--;
    if (this.n > 0) {
      this.idx[0] = this.idx[this.n];
      this.key[0] = this.key[this.n];
      let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1;
        let m = c;
        if (l < this.n && this.key[l] < this.key[m]) m = l;
        if (r < this.n && this.key[r] < this.key[m]) m = r;
        if (m === c) break;
        const ti = this.idx[m], tk = this.key[m];
        this.idx[m] = this.idx[c]; this.key[m] = this.key[c];
        this.idx[c] = ti; this.key[c] = tk;
        c = m;
      }
    }
    return top;
  }
}

/* ------------------------------------------------------------------ */
/* Nav grid                                                            */
/* ------------------------------------------------------------------ */

export class NavGrid {
  constructor(physics, opts = {}) {
    this.physics = physics;
    this.cell = opts.cell ?? 0.8;
    this.radius = opts.radius ?? 0.36;
    this.height = opts.height ?? 1.78;
    this.crouchHeight = opts.crouchHeight ?? 1.15;
    this.maxStep = opts.maxStep ?? 0.45;
    this.maxSlope = Math.cos((opts.maxSlopeDeg ?? 46) * Math.PI / 180);

    const b = opts.bounds;
    this.minX = Math.floor(b.min.x / this.cell) * this.cell;
    this.minZ = Math.floor(b.min.z / this.cell) * this.cell;
    this.nx = Math.max(1, Math.ceil((b.max.x - this.minX) / this.cell));
    this.nz = Math.max(1, Math.ceil((b.max.z - this.minZ) / this.cell));
    this.topY = b.max.y + 4;

    const n = this.nx * this.nz;
    /** 0 = blocked, 1 = walkable standing, 2 = walkable crouched only */
    this.flags = new Uint8Array(n);
    this.floor = new Float32Array(n);
    this.floor.fill(-Infinity);
    /** how enclosed a cell is: 0 open, 1 hemmed in — used for cover scoring */
    this.enclosure = new Uint8Array(n);

    // A* working set
    this.gScore = new Float32Array(n);
    this.came = new Int32Array(n);
    this.visitStamp = new Int32Array(n);
    this.stamp = 0;
    this.open = new Heap(Math.min(n, 1 << 16));

    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._p0 = new THREE.Vector3();
    this._p1 = new THREE.Vector3();
    this.buildMs = 0;
    this.walkableCount = 0;
  }

  index(ix, iz) {
    return iz * this.nx + ix;
  }

  cellX(x) {
    return Math.round((x - this.minX) / this.cell);
  }

  cellZ(z) {
    return Math.round((z - this.minZ) / this.cell);
  }

  worldX(ix) {
    return this.minX + ix * this.cell;
  }

  worldZ(iz) {
    return this.minZ + iz * this.cell;
  }

  inside(ix, iz) {
    return ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz;
  }

  /** Sample the physics world. ~2 rays per cell; logged so the cost is visible. */
  build() {
    const t0 = performance.now();
    const phys = this.physics;
    const MASK = phys.MASK.WORLD;
    const r = this.radius;
    let walk = 0;
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const i = this.index(ix, iz);
        const x = this.worldX(ix), z = this.worldZ(iz);
        const down = phys.raycast(x, this.topY, z, 0, -1, 0, this.topY + 30, MASK);
        if (!down.hit) continue;
        this.floor[i] = down.point.y;
        if (down.normal.y < this.maxSlope) continue;
        const fy = down.point.y;
        // standing clearance straight up
        const up = phys.raycast(x, fy + 0.25, z, 0, 1, 0, this.height - 0.2, MASK);
        if (!up.hit) this.flags[i] = 1;
        else if (up.distance > this.crouchHeight - 0.25) this.flags[i] = 2;
        else continue;
        // shoulder clearance: four short lateral probes at chest height
        let blocked = 0;
        for (let d = 0; d < 4; d++) {
          const dx = d === 0 ? 1 : d === 1 ? -1 : 0;
          const dz = d === 2 ? 1 : d === 3 ? -1 : 0;
          if (phys.raycastAny(x, fy + 0.95, z, dx, 0, dz, r + 0.06, MASK)) blocked++;
        }
        if (blocked >= 3) {
          this.flags[i] = 0;
          continue;
        }
        this.enclosure[i] = blocked;
        walk++;
      }
    }
    this.walkableCount = walk;
    this.buildMs = performance.now() - t0;
    return this;
  }

  walkable(ix, iz, crouch = true) {
    if (!this.inside(ix, iz)) return false;
    const f = this.flags[this.index(ix, iz)];
    return crouch ? f !== 0 : f === 1;
  }

  floorAt(ix, iz) {
    return this.floor[this.index(ix, iz)];
  }

  /**
   * Nearest walkable cell to a world point, searched in rings. Pass `y` plus a
   * `yTol` to reject cells on a different storey — otherwise a spawn point in a
   * street happily snaps onto a market stall's table top.
   */
  nearest(x, z, y = null, maxRings = 8, yTol = Infinity) {
    const cx = this.cellX(x), cz = this.cellZ(z);
    const okY = (i) => y === null || Math.abs(this.floor[i] - y) <= yTol;
    if (this.walkable(cx, cz) && okY(this.index(cx, cz))) return this.index(cx, cz);
    for (let ring = 1; ring <= maxRings; ring++) {
      let best = -1, bestD = Infinity;
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const ix = cx + dx, iz = cz + dz;
          if (!this.walkable(ix, iz)) continue;
          const i = this.index(ix, iz);
          if (!okY(i)) continue;
          let d = dx * dx + dz * dz;
          if (y !== null && Number.isFinite(this.floor[i])) d += (this.floor[i] - y) ** 2 * 4;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /**
   * A* between two world points. Writes world-space waypoints into `out`
   * (an array of THREE.Vector3, reused) and returns the count.
   */
  findPath(from, to, out, opts = {}) {
    const start = this.nearest(from.x, from.z, from.y);
    const goal = this.nearest(to.x, to.z, to.y);
    if (start < 0 || goal < 0) return 0;
    if (start === goal) {
      this._emit(out, 0, to);
      return 1;
    }
    const nx = this.nx;
    const gx = goal % nx, gz = (goal / nx) | 0;
    const cell = this.cell;
    const maxNodes = opts.maxNodes ?? 6000;

    this.stamp++;
    const stamp = this.stamp;
    this.open.clear();
    this.gScore[start] = 0;
    this.came[start] = -1;
    this.visitStamp[start] = stamp;
    this.open.push(start, 0);

    let expanded = 0;
    let found = false;
    while (this.open.n > 0 && expanded < maxNodes) {
      const cur = this.open.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      expanded++;
      const cxi = cur % nx, czi = (cur / nx) | 0;
      const cg = this.gScore[cur];
      const cy = this.floor[cur];
      for (let d = 0; d < 8; d++) {
        const dx = DX[d], dz = DZ[d];
        const ix = cxi + dx, iz = czi + dz;
        if (!this.walkable(ix, iz)) continue;
        if (dx && dz) {
          // no corner cutting
          if (!this.walkable(cxi + dx, czi) || !this.walkable(cxi, czi + dz)) continue;
        }
        const ni = this.index(ix, iz);
        const dy = this.floor[ni] - cy;
        if (Math.abs(dy) > this.maxStep) continue;
        let cost = (dx && dz ? SQRT2 : 1) * cell;
        cost += Math.abs(dy) * 2.2; // prefer flat ground
        if (this.flags[ni] === 2) cost += cell * 1.6; // crouch-only squeeze
        cost += this.enclosure[ni] * cell * 0.25; // avoid scraping walls
        const g = cg + cost;
        if (this.visitStamp[ni] === stamp && g >= this.gScore[ni]) continue;
        this.visitStamp[ni] = stamp;
        this.gScore[ni] = g;
        this.came[ni] = cur;
        const hx = Math.abs(ix - gx), hz = Math.abs(iz - gz);
        const h = (Math.max(hx, hz) + (SQRT2 - 1) * Math.min(hx, hz)) * cell;
        this.open.push(ni, g + h * 1.06);
      }
    }
    if (!found) return 0;

    // walk the parents back, then string-pull
    const raw = this._raw ?? (this._raw = []);
    raw.length = 0;
    let n = goal;
    while (n >= 0) {
      raw.push(n);
      n = this.came[n];
    }
    raw.reverse();
    return this._stringPull(raw, from, to, out);
  }

  _emit(out, i, v) {
    if (!out[i]) out[i] = new THREE.Vector3();
    out[i].copy(v);
  }

  /**
   * Greedy string pull: keep the furthest waypoint still reachable in a
   * straight walkable line from the anchor. Turns a staircase into a corner.
   */
  _stringPull(raw, from, to, out) {
    let count = 0;
    const anchor = this._v.copy(from);
    let i = 0;
    const nx = this.nx;
    const pos = this._v2;
    while (i < raw.length - 1) {
      let best = i + 1;
      for (let j = raw.length - 1; j > i; j--) {
        const c = raw[j];
        pos.set(this.worldX(c % nx), this.floor[c], this.worldZ((c / nx) | 0));
        if (this.lineOfWalk(anchor, pos)) {
          best = j;
          break;
        }
      }
      const c = raw[best];
      pos.set(this.worldX(c % nx), this.floor[c], this.worldZ((c / nx) | 0));
      this._emit(out, count++, pos);
      anchor.copy(pos);
      i = best;
      if (count >= 32) break;
    }
    // finish on the exact goal if we can see it
    if (this.lineOfWalk(anchor, to) && count < 32) this._emit(out, count++, to);
    else if (count === 0) this._emit(out, count++, to);
    return count;
  }

  /** Is the straight segment walkable end to end? */
  lineOfWalk(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (this.cell * 0.65)));
    let prevY = a.y;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + dx * t, z = a.z + dz * t;
      const ix = this.cellX(x), iz = this.cellZ(z);
      if (!this.walkable(ix, iz)) return false;
      const y = this.floor[this.index(ix, iz)];
      if (Math.abs(y - prevY) > this.maxStep) return false;
      prevY = y;
    }
    return true;
  }
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

/* ------------------------------------------------------------------ */
/* Cover                                                               */
/* ------------------------------------------------------------------ */

/**
 * A cover point: a spot to stand plus the direction the protection comes from.
 * `high` means the blocker stops a standing shot; otherwise it is crouch cover.
 * `peek` is a lateral offset that clears the edge for shooting.
 */
export class CoverMap {
  constructor(grid, physics) {
    this.grid = grid;
    this.physics = physics;
    this.points = [];
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this.buildMs = 0;
  }

  build(opts = {}) {
    const t0 = performance.now();
    const g = this.grid;
    const phys = this.physics;
    const MASK = phys.MASK.WORLD;
    const step = opts.step ?? 1; // sample every Nth cell
    const reach = opts.reach ?? 1.25;
    this.points.length = 0;
    for (let iz = 1; iz < g.nz - 1; iz += step) {
      for (let ix = 1; ix < g.nx - 1; ix += step) {
        if (!g.walkable(ix, iz)) continue;
        const i = g.index(ix, iz);
        if (g.enclosure[i] === 0) {
          // still allow cover next to a blocked cell (thin props, sandbags)
          let adj = false;
          for (let d = 0; d < 4 && !adj; d++) {
            if (!g.walkable(ix + DX[d], iz + DZ[d])) adj = true;
          }
          if (!adj) continue;
        }
        const x = g.worldX(ix), z = g.worldZ(iz), y = g.floor[i];
        // find the strongest blocking direction at chest and knee height
        for (let d = 0; d < 8; d++) {
          const dx = DX[d] / (d < 4 ? 1 : SQRT2);
          const dz = DZ[d] / (d < 4 ? 1 : SQRT2);
          const low = phys.raycast(x, y + 0.55, z, dx, 0, dz, reach, MASK);
          if (!low.hit) continue;
          const high = phys.raycastAny(x, y + 1.32, z, dx, 0, dz, reach, MASK);
          // must be able to shoot over/around: check a peek to both sides
          this.points.push({
            x, y, z,
            dx, dz, // direction the cover faces (toward the blocker)
            high,
            dist: low.distance,
            claimed: -1,
            score: 0,
          });
          break;
        }
      }
    }
    this.buildMs = performance.now() - t0;
    return this;
  }

  /**
   * Best cover for an agent at `pos` against a threat at `threat`.
   * Scoring, in order of weight: does the blocker actually sit between us and
   * the threat, is the spot a sensible distance from both, is it free, and does
   * a peek from it have line of sight (a hole to shoot through).
   */
  pick(pos, threat, opts = {}) {
    const wantMin = opts.minRange ?? 6;
    const wantMax = opts.maxRange ?? 26;
    const claimId = opts.id ?? -1;
    const squad = opts.squad ?? null;
    const maxTravel = opts.maxTravel ?? 22;
    const yRef = opts.yRef ?? null;
    const yTol = opts.yTol ?? Infinity;
    let best = null;
    let bestScore = -Infinity;
    const tx = threat.x, tz = threat.z;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (p.claimed >= 0 && p.claimed !== claimId) continue;
      const toThreatX = tx - p.x, toThreatZ = tz - p.z;
      const dT = Math.hypot(toThreatX, toThreatZ);
      if (dT < 2.5 || dT > 40) continue;
      const travel = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (travel > maxTravel) continue;
      if (yRef !== null && Math.abs(p.y - yRef) > yTol) continue;
      // protection: the blocker must be on the threat side
      const prot = (toThreatX / dT) * p.dx + (toThreatZ / dT) * p.dz;
      if (prot < 0.25) continue;
      let score = prot * 5 + (p.high ? 2.2 : 1.0);
      // range preference
      if (dT < wantMin) score -= (wantMin - dT) * 0.55;
      else if (dT > wantMax) score -= (dT - wantMax) * 0.28;
      score -= travel * 0.16;
      // do not bunch up
      if (squad) {
        for (const other of squad) {
          if (!other || other.id === claimId || !other.alive) continue;
          const d = Math.hypot(other.position.x - p.x, other.position.z - p.z);
          if (d < 3.2) score -= (3.2 - d) * 1.4;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best && claimId >= 0) {
      for (const p of this.points) if (p.claimed === claimId) p.claimed = -1;
      best.claimed = claimId;
    }
    return best;
  }

  release(claimId) {
    for (const p of this.points) if (p.claimed === claimId) p.claimed = -1;
  }

  /**
   * Where to lean out from a cover point to shoot: try both sides and pick the
   * one with line of sight from the eye to the threat.
   */
  peekOffset(cover, threat, eyeH, out) {
    const phys = this.physics;
    // lateral axis = perpendicular to the cover facing
    const lx = -cover.dz, lz = cover.dx;
    const from = this._v;
    const to = this._v2.set(threat.x, threat.y, threat.z);
    for (const s of [1, -1, 0]) {
      const px = cover.x + lx * 0.62 * s;
      const pz = cover.z + lz * 0.62 * s;
      from.set(px, cover.y + eyeH, pz);
      if (phys.lineOfSight(from, to, phys.MASK.SIGHT)) {
        out.set(px, cover.y, pz);
        return s;
      }
    }
    out.set(cover.x, cover.y, cover.z);
    return 0;
  }
}
