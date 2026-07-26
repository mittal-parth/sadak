import * as THREE from 'three';
import { Noise, clamp01, smoothstep, encodeSrgb } from './noise.js';

/**
 * Every FX texture in the game is baked here, once, at load time — there are no
 * image files anywhere in this project.
 *
 * Two atlases:
 *   PARTICLES  RGBA. RGB is a *detail/tint* field (internal density structure,
 *              hot-core gradients) that the shader multiplies by the
 *              per-particle colour; A is coverage.
 *   DECALS     albedo RGBA + normal RGB + ORM (r=ao, g=roughness, b=metalness),
 *              derived from a per-tile height field so bullet holes have real
 *              relief instead of being stickers.
 */

// ---------------------------------------------------------------------------
//  particle atlas layout (4x4)
// ---------------------------------------------------------------------------
export const P = {
  SMOKE_A: 0,
  SMOKE_B: 1,
  WISP: 2,
  DUST: 3,
  SPARK: 4,
  STREAK: 5,
  FLASH_LOBE: 6,
  FLASH_CORE: 7,
  CHIP: 8,
  SPLINTER: 9,
  DROPLET: 10,
  MIST: 11,
  SPLASH: 12,
  RING: 13,
  FIRE: 14,
  MOTE: 15,
};

// ---------------------------------------------------------------------------
//  decal atlas layout (4x4)
// ---------------------------------------------------------------------------
export const D = {
  HOLE_CONCRETE: 0,
  HOLE_CONCRETE_B: 1,
  HOLE_METAL: 2,
  HOLE_WOOD: 3,
  HOLE_PLASTER: 4,
  GLASS_CRACK: 5,
  BLOOD_A: 6,
  BLOOD_B: 7,
  SCORCH: 8,
  IMPACT_DIRT: 9,
  IMPACT_SAND: 10,
  SCRAPE: 11,
  RIPPLE: 12,
  HOLE_GLASS: 13,
  SMUDGE: 14,
  TEAR: 15,
};

const ATLAS_COLS = 4;

/* ========================================================================= */
/*  particle tiles                                                           */
/* ========================================================================= */

/**
 * Each painter writes `out = [r,g,b,a]` for a point (x,y) in -1..1.
 * RGB is linear here; it gets sRGB-encoded on the way into the texture.
 */
const PARTICLE_PAINTERS = [
  // 0 — SMOKE_A: billowing puff, wispy eroded rim
  (n, x, y, r, out) => {
    const w = n.warped(x * 2.05 + 3.7, y * 2.05 - 1.4, 0.8, 5);
    const lump = n.worley(x * 2.4 + 7.1, y * 2.4 + 2.3);
    const tear = n.fbm(x * 7.4 - 6.2, y * 7.4 + 3.9, 3);
    let a = smoothstep(0, 0.58, 1 - r + (w - 0.5) * 0.8 + (lump - 0.45) * 0.26);
    // High-frequency erosion only near the rim: keeps the core dense while the
    // silhouette tears the way real dust does.
    a *= 1 - smoothstep(0.35, 0.95, r) * (1 - tear) * 0.85;
    a *= smoothstep(1.02, 0.66, r);
    const det = n.fbm(x * 4.6 - 2.1, y * 4.6 + 8.4, 4);
    const l = 0.42 + 0.66 * det * det;
    out[0] = l;
    out[1] = l * 0.995;
    out[2] = l * 0.99;
    out[3] = a;
  },
  // 1 — SMOKE_B: cauliflower lobes, denser core
  (n, x, y, r, out) => {
    const cw = 1 - n.worley(x * 3.05 - 4.3, y * 3.05 + 6.7);
    const f = n.fbm(x * 1.9 + 12.2, y * 1.9 - 3.3, 4);
    const tear = n.fbm(x * 8.8 + 1.7, y * 8.8 - 4.4, 3);
    let a = smoothstep(0, 0.52, 1 - r * 1.02 + (cw - 0.42) * 0.68 + (f - 0.5) * 0.46);
    a *= 1 - smoothstep(0.3, 0.92, r) * (1 - tear) * 0.9;
    a *= smoothstep(1.0, 0.6, r);
    const det = n.fbm(x * 6.1 + 4.4, y * 6.1 - 5.2, 4);
    const l = 0.38 + 0.7 * (0.35 * det + 0.65 * cw);
    out[0] = l;
    out[1] = l * 0.99;
    out[2] = l * 0.975;
    out[3] = a;
  },
  // 2 — WISP: torn filaments, drifts and dissipates
  (n, x, y, r, out) => {
    const fil = n.ridged(x * 2.6 + 1.3, y * 1.05 - 6.0, 4);
    const body = smoothstep(0, 0.75, 1 - Math.hypot(x * 1.05, y * 0.78));
    let a = clamp01(smoothstep(0.28, 0.85, fil) * 1.15 + 0.16) * body * body;
    a *= smoothstep(1.05, 0.55, r);
    const l = 0.5 + 0.55 * fil;
    out[0] = l;
    out[1] = l * 0.99;
    out[2] = l * 0.985;
    out[3] = a * 0.9;
  },
  // 3 — DUST: fine grained, sharp-ish falloff, grit specks
  (n, x, y, r, out) => {
    const w = n.warped(x * 3.3 + 21.1, y * 3.3 + 5.9, 0.55, 5);
    const grit = n.fbm(x * 15.5 + 3.3, y * 15.5 - 7.7, 2);
    let a = smoothstep(0, 0.5, 1 - r * 1.04 + (w - 0.5) * 0.86);
    a *= 1 - smoothstep(0.25, 0.9, r) * (1 - grit) * 0.8;
    a *= smoothstep(1.0, 0.62, r);
    // Grain, not snow: a soft ramp instead of a threshold, or every puff wears
    // a scatter of hard white dots.
    const l = 0.48 + 0.42 * w + 0.16 * smoothstep(0.6, 0.92, grit);
    out[0] = Math.min(1, l);
    out[1] = Math.min(1, l * 0.985);
    out[2] = Math.min(1, l * 0.96);
    out[3] = a;
  },
  // 4 — SPARK: point with a tight bloom halo
  (n, x, y, r, out) => {
    const core = Math.exp(-r * r * 26);
    const glow = Math.exp(-r * r * 4.5) * 0.4;
    const a = clamp01(core + glow) * smoothstep(1.0, 0.85, r);
    out[0] = 1;
    out[1] = 1;
    out[2] = 1;
    out[3] = a;
  },
  // 5 — STREAK: capsule along +Y, bright head, fading tail (tracers, spark trails)
  (n, x, y, r, out) => {
    const halfW = 0.26 * (0.55 + 0.45 * smoothstep(-1.0, 0.6, y));
    const q = Math.abs(x) / halfW;
    const core = Math.exp(-q * q * 3.0);
    const along = smoothstep(-1.02, -0.55, y) * smoothstep(1.02, 0.72, y);
    const taper = 0.1 + 0.9 * smoothstep(-1.0, 0.85, y);
    const jag = 0.85 + 0.3 * n.fbm(x * 6 + 2.2, y * 3.1 - 8.8, 3);
    let a = core * along * taper * jag;
    a += Math.exp(-(x * x * 90 + (y - 0.72) * (y - 0.72) * 30)) * 0.9; // hot head
    out[0] = 1;
    out[1] = 1;
    out[2] = 1;
    out[3] = clamp01(a);
  },
  // 6 — FLASH_LOBE: ONE tongue of burning gas. Root at the -X edge, tip toward
  //     +X. Deliberately one-sided and asymmetric: muzzle.js stamps a handful of
  //     these at independent rolls, so any radial symmetry in the sprite itself
  //     rebuilds the cartoon starburst this replaces. There is no spike term.
  (n, x, y, r, out) => {
    const u = clamp01((x + 1) * 0.5); // 0 at the root, 1 at the tip
    // Width: swells just past the crown where the gas is still choked, then
    // tapers to a torn point. Half-width in painter units.
    const swell = Math.pow(u + 0.02, 0.5) * Math.pow(1 - u, 0.7);
    // The tongue leans and wanders instead of running straight down +X.
    const lean = 0.26 * u * u - 0.07 * u + 0.2 * (n.fbm(u * 2.4 + 4.1, 8.3, 3) - 0.5) * u;
    let w = 0.04 + 1.5 * swell;
    // Shear only the +Y flank: a smooth pressure face on one side, a shredded
    // shear layer on the other, which is what high-speed film actually shows.
    const shear = n.fbm(u * 4.6 - 3.3, y * 2.2 + 1.9, 4);
    const flank = smoothstep(0.0, 0.5, (y - lean) / Math.max(w, 1e-3));
    w *= 1 - flank * (1 - shear) * 0.5;
    const q = (y - lean) / Math.max(w, 1e-3);
    let a = Math.exp(-q * q * 2.0);
    // Tip: the gas has burnt out and is tearing into filaments.
    const frag = n.fbm(u * 6.8 + 12.7, y * 4.4 - 6.4, 4);
    a *= 1 - smoothstep(0.46, 1.0, u) * (1 - frag) * 1.5;
    // Internal turbulence so the body is not a smooth airbrushed blob.
    a *= 0.72 + 0.46 * n.fbm(u * 7.9 - 8.1, y * 3.6 + 15.2, 4);
    // Close the root with a rounded cap, and never let the tip touch the tile
    // edge (a clipped filament reads as a hard rectangle at this intensity).
    a *= smoothstep(-1.0, -0.86, x) * smoothstep(1.0, 0.86, u);
    a += Math.exp(-((x + 0.8) * (x + 0.8) * 13.0 + y * y * 30.0)) * 0.85;
    // Colour: white-hot at the choke, orange through the body, sooty at the
    // shredding tip and along the cool outer edges.
    const edge = clamp01(Math.abs(q) * 0.72);
    const t = clamp01(smoothstep(0.02, 0.72, u) * 0.85 + edge * 0.4);
    const soot = smoothstep(0.62, 1.0, u) * 0.34;
    const den = 0.82 + 0.34 * shear;
    out[0] = clamp01((1 - soot) * den);
    out[1] = clamp01((1 - 0.52 * t) * (1 - soot * 1.3) * den);
    out[2] = clamp01((1 - 0.84 * t) * (1 - soot * 1.6) * den);
    out[3] = clamp01(a);
  },
  // 7 — FLASH_CORE: the choked, boiling gas ball right at the crown. Drawn
  //     small and very hot, so what has to survive clipping is the *silhouette*:
  //     the radius is warped per-direction and the interior churns.
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const lump = n.fbm(Math.cos(ang) * 1.7 + 30.1, Math.sin(ang) * 1.7 + 9.4, 3);
    const churn = n.fbm(x * 3.1 - 5.5, y * 3.1 + 2.2, 4);
    const rr = r * (0.84 + 0.32 * lump) * (0.94 + 0.14 * churn);
    let a = Math.exp(-rr * rr * 15.0) * (0.74 + 0.48 * churn) + Math.exp(-rr * rr * 44) * 0.95;
    a *= smoothstep(1.02, 0.72, r);
    const t = smoothstep(0.0, 0.7, rr);
    out[0] = 1;
    out[1] = 1 - 0.2 * t;
    out[2] = 1 - 0.5 * t;
    out[3] = clamp01(a);
  },
  // 8 — CHIP: solid angular fleck of masonry
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const shape =
      0.52 + 0.34 * n.fbm(Math.cos(ang) * 1.8 + 5.5, Math.sin(ang) * 1.8 + 2.9, 2) - 0.1 * Math.abs(Math.sin(ang * 2.5));
    const a = smoothstep(shape, shape - 0.09, r);
    const facet = n.fbm(x * 3.4 - 4.2, y * 3.4 + 1.1, 3);
    const l = 0.34 + 0.5 * facet + 0.22 * clamp01(0.5 - y);
    out[0] = l;
    out[1] = l * 0.985;
    out[2] = l * 0.955;
    out[3] = a;
  },
  // 9 — SPLINTER: tapered sliver with visible grain
  (n, x, y, r, out) => {
    const bend = 0.16 * Math.sin(y * 2.1 + 1.3);
    const w = 0.155 * (1 - 0.72 * Math.abs(y)) * (0.7 + 0.6 * n.fbm(y * 4.4 + 2.2, 7.7, 2));
    const d = Math.abs(x - bend) / Math.max(0.02, w);
    const a = smoothstep(1.0, 0.72, d) * smoothstep(1.0, 0.9, Math.abs(y));
    const grain = n.fbm(x * 9 + 1.1, y * 2.2 - 3.3, 3);
    const l = 0.3 + 0.5 * grain;
    out[0] = l;
    out[1] = l * 0.82;
    out[2] = l * 0.6;
    out[3] = a;
  },
  // 10 — DROPLET: teardrop with a specular highlight (blood, water)
  (n, x, y, r, out) => {
    const yy = y * 0.92;
    const head = Math.hypot(x, (yy - 0.16) * 1.05) / 0.5;
    const tailW = 0.42 * clamp01(0.9 - yy * 0.75);
    const tail = Math.hypot(x / Math.max(0.03, tailW), (yy + 0.5) * 0.85);
    const a = clamp01(smoothstep(1.0, 0.82, head) + smoothstep(1.0, 0.55, tail) * 0.9);
    const spec = Math.exp(-((x + 0.16) * (x + 0.16) + (yy - 0.3) * (yy - 0.3)) * 26);
    const l = 0.55 + 0.45 * spec + 0.16 * clamp01(0.4 - yy);
    out[0] = Math.min(1, l);
    out[1] = Math.min(1, l * 0.9);
    out[2] = Math.min(1, l * 0.86);
    out[3] = a;
  },
  // 11 — MIST: very soft aerosol cloud (blood mist, fine spray)
  (n, x, y, r, out) => {
    const f = n.fbm(x * 5.2 + 31.4, y * 5.2 - 12.6, 5);
    let a = smoothstep(0.04, 0.9, (1 - r) * 0.95 + (f - 0.5) * 0.95) * 0.78;
    a *= smoothstep(1.02, 0.5, r);
    const l = 0.5 + 0.5 * f;
    out[0] = l;
    out[1] = l * 0.97;
    out[2] = l * 0.96;
    out[3] = a;
  },
  // 12 — SPLASH: sheet of water, dense at the base, shredding at the crown
  (n, x, y, r, out) => {
    const width = 0.66 - 0.3 * smoothstep(-1, 1, y);
    const col = 1 - Math.abs(x) / Math.max(0.05, width);
    const body = n.warped(x * 2.4 + 2.4, y * 1.5 - 9.1, 0.7, 4);
    const shred = n.fbm(x * 5.5 - 1.2, y * 3.0 + 4.4, 4);
    let a = smoothstep(0.0, 0.5, col + (body - 0.5) * 0.55);
    // the higher up the sheet, the more it has broken into ligaments
    a *= 1 - smoothstep(-0.2, 1.0, y) * (1 - shred) * 0.95;
    a *= smoothstep(1.04, 0.84, Math.abs(y));
    const drop = Math.exp(-((x - 0.12) * (x - 0.12) * 55 + (y - 0.74) * (y - 0.74) * 45));
    a = clamp01(a + drop * 0.5);
    const l = 0.58 + 0.42 * body + 0.12 * shred;
    out[0] = Math.min(1, l * 0.94);
    out[1] = Math.min(1, l * 0.98);
    out[2] = Math.min(1, l);
    out[3] = a;
  },
  // 13 — RING: shockwave / ripple annulus
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const wob = 1 + 0.055 * (n.fbm(Math.cos(ang) * 3.1 + 6.6, Math.sin(ang) * 3.1 - 2.2, 3) - 0.5);
    const t = (r * wob - 0.74) / 0.16;
    let a = Math.exp(-t * t * 3.2);
    a += smoothstep(0.78, 0.2, r) * 0.1;
    out[0] = 1;
    out[1] = 1;
    out[2] = 1;
    out[3] = clamp01(a) * smoothstep(1.0, 0.94, r);
  },
  // 14 — FIRE: dense billow, white-hot core to deep orange rim
  (n, x, y, r, out) => {
    const w = n.warped(x * 2.5 + 9.2, y * 2.5 + 17.5, 0.95, 5);
    let a = smoothstep(0.08, 0.6, 1 - r * 0.98 + (w - 0.5) * 0.8);
    a *= smoothstep(1.02, 0.6, r);
    const heat = clamp01(1.15 - r * 1.35 + (w - 0.5) * 0.65);
    out[0] = 1;
    out[1] = 0.28 + 0.7 * heat;
    out[2] = 0.06 + 0.82 * Math.pow(heat, 2.6);
    out[3] = a;
  },
  // 15 — MOTE: airborne speck, slightly irregular
  (n, x, y, r, out) => {
    const j = 1 + 0.3 * (n.fbm(x * 5 + 44.2, y * 5 - 17.3, 2) - 0.5);
    const a = Math.exp(-(r * j) * (r * j) * 11) * 0.95;
    out[0] = 1;
    out[1] = 0.99;
    out[2] = 0.96;
    out[3] = a * smoothstep(1.0, 0.8, r);
  },
];

/* ========================================================================= */
/*  decal tiles                                                              */
/* ========================================================================= */

const TWO_PI = Math.PI * 2;

/* ------------------------------------------------------------------------- */
/*  bullet holes                                                             */
/* ------------------------------------------------------------------------- */

/**
 * A bullet hole is a LIGHT TRAP in a surface, not a sticker on it.
 *
 * The version this replaces painted the rim at `0.6 + 0.28*crumb + 0.16*powder`
 * — up to 0.9 albedo against a 0.35-albedo wall — so every hole rendered 1.3
 * stops BRIGHTER than the plaster it was in and the wall read as a row of
 * glowing white donuts. The rules now, in linear albedo:
 *
 *   BORE   0.015-0.025. Nothing inside a hole is ever brighter than its host.
 *   RIM    pulverised material, capped at 1.2x the host's albedo.
 *   AO     a contact annulus from 1.0x to 1.9x the bore radius that MULTIPLIES
 *          the host down to ~0.6 at the lip and back to 1.0 at its outer edge.
 *          Under src-alpha-over blending, black at alpha k *is* a multiply by
 *          (1-k), so the AO layer is authored as coverage with zero colour and
 *          the blend does the rest — no second material, no multiply pass.
 *   SPALL  3-5 asymmetric radial cracks, darker than the host.
 *
 * `mixAdd` accumulates premultiplied coverage so overlapping layers average
 * rather than add: no layer can lighten the result of another.
 */
const MIX = new Float64Array(4);

function mixReset() {
  MIX[0] = MIX[1] = MIX[2] = MIX[3] = 0;
}

function mixAdd(cov, r, g, b) {
  if (cov <= 0) return;
  MIX[0] += r * cov;
  MIX[1] += g * cov;
  MIX[2] += b * cov;
  MIX[3] += cov;
}

/** Resolve the accumulator into `out`, feathering alpha by `edge`. */
function mixInto(out, edge) {
  const sum = MIX[3];
  const inv = sum > 1e-6 ? 1 / sum : 0;
  out[0] = MIX[0] * inv;
  out[1] = MIX[1] * inv;
  out[2] = MIX[2] * inv;
  out[3] = clamp01(sum) * edge;
}

/**
 * Contact-occlusion annulus. Full strength at the lip of the bore, gone by
 * 1.9x the bore radius. Returned as *coverage of black*, i.e. 1 - multiplier.
 */
function contactAo(r, rb, peak) {
  if (r <= rb) return peak;
  const t = clamp01((r - rb) / (rb * 0.9));
  // Falls off faster than a smoothstep on purpose. A symmetric ramp still puts
  // ~0.32 of occlusion where the pulverised rim lives (1.3x the bore) and swamps
  // it, so the hole loses its crushed pale collar and reads as a plain dark dot.
  return peak * Math.pow(1 - t, 2.2);
}

/**
 * 3-5 asymmetric radial spall cracks running out of the bore.
 *
 * Angles are unevenly spaced, lengths are unequal and each crack wanders as it
 * runs out of energy, so the tile keeps no rotational symmetry — which, with the
 * per-instance roll and flip the decal system applies, is what stops seven holes
 * walked across a wall from being seven identical copies.
 */
function radialSpall(n, ang, r, seed, count) {
  let c = 0;
  for (let k = 0; k < count; k++) {
    const h = n.fbm(k * 4.7 + seed, k * 2.3 - seed * 0.7, 2);
    const h2 = n.fbm(k * 2.9 - seed, k * 5.1 + seed * 1.3, 2);
    const len = 0.24 + 0.52 * h2;
    if (r > len) continue;
    // uneven spacing: a real spall pattern is never evenly spoked
    const a0 = ((k + (h - 0.5) * 1.5) / count) * TWO_PI + seed;
    let d = ang - a0;
    d -= TWO_PI * Math.round(d / TWO_PI);
    const wob = (n.fbm(r * 7.5 + k * 3.3, seed + k * 1.7, 3) - 0.5) * 0.5;
    // constant-ish physical width, tapering to nothing at the tip
    const w = 0.03 * (1 - r / len) + 0.006;
    const q = (Math.abs(d + wob * r) * r) / w;
    c = Math.max(c, smoothstep(1.0, 0.25, q) * (0.4 + 0.85 * h2) * smoothstep(len, len * 0.55, r));
  }
  return clamp01(c);
}

/**
 * Decal painters write `out = [r,g,b, alpha, height, roughness, metalness]`.
 * height 0.5 == flush with the wall, 0 == deep, 1 == proud.
 */
const DECAL_PAINTERS = [
  // 0 — bullet hole in concrete: bore, pulverised rim, contact AO, spall cracks
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const jit = n.fbm(Math.cos(ang) * 2.6 + 3.1, Math.sin(ang) * 2.6 - 7.4, 3) - 0.5;
    const rb = 0.185 * (1 + jit * 0.36);
    const bore = smoothstep(rb + 0.028, rb - 0.012, r);
    // Pulverised cement, eroded by noise so the collar never closes into a ring.
    const crumb = Math.pow(n.fbm(x * 5.2 + 2.2, y * 5.2 - 1.1, 4), 1.4);
    const rimT = (r - rb * 1.3) / (0.11 + 0.05 * (jit + 0.5));
    const rim = clamp01(Math.exp(-rimT * rimT * 1.4) * (0.3 + 1.25 * crumb)) * (1 - bore);
    const ao = contactAo(r, rb, 0.40 + 0.12 * crumb) * (1 - bore);
    const crack = radialSpall(n, ang, r, 3.7, 4) * smoothstep(rb * 0.8, rb * 1.25, r);
    const grit =
      Math.pow(clamp01(1 - n.worley(x * 12.5 + 8.8, y * 12.5 - 3.3) * 2.1), 2) *
      smoothstep(0.85, 0.2, r);
    mixReset();
    mixAdd(bore, 0.021, 0.0195, 0.018);
    mixAdd(rim * 0.92, 0.235, 0.222, 0.198); // <= 1.2x a ~0.2 linear host
    mixAdd(grit * 0.4, 0.19, 0.18, 0.163);
    mixAdd(crack * 0.8, 0.045, 0.042, 0.038);
    mixAdd(ao, 0, 0, 0);
    mixInto(out, smoothstep(1.0, 0.74, r));
    out[4] = 0.5 - bore * 0.5 + rim * 0.1 - crack * 0.22 - ao * 0.1;
    out[5] = clamp01(0.99 - rim * 0.05);
    out[6] = 0;
  },
  // 1 — deeper concrete hit: the bore sits in a blown-out spall crater
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const lobes = 0.26 + 0.13 * n.fbm(Math.cos(ang) * 1.7 + 20.5, Math.sin(ang) * 1.7 + 6.6, 3);
    const erode = n.fbm(x * 6.6 + 14.2, y * 6.6 - 8.1, 4);
    const crater = smoothstep(lobes + 0.1, lobes - 0.08, r + (erode - 0.5) * 0.14);
    const rb = 0.105 + 0.028 * n.fbm(Math.cos(ang) * 3 + 1.5, Math.sin(ang) * 3 - 2.5, 2);
    const bore = smoothstep(rb + 0.03, rb - 0.014, r);
    const chips =
      Math.pow(1 - n.worley(x * 13.5 + 8.8, y * 13.5 - 3.3), 2.6) *
      crater *
      (0.4 + 1.1 * n.fbm(x * 5.5 - 1.1, y * 5.5 + 6.2, 3));
    const crack = radialSpall(n, ang, r, 8.2, 5) * smoothstep(rb * 0.9, rb * 1.4, r);
    // The crater floor is fresh fracture: slightly greyer than the weathered
    // face, and sunk, so it also carries its own occlusion.
    const floorAo = crater * 0.34;
    const ao = contactAo(r, lobes * 0.92, 0.34 + 0.14 * chips) * (1 - bore) * (1 - crater * 0.6);
    mixReset();
    mixAdd(bore, 0.020, 0.0185, 0.017);
    mixAdd(crater * 0.64, 0.205 + 0.05 * chips, 0.195 + 0.045 * chips, 0.175 + 0.04 * chips);
    mixAdd(crack * 0.78, 0.042, 0.039, 0.035);
    mixAdd(clamp01(floorAo + ao), 0, 0, 0);
    mixInto(out, smoothstep(1.0, 0.76, r));
    out[4] = 0.5 - bore * 0.5 - crater * 0.24 + chips * 0.12 - crack * 0.2;
    out[5] = 0.99;
    out[6] = 0;
  },
  // 2 — bullet hole in steel: torn petals of bare bright metal
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    // Irregular angular profile: a clean harmonic reads as a stamped hexagon,
    // so the petal function is warped by noise and eroded radially.
    const warp = n.fbm(Math.cos(ang) * 2.2 + 4.4, Math.sin(ang) * 2.2 + 9.1, 3);
    const petal = 0.45 * Math.abs(Math.sin(ang * 2.5 + warp * 5.5)) + 0.55 * warp;
    const rh = 0.14 + 0.035 * petal;
    const hole = smoothstep(rh + 0.03, rh - 0.015, r);
    const lipT = (r - rh * (1.35 + 0.5 * petal)) / (0.07 + 0.09 * petal);
    const grain = n.fbm(x * 9.5 + 1.3, y * 9.5 - 5.6, 3);
    const lip = Math.exp(-lipT * lipT * 2.4) * (0.45 + 1.05 * grain);
    const scuff = smoothstep(0.9, 0.2, r) * n.fbm(x * 7.5 + 6.1, y * 7.5 - 2.2, 3);
    const scratch = Math.pow(clamp01(1 - n.worleyEdge(x * 6 + 2, y * 6 - 8) * 9), 2) * smoothstep(0.85, 0.1, r);
    // Same contact annulus as the masonry tiles: a punched plate has a shadow in
    // the hole, and torn petals throw one on the paint around them.
    const ao = contactAo(r, rh, 0.34) * (1 - hole);
    const a = clamp01(hole + lip * 0.7 + scuff * 0.5 + scratch * 0.3 + ao) * smoothstep(1.0, 0.75, r);
    const bare = clamp01(lip * 0.85 + scratch * 0.45);
    // 0.24, not 0.4: bare torn steel IS bright, but at 0.4 the petal ring came out
    // paler than any plate it could be punched through and read as a white donut.
    const l = hole > 0.5 ? 0.018 : clamp01((0.09 + 0.24 * bare + 0.07 * scuff) * (1 - ao));
    out[0] = l;
    out[1] = l * 0.985;
    out[2] = l * 0.96;
    out[3] = a;
    out[4] = 0.5 - hole * 0.5 + lip * 0.26;
    out[5] = clamp01(0.62 - bare * 0.42);
    out[6] = clamp01(bare * 0.85);
  },
  // 3 — bullet hole in wood: bore, torn fibre lip, contact AO
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const fib = n.fbm(x * 1.6 + 5.5, y * 11.0 - 2.2, 4); // grain runs along X
    const rb = 0.16 * (1 + (fib - 0.5) * 0.34);
    const bore = smoothstep(rb + 0.03, rb - 0.014, r);
    // Fibres tear out along the grain, so the lip is lopsided along X.
    const splinter =
      Math.pow(clamp01(1 - Math.abs(Math.sin(ang * 6.5 + fib * 5)) * 1.05), 3.2) *
      smoothstep(0.52, rb * 0.9, r) *
      (0.45 + 1.0 * n.fbm(x * 7.7 - 2.2, y * 7.7 + 5.5, 3));
    const lipT = (r - rb * 1.25) / 0.1;
    // Fresh wood is lighter than the finish, but "lighter than a 0.07 host" is
    // still 0.12 linear — not the 0.4 the old tile painted.
    const lip = clamp01(Math.exp(-lipT * lipT * 1.5) * (0.4 + 1.1 * fib)) * (1 - bore);
    const ao = contactAo(r, rb, 0.44 + 0.1 * fib) * (1 - bore);
    const crack = radialSpall(n, ang, r, 5.9, 3) * smoothstep(rb * 0.8, rb * 1.3, r);
    mixReset();
    mixAdd(bore, 0.015, 0.0125, 0.010);
    mixAdd(clamp01(lip * 0.85 + splinter * 0.6), 0.125, 0.088, 0.052);
    mixAdd(crack * 0.7, 0.03, 0.022, 0.014);
    mixAdd(ao, 0, 0, 0);
    mixInto(out, smoothstep(1.0, 0.72, r));
    out[4] = 0.5 - bore * 0.5 + splinter * 0.22 - crack * 0.18 - ao * 0.08;
    out[5] = clamp01(0.9 - splinter * 0.1);
    out[6] = 0;
  },
  // 4 — plaster / drywall: crumbly bore, powdered rim, contact AO
  //
  // The reference failure lived here: `0.6 + 0.28*crumb + 0.16*powder` put the
  // rim at up to 0.9 albedo against a 0.35 wall, which is why the measured hole
  // came out 1.3 stops brighter than the plaster around it.
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const jit = n.fbm(Math.cos(ang) * 2.2 + 14.4, Math.sin(ang) * 2.2 + 3.3, 3) - 0.5;
    const rb = 0.195 * (1 + jit * 0.4);
    const bore = smoothstep(rb + 0.032, rb - 0.014, r);
    const crumb =
      Math.pow(1 - n.worley(x * 11.5 - 3.3, y * 11.5 + 7.7), 2.4) *
      (0.35 + 1.2 * n.fbm(x * 4.4 + 9.9, y * 4.4 - 2.2, 3));
    const rimT = (r - rb * 1.26) / (0.12 + 0.05 * (jit + 0.5));
    const rim = clamp01(Math.exp(-rimT * rimT * 1.35) * (0.32 + 1.2 * crumb)) * (1 - bore);
    // A thin veil of powder that has drifted further out, still under the host.
    const powder = smoothstep(0.9, 0.18, r) * n.fbm(x * 3.1 + 8.2, y * 3.1 - 4.4, 4) * 0.3;
    const ao = contactAo(r, rb, 0.40 + 0.12 * crumb) * (1 - bore);
    const crack = radialSpall(n, ang, r, 1.9, 4) * smoothstep(rb * 0.8, rb * 1.25, r);
    mixReset();
    mixAdd(bore, 0.018, 0.0165, 0.015);
    // Lime plaster over mud brick: the pulverised rim keeps the host's ochre
    // hue and is capped at ~1.2x its luminance (0.29 against a 0.24 wall).
    mixAdd(rim * 0.94, 0.305, 0.278, 0.234);
    mixAdd(powder, 0.26, 0.238, 0.20);
    mixAdd(crack * 0.8, 0.04, 0.036, 0.03);
    mixAdd(ao, 0, 0, 0);
    mixInto(out, smoothstep(1.0, 0.75, r));
    out[4] = 0.5 - bore * 0.5 + rim * 0.12 - crack * 0.2 - ao * 0.1;
    out[5] = 1.0;
    out[6] = 0;
  },
  // 5 — glass: radial + concentric crack web, almost no fill
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const radial = Math.pow(clamp01(1 - Math.abs(Math.sin(ang * 5.5 + n.fbm(r * 3 + 2, ang + 4, 3) * 6)) * 1.6), 6);
    const conc = Math.pow(clamp01(1 - Math.abs(Math.sin(r * 17 + n.fbm(x * 2, y * 2, 2) * 4)) * 1.9), 5);
    const web = clamp01(radial * smoothstep(0.98, 0.05, r) + conc * smoothstep(0.95, 0.12, r) * 0.7);
    const rh = 0.055;
    const hole = smoothstep(rh + 0.02, rh - 0.01, r);
    const shatter = Math.pow(clamp01(1 - n.worleyEdge(x * 4.4 + 1.1, y * 4.4 - 6.6) * 8), 3) * smoothstep(0.7, 0.1, r);
    const a = clamp01(web * 0.95 + hole + shatter * 0.8);
    const l = hole > 0.5 ? 0.02 : clamp01(0.5 + 0.45 * web);
    out[0] = l * 0.94;
    out[1] = l * 0.98;
    out[2] = l;
    out[3] = a;
    out[4] = 0.5 - hole * 0.4 + web * 0.2;
    out[5] = clamp01(0.42 - web * 0.3);
    out[6] = 0;
  },
  // 6 — blood splat with satellite droplets
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const edge = 0.44 + 0.3 * n.fbm(Math.cos(ang) * 2.1 + 6.5, Math.sin(ang) * 2.1 - 9.9, 3);
    const wob = n.fbm(x * 5.5 - 3.3, y * 5.5 + 1.7, 4);
    let a = smoothstep(edge, edge - 0.16, r + (wob - 0.5) * 0.16);
    // satellite spatter
    const s = n.worley(x * 4.2 + 3.7, y * 4.2 - 5.5);
    a = clamp01(a + Math.pow(clamp01(1 - s * 3.4), 5) * smoothstep(1.0, 0.42, r) * 0.95);
    const thick = a * (0.25 + 1.35 * Math.pow(n.warped(x * 4.4 - 2.2, y * 4.4 + 4.4, 0.7, 4), 1.5));
    const rim = smoothstep(edge - 0.16, edge, r); // dried, darker at the perimeter
    out[0] = clamp01(0.075 + 0.075 * thick - rim * 0.035);
    out[1] = clamp01(0.009 + 0.017 * thick);
    out[2] = clamp01(0.008 + 0.014 * thick);
    out[3] = a;
    out[4] = 0.5 + thick * 0.12;
    out[5] = clamp01(0.5 - thick * 0.26 + rim * 0.24);
    out[6] = 0;
  },
  // 7 — heavier blood with runs (roll-aligned to gravity by the decal system)
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const edge = 0.4 + 0.22 * n.fbm(Math.cos(ang) * 1.8 + 16.5, Math.sin(ang) * 1.8 + 2.2, 3);
    let a = smoothstep(edge, edge - 0.12, Math.hypot(x, (y + 0.12) * 1.18));
    // Runs hang off the *bottom of the splat* and terminate in a bead. Doing
    // this as a periodic function of x alone striped the whole tile.
    const lane = n.fbm(x * 9.5 + 1.7, 3.3, 2);
    const inLane = Math.pow(clamp01(1 - Math.abs(Math.sin(x * 11.5 + lane * 4)) * 1.5), 5);
    const under = smoothstep(edge * 1.0, edge * 0.25, Math.abs(x));
    const y0 = -edge * 0.8;
    const runLen = (0.3 + 0.55 * lane) * under;
    const t = runLen > 0.02 ? (y0 - y) / runLen : -1;
    const run =
      t > 0 && t < 1
        ? inLane * under * (1 - t * 0.65) * smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.86, t)
        : 0;
    a = clamp01(a + run * 0.9);
    const bead = Math.exp(-(Math.pow((x - (lane - 0.5) * 0.12) * 26, 2) + Math.pow((y - (y0 - runLen)) * 22, 2)));
    a = clamp01(a + bead * inLane * under * 0.85);
    const thick = a * (0.5 + 0.8 * n.fbm(x * 4.4 + 7.7, y * 4.4 - 1.1, 3));
    out[0] = clamp01(0.07 + 0.08 * thick);
    out[1] = clamp01(0.008 + 0.016 * thick);
    out[2] = clamp01(0.007 + 0.013 * thick);
    out[3] = a;
    out[4] = 0.5 + thick * 0.1;
    out[5] = clamp01(0.46 - thick * 0.24);
    out[6] = 0;
  },
  // 8 — scorch: soot with radial streaks
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const streak = 0.55 + 0.55 * n.fbm(Math.cos(ang) * 3.3 + 4.4, Math.sin(ang) * 3.3 - 8.8, 4);
    const body = smoothstep(0.98 * streak, 0.05, r);
    const soot = n.fbm(x * 3.4 + 2.4, y * 3.4 + 12.2, 5);
    const a = clamp01(body * (0.45 + 0.85 * soot));
    const l = clamp01(0.035 + 0.07 * (1 - body) + 0.03 * soot);
    out[0] = l;
    out[1] = l * 0.96;
    out[2] = l * 0.92;
    out[3] = a * 0.92;
    out[4] = 0.5 - body * 0.04;
    out[5] = 1.0;
    out[6] = 0;
  },
  // 9 — dirt impact: dark damp crater with an ejecta collar
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const rh = 0.26 + 0.09 * (n.fbm(Math.cos(ang) * 1.9 + 9.1, Math.sin(ang) * 1.9 - 3.7, 3) - 0.5);
    const crater = smoothstep(rh + 0.09, rh - 0.05, r);
    const collar = Math.exp(-Math.pow((r - rh * 1.5) / 0.24, 2) * 1.7);
    const clods = Math.pow(1 - n.worley(x * 3.9 + 5.2, y * 3.9 + 1.4), 2.4);
    const a = clamp01(crater + collar * 0.85 * (0.4 + clods) + smoothstep(1.0, 0.3, r) * 0.3);
    const l = clamp01(0.045 + 0.06 * (1 - crater) + 0.07 * collar * clods);
    out[0] = l * 1.0;
    out[1] = l * 0.82;
    out[2] = l * 0.62;
    out[3] = a;
    out[4] = 0.5 - crater * 0.4 + collar * clods * 0.2;
    out[5] = 0.96;
    out[6] = 0;
  },
  // 10 — sand impact: pale cone crater, fine ripples
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const rh = 0.3 + 0.07 * (n.fbm(Math.cos(ang) * 2.4 + 1.1, Math.sin(ang) * 2.4 + 8.3, 3) - 0.5);
    const crater = smoothstep(rh + 0.13, rh - 0.06, r);
    const collar = Math.exp(-Math.pow((r - rh * 1.42) / 0.26, 2) * 1.5);
    const grain = n.fbm(x * 11 + 3.3, y * 11 - 6.6, 3);
    // Ejecta rays break the collar so it stops reading as a painted ring.
    const rays =
      Math.pow(clamp01(1 - Math.abs(Math.sin(ang * 4.5 + n.fbm(Math.cos(ang) * 2, Math.sin(ang) * 2, 3) * 6)) * 1.15), 2.5) *
      collar;
    const a = clamp01(crater * 0.8 + collar * 0.45 + rays * 0.45 + smoothstep(1.0, 0.3, r) * 0.3);
    const l = clamp01(0.3 + 0.1 * collar + 0.1 * rays - 0.16 * crater + 0.08 * grain);
    out[0] = l * 1.0;
    out[1] = l * 0.9;
    out[2] = l * 0.72;
    out[3] = a;
    out[4] = 0.5 - crater * 0.3 + collar * 0.12;
    out[5] = 1.0;
    out[6] = 0;
  },
  // 11 — ricochet scrape: long gouge with bright abraded metal
  (n, x, y, r, out) => {
    // The round skids along +X: the gouge is deepest where it bit and tapers
    // out, with abrasion striae running *along* travel, never across it.
    const wander = (n.fbm(x * 2.6 + 2.2, 1.7, 3) - 0.5) * 0.22;
    const taper = smoothstep(-0.95, -0.55, x) * smoothstep(1.0, 0.35, x);
    const w = 0.19 * taper * (0.55 + 0.8 * n.fbm(x * 4.4 - 6.6, 3.3, 3));
    const d = Math.abs(y - wander) / Math.max(0.02, w);
    const gouge = smoothstep(1.15, 0.15, d) * taper;
    // Abrasion is a bundle of parallel scratches: high frequency across the
    // groove, smooth along it.
    const striae =
      Math.pow(clamp01(1 - Math.abs(Math.sin(y * 34 + n.fbm(x * 3.2, 5.5, 2) * 4)) * 1.25), 4) *
      gouge *
      (0.3 + 1.2 * n.fbm(x * 9 + 1.1, y * 2, 3));
    const a = clamp01(gouge * 0.85 + striae * 0.4);
    const l = clamp01(0.18 + 0.34 * striae + 0.16 * gouge);
    out[0] = l;
    out[1] = l * 0.98;
    out[2] = l * 0.95;
    out[3] = a;
    out[4] = 0.5 - gouge * 0.22 + striae * 0.1;
    out[5] = clamp01(0.55 - striae * 0.35);
    out[6] = clamp01(gouge * 0.85);
  },
  // 12 — water ripple: normal-dominated concentric rings
  (n, x, y, r, out) => {
    const wob = 1 + 0.06 * (n.fbm(x * 3 + 6, y * 3 - 2, 3) - 0.5);
    const rings = Math.sin((r * wob) * 22) * Math.exp(-r * r * 2.6);
    const a = clamp01(Math.exp(-r * r * 2.2) * 0.6) * smoothstep(1.0, 0.85, r);
    out[0] = 0.42;
    out[1] = 0.46;
    out[2] = 0.5;
    out[3] = a;
    out[4] = 0.5 + rings * 0.28;
    out[5] = 0.06;
    out[6] = 0;
  },
  // 13 — small glass punch-through
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const rad = Math.pow(clamp01(1 - Math.abs(Math.sin(ang * 4.5 + n.fbm(r * 4 + 1, ang * 2, 3) * 5)) * 1.5), 7);
    const web = rad * smoothstep(0.72, 0.04, r);
    const hole = smoothstep(0.08, 0.05, r);
    const frost = Math.pow(1 - n.worley(x * 7 + 2.2, y * 7 - 3.3), 3) * smoothstep(0.34, 0.04, r);
    const a = clamp01(web * 0.9 + hole + frost * 0.85);
    const l = hole > 0.5 ? 0.02 : clamp01(0.55 + 0.4 * (web + frost));
    out[0] = l * 0.95;
    out[1] = l * 0.99;
    out[2] = l;
    out[3] = a;
    out[4] = 0.5 - hole * 0.4 + (web + frost) * 0.18;
    out[5] = clamp01(0.36 - frost * 0.24);
    out[6] = 0;
  },
  // 14 — generic dust smudge (explosion soiling, sandbag hits, scuffs)
  (n, x, y, r, out) => {
    const w = n.warped(x * 2.2 + 18.8, y * 2.2 - 5.5, 0.8, 5);
    const a = clamp01(smoothstep(0.05, 0.75, (1 - r) + (w - 0.5) * 0.9)) * 0.7;
    const l = clamp01(0.22 + 0.22 * w);
    out[0] = l;
    out[1] = l * 0.96;
    out[2] = l * 0.9;
    out[3] = a;
    out[4] = 0.5;
    out[5] = 1.0;
    out[6] = 0;
  },
  // 15 — torn fabric / foliage puncture
  (n, x, y, r, out) => {
    const ang = Math.atan2(y, x);
    const rip = Math.pow(clamp01(1 - Math.abs(Math.sin(ang * 2.5 + n.fbm(Math.cos(ang) * 2 + 3, Math.sin(ang) * 2, 2) * 4)) * 1.2), 3);
    const rh = 0.1 + 0.14 * rip;
    const hole = smoothstep(rh + 0.05, rh - 0.02, r);
    const fray = Math.pow(clamp01(1 - n.worleyEdge(x * 8 + 4.4, y * 8 - 1.1) * 9), 2) * smoothstep(0.5, 0.1, r);
    const a = clamp01(hole + fray * 0.9);
    const l = hole > 0.5 ? 0.02 : clamp01(0.18 + 0.3 * fray);
    out[0] = l;
    out[1] = l * 0.94;
    out[2] = l * 0.88;
    out[3] = a;
    out[4] = 0.5 - hole * 0.45 + fray * 0.12;
    out[5] = 0.98;
    out[6] = 0;
  },
];

/* ========================================================================= */
/*  bakers                                                                   */
/* ========================================================================= */

/** Relief strength per decal tile — how hard the derived normal map pushes. */
const DECAL_RELIEF = [2.6, 3.0, 2.2, 2.4, 2.3, 1.4, 0.8, 0.7, 0.35, 2.4, 1.9, 1.6, 1.1, 1.5, 0.2, 1.7];

function makeTexture(data, size, { srgb, mips = true, name }) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = mips;
  t.anisotropy = 4;
  t.name = name;
  t.needsUpdate = true;
  return t;
}

/**
 * Bake the particle sprite atlas.
 * @returns {{texture:THREE.DataTexture, cols:number, size:number}}
 */
export function buildParticleAtlas(rng, size = 1024) {
  const n = new Noise(rng);
  const tile = size / ATLAS_COLS;
  const data = new Uint8Array(size * size * 4);
  const out = [0, 0, 0, 0];
  for (let t = 0; t < 16; t++) {
    const paint = PARTICLE_PAINTERS[t];
    const ox = (t % ATLAS_COLS) * tile;
    const oy = Math.floor(t / ATLAS_COLS) * tile;
    for (let py = 0; py < tile; py++) {
      const y = ((py + 0.5) / tile) * 2 - 1;
      for (let px = 0; px < tile; px++) {
        const x = ((px + 0.5) / tile) * 2 - 1;
        const r = Math.hypot(x, y);
        out[0] = out[1] = out[2] = out[3] = 0;
        if (r < 1.45) paint(n, x, y, r, out);
        // A 1px transparent gutter stops bilinear/mip bleed between tiles.
        const gutter =
          px < 1 || py < 1 || px > tile - 2 || py > tile - 2 ? 0 : 1;
        const i = ((oy + py) * size + ox + px) * 4;
        data[i] = encodeSrgb(out[0]) * 255;
        data[i + 1] = encodeSrgb(out[1]) * 255;
        data[i + 2] = encodeSrgb(out[2]) * 255;
        data[i + 3] = clamp01(out[3]) * 255 * gutter;
      }
    }
  }
  return { texture: makeTexture(data, size, { srgb: true, name: 'fx-particles' }), cols: ATLAS_COLS, size };
}

/**
 * Bake the decal atlas: albedo+alpha, a normal map derived from the painted
 * height field, and packed ORM.
 */
export function buildDecalAtlas(rng, size = 1024) {
  const n = new Noise(rng);
  const tile = size / ATLAS_COLS;
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const orm = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const out = [0, 0, 0, 0, 0.5, 1, 0];

  for (let t = 0; t < 16; t++) {
    const paint = DECAL_PAINTERS[t];
    const ox = (t % ATLAS_COLS) * tile;
    const oy = Math.floor(t / ATLAS_COLS) * tile;
    for (let py = 0; py < tile; py++) {
      const y = ((py + 0.5) / tile) * 2 - 1;
      for (let px = 0; px < tile; px++) {
        const x = ((px + 0.5) / tile) * 2 - 1;
        const r = Math.hypot(x, y);
        out[0] = out[1] = out[2] = out[3] = 0;
        out[4] = 0.5;
        out[5] = 1;
        out[6] = 0;
        if (r < 1.45) paint(n, x, y, r, out);
        const gutter = px < 1 || py < 1 || px > tile - 2 || py > tile - 2 ? 0 : 1;
        const idx = (oy + py) * size + ox + px;
        const i = idx * 4;
        albedo[i] = encodeSrgb(out[0]) * 255;
        albedo[i + 1] = encodeSrgb(out[1]) * 255;
        albedo[i + 2] = encodeSrgb(out[2]) * 255;
        albedo[i + 3] = clamp01(out[3]) * 255 * gutter;
        // ORM: r = baked AO (crevice darkening), g = roughness, b = metalness
        const ao = clamp01(0.35 + 0.65 * smoothstep(0.05, 0.55, out[4]));
        orm[i] = ao * 255;
        orm[i + 1] = clamp01(out[5]) * 255;
        orm[i + 2] = clamp01(out[6]) * 255;
        orm[i + 3] = 255;
        height[idx] = out[4];
      }
    }
  }

  // Height -> tangent-space normal, sampled inside the tile only.
  for (let t = 0; t < 16; t++) {
    const ox = (t % ATLAS_COLS) * tile;
    const oy = Math.floor(t / ATLAS_COLS) * tile;
    const relief = DECAL_RELIEF[t] * (tile / 256);
    for (let py = 0; py < tile; py++) {
      for (let px = 0; px < tile; px++) {
        const cx = Math.min(tile - 2, Math.max(1, px));
        const cy = Math.min(tile - 2, Math.max(1, py));
        const at = (dx, dy) => height[(oy + cy + dy) * size + ox + cx + dx];
        const gx = (at(1, 0) - at(-1, 0)) * relief * 8;
        const gy = (at(0, 1) - at(0, -1)) * relief * 8;
        let nx = -gx;
        let ny = -gy;
        let nz = 1;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
        const i = ((oy + py) * size + ox + px) * 4;
        normal[i] = (nx * 0.5 + 0.5) * 255;
        normal[i + 1] = (ny * 0.5 + 0.5) * 255;
        normal[i + 2] = (nz * 0.5 + 0.5) * 255;
        normal[i + 3] = 255;
      }
    }
  }

  return {
    albedo: makeTexture(albedo, size, { srgb: true, name: 'fx-decal-albedo' }),
    normal: makeTexture(normal, size, { srgb: false, name: 'fx-decal-normal' }),
    orm: makeTexture(orm, size, { srgb: false, name: 'fx-decal-orm' }),
    cols: ATLAS_COLS,
    size,
  };
}

/**
 * Brass casing maps: drawn seams, extractor scuffing and a machined-rim
 * roughness break so casings never read as plastic.
 */
export function buildBrassTextures(rng, size = 256) {
  const n = new Noise(rng);
  const normal = new Uint8Array(size * size * 4);
  const orm = new Uint8Array(size * size * 4);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Drawing marks run along the casing axis (V), machining rings across it.
      const draw = n.fbm(u * 42, v * 3.5, 3);
      const rings = Math.sin(v * 190) * 0.5 + 0.5;
      const scuff = Math.pow(clamp01(1 - n.worleyEdge(u * 9, v * 9) * 7), 2);
      h[y * size + x] = 0.5 + (draw - 0.5) * 0.35 + (rings - 0.5) * 0.08 - scuff * 0.25;
      const i = (y * size + x) * 4;
      // AO in the scuffs, roughness up where the brass is abraded.
      orm[i] = clamp01(1 - scuff * 0.55) * 255;
      orm[i + 1] = clamp01(0.19 + 0.3 * scuff + 0.12 * draw) * 255;
      orm[i + 2] = 255;
      orm[i + 3] = 255;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (dx, dy) => h[(((y + dy) % size) + size) % size * size + ((((x + dx) % size) + size) % size)];
      const gx = (at(1, 0) - at(-1, 0)) * 5;
      const gy = (at(0, 1) - at(0, -1)) * 5;
      let nx = -gx;
      let ny = -gy;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      normal[i] = (nx / l * 0.5 + 0.5) * 255;
      normal[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      normal[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }
  const nt = makeTexture(normal, size, { srgb: false, name: 'fx-brass-normal' });
  const ot = makeTexture(orm, size, { srgb: false, name: 'fx-brass-orm' });
  nt.wrapS = nt.wrapT = THREE.RepeatWrapping;
  ot.wrapS = ot.wrapT = THREE.RepeatWrapping;
  return { normal: nt, orm: ot };
}
