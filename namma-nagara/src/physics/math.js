/**
 * Allocation-free geometric kernel for the physics system.
 *
 * Every routine here takes scalar components and writes into a caller-supplied
 * "out" record, so the hot paths (BVH traversal, capsule sweeps, contact
 * generation) never touch the allocator. Records are plain objects with fixed
 * shapes so V8 keeps them monomorphic.
 *
 * Conventions
 *  - Right-handed, Y-up, metres.
 *  - A capsule is the Minkowski sum of a segment (p0..p1) and a sphere of
 *    radius r. p0/p1 are the *sphere centres*, not the tips.
 *  - Triangle winding is CCW when seen from the front face; the geometric
 *    normal is normalize(cross(b-a, c-a)).
 */

export const EPS = 1e-9;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A closest-feature record. Reused everywhere; never allocated per query. */
export function makeClosest() {
  return { d2: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, s: 0, t: 0 };
}

/** A raycast/sweep result record. */
export function makeHitRecord() {
  return {
    hit: false,
    t: 0,
    px: 0,
    py: 0,
    pz: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    tri: -1,
    surface: 0,
    object: -1,
    frontFace: true,
    body: null,
  };
}

/* ------------------------------------------------------------------ */
/* Ray primitives                                                      */
/* ------------------------------------------------------------------ */

/**
 * Möller–Trumbore. Returns the ray parameter t (distance if dir is unit) or
 * -1 on miss. Does not cull backfaces — penetration needs exit hits.
 * `out.frontFace` is written when out is supplied.
 */
export function rayTriangle(
  ox, oy, oz, dx, dy, dz,
  ax, ay, az, bx, by, bz, cx, cy, cz,
  out
) {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -1e-12 && det < 1e-12) return -1; // parallel
  const inv = 1 / det;
  const tx = ox - ax, ty = oy - ay, tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-6 || u > 1.000001) return -1;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-6 || u + v > 1.000001) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  if (out) out.frontFace = det > 0;
  return t;
}

/**
 * Slab test against an AABB using precomputed reciprocal direction.
 * Returns the entry distance, or Infinity on miss. Handles rays starting
 * inside the box (returns 0).
 */
export function rayAabb(
  ox, oy, oz, ix, iy, iz,
  minx, miny, minz, maxx, maxy, maxz,
  tmax
) {
  let t0 = (minx - ox) * ix;
  let t1 = (maxx - ox) * ix;
  let lo = t0 < t1 ? t0 : t1;
  let hi = t0 < t1 ? t1 : t0;
  t0 = (miny - oy) * iy;
  t1 = (maxy - oy) * iy;
  const lo1 = t0 < t1 ? t0 : t1;
  const hi1 = t0 < t1 ? t1 : t0;
  if (lo1 > lo) lo = lo1;
  if (hi1 < hi) hi = hi1;
  t0 = (minz - oz) * iz;
  t1 = (maxz - oz) * iz;
  const lo2 = t0 < t1 ? t0 : t1;
  const hi2 = t0 < t1 ? t1 : t0;
  if (lo2 > lo) lo = lo2;
  if (hi2 < hi) hi = hi2;
  if (hi < 0 || lo > hi || lo > tmax) return Infinity;
  return lo < 0 ? 0 : lo;
}

/* ------------------------------------------------------------------ */
/* Closest-feature queries                                             */
/* ------------------------------------------------------------------ */

/** Ericson, Real-Time Collision Detection §5.1.5. Writes out.b* = point on tri. */
export function closestPtPointTriangle(
  px, py, pz,
  ax, ay, az, bx, by, bz, cx, cy, cz,
  out
) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    out.bx = ax; out.by = ay; out.bz = az;
    return;
  }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    out.bx = bx; out.by = by; out.bz = bz;
    return;
  }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out.bx = ax + abx * v; out.by = ay + aby * v; out.bz = az + abz * v;
    return;
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    out.bx = cx; out.by = cy; out.bz = cz;
    return;
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out.bx = ax + acx * w; out.by = ay + acy * w; out.bz = az + acz * w;
    return;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    out.bx = bx + (cx - bx) * w; out.by = by + (cy - by) * w; out.bz = bz + (cz - bz) * w;
    return;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  out.bx = ax + abx * v + acx * w;
  out.by = ay + aby * v + acy * w;
  out.bz = az + abz * v + acz * w;
}

/**
 * Closest points between segments p1q1 and p2q2 (Ericson §5.1.9).
 * Writes out.a* (on segment 1), out.b* (on segment 2), out.s/out.t, out.d2.
 */
export function closestPtSegSeg(
  p1x, p1y, p1z, q1x, q1y, q1z,
  p2x, p2y, p2z, q2x, q2y, q2z,
  out
) {
  const dx1 = q1x - p1x, dy1 = q1y - p1y, dz1 = q1z - p1z;
  const dx2 = q2x - p2x, dy2 = q2y - p2y, dz2 = q2z - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = dx1 * dx1 + dy1 * dy1 + dz1 * dz1;
  const e = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;
  const f = dx2 * rx + dy2 * ry + dz2 * rz;
  let s, t;
  if (a <= EPS && e <= EPS) {
    s = 0; t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dx1 * rx + dy1 * ry + dz1 * rz;
    if (e <= EPS) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dx1 * dx2 + dy1 * dy2 + dz1 * dz2;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const ax = p1x + dx1 * s, ay = p1y + dy1 * s, az = p1z + dz1 * s;
  const bx = p2x + dx2 * t, by = p2y + dy2 * t, bz = p2z + dz2 * t;
  out.ax = ax; out.ay = ay; out.az = az;
  out.bx = bx; out.by = by; out.bz = bz;
  out.s = s; out.t = t;
  const ex = ax - bx, ey = ay - by, ez = az - bz;
  out.d2 = ex * ex + ey * ey + ez * ez;
  return out.d2;
}

const _tmp = makeClosest();

/**
 * Squared distance between segment p0p1 and triangle abc, plus the closest
 * point pair (out.a* on the segment, out.b* on the triangle).
 *
 * This is the single most important routine in the system: capsule sweeps,
 * capsule overlap, ragdoll bone collision and rigid-body probes all reduce to
 * it. Cost is ~5 sub-queries worst case, early-outs on intersection.
 */
export function segTriangleClosest(
  p0x, p0y, p0z, p1x, p1y, p1z,
  ax, ay, az, bx, by, bz, cx, cy, cz,
  out
) {
  // Plane straddle test first: if the segment crosses the triangle interior the
  // distance is exactly zero and we can skip the five edge/vertex sub-queries.
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const d0 = nx * (p0x - ax) + ny * (p0y - ay) + nz * (p0z - az);
  const d1 = nx * (p1x - ax) + ny * (p1y - ay) + nz * (p1z - az);
  if ((d0 > 0) !== (d1 > 0)) {
    const denom = d0 - d1;
    if (denom !== 0) {
      const u = d0 / denom;
      const ix = p0x + (p1x - p0x) * u;
      const iy = p0y + (p1y - p0y) * u;
      const iz = p0z + (p1z - p0z) * u;
      // barycentric inside test
      const vx = ix - ax, vy = iy - ay, vz = iz - az;
      const d00 = abx * abx + aby * aby + abz * abz;
      const d01 = abx * acx + aby * acy + abz * acz;
      const d11 = acx * acx + acy * acy + acz * acz;
      const d20 = vx * abx + vy * aby + vz * abz;
      const d21 = vx * acx + vy * acy + vz * acz;
      const den = d00 * d11 - d01 * d01;
      if (den !== 0) {
        const v = (d11 * d20 - d01 * d21) / den;
        const w = (d00 * d21 - d01 * d20) / den;
        if (v >= 0 && w >= 0 && v + w <= 1) {
          out.d2 = 0;
          out.ax = ix; out.ay = iy; out.az = iz;
          out.bx = ix; out.by = iy; out.bz = iz;
          out.s = u; out.t = 0;
          return 0;
        }
      }
    }
  }

  let best = Infinity;

  // segment endpoints vs triangle face
  closestPtPointTriangle(p0x, p0y, p0z, ax, ay, az, bx, by, bz, cx, cy, cz, _tmp);
  let ex = p0x - _tmp.bx, ey = p0y - _tmp.by, ez = p0z - _tmp.bz;
  let d = ex * ex + ey * ey + ez * ez;
  if (d < best) {
    best = d;
    out.ax = p0x; out.ay = p0y; out.az = p0z;
    out.bx = _tmp.bx; out.by = _tmp.by; out.bz = _tmp.bz;
    out.s = 0;
  }
  closestPtPointTriangle(p1x, p1y, p1z, ax, ay, az, bx, by, bz, cx, cy, cz, _tmp);
  ex = p1x - _tmp.bx; ey = p1y - _tmp.by; ez = p1z - _tmp.bz;
  d = ex * ex + ey * ey + ez * ez;
  if (d < best) {
    best = d;
    out.ax = p1x; out.ay = p1y; out.az = p1z;
    out.bx = _tmp.bx; out.by = _tmp.by; out.bz = _tmp.bz;
    out.s = 1;
  }

  // segment vs the three triangle edges
  d = closestPtSegSeg(p0x, p0y, p0z, p1x, p1y, p1z, ax, ay, az, bx, by, bz, _tmp);
  if (d < best) {
    best = d;
    out.ax = _tmp.ax; out.ay = _tmp.ay; out.az = _tmp.az;
    out.bx = _tmp.bx; out.by = _tmp.by; out.bz = _tmp.bz;
    out.s = _tmp.s;
  }
  d = closestPtSegSeg(p0x, p0y, p0z, p1x, p1y, p1z, bx, by, bz, cx, cy, cz, _tmp);
  if (d < best) {
    best = d;
    out.ax = _tmp.ax; out.ay = _tmp.ay; out.az = _tmp.az;
    out.bx = _tmp.bx; out.by = _tmp.by; out.bz = _tmp.bz;
    out.s = _tmp.s;
  }
  d = closestPtSegSeg(p0x, p0y, p0z, p1x, p1y, p1z, cx, cy, cz, ax, ay, az, _tmp);
  if (d < best) {
    best = d;
    out.ax = _tmp.ax; out.ay = _tmp.ay; out.az = _tmp.az;
    out.bx = _tmp.bx; out.by = _tmp.by; out.bz = _tmp.bz;
    out.s = _tmp.s;
  }

  out.d2 = best;
  return best;
}

/* ------------------------------------------------------------------ */
/* Analytic sweeps used for dynamic (non-BVH) proxies                  */
/* ------------------------------------------------------------------ */

/** Ray vs sphere. Returns entry distance or -1. */
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxDist) {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq; // origin inside
  if (t < 0 || t > maxDist) return -1;
  return t;
}

/**
 * Ray vs capsule (segment a..b, radius r). Returns distance or -1.
 * Solved as ray-vs-infinite-cylinder clipped by the two end spheres.
 */
export function rayCapsule(
  ox, oy, oz, dx, dy, dz,
  ax, ay, az, bx, by, bz, r, maxDist
) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const aox = ox - ax, aoy = oy - ay, aoz = oz - az;
  const abd = abx * dx + aby * dy + abz * dz;
  const abo = abx * aox + aby * aoy + abz * aoz;
  const abab = abx * abx + aby * aby + abz * abz;
  if (abab < EPS) return raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r, maxDist);
  const m = abd / abab;
  const n = abo / abab;
  const qx = dx - abx * m, qy = dy - aby * m, qz = dz - abz * m;
  const sx = aox - abx * n, sy = aoy - aby * n, sz = aoz - abz * n;
  const A = qx * qx + qy * qy + qz * qz;
  const B = 2 * (qx * sx + qy * sy + qz * sz);
  const C = sx * sx + sy * sy + sz * sz - r * r;
  let best = -1;
  if (A > EPS) {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      let t = (-B - sq) / (2 * A);
      if (t < 0) t = (-B + sq) / (2 * A);
      if (t >= 0 && t <= maxDist) {
        const k = n + t * m;
        if (k >= 0 && k <= 1) best = t;
      }
    }
  } else if (C <= 0) {
    best = 0; // ray parallel to axis and already inside the cylinder
  }
  const t1 = raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r, maxDist);
  if (t1 >= 0 && (best < 0 || t1 < best)) best = t1;
  const t2 = raySphere(ox, oy, oz, dx, dy, dz, bx, by, bz, r, maxDist);
  if (t2 >= 0 && (best < 0 || t2 < best)) best = t2;
  return best;
}

/** Ray vs oriented box. `inv` is the world->local matrix elements (Matrix4.elements). */
export function rayObb(ox, oy, oz, dx, dy, dz, inv, hx, hy, hz, maxDist) {
  const lx = inv[0] * ox + inv[4] * oy + inv[8] * oz + inv[12];
  const ly = inv[1] * ox + inv[5] * oy + inv[9] * oz + inv[13];
  const lz = inv[2] * ox + inv[6] * oy + inv[10] * oz + inv[14];
  const ldx = inv[0] * dx + inv[4] * dy + inv[8] * dz;
  const ldy = inv[1] * dx + inv[5] * dy + inv[9] * dz;
  const ldz = inv[2] * dx + inv[6] * dy + inv[10] * dz;
  const t = rayAabb(
    lx, ly, lz,
    1 / (ldx || 1e-30), 1 / (ldy || 1e-30), 1 / (ldz || 1e-30),
    -hx, -hy, -hz, hx, hy, hz,
    maxDist
  );
  return t === Infinity ? -1 : t;
}
