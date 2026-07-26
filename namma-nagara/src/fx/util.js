/**
 * Allocation-free vector scratch used by the FX spawners. Every helper writes
 * into a module-level triple and returns it, so a burst of 60 particles does
 * not create 60 Vector3s.
 */

export const V = { x: 0, y: 0, z: 0 };
export const V2 = { x: 0, y: 0, z: 0 };

export function reflect(out, dx, dy, dz, nx, ny, nz) {
  const d = dx * nx + dy * ny + dz * nz;
  out.x = dx - 2 * d * nx;
  out.y = dy - 2 * d * ny;
  out.z = dz - 2 * d * nz;
  return out;
}

/** Build any orthonormal pair around (nx,ny,nz) into t/b of `out`. */
export function basis(out, nx, ny, nz) {
  let ax = 0;
  let ay = 1;
  let az = 0;
  if (Math.abs(ny) > 0.9) {
    ax = 1;
    ay = 0;
  }
  let tx = ay * nz - az * ny;
  let ty = az * nx - ax * nz;
  let tz = ax * ny - ay * nx;
  const l = Math.hypot(tx, ty, tz) || 1;
  tx /= l;
  ty /= l;
  tz /= l;
  out.tx = tx;
  out.ty = ty;
  out.tz = tz;
  out.bx = ny * tz - nz * ty;
  out.by = nz * tx - nx * tz;
  out.bz = nx * ty - ny * tx;
  return out;
}

const B = { tx: 0, ty: 0, tz: 0, bx: 0, by: 0, bz: 0 };

/**
 * Random unit direction inside a cone of half-angle `spread` (radians) around
 * a unit axis. `power` > 1 biases toward the axis.
 */
export function cone(out, rng, ax, ay, az, spread, power = 1) {
  basis(B, ax, ay, az);
  const u = Math.pow(rng.float(), power);
  const cosT = Math.cos(spread * u);
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  const phi = rng.float() * Math.PI * 2;
  const cp = Math.cos(phi) * sinT;
  const sp = Math.sin(phi) * sinT;
  out.x = ax * cosT + B.tx * cp + B.bx * sp;
  out.y = ay * cosT + B.ty * cp + B.by * sp;
  out.z = az * cosT + B.tz * cp + B.bz * sp;
  return out;
}

/** Uniform direction on the hemisphere around a unit axis. */
export function hemi(out, rng, ax, ay, az) {
  return cone(out, rng, ax, ay, az, Math.PI * 0.5, 1);
}

/**
 * Force a direction into the hemisphere around an axis by mirroring whatever
 * component points the wrong way, keeping a minimum forward bias.
 *
 * Ejecta that leaves a surface *into* the surface is the single loudest tell
 * that a spark system is a random-direction emitter: real sparks off a wall
 * only ever occupy the normal hemisphere, and sparks off a muzzle only ever
 * leave down-bore. `bias` is the minimum cosine kept against the axis.
 */
export function towardHemi(out, ax, ay, az, bias = 0.08) {
  const d = out.x * ax + out.y * ay + out.z * az;
  if (d < bias) {
    // reflect back across the plane, then push it clear of the surface
    const k = bias - d;
    out.x += ax * (k - 2 * Math.min(0, d));
    out.y += ay * (k - 2 * Math.min(0, d));
    out.z += az * (k - 2 * Math.min(0, d));
    const l = Math.hypot(out.x, out.y, out.z) || 1;
    out.x /= l;
    out.y /= l;
    out.z /= l;
  }
  return out;
}

/**
 * Hard cone clamp: force a direction to lie within `cosMax` of an axis, keeping
 * whatever tangential direction it already had.
 *
 * `towardHemi` only guarantees a particle is not travelling *into* the surface,
 * which still leaves a full 180 deg fan — including sparks flying sideways past
 * the camera, which is the loudest tell of a random-direction emitter. Ejecta
 * from a rifle impact leaves inside roughly +-55 deg of the normal, and muzzle
 * embers inside +-55 deg of the bore, so that is what this enforces.
 *
 * @param {number} cosMax cosine of the half-angle, e.g. cos(55 deg) = 0.574
 */
export function clampCone(out, ax, ay, az, cosMax) {
  const d = out.x * ax + out.y * ay + out.z * az;
  if (d >= cosMax) return out;
  let tx = out.x - ax * d;
  let ty = out.y - ay * d;
  let tz = out.z - az * d;
  const tl = Math.hypot(tx, ty, tz);
  if (tl < 1e-5) {
    out.x = ax;
    out.y = ay;
    out.z = az;
    return out;
  }
  const s = Math.sqrt(Math.max(0, 1 - cosMax * cosMax)) / tl;
  out.x = ax * cosMax + tx * s;
  out.y = ay * cosMax + ty * s;
  out.z = az * cosMax + tz * s;
  return out;
}

/** cos(55 deg) — the ejecta cone half-angle shared by impacts and the muzzle. */
export const COS55 = 0.5735764;

/**
 * Planckian locus, normalised so the brightest channel is 1: the colour a
 * cooling steel spark actually goes through. 2500 K is a fresh spark leaving
 * the impact (orange-white), 1200 K is the same particle a third of a second
 * later (deep red, barely visible). Sampled from a fit of the CIE blackbody
 * table, which is cheap and monotonic — the important thing is that R:G:B
 * separates as it cools instead of every spark being white.
 */
export function blackbody(out, kelvin) {
  const t = clamp(kelvin, 1000, 6500) / 100;
  let r;
  let g;
  let b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.52 * Math.log(t - 10) - 305.04;
  r = clamp(r, 0, 255) / 255;
  g = clamp(g, 0, 255) / 255;
  b = clamp(b, 0, 255) / 255;
  // sRGB -> linear, then normalise on the peak so the caller controls radiance
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  r = lin(r);
  g = lin(g);
  b = lin(b);
  const m = Math.max(r, g, b, 1e-4);
  out.r = r / m;
  out.g = g / m;
  out.b = b / m;
  return out;
}

/** Scratch colour for {@link blackbody}. */
export const C = { r: 1, g: 1, b: 1 };
export const C2 = { r: 1, g: 1, b: 1 };

/** Random point inside a disc of radius r on the plane whose normal is (n). */
export function discOn(out, rng, nx, ny, nz, r) {
  basis(B, nx, ny, nz);
  const rr = Math.sqrt(rng.float()) * r;
  const a = rng.float() * Math.PI * 2;
  const cx = Math.cos(a) * rr;
  const cy = Math.sin(a) * rr;
  out.x = B.tx * cx + B.bx * cy;
  out.y = B.ty * cx + B.by * cy;
  out.z = B.tz * cx + B.bz * cy;
  return out;
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
