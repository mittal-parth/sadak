/**
 * Static world: triangle soup + binned-SAH BVH.
 *
 * `world` registers meshes through PhysicsSystem.addStatic(); we bake them into
 * world space once, concatenate everything into flat typed arrays, and build a
 * BVH over the result. Nothing here allocates after build() — queries run on
 * preallocated stacks and write into caller-supplied records.
 *
 * Layout
 *   pos      Float32Array, 9 floats per triangle (a.xyz b.xyz c.xyz), world space
 *   nrm      Float32Array, 3 floats per triangle (unit geometric normal)
 *   surface  Uint8Array,   surface enum index per triangle
 *   mask     Uint16Array,  collision layer bits per triangle
 *   object   Int32Array,   owner object id per triangle
 *
 * Nodes
 *   nodeBounds Float32Array, 6 per node
 *   nodeMeta   Int32Array,   2 per node — [leftFirst, count]
 *                            count > 0 : leaf, triIndex[leftFirst .. +count)
 *                            count = 0 : interior, children at leftFirst, +1
 */

import * as THREE from 'three';
import {
  rayAabb,
  rayTriangle,
  segTriangleClosest,
  makeClosest,
  EPS,
} from './math.js';
import { surfaceIndex, guessSurface, LAYER } from './surfaces.js';

const BINS = 12;
const LEAF_SIZE = 6;
const TRAV_COST = 1.0;
const TRI_COST = 1.35;
/** Conservative-advancement tolerance, metres. */
const CA_TOL = 1e-4;
const CA_ITERS = 48;

const _m4 = new THREE.Matrix4();

export class StaticWorld {
  constructor() {
    this.objects = []; // { id, name, mesh, surface, mask, tris, triCount, alive, aabb }
    this._freeIds = [];

    this.triCount = 0;
    this.pos = new Float32Array(0);
    this.nrm = new Float32Array(0);
    this.surface = new Uint8Array(0);
    this.mask = new Uint16Array(0);
    this.object = new Int32Array(0);

    this.triIndex = new Uint32Array(0);
    this.nodeBounds = new Float32Array(0);
    this.nodeMeta = new Int32Array(0);
    this.nodeCount = 0;
    this.maxDepth = 0;

    this.dirty = false;
    this.buildMs = 0;
    this.version = 0;

    // scratch
    this._cent = new Float32Array(0);
    this._taabb = new Float32Array(0);
    this._stackNode = new Int32Array(128);
    this._stackT = new Float32Array(128);
    this._buildStack = new Int32Array(3 * 4096);
    this._cl = makeClosest();
    this._cl2 = makeClosest();
    this._cand = new Int32Array(4096);
    this._candCount = 0;

    // shared contact buffer for overlap queries
    this.contacts = {
      count: 0,
      capacity: 256,
      nx: new Float32Array(256),
      ny: new Float32Array(256),
      nz: new Float32Array(256),
      px: new Float32Array(256),
      py: new Float32Array(256),
      pz: new Float32Array(256),
      depth: new Float32Array(256),
      /** Parameter along the query segment where the contact sits, 0..1. */
      s: new Float32Array(256),
      tri: new Int32Array(256),
    };

    this.aabb = { minx: 0, miny: 0, minz: 0, maxx: 0, maxy: 0, maxz: 0 };
    this.stats = { rayTests: 0, nodeTests: 0, triTests: 0 };
  }

  /* ---------------------------------------------------------------- */
  /* Registration                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Bake a mesh (or InstancedMesh) into world-space triangles.
   * Returns the object id, or -1 if the mesh had no usable geometry.
   */
  addMesh(mesh, surface, mask = LAYER.STATIC, opts = {}) {
    if (!mesh) return -1;
    const baked = bakeMesh(mesh, surface, opts);
    if (!baked || baked.count === 0) return -1;

    const id = this._freeIds.length ? this._freeIds.pop() : this.objects.length;
    const obj = {
      id,
      name: mesh.name || mesh.type,
      mesh,
      surface: baked.uniformSurface,
      surfaces: baked.surfaces,
      mask,
      tris: baked.pos,
      triCount: baked.count,
      alive: true,
      userData: opts.userData ?? null,
    };
    this.objects[id] = obj;
    this.dirty = true;
    return id;
  }

  /** Register raw world-space triangles (Float32Array, 9 floats each). */
  addTriangles(positions, count, surface, mask = LAYER.STATIC, name = 'raw') {
    const id = this._freeIds.length ? this._freeIds.pop() : this.objects.length;
    const s = surfaceIndex(surface);
    const surfaces = new Uint8Array(count);
    surfaces.fill(s);
    this.objects[id] = {
      id, name, mesh: null, surface: s, surfaces, mask,
      tris: positions, triCount: count, alive: true, userData: null,
    };
    this.dirty = true;
    return id;
  }

  removeObject(id) {
    const o = this.objects[id];
    if (!o || !o.alive) return false;
    o.alive = false;
    o.tris = null;
    o.surfaces = null;
    this.objects[id] = null;
    this._freeIds.push(id);
    this.dirty = true;
    return true;
  }

  findByMesh(mesh) {
    for (let i = 0; i < this.objects.length; i++) {
      const o = this.objects[i];
      if (o && o.alive && o.mesh === mesh) return i;
    }
    return -1;
  }

  /* ---------------------------------------------------------------- */
  /* Build                                                             */
  /* ---------------------------------------------------------------- */

  build() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    let total = 0;
    for (const o of this.objects) if (o && o.alive) total += o.triCount;

    if (total === 0) {
      this.triCount = 0;
      this.nodeCount = 0;
      this.dirty = false;
      this.version++;
      return;
    }

    if (this.pos.length < total * 9) {
      this.pos = new Float32Array(total * 9);
      this.nrm = new Float32Array(total * 3);
      this.surface = new Uint8Array(total);
      this.mask = new Uint16Array(total);
      this.object = new Int32Array(total);
      this.triIndex = new Uint32Array(total);
      this._cent = new Float32Array(total * 3);
      this._taabb = new Float32Array(total * 6);
      const maxNodes = 2 * total + 8;
      this.nodeBounds = new Float32Array(maxNodes * 6);
      this.nodeMeta = new Int32Array(maxNodes * 2);
    }

    const pos = this.pos;
    let w = 0;
    for (const o of this.objects) {
      if (!o || !o.alive) continue;
      pos.set(o.tris.subarray(0, o.triCount * 9), w * 9);
      for (let i = 0; i < o.triCount; i++) {
        this.surface[w + i] = o.surfaces ? o.surfaces[i] : o.surface;
        this.mask[w + i] = o.mask;
        this.object[w + i] = o.id;
      }
      w += o.triCount;
    }
    this.triCount = total;

    // Per-triangle normals, centroids, bounds.
    const cent = this._cent;
    const ta = this._taabb;
    const nrm = this.nrm;
    let gminx = Infinity, gminy = Infinity, gminz = Infinity;
    let gmaxx = -Infinity, gmaxy = -Infinity, gmaxz = -Infinity;
    for (let i = 0; i < total; i++) {
      const p = i * 9;
      const ax = pos[p], ay = pos[p + 1], az = pos[p + 2];
      const bx = pos[p + 3], by = pos[p + 4], bz = pos[p + 5];
      const cx = pos[p + 6], cy = pos[p + 7], cz = pos[p + 8];
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz);
      if (l > EPS) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 1; nz = 0; }
      nrm[i * 3] = nx; nrm[i * 3 + 1] = ny; nrm[i * 3 + 2] = nz;

      const mnx = Math.min(ax, bx, cx), mny = Math.min(ay, by, cy), mnz = Math.min(az, bz, cz);
      const mxx = Math.max(ax, bx, cx), mxy = Math.max(ay, by, cy), mxz = Math.max(az, bz, cz);
      const b = i * 6;
      ta[b] = mnx; ta[b + 1] = mny; ta[b + 2] = mnz;
      ta[b + 3] = mxx; ta[b + 4] = mxy; ta[b + 5] = mxz;
      cent[i * 3] = (mnx + mxx) * 0.5;
      cent[i * 3 + 1] = (mny + mxy) * 0.5;
      cent[i * 3 + 2] = (mnz + mxz) * 0.5;
      this.triIndex[i] = i;
      if (mnx < gminx) gminx = mnx;
      if (mny < gminy) gminy = mny;
      if (mnz < gminz) gminz = mnz;
      if (mxx > gmaxx) gmaxx = mxx;
      if (mxy > gmaxy) gmaxy = mxy;
      if (mxz > gmaxz) gmaxz = mxz;
    }
    this.aabb.minx = gminx; this.aabb.miny = gminy; this.aabb.minz = gminz;
    this.aabb.maxx = gmaxx; this.aabb.maxy = gmaxy; this.aabb.maxz = gmaxz;

    this._buildNodes(total);
    this.dirty = false;
    this.version++;
    this.buildMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }

  _buildNodes(total) {
    const meta = this.nodeMeta;
    const bounds = this.nodeBounds;
    const idx = this.triIndex;
    const ta = this._taabb;
    const cent = this._cent;

    this.nodeCount = 1;
    meta[0] = 0;
    meta[1] = total;
    this._nodeBoundsFromRange(0, 0, total);

    // Explicit stack of (nodeIndex, start, count, depth)
    const need = 4 * (2 * Math.ceil(total / LEAF_SIZE) + 64);
    if (this._buildStack.length < need) this._buildStack = new Int32Array(need);
    const stack = this._buildStack;
    let sp = 0;
    stack[sp++] = 0; stack[sp++] = 0; stack[sp++] = total; stack[sp++] = 0;

    // Binned SAH scratch (reused every split)
    const binCount = new Int32Array(BINS);
    const binB = new Float32Array(BINS * 6);
    const leftArea = new Float32Array(BINS);
    const leftCnt = new Int32Array(BINS);
    let maxDepth = 0;

    while (sp > 0) {
      const depth = stack[--sp];
      const count = stack[--sp];
      const start = stack[--sp];
      const node = stack[--sp];
      if (depth > maxDepth) maxDepth = depth;
      if (count <= LEAF_SIZE || depth > 60) continue;

      const nb = node * 6;
      // centroid bounds
      let cminx = Infinity, cminy = Infinity, cminz = Infinity;
      let cmaxx = -Infinity, cmaxy = -Infinity, cmaxz = -Infinity;
      for (let i = start; i < start + count; i++) {
        const t = idx[i] * 3;
        const x = cent[t], y = cent[t + 1], z = cent[t + 2];
        if (x < cminx) cminx = x; if (x > cmaxx) cmaxx = x;
        if (y < cminy) cminy = y; if (y > cmaxy) cmaxy = y;
        if (z < cminz) cminz = z; if (z > cmaxz) cmaxz = z;
      }
      const ex = cmaxx - cminx, ey = cmaxy - cminy, ez = cmaxz - cminz;
      let axis = 0, extent = ex, cmin = cminx;
      if (ey > extent) { axis = 1; extent = ey; cmin = cminy; }
      if (ez > extent) { axis = 2; extent = ez; cmin = cminz; }
      if (extent < 1e-7) continue; // degenerate cluster -> leaf

      const scale = BINS / extent;
      binCount.fill(0);
      for (let b = 0; b < BINS; b++) {
        const o = b * 6;
        binB[o] = binB[o + 1] = binB[o + 2] = Infinity;
        binB[o + 3] = binB[o + 4] = binB[o + 5] = -Infinity;
      }
      for (let i = start; i < start + count; i++) {
        const tri = idx[i];
        let b = ((cent[tri * 3 + axis] - cmin) * scale) | 0;
        if (b < 0) b = 0; else if (b >= BINS) b = BINS - 1;
        binCount[b]++;
        const o = b * 6, tb = tri * 6;
        if (ta[tb] < binB[o]) binB[o] = ta[tb];
        if (ta[tb + 1] < binB[o + 1]) binB[o + 1] = ta[tb + 1];
        if (ta[tb + 2] < binB[o + 2]) binB[o + 2] = ta[tb + 2];
        if (ta[tb + 3] > binB[o + 3]) binB[o + 3] = ta[tb + 3];
        if (ta[tb + 4] > binB[o + 4]) binB[o + 4] = ta[tb + 4];
        if (ta[tb + 5] > binB[o + 5]) binB[o + 5] = ta[tb + 5];
      }

      // sweep left
      let axmin = Infinity, aymin = Infinity, azmin = Infinity;
      let axmax = -Infinity, aymax = -Infinity, azmax = -Infinity;
      let acc = 0;
      for (let b = 0; b < BINS - 1; b++) {
        const o = b * 6;
        if (binCount[b] > 0) {
          if (binB[o] < axmin) axmin = binB[o];
          if (binB[o + 1] < aymin) aymin = binB[o + 1];
          if (binB[o + 2] < azmin) azmin = binB[o + 2];
          if (binB[o + 3] > axmax) axmax = binB[o + 3];
          if (binB[o + 4] > aymax) aymax = binB[o + 4];
          if (binB[o + 5] > azmax) azmax = binB[o + 5];
        }
        acc += binCount[b];
        leftCnt[b] = acc;
        leftArea[b] = acc > 0 ? surfaceArea(axmin, aymin, azmin, axmax, aymax, azmax) : 0;
      }
      // sweep right + pick
      axmin = aymin = azmin = Infinity;
      axmax = aymax = azmax = -Infinity;
      let rAcc = 0;
      let bestCost = TRI_COST * count; // cost of making this a leaf
      let bestSplit = -1;
      const parentArea = surfaceArea(
        bounds[nb], bounds[nb + 1], bounds[nb + 2],
        bounds[nb + 3], bounds[nb + 4], bounds[nb + 5]
      );
      const invParent = parentArea > 0 ? 1 / parentArea : 0;
      for (let b = BINS - 1; b > 0; b--) {
        const o = b * 6;
        if (binCount[b] > 0) {
          if (binB[o] < axmin) axmin = binB[o];
          if (binB[o + 1] < aymin) aymin = binB[o + 1];
          if (binB[o + 2] < azmin) azmin = binB[o + 2];
          if (binB[o + 3] > axmax) axmax = binB[o + 3];
          if (binB[o + 4] > aymax) aymax = binB[o + 4];
          if (binB[o + 5] > azmax) azmax = binB[o + 5];
        }
        rAcc += binCount[b];
        const lc = leftCnt[b - 1];
        if (lc === 0 || rAcc === 0) continue;
        const rArea = surfaceArea(axmin, aymin, azmin, axmax, aymax, azmax);
        const cost = TRAV_COST + TRI_COST * invParent * (leftArea[b - 1] * lc + rArea * rAcc);
        if (cost < bestCost) {
          bestCost = cost;
          bestSplit = b;
        }
      }
      if (bestSplit < 0) continue; // leaf is cheaper

      // partition in place
      const splitPos = cmin + extent * (bestSplit / BINS);
      let i = start, j = start + count - 1;
      while (i <= j) {
        const tri = idx[i];
        if (cent[tri * 3 + axis] < splitPos) i++;
        else { idx[i] = idx[j]; idx[j] = tri; j--; }
      }
      const leftCount = i - start;
      if (leftCount === 0 || leftCount === count) continue;

      const l = this.nodeCount;
      this.nodeCount += 2;
      meta[node * 2] = l;
      meta[node * 2 + 1] = 0;
      meta[l * 2] = start; meta[l * 2 + 1] = leftCount;
      meta[(l + 1) * 2] = i; meta[(l + 1) * 2 + 1] = count - leftCount;
      this._nodeBoundsFromRange(l, start, leftCount);
      this._nodeBoundsFromRange(l + 1, i, count - leftCount);

      stack[sp++] = l; stack[sp++] = start; stack[sp++] = leftCount; stack[sp++] = depth + 1;
      stack[sp++] = l + 1; stack[sp++] = i; stack[sp++] = count - leftCount; stack[sp++] = depth + 1;
    }
    this.maxDepth = maxDepth;
    const needStack = Math.max(64, maxDepth * 2 + 8);
    if (this._stackNode.length < needStack) {
      this._stackNode = new Int32Array(needStack);
      this._stackT = new Float32Array(needStack);
    }
  }

  _nodeBoundsFromRange(node, start, count) {
    const ta = this._taabb;
    const idx = this.triIndex;
    let mnx = Infinity, mny = Infinity, mnz = Infinity;
    let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let i = start; i < start + count; i++) {
      const b = idx[i] * 6;
      if (ta[b] < mnx) mnx = ta[b];
      if (ta[b + 1] < mny) mny = ta[b + 1];
      if (ta[b + 2] < mnz) mnz = ta[b + 2];
      if (ta[b + 3] > mxx) mxx = ta[b + 3];
      if (ta[b + 4] > mxy) mxy = ta[b + 4];
      if (ta[b + 5] > mxz) mxz = ta[b + 5];
    }
    // Float32 storage can round a bound inwards; pad by a hair so we never
    // reject a triangle that actually straddles the plane.
    const p = 1e-5;
    const o = node * 6;
    this.nodeBounds[o] = mnx - p;
    this.nodeBounds[o + 1] = mny - p;
    this.nodeBounds[o + 2] = mnz - p;
    this.nodeBounds[o + 3] = mxx + p;
    this.nodeBounds[o + 4] = mxy + p;
    this.nodeBounds[o + 5] = mxz + p;
  }

  /* ---------------------------------------------------------------- */
  /* Queries                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Closest-hit ray query. `out` is a hit record (see math.makeHitRecord).
   * Returns true on hit. Both faces are tested — bullet penetration needs the
   * backface exit hit.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, mask, out, ignoreObject = -1) {
    out.hit = false;
    if (this.nodeCount === 0 || this.triCount === 0) return false;
    const ix = 1 / (dx !== 0 ? dx : 1e-30);
    const iy = 1 / (dy !== 0 ? dy : 1e-30);
    const iz = 1 / (dz !== 0 ? dz : 1e-30);
    const nb = this.nodeBounds;
    const meta = this.nodeMeta;
    const idx = this.triIndex;
    const pos = this.pos;
    const stackNode = this._stackNode;
    const stackT = this._stackT;

    let best = maxDist;
    let bestTri = -1;
    let bestFront = true;

    if (rayAabb(ox, oy, oz, ix, iy, iz, nb[0], nb[1], nb[2], nb[3], nb[4], nb[5], best) === Infinity)
      return false;

    let sp = 0;
    stackNode[sp] = 0;
    stackT[sp] = 0;
    sp++;

    while (sp > 0) {
      sp--;
      if (stackT[sp] >= best) continue;
      let node = stackNode[sp];
      for (;;) {
        const count = meta[node * 2 + 1];
        if (count > 0) {
          const start = meta[node * 2];
          for (let i = start; i < start + count; i++) {
            const tri = idx[i];
            if ((this.mask[tri] & mask) === 0) continue;
            if (ignoreObject >= 0 && this.object[tri] === ignoreObject) continue;
            const p = tri * 9;
            const t = rayTriangle(
              ox, oy, oz, dx, dy, dz,
              pos[p], pos[p + 1], pos[p + 2],
              pos[p + 3], pos[p + 4], pos[p + 5],
              pos[p + 6], pos[p + 7], pos[p + 8],
              out
            );
            if (t >= 0 && t < best) {
              best = t;
              bestTri = tri;
              bestFront = out.frontFace; // written by rayTriangle
            }
          }
          break;
        }
        const l = meta[node * 2];
        const r = l + 1;
        const lo = l * 6, ro = r * 6;
        const tl = rayAabb(ox, oy, oz, ix, iy, iz, nb[lo], nb[lo + 1], nb[lo + 2], nb[lo + 3], nb[lo + 4], nb[lo + 5], best);
        const tr = rayAabb(ox, oy, oz, ix, iy, iz, nb[ro], nb[ro + 1], nb[ro + 2], nb[ro + 3], nb[ro + 4], nb[ro + 5], best);
        if (tl === Infinity && tr === Infinity) break;
        if (tl <= tr) {
          if (tr !== Infinity) { stackNode[sp] = r; stackT[sp] = tr; sp++; }
          node = l;
        } else {
          if (tl !== Infinity) { stackNode[sp] = l; stackT[sp] = tl; sp++; }
          node = r;
        }
      }
    }

    if (bestTri < 0) return false;
    this._fillHit(out, bestTri, best, ox, oy, oz, dx, dy, dz);
    out.frontFace = bestFront;
    // Face the normal against the incoming ray so callers can always use it
    // directly for reflection / decal orientation.
    if (out.nx * dx + out.ny * dy + out.nz * dz > 0) {
      out.nx = -out.nx; out.ny = -out.ny; out.nz = -out.nz;
    }
    return true;
  }

  _fillHit(out, tri, t, ox, oy, oz, dx, dy, dz) {
    out.hit = true;
    out.t = t;
    out.px = ox + dx * t;
    out.py = oy + dy * t;
    out.pz = oz + dz * t;
    out.nx = this.nrm[tri * 3];
    out.ny = this.nrm[tri * 3 + 1];
    out.nz = this.nrm[tri * 3 + 2];
    out.tri = tri;
    out.surface = this.surface[tri];
    out.object = this.object[tri];
    out.body = null;
  }

  /** Any-hit shadow/visibility ray. Cheaper: no ordering, first hit wins. */
  raycastAny(ox, oy, oz, dx, dy, dz, maxDist, mask) {
    if (this.nodeCount === 0) return false;
    const ix = 1 / (dx !== 0 ? dx : 1e-30);
    const iy = 1 / (dy !== 0 ? dy : 1e-30);
    const iz = 1 / (dz !== 0 ? dz : 1e-30);
    const nb = this.nodeBounds;
    const meta = this.nodeMeta;
    const idx = this.triIndex;
    const pos = this.pos;
    const stack = this._stackNode;
    let sp = 0;
    if (rayAabb(ox, oy, oz, ix, iy, iz, nb[0], nb[1], nb[2], nb[3], nb[4], nb[5], maxDist) === Infinity)
      return false;
    stack[sp++] = 0;
    while (sp > 0) {
      const node = stack[--sp];
      const count = meta[node * 2 + 1];
      if (count > 0) {
        const start = meta[node * 2];
        for (let i = start; i < start + count; i++) {
          const tri = idx[i];
          if ((this.mask[tri] & mask) === 0) continue;
          const p = tri * 9;
          const t = rayTriangle(
            ox, oy, oz, dx, dy, dz,
            pos[p], pos[p + 1], pos[p + 2],
            pos[p + 3], pos[p + 4], pos[p + 5],
            pos[p + 6], pos[p + 7], pos[p + 8],
            null
          );
          if (t >= 0 && t < maxDist) return true;
        }
        continue;
      }
      const l = meta[node * 2];
      const r = l + 1;
      const lo = l * 6, ro = r * 6;
      if (rayAabb(ox, oy, oz, ix, iy, iz, nb[lo], nb[lo + 1], nb[lo + 2], nb[lo + 3], nb[lo + 4], nb[lo + 5], maxDist) !== Infinity)
        stack[sp++] = l;
      if (rayAabb(ox, oy, oz, ix, iy, iz, nb[ro], nb[ro + 1], nb[ro + 2], nb[ro + 3], nb[ro + 4], nb[ro + 5], maxDist) !== Infinity)
        stack[sp++] = r;
    }
    return false;
  }

  /** Gather triangle indices whose AABB overlaps the query box. */
  queryAabb(minx, miny, minz, maxx, maxy, maxz, mask) {
    this._candCount = 0;
    if (this.nodeCount === 0) return 0;
    const nb = this.nodeBounds;
    const meta = this.nodeMeta;
    const idx = this.triIndex;
    const ta = this._taabb;
    const stack = this._stackNode;
    let sp = 0;
    if (nb[0] > maxx || nb[3] < minx || nb[1] > maxy || nb[4] < miny || nb[2] > maxz || nb[5] < minz)
      return 0;
    stack[sp++] = 0;
    let n = 0;
    let cand = this._cand;
    while (sp > 0) {
      const node = stack[--sp];
      const count = meta[node * 2 + 1];
      if (count > 0) {
        const start = meta[node * 2];
        for (let i = start; i < start + count; i++) {
          const tri = idx[i];
          if ((this.mask[tri] & mask) === 0) continue;
          const b = tri * 6;
          if (ta[b] > maxx || ta[b + 3] < minx) continue;
          if (ta[b + 1] > maxy || ta[b + 4] < miny) continue;
          if (ta[b + 2] > maxz || ta[b + 5] < minz) continue;
          if (n >= cand.length) {
            const bigger = new Int32Array(cand.length * 2);
            bigger.set(cand);
            this._cand = cand = bigger;
          }
          cand[n++] = tri;
        }
        continue;
      }
      const l = meta[node * 2];
      const r = l + 1;
      const lo = l * 6, ro = r * 6;
      const hitL = !(nb[lo] > maxx || nb[lo + 3] < minx || nb[lo + 1] > maxy || nb[lo + 4] < miny || nb[lo + 2] > maxz || nb[lo + 5] < minz);
      const hitR = !(nb[ro] > maxx || nb[ro + 3] < minx || nb[ro + 1] > maxy || nb[ro + 4] < miny || nb[ro + 2] > maxz || nb[ro + 5] < minz);
      if (hitL) stack[sp++] = l;
      if (hitR) stack[sp++] = r;
      if (sp >= stack.length - 2) break; // stack is sized from tree depth; never hit in practice
    }
    this._candCount = n;
    return n;
  }

  get candidates() {
    return this._cand;
  }
  get candidateCount() {
    return this._candCount;
  }

  /**
   * Swept capsule against the static world. The capsule translates linearly;
   * per candidate triangle we run conservative advancement on the exact
   * segment/triangle distance function, which is convex under linear motion —
   * so the result is a true time of impact with no tunnelling at any speed.
   */
  sweepCapsule(p0x, p0y, p0z, p1x, p1y, p1z, radius, dx, dy, dz, maxDist, mask, out) {
    out.hit = false;
    if (this.nodeCount === 0) return false;
    const ex = dx * maxDist, ey = dy * maxDist, ez = dz * maxDist;
    const r = radius + 0.002;
    const minx = Math.min(p0x, p1x, p0x + ex, p1x + ex) - r;
    const miny = Math.min(p0y, p1y, p0y + ey, p1y + ey) - r;
    const minz = Math.min(p0z, p1z, p0z + ez, p1z + ez) - r;
    const maxx = Math.max(p0x, p1x, p0x + ex, p1x + ex) + r;
    const maxy = Math.max(p0y, p1y, p0y + ey, p1y + ey) + r;
    const maxz = Math.max(p0z, p1z, p0z + ez, p1z + ez) + r;
    const n = this.queryAabb(minx, miny, minz, maxx, maxy, maxz, mask);
    if (n === 0) return false;

    const cand = this._cand;
    const pos = this.pos;
    const nrm = this.nrm;
    const cl = this._cl;
    let best = maxDist;
    let bestTri = -1;
    let bnx = 0, bny = 1, bnz = 0;
    let bpx = 0, bpy = 0, bpz = 0;

    for (let c = 0; c < n; c++) {
      const tri = cand[c];
      const p = tri * 9;
      const ax = pos[p], ay = pos[p + 1], az = pos[p + 2];
      const bx = pos[p + 3], by = pos[p + 4], bz = pos[p + 5];
      const cx = pos[p + 6], cy = pos[p + 7], cz = pos[p + 8];

      // Cheap plane-slab prefilter. The min signed distance over the capsule
      // axis is linear in t, so the whole sweep can be rejected with two dots.
      const tnx = nrm[tri * 3], tny = nrm[tri * 3 + 1], tnz = nrm[tri * 3 + 2];
      const sdA = (p0x - ax) * tnx + (p0y - ay) * tny + (p0z - az) * tnz;
      const sdB = (p1x - ax) * tnx + (p1y - ay) * tny + (p1z - az) * tnz;
      const vd = (dx * tnx + dy * tny + dz * tnz) * best;
      const lo = Math.min(sdA, sdB) + Math.min(0, vd);
      const hi = Math.max(sdA, sdB) + Math.max(0, vd);
      if (lo > radius || hi < -radius) continue;

      let t = 0;
      let hitT = -1;
      for (let iter = 0; iter < CA_ITERS; iter++) {
        const ox = dx * t, oy = dy * t, oz = dz * t;
        segTriangleClosest(
          p0x + ox, p0y + oy, p0z + oz,
          p1x + ox, p1y + oy, p1z + oz,
          ax, ay, az, bx, by, bz, cx, cy, cz,
          cl
        );
        const dist = Math.sqrt(cl.d2) - radius;
        // separating axis: capsule axis point -> triangle point
        let sx = cl.bx - cl.ax, sy = cl.by - cl.ay, sz = cl.bz - cl.az;
        const sl = Math.hypot(sx, sy, sz);
        if (sl < 1e-12) { hitT = t; break; } // axis passes through the face
        sx /= sl; sy /= sl; sz /= sl;
        const closing = dx * sx + dy * sy + dz * sz;
        if (dist <= CA_TOL) {
          // Already touching. Only a *blocking* contact counts — a capsule
          // resting on the floor must still be able to slide along it, or the
          // controller stalls the instant it stands on anything.
          if (closing > 1e-6) hitT = t;
          break;
        }
        if (closing <= 1e-7) break; // convex distance is non-decreasing -> miss
        const step = dist / closing;
        t += step > 1e-7 ? step : 1e-7;
        if (t >= best) break;
      }
      if (hitT < 0 || hitT >= best) continue;

      // Recover the contact normal at the impact configuration.
      const ox = dx * hitT, oy = dy * hitT, oz = dz * hitT;
      segTriangleClosest(
        p0x + ox, p0y + oy, p0z + oz,
        p1x + ox, p1y + oy, p1z + oz,
        ax, ay, az, bx, by, bz, cx, cy, cz,
        cl
      );
      let nx = cl.ax - cl.bx, ny = cl.ay - cl.by, nz = cl.az - cl.bz;
      const nl = Math.hypot(nx, ny, nz);
      if (nl > 1e-7) { nx /= nl; ny /= nl; nz /= nl; }
      else { nx = tnx; ny = tny; nz = tnz; }
      // Never return a normal we are travelling away from.
      if (nx * dx + ny * dy + nz * dz > 0) {
        if (tnx * dx + tny * dy + tnz * dz < 0) { nx = tnx; ny = tny; nz = tnz; }
        else { nx = -tnx; ny = -tny; nz = -tnz; }
      }
      best = hitT;
      bestTri = tri;
      bnx = nx; bny = ny; bnz = nz;
      bpx = cl.bx; bpy = cl.by; bpz = cl.bz;
    }

    if (bestTri < 0) return false;
    out.hit = true;
    out.t = best;
    out.px = bpx; out.py = bpy; out.pz = bpz;
    out.nx = bnx; out.ny = bny; out.nz = bnz;
    out.tri = bestTri;
    out.surface = this.surface[bestTri];
    out.object = this.object[bestTri];
    out.frontFace = true;
    out.body = null;
    return true;
  }

  /**
   * Collect penetration contacts for a capsule at rest. Fills `this.contacts`
   * (shared, valid until the next overlap query). Normals point out of the
   * surface, towards the capsule.
   */
  overlapCapsule(p0x, p0y, p0z, p1x, p1y, p1z, radius, mask, margin = 0) {
    const cts = this.contacts;
    cts.count = 0;
    if (this.nodeCount === 0) return 0;
    const r = radius + margin;
    const n = this.queryAabb(
      Math.min(p0x, p1x) - r, Math.min(p0y, p1y) - r, Math.min(p0z, p1z) - r,
      Math.max(p0x, p1x) + r, Math.max(p0y, p1y) + r, Math.max(p0z, p1z) + r,
      mask
    );
    if (n === 0) return 0;
    const cand = this._cand;
    const pos = this.pos;
    const nrm = this.nrm;
    const cl = this._cl2;
    const r2 = r * r;
    let k = 0;
    for (let c = 0; c < n && k < cts.capacity; c++) {
      const tri = cand[c];
      const p = tri * 9;
      const d2 = segTriangleClosest(
        p0x, p0y, p0z, p1x, p1y, p1z,
        pos[p], pos[p + 1], pos[p + 2],
        pos[p + 3], pos[p + 4], pos[p + 5],
        pos[p + 6], pos[p + 7], pos[p + 8],
        cl
      );
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2);
      let nx, ny, nz;
      if (d > 1e-6) {
        nx = (cl.ax - cl.bx) / d;
        ny = (cl.ay - cl.by) / d;
        nz = (cl.az - cl.bz) / d;
        // Deep contacts can pick a normal pointing into the solid; fall back to
        // the face normal when the closest-point direction disagrees with it.
        const fn = nx * nrm[tri * 3] + ny * nrm[tri * 3 + 1] + nz * nrm[tri * 3 + 2];
        if (fn < 0.05) {
          nx = nrm[tri * 3]; ny = nrm[tri * 3 + 1]; nz = nrm[tri * 3 + 2];
        }
      } else {
        nx = nrm[tri * 3]; ny = nrm[tri * 3 + 1]; nz = nrm[tri * 3 + 2];
      }
      cts.nx[k] = nx; cts.ny[k] = ny; cts.nz[k] = nz;
      cts.px[k] = cl.bx; cts.py[k] = cl.by; cts.pz[k] = cl.bz;
      cts.depth[k] = r - d;
      cts.s[k] = cl.s;
      cts.tri[k] = tri;
      k++;
    }
    cts.count = k;
    return k;
  }

  surfaceOf(tri) {
    return this.surface[tri] ?? 0;
  }

  objectOf(tri) {
    return this.objects[this.object[tri]] ?? null;
  }

  dispose() {
    this.objects.length = 0;
    this.pos = new Float32Array(0);
    this.nodeCount = 0;
    this.triCount = 0;
  }
}

function surfaceArea(minx, miny, minz, maxx, maxy, maxz) {
  const dx = maxx - minx, dy = maxy - miny, dz = maxz - minz;
  if (dx < 0 || dy < 0 || dz < 0) return 0;
  return 2 * (dx * dy + dy * dz + dz * dx);
}

/* ------------------------------------------------------------------ */
/* Mesh baking                                                         */
/* ------------------------------------------------------------------ */

/**
 * Flatten a Mesh / InstancedMesh into world-space triangles.
 * Handles indexed and non-indexed geometry, multi-material groups (each group
 * can carry its own surface, inferred from the material name), and instancing.
 */
export function bakeMesh(mesh, surfaceOverride, opts = {}) {
  const geo = mesh.geometry;
  if (!geo || !geo.attributes || !geo.attributes.position) return null;
  const posAttr = geo.attributes.position;
  const index = geo.index;
  const triPerInstance = (index ? index.count : posAttr.count) / 3 | 0;
  if (triPerInstance === 0) return null;

  const isInstanced = mesh.isInstancedMesh === true && mesh.count > 0;
  const instances = isInstanced ? mesh.count : 1;
  const total = triPerInstance * instances;

  const out = new Float32Array(total * 9);
  const surfaces = new Uint8Array(total);

  mesh.updateWorldMatrix(true, false);

  // Per-group surface resolution.
  const groups = geo.groups && geo.groups.length ? geo.groups : null;
  const baseSurface = surfaceOverride !== undefined && surfaceOverride !== null
    ? surfaceIndex(surfaceOverride)
    : surfaceIndex(
        mesh.userData?.surface ?? materialName(mesh.material) ?? mesh.name,
        guessSurface(mesh.name)
      );
  const groupSurface = groups
    ? groups.map((g, gi) => {
        if (surfaceOverride !== undefined && surfaceOverride !== null) return baseSurface;
        const mat = Array.isArray(mesh.material) ? mesh.material[g.materialIndex ?? gi] : mesh.material;
        return surfaceIndex(mat?.userData?.surface ?? mat?.name ?? mesh.name, baseSurface);
      })
    : null;

  const pos = posAttr.array;
  const stride = posAttr.itemSize;
  const idxArr = index ? index.array : null;

  for (let inst = 0; inst < instances; inst++) {
    if (isInstanced) {
      mesh.getMatrixAt(inst, _m4);
      _m4.premultiply(mesh.matrixWorld);
    } else {
      _m4.copy(mesh.matrixWorld);
    }
    const e = _m4.elements;
    const base = inst * triPerInstance;
    for (let t = 0; t < triPerInstance; t++) {
      const o = (base + t) * 9;
      for (let v = 0; v < 3; v++) {
        const vi = idxArr ? idxArr[t * 3 + v] : t * 3 + v;
        const px = pos[vi * stride];
        const py = pos[vi * stride + 1];
        const pz = pos[vi * stride + 2];
        out[o + v * 3] = e[0] * px + e[4] * py + e[8] * pz + e[12];
        out[o + v * 3 + 1] = e[1] * px + e[5] * py + e[9] * pz + e[13];
        out[o + v * 3 + 2] = e[2] * px + e[6] * py + e[10] * pz + e[14];
      }
      let s = baseSurface;
      if (groupSurface) {
        const vStart = t * 3;
        for (let gi = 0; gi < geo.groups.length; gi++) {
          const g = geo.groups[gi];
          if (vStart >= g.start && vStart < g.start + g.count) { s = groupSurface[gi]; break; }
        }
      }
      surfaces[base + t] = s;
    }
  }

  // Drop degenerate triangles (zero area) — they poison normals and SAH bins.
  let w = 0;
  for (let t = 0; t < total; t++) {
    const p = t * 9;
    const e1x = out[p + 3] - out[p], e1y = out[p + 4] - out[p + 1], e1z = out[p + 5] - out[p + 2];
    const e2x = out[p + 6] - out[p], e2y = out[p + 7] - out[p + 1], e2z = out[p + 8] - out[p + 2];
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    if (cx * cx + cy * cy + cz * cz < 1e-14) continue;
    if (w !== t) {
      out.copyWithin(w * 9, p, p + 9);
      surfaces[w] = surfaces[t];
    }
    w++;
  }

  return { pos: out, count: w, surfaces, uniformSurface: baseSurface };
}

function materialName(m) {
  if (!m) return null;
  if (Array.isArray(m)) return m[0]?.name ?? null;
  return m.userData?.surface ?? m.name ?? null;
}
