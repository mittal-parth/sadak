import * as THREE from 'three';

/**
 * Curvature-driven vertex masks.
 *
 * Convex edges get *wear* (paint chipped off, corners rubbed back to the
 * substrate); concave creases get *grime* and extra AO. Baking this per-vertex
 * costs nothing at runtime and is what stops modular kit pieces from reading as
 * clean extruded boxes.
 *
 * Writes a 3-component `color` attribute:  r = wear, g = grime, b = extra AO.
 * All channels default to 0, which the material shader treats as "no effect",
 * so it is always safe to add.
 */

/** One triangle's three positions, in doubles — Vector3 arithmetic in disguise. */
const _tri = new Float64Array(9);

/**
 * The backing xyz array of a 3-component attribute.
 *
 * Returns `attribute.array` when the layout already is a tight xyz triple —
 * which is what `getX/getY/getZ` read anyway — and otherwise copies through the
 * accessors so the callers below only ever deal with one layout.
 */
function plainXYZ(attr) {
  if (attr.itemSize === 3 && !attr.normalized && !attr.isInterleavedBufferAttribute) {
    return attr.array;
  }
  const out = new Float64Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return out;
}

export function bakeMasks(geometry, opts = {}) {
  const {
    wear = 1,
    grime = 1,
    ao = 1,
    /** vertices whose convexity exceeds this are treated as a hard edge */
    edgeThreshold = 0.06,
    /** extra grime on downward faces (undersides collect dirt) */
    downGrime = 0.35,
    /** extra wear on upward faces (walked on, rained on) */
    upWear = 0.15,
    rng = null,
  } = opts;

  const pos = geometry.getAttribute('position');
  if (!pos) return geometry;
  let nrm = geometry.getAttribute('normal');
  if (!nrm) {
    geometry.computeVertexNormals();
    nrm = geometry.getAttribute('normal');
  }
  const count = pos.count;
  const index = geometry.getIndex();
  const idx = index ? index.array : null;
  const triCount = idx ? idx.length / 3 : count / 3;
  // Read straight out of the backing array instead of through getX/getY/getZ:
  // for a plain, non-normalised, 3-component attribute those accessors *are*
  // `array[i * 3 + k]`, so the values — and therefore every sum below — are
  // identical. Anything exotic (interleaved / normalised / padded) is copied
  // through the accessors once so the loops stay on one code path.
  const posArr = plainXYZ(pos);
  const nrmArr = plainXYZ(nrm);

  // Hard-edged kit geometry duplicates its vertices per face, so raw vertex
  // adjacency never crosses an edge and every box would come out perfectly
  // clean. Cluster by position first so adjacency (and therefore curvature)
  // spans the seam.
  //
  // This used to build a `${x},${y},${z}` string per vertex and hash that,
  // which was over half of the whole bake (measured: 50-65 ms of the 110-118 ms
  // this function costs at boot, over 202k vertices). Same grouping, no strings:
  // hash the quantised triple to an int, chain the buckets, and compare the
  // quantised coordinates exactly on collision. Cluster ids are still handed
  // out in first-seen order, so every downstream sum is bit-identical.
  const cluster = new Int32Array(count);
  const qx = new Float64Array(count);
  const qy = new Float64Array(count);
  const qz = new Float64Array(count);
  const chain = new Int32Array(count); // previous cluster sharing a hash, or -1
  const head = new Map(); // hash -> most recent cluster with that hash
  let clusters = 0;
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const x = Math.round(posArr[i3] * 8192);
    const y = Math.round(posArr[i3 + 1] * 8192);
    const z = Math.round(posArr[i3 + 2] * 8192);
    const h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0;
    let c = head.get(h);
    if (c === undefined) c = -1;
    let found = -1;
    while (c >= 0) {
      if (qx[c] === x && qy[c] === y && qz[c] === z) {
        found = c;
        break;
      }
      c = chain[c];
    }
    if (found < 0) {
      found = clusters++;
      qx[found] = x;
      qy[found] = y;
      qz[found] = z;
      chain[found] = head.has(h) ? head.get(h) : -1;
      head.set(h, found);
    }
    cluster[i] = found;
  }

  // Per cluster: the summed face normal and the summed offset to its
  // neighbours. dot(avgNormal, avgOffset) < 0 means the surrounding surface
  // folds *away* from the normal => a convex edge; > 0 => a concave crease.
  const sumOff = new Float32Array(clusters * 3);
  const hits = new Float32Array(clusters);
  const spread = new Float32Array(clusters);
  const cnx = new Float32Array(clusters * 3);
  const nCnt = new Float32Array(clusters);

  // Same arithmetic as before, in doubles out of the raw arrays: Vector3 holds
  // JS numbers, so `copy().sub().normalize()` was already float64 over
  // float32-widened inputs. `|| 1` guards a degenerate edge exactly as
  // Vector3.normalize() does, and the accumulation order (both offsets summed,
  // then added into the float32 accumulator) is preserved.
  for (let t = 0; t < triCount; t++) {
    const t3 = t * 3;
    const ia = idx ? idx[t3] : t3;
    const ib = idx ? idx[t3 + 1] : t3 + 1;
    const ic = idx ? idx[t3 + 2] : t3 + 2;
    _tri[0] = posArr[ia * 3];
    _tri[1] = posArr[ia * 3 + 1];
    _tri[2] = posArr[ia * 3 + 2];
    _tri[3] = posArr[ib * 3];
    _tri[4] = posArr[ib * 3 + 1];
    _tri[5] = posArr[ib * 3 + 2];
    _tri[6] = posArr[ic * 3];
    _tri[7] = posArr[ic * 3 + 1];
    _tri[8] = posArr[ic * 3 + 2];
    for (let k = 0; k < 3; k++) {
      const i = k === 0 ? ia : k === 1 ? ib : ic;
      const c = cluster[i];
      const c3 = c * 3;
      const p3 = k * 3;
      const q3 = (k + 1) % 3 * 3;
      const r3 = (k + 2) % 3 * 3;
      // Unit offsets so long thin triangles don't dominate the average.
      const ux = _tri[q3] - _tri[p3];
      const uy = _tri[q3 + 1] - _tri[p3 + 1];
      const uz = _tri[q3 + 2] - _tri[p3 + 2];
      const us = 1 / (Math.sqrt(ux * ux + uy * uy + uz * uz) || 1);
      const vx = _tri[r3] - _tri[p3];
      const vy = _tri[r3 + 1] - _tri[p3 + 1];
      const vz = _tri[r3 + 2] - _tri[p3 + 2];
      const vs = 1 / (Math.sqrt(vx * vx + vy * vy + vz * vz) || 1);
      sumOff[c3 + 0] += ux * us + vx * vs;
      sumOff[c3 + 1] += uy * us + vy * vs;
      sumOff[c3 + 2] += uz * us + vz * vs;
      hits[c] += 2;
      const n3 = i * 3;
      cnx[c3 + 0] += nrmArr[n3];
      cnx[c3 + 1] += nrmArr[n3 + 1];
      cnx[c3 + 2] += nrmArr[n3 + 2];
      nCnt[c] += 1;
    }
  }
  // How much the normals at a cluster disagree — 0 on a flat face, high on a
  // crease. This separates "on an edge" from "merely tilted".
  const curve = new Float32Array(clusters);
  for (let c = 0; c < clusters; c++) {
    const nl = Math.hypot(cnx[c * 3], cnx[c * 3 + 1], cnx[c * 3 + 2]);
    spread[c] = Math.min(1, Math.max(0, 1 - nl / Math.max(1, nCnt[c])));
    if (nl > 1e-6 && hits[c] > 0) {
      const k = 1 / (nl * hits[c]);
      curve[c] =
        (cnx[c * 3] * sumOff[c * 3] +
          cnx[c * 3 + 1] * sumOff[c * 3 + 1] +
          cnx[c * 3 + 2] * sumOff[c * 3 + 2]) *
        k;
    }
  }

  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const c = cluster[i];
    const mean = curve[c];
    const crease = Math.min(1, spread[c] / 0.18);
    // convex -> mean < 0, concave -> mean > 0
    const convex = crease * Math.min(1, Math.max(0, (-mean - edgeThreshold) / 0.22));
    const concave = crease * Math.min(1, Math.max(0, (mean - edgeThreshold) / 0.22));
    const ny = nrmArr[i * 3 + 1];
    const up = Math.max(0, ny);
    const down = Math.max(0, -ny);

    let w = convex * wear + up * up * upWear * wear;
    let g = concave * grime + down * downGrime * grime;
    let o = concave * ao;

    if (rng) {
      const j = 0.85 + rng.float() * 0.3;
      w *= j;
      g *= 2 - j;
    }
    colors[i * 3 + 0] = Math.min(1, w);
    colors[i * 3 + 1] = Math.min(1, g);
    colors[i * 3 + 2] = Math.min(1, o);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Push wear/grime straight onto an already-authored colour attribute without
 * recomputing curvature — used by callers that know their own topology.
 */
export function setMask(geometry, { wear = 0, grime = 0, ao = 0 } = {}) {
  const pos = geometry.getAttribute('position');
  if (!pos) return geometry;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3 + 0] = wear;
    colors[i * 3 + 1] = grime;
    colors[i * 3 + 2] = ao;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
