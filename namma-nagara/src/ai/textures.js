/**
 * AI — procedural material set for the enemy characters.
 *
 * Tiling PBR sets, all generated on the CPU at boot from tileable value noise:
 * camouflage ripstop cloth (one bake per uniform pattern), cordura nylon
 * webbing, laminated plate-carrier shell, skin, glass-filled polymer,
 * parkerised steel and boot rubber. Each set is albedo (sRGB) + tangent normal
 * (Sobel of a height field) + a packed ORM (r = AO, g = roughness,
 * b = metalness), which is exactly the layout MeshStandardMaterial samples when
 * the same texture is bound to aoMap / roughnessMap / metalnessMap.
 *
 * TWO-SCALE CAMOUFLAGE — a single tile cannot carry both a 0.4 m macro blotch
 * and a 1.5 mm weave: that is a 300:1 frequency ratio, which needs a 2 k map and
 * seconds of CPU bake. So the system is split the way a shipping engine splits
 * it. The *base* tile is large (0.78 m of cloth over 512 px = 1.5 mm/texel) and
 * carries the macro blotch field, the 3 cm pixel layer, panel seams and folds —
 * everything that has to survive at 25 m. A second, small *detail* tile (5 cm
 * over 512 px = 0.1 mm/texel) carries the weave, the ripstop lattice and the
 * nylon ribbing, and is blended in inside the shader as a tangent-space normal
 * plus a roughness delta. Both scales are therefore present at every distance,
 * and the macro pattern is not averaged into flat tan by the mip chain.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* Tileable value noise                                                */
/* ------------------------------------------------------------------ */

export class TileNoise {
  constructor(rng) {
    this.tab = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) this.tab[i] = rng.float();
    this.perm = new Uint16Array(4096);
    for (let i = 0; i < 4096; i++) this.perm[i] = rng.int(0, 4095);
  }

  _h(ix, iy, period) {
    const p = period | 0;
    const x = ((ix % p) + p) % p;
    const y = ((iy % p) + p) % p;
    return this.tab[(this.perm[(x * 73 + y * 151) & 4095] + x * 31 + y * 17) & 4095];
  }

  /** Value noise on a lattice of `period` cells over the unit tile. */
  n2(u, v, period) {
    const x = u * period, y = v * period;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = this._h(ix, iy, period), b = this._h(ix + 1, iy, period);
    const c = this._h(ix, iy + 1, period), d = this._h(ix + 1, iy + 1, period);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }

  fbm(u, v, period, oct = 4, gain = 0.5) {
    let a = 1, s = 0, norm = 0, p = period;
    for (let i = 0; i < oct; i++) {
      s += a * this.n2(u, v, p);
      norm += a;
      a *= gain;
      p *= 2;
    }
    return s / norm;
  }

  /** Ridged noise for fibre and scratch structure. */
  ridge(u, v, period, oct = 3) {
    let a = 1, s = 0, norm = 0, p = period;
    for (let i = 0; i < oct; i++) {
      s += a * (1 - Math.abs(this.n2(u, v, p) * 2 - 1));
      norm += a;
      a *= 0.55;
      p *= 2;
    }
    return s / norm;
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const srgb = (v) => {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v;
  return (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255;
};

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function dataTexture(buf, size, srgbSpace, aniso) {
  const t = new THREE.DataTexture(buf, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgbSpace ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/**
 * Run a per-texel shader function over a tile and pack the three maps.
 * fn(u, v, out) fills out.rgb (linear albedo), out.h (height, metres-ish),
 * out.rough, out.metal, out.ao.
 */
function bake(size, fn, aniso, normalScale = 1) {
  const alb = new Uint8Array(size * size * 4);
  const orm = new Uint8Array(size * size * 4);
  const nrm = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const out = { r: 0.5, g: 0.5, b: 0.5, h: 0, rough: 0.7, metal: 0, ao: 1 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      out.r = out.g = out.b = 0.5;
      out.h = 0;
      out.rough = 0.7;
      out.metal = 0;
      out.ao = 1;
      fn(x / size, y / size, out, x, y);
      alb[i * 4] = srgb(out.r);
      alb[i * 4 + 1] = srgb(out.g);
      alb[i * 4 + 2] = srgb(out.b);
      alb[i * 4 + 3] = 255;
      orm[i * 4] = out.ao * 255;
      orm[i * 4 + 1] = out.rough * 255;
      orm[i * 4 + 2] = out.metal * 255;
      orm[i * 4 + 3] = 255;
      height[i] = out.h;
    }
  }
  // Sobel -> tangent normal, wrapping so the tile stays seamless
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  // the Sobel kernel already sums ~8 neighbour deltas; keep the slope sane or
  // every fabric turns to corduroy
  const k = normalScale * 0.17;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      let nx = -dx * k, ny = -dy * k, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = y * size + x;
      nrm[i * 4] = (nx * 0.5 + 0.5) * 255;
      nrm[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      nrm[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
      nrm[i * 4 + 3] = 255;
    }
  }
  return {
    albedo: dataTexture(alb, size, true, aniso),
    orm: dataTexture(orm, size, false, aniso),
    normal: dataTexture(nrm, size, false, aniso),
  };
}

/**
 * Bake a *detail* tile: one RGBA texture whose rgb is a tangent normal and
 * whose alpha is a roughness delta around 0.5. This is the high-frequency half
 * of the two-scale system — 5 cm of cloth over 512 px, so a 1.5 mm thread is
 * 15 texels wide and still there when the base tile has run out of resolution.
 */
function bakeDetail(size, fn, aniso, normalScale = 1) {
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const out = { h: 0, rough: 0 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out.h = 0;
      out.rough = 0;
      fn(x / size, y / size, out);
      const i = y * size + x;
      height[i] = out.h;
      rough[i] = out.rough;
    }
  }
  const buf = new Uint8Array(size * size * 4);
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const k = normalScale * 0.17;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      let nx = -dx * k, ny = -dy * k, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = y * size + x;
      buf[i * 4] = (nx / l * 0.5 + 0.5) * 255;
      buf[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255;
      buf[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255;
      buf[i * 4 + 3] = Math.max(0, Math.min(255, (rough[i] * 0.5 + 0.5) * 255));
    }
  }
  return dataTexture(buf, size, false, aniso);
}

/* ------------------------------------------------------------------ */
/* Pattern definitions                                                 */
/* ------------------------------------------------------------------ */

/**
 * Two-scale blotch camouflage in the spirit of Multicam / MARPAT.
 *
 * Five tonal families spanning 0.09-0.32 linear. The MACRO field decides which
 * family a texel belongs to at 0.2-0.4 m; the fine 3 cm dot layer only modulates
 * the chosen family by ±18 %. That ratio is the whole point: at 25 m the dot
 * layer mips away and what is left is still a blotch pattern with real value
 * contrast, instead of the flat tan a single high-frequency dot field averages
 * to. `CLOTH_TILE` metres of cloth map to one tile.
 */
export const CLOTH_TILE = 0.78;

export const CAMO = {
  // family luminances: pale 0.335 / base 0.275 / mid 0.205 / dark 0.125 /
  // olive 0.19 — a 2.7:1 macro value ratio inside the 0.18-0.32 window real
  // printed multicam occupies, with the dark blotches allowed below it. The
  // families are the *pattern*; `budget` is what the finished map is remapped
  // onto (see CLOTH_BUDGET), so these five numbers only set hue and ratio.
  arid: {
    // desert multicam is the pale one: it gets the top of the window
    budget: 0.104,
    pale: [0.382, 0.318, 0.212],
    base: [0.320, 0.256, 0.163],
    mid: [0.241, 0.186, 0.116],
    dark: [0.146, 0.111, 0.072],
    olive: [0.176, 0.190, 0.116],
    macro: 2,
    warp: 0.15,
  },
  woodland: {
    // olive drab in the field sits well under desert tan
    budget: 0.092,
    pale: [0.354, 0.340, 0.230],
    base: [0.246, 0.259, 0.170],
    mid: [0.174, 0.190, 0.126],
    dark: [0.104, 0.110, 0.083],
    olive: [0.210, 0.196, 0.132],
    macro: 3,
    warp: 0.17,
  },
  urban: {
    // wolf grey / near-black urban kit: the darkest of the three, and the one
    // that reads as a plaster mannequin if it is allowed anywhere near 0.2
    budget: 0.083,
    pale: [0.330, 0.334, 0.342],
    base: [0.226, 0.230, 0.239],
    mid: [0.150, 0.154, 0.163],
    dark: [0.078, 0.079, 0.088],
    olive: [0.190, 0.188, 0.182],
    macro: 2,
    warp: 0.14,
  },
};

/**
 * Distance from the centre of a repeating cell, in cell units: 0 on the line,
 * 0.5 half a cell away. Everything below draws THIN features with `ridgeLine`,
 * whose width is stated in cell units — the trap here is writing
 * `smooth(0.5, 0.47, d)`, which is 1 over 94 % of the cell and turns a seam into
 * a flat offset plus a full-surface ripple. That is what made the cloth read as
 * corduroy instead of ripstop.
 */
const cellDist = (x) => Math.abs((((x % 1) + 1) % 1) - 0.5);
const ridgeLine = (d, w) => smooth(w, 0, d);

/**
 * Garment-scale relief for the base cloth tile: felled panel seams with their
 * stitch beads, pocket-edge creases and the broad wrinkle field. The weave
 * itself is far too fine for this tile and lives in the detail map.
 */
function garmentRelief(nz, u, v) {
  // horizontal felled seams every 1/4 tile (~20 cm): a 2 mm sunk channel with a
  // 4 mm raised felled lip beside it
  const drift = (nz.fbm(u, v, 3, 2) - 0.5) * 0.22;
  const sa = cellDist(v * 4 + drift);
  let h = -ridgeLine(sa, 0.013) * 0.62 + (ridgeLine(sa, 0.030) - ridgeLine(sa, 0.016)) * 0.34;
  // vertical seams, sparser (~31 cm)
  const drift2 = (nz.fbm(v + 4.1, u, 3, 2) - 0.5) * 0.26;
  const sb = cellDist(u * 2.5 + drift2);
  h += -ridgeLine(sb, 0.009) * 0.46 + (ridgeLine(sb, 0.022) - ridgeLine(sb, 0.011)) * 0.22;
  // stitch beads, only on the seams themselves, 9 mm apart
  const onSeam = Math.max(ridgeLine(sa, 0.020), ridgeLine(sb, 0.014));
  h += onSeam * (0.5 + 0.5 * Math.sin((u + v) * 520)) * 0.26;
  // pocket-edge creases: a coarse rectangular lattice, only sometimes present
  const gate = smooth(0.55, 0.72, nz.fbm(u + 1.7, v + 2.3, 3, 2));
  const pu = cellDist(u * 3.5 + 0.31);
  const pv = cellDist(v * 3.0 + 0.17);
  h -= gate * Math.max(ridgeLine(pu, 0.012), ridgeLine(pv, 0.014)) * 0.55;
  // wrinkles: 8 cm folds plus 3 cm crumple — the low-frequency half of the
  // relief, and the part that actually catches the key light
  h += (nz.fbm(u, v, 10, 3) - 0.5) * 0.95;
  h += (nz.fbm(u + 5.3, v + 1.9, 26, 2) - 0.5) * 0.34;
  // 1-2 cm CREASE field. Ridged (not fbm) on purpose: a crease in cloth is a
  // sharp line with a soft valley either side, and it is the one relief scale
  // that still separates a sleeve from a rendered tube at 25 m. Without it the
  // figure has an 8 cm fold field and a 1.5 mm weave and nothing between them,
  // which is exactly what reads as a smooth mannequin.
  const crease = nz.ridge(u + 3.1, v - 2.2, 52, 2);
  h += (crease - 0.55) * 0.46;
  h += (nz.ridge(v * 0.7 + 8.4, u * 0.7 + 1.1, 74, 2) - 0.55) * 0.22;
  return h;
}

/**
 * ALBEDO BUDGET for the uniform cloth, in linear luminance.
 *
 * The bake used to be trusted to land in budget by construction and it did not:
 * measured mean was 0.171 with pale blotches at 0.386 — simultaneously under
 * budget on average and *over* it on the pale family, which is a chalky figure
 * with no dark structure. So the bake is measured and remapped instead of hoped
 * at: the mean is forced onto `mean`, the macro spread is stretched by
 * `contrast`, and every texel is clamped into [min,max]. `SoldierMaterials`
 * prints what it actually achieved, and selftest.mjs fails the audit if it
 * drifts.
 *
 * WHY 0.104 AND NOT THE 0.20-0.22 REAL-WORLD FIGURE — measured off the shipping
 * frame, not guessed. A flat-grey reference figure was rendered in the `hero`
 * framing next to the sunlit set dressing and read back per channel:
 *
 *     albedo 0.17 -> 155 sRGB      sunlit stucco wall -> 118 sRGB
 *     albedo 0.09 -> 124 sRGB      sunlit sandbags    ->  91 sRGB
 *     albedo 0.05 ->  96 sRGB
 *
 * i.e. the environment's *sunlit* surfaces currently behave like 0.05-0.09
 * albedo, so a physically-honest 0.21 uniform renders far brighter than sunlit
 * plaster and the soldier reads as a white mannequin — the exact defect this
 * round exists to kill.
 *
 * ROUND 3 — the 0.145 calibration was still a stop too bright *on screen*. Read
 * back off `shots/r3/combat.png` (a hostile at ~32 m, sun behind camera-left):
 *
 *     enemy torso           rgb(170,148,115)  screen lin 0.310
 *     wall directly behind  rgb(127,122,115)  screen lin 0.196
 *     balcony figure (ads)  rgb(224,217,210)  screen lin 0.699  vs sky 0.94
 *
 * i.e. the soldier rendered 1.6x the building he stood in front of, and against
 * a blown 250-L sky he had 3 % contrast and vanished. The whole kit therefore
 * comes down another 0.72x: cloth 0.104 desert / 0.092 olive / 0.083 wolf grey,
 * pale blotches capped at 0.152, which puts the finished uniform at 0.075-0.11
 * linear — real coyote/multicam in dust is 0.08-0.14 and this is the bottom of
 * that. The macro window is still 3.8:1 (0.040-0.152) so the pattern keeps its
 * internal value structure, and `contrast` goes 1.4 -> 1.5 so the macro blotches
 * do not flatten as the window narrows. Screen contrast at the outline is then
 * finished by the edge-darkening term (`RIM`) below. If `world`/`materials` raise
 * the environment albedo to physical values, these four numbers plus `KIT_CAL`
 * are the only thing that has to move.
 */
export const CLOTH_BUDGET = { mean: 0.104, min: 0.040, max: 0.152, contrast: 1.5, sat: 1.35 };

/**
 * Per-pattern budget. Only the MEAN moves: the 0.085-0.325 window, the contrast
 * stretch and the saturation are shared, because they are what stops any of the
 * three from reading as a flat mannequin.
 */
/**
 * The same calibration applied to the rest of the kit. The GEAR vertex tints in
 * `soldier.js` express the *hierarchy* (cloth > pouches > webbing > boots) as
 * fractions of their base bake, so when the cloth came down to meet the world's
 * albedo the nylon and laminate bakes had to come with it or the pouches would
 * end up paler than the uniform they are strapped to — which is precisely the
 * "no internal value structure" read. 0.104 / 0.205 = 0.51.
 *
 * The finished per-part values this lands (printed by `node src/ai/selftest.mjs`)
 * are the ones the art direction asked for: carrier and helmet cover 0.045-0.07,
 * pouches / slings / webbing 0.05-0.09, boots 0.03-0.05, skin 0.16-0.22.
 */
export const KIT_CAL = 0.51;

export function budgetFor(cfg) {
  const mean = cfg?.budget ?? CLOTH_BUDGET.mean;
  if (mean === CLOTH_BUDGET.mean) return CLOTH_BUDGET;
  return { ...CLOTH_BUDGET, mean };
}

const lum3 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Mean/sd of a camo pattern's linear luminance, sampled on a coarse grid. */
export function measureCamo(nz, cfg, n = 96) {
  const out = { r: 0, g: 0, b: 0, h: 0, rough: 0, metal: 0, ao: 1 };
  let s = 0;
  let s2 = 0;
  let mn = Infinity;
  let mx = -Infinity;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      camoTexel(nz, cfg, x / n, y / n, out);
      const l = lum3(out.r, out.g, out.b);
      s += l;
      s2 += l * l;
      if (l < mn) mn = l;
      if (l > mx) mx = l;
    }
  }
  const mean = s / (n * n);
  return { mean, sd: Math.sqrt(Math.max(0, s2 / (n * n) - mean * mean)), min: mn, max: mx };
}

/**
 * Force one baked texel into the budget: recentre the mean, stretch the macro
 * contrast about it, clamp, and push the hue a little further from neutral —
 * a desaturated tan at these values is what makes cloth read as plaster.
 */
/**
 * The one place the finished cloth texel comes from: raw pattern -> budget.
 * Both the bake and `selftest.mjs` go through this, so the audit reports the map
 * that actually ships rather than the pattern before it was remapped.
 */
export function makeCamoSampler(nz, cfg, B = budgetFor(cfg)) {
  const pre = measureCamo(nz, cfg);
  const fn = (u, v, out) => {
    camoTexel(nz, cfg, u, v, out);
    applyBudget(out, pre.mean, B);
  };
  fn.srcMean = pre.mean;
  return fn;
}

function applyBudget(out, srcMean, B) {
  const l = lum3(out.r, out.g, out.b);
  if (l < 1e-6) return;
  let t = B.mean + (l - srcMean) * B.contrast;
  t = t < B.min ? B.min : t > B.max ? B.max : t;
  const k = t / l;
  // saturate around the texel's own luminance, then rescale to the target value
  const r = l + (out.r - l) * B.sat;
  const g = l + (out.g - l) * B.sat;
  const b = l + (out.b - l) * B.sat;
  const l2 = Math.max(1e-6, lum3(r, g, b));
  const k2 = (l * k) / l2;
  out.r = r * k2;
  out.g = g * k2;
  out.b = b * k2;
}

export function camoTexel(nz, cfg, u, v, out) {
  const M = cfg.macro;
  // domain warp so the blotches get organic, elongated shapes instead of the
  // round blobs raw value noise thresholds into
  const wx = nz.fbm(u + 0.31, v + 0.17, M * 2, 2) - 0.5;
  const wy = nz.fbm(u + 0.73, v + 0.59, M * 2, 2) - 0.5;
  const mu = u + wx * cfg.warp;
  const mv = v + wy * cfg.warp;

  // ---- macro: four overlapping blotch fields, one per non-base family ------
  const a = nz.fbm(mu + 0.11, mv, M, 2, 0.40);
  const b = nz.fbm(mu, mv + 0.37, M, 2, 0.40);
  const c = nz.fbm(mu + 0.61, mv + 0.23, M + 1, 2, 0.44);
  const d = nz.fbm(mu + 0.29, mv + 0.83, M + 2, 2, 0.44);

  // narrow transition bands: printed camo has hard edges between families, and
  // a soft ramp is exactly what averages to flat tan at distance
  let col = cfg.base;
  col = mix3(col, cfg.pale, smooth(0.535, 0.585, a));
  col = mix3(col, cfg.olive, smooth(0.555, 0.605, b) * 0.9);
  col = mix3(col, cfg.mid, smooth(0.515, 0.565, c));
  col = mix3(col, cfg.dark, smooth(0.605, 0.655, d));

  // ---- fine 3 cm pixel/dot layer, low amplitude ---------------------------
  const f1 = smooth(0.40, 0.60, nz.fbm(u + 3.7, v + 1.3, 24, 2, 0.35));
  const f2 = smooth(0.52, 0.70, nz.n2(u + 7.1, v + 2.9, 48));
  const fine = 0.88 + 0.26 * f1 - 0.12 * f2;

  const h = garmentRelief(nz, u, v);
  out.h = h;
  // sun bleaching on the crowns of the folds, dye pooling in the creases
  const bleach = 1 + 0.05 * smooth(-0.2, 0.9, h);
  out.r = col[0] * fine * bleach;
  out.g = col[1] * fine * bleach;
  out.b = col[2] * fine * bleach * 0.99;
  // matte ripstop: 0.86-0.95, roughest where the nap is raised
  out.rough = 0.905 - 0.045 * smooth(-0.6, 0.8, h) + 0.035 * (nz.fbm(u, v, 9, 3) - 0.5);
  out.metal = 0;
  out.ao = 0.82 + 0.18 * smooth(-0.7, 0.7, h);
}

/* ------------------------------------------------------------------ */
/* Silhouette preservation                                             */
/* ------------------------------------------------------------------ */

/**
 * VIEW-DEPENDENT EDGE DARKENING — the second half of the "read as a person
 * against a blown sky" problem, and the half albedo cannot solve.
 *
 * A character standing against a 0.94-linear sky loses its outline for two
 * reasons: the sky is brighter than anything physical the figure can be, and
 * bloom bleeds the sky *over* the last few pixels of him. Both are fixed by the
 * same thing a real photograph gets for free — a body is a closed surface, so at
 * its outline you are looking along the surface, through the full thickness of
 * fabric nap, dust and self-shadowing. Almost nothing comes back.
 *
 * So: outgoing radiance is scaled by `1 - strength * smoothstep(edge,1,1-|N.V|)^power`
 * using the GEOMETRIC normal (not the detail-perturbed one — perturbing the rim
 * makes it crawl). The band is confined to the outer sliver of every curved
 * surface, which is exactly the silhouette, and it takes the specular Fresnel
 * with it: the grazing highlight is precisely what was making the balcony figure
 * read as a piece of sky.
 *
 *   strength 0.62  measured: a 0.09-albedo uniform against 0.94 sky ends at
 *                  ~0.10 screen linear, i.e. > 80 % outline contrast; the AD
 *                  asked for >= 25 %.
 *   edge     0.42  |N.V| < 0.58 — roughly the outer 18 % of a limb's width, so
 *                  it reads as form shading rather than a drawn line.
 *   power    1.9   soft enough that it never becomes a cartoon outline.
 */
export const RIM = { strength: 0.62, edge: 0.42, power: 1.9 };

/* ------------------------------------------------------------------ */
/* Public: the material set                                            */
/* ------------------------------------------------------------------ */

export class SoldierMaterials {
  /**
   * @param rng   deterministic Rng
   * @param opts  { size, anisotropy, camo: string[] }
   */
  constructor(rng, opts = {}) {
    const size = opts.size ?? 512;
    const aniso = opts.anisotropy ?? 8;
    const nz = new TileNoise(rng.fork());
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);

    this.sets = {};
    this.materials = new Map();
    this._disposables = [];

    // ---- camouflage cloth, one bake per pattern ------------------------
    // Measure first, then bake through the budget remap, then report what the
    // map actually is. A camo bake that is never measured drifts every time the
    // noise is touched, and the figure goes chalky without anybody noticing.
    this.camoStats = {};
    for (const name of opts.camo ?? ['arid', 'woodland']) {
      const cfg = CAMO[name] ?? CAMO.arid;
      const sample = makeCamoSampler(nz, cfg);
      let s = 0;
      let s2 = 0;
      let mn = Infinity;
      let mx = -Infinity;
      let n = 0;
      this.sets[`camo_${name}`] = bake(
        size,
        (u, v, out) => {
          sample(u, v, out);
          const l = lum3(out.r, out.g, out.b);
          s += l;
          s2 += l * l;
          n++;
          if (l < mn) mn = l;
          if (l > mx) mx = l;
        },
        aniso,
        0.9
      );
      const mean = s / n;
      this.camoStats[name] = {
        mean,
        sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)),
        min: mn,
        max: mx,
        was: sample.srcMean,
      };
    }

    // ---- cordura nylon: webbing, pouches, boot uppers, gloves ----------
    // Base albedo sits at the TOP of the plausible range (0.30) so the assembly
    // can place each piece of kit below it with a vertex tint: pouches 0.19,
    // webbing 0.13, sling 0.12, gloves 0.07, boots 0.055. One material, five
    // values — that internal value hierarchy is what breaks the "one extruded
    // blob" read at 25 m.
    this.sets.nylon = bake(
      size,
      (u, v, out) => {
        // 1000D cordura at 0.26 m/tile: the basket weave is 1 mm, the binding
        // tape and bar-tacks are the things this tile actually has to carry
        const tu = u * 26, tv = v * 26;
        const cell = Math.sin(tu * Math.PI) * Math.sin(tv * Math.PI);
        let h = cell * 0.34;
        h += (nz.fbm(u, v, 120, 2) - 0.5) * 0.30;
        // PALS ribbing: 6 mm ribs, but only across the patches of the tile that
        // are webbing rather than plain cordura
        const rib = cellDist(v * 44);
        const ribGate = smooth(0.52, 0.70, nz.fbm(u + 8.3, v, 5, 2));
        h += ribGate * (ridgeLine(rib, 0.30) - 0.5) * 0.30;
        // binding tape + bar-tacks on the hem rows (every 1/3 tile ~ 87 mm)
        const st = cellDist(v * 3);
        const tape = ridgeLine(st, 0.045);
        h += tape * 0.14;
        h += ridgeLine(st, 0.020) * (0.5 + 0.5 * Math.sin(u * 300)) * 0.30;
        out.h = h;
        const shade = 0.84 + 0.16 * nz.fbm(u, v, 7, 3);
        const base = 0.300 * KIT_CAL * shade;
        out.r = base * 1.05;
        out.g = base * 1.0;
        out.b = base * 0.90;
        // thread is paler and shinier than the webbing
        const thr = ridgeLine(st, 0.020) * (0.25 + 0.25 * Math.sin(u * 300));
        out.r = mix(out.r, 0.335 * KIT_CAL, thr);
        out.g = mix(out.g, 0.320 * KIT_CAL, thr);
        out.b = mix(out.b, 0.278 * KIT_CAL, thr);
        out.rough = 0.79 - 0.13 * smooth(-0.4, 0.9, h) + 0.05 * (nz.fbm(u + 2, v, 11, 2) - 0.5);
        out.metal = 0;
        out.ao = 0.80 + 0.20 * smooth(-0.5, 1.0, h);
      },
      aniso,
      1.15
    );

    // ---- laminated plate-carrier shell / painted helmet shell ----------
    // A carrier is not webbing: it is a laminate over a foam-backed plate, so it
    // is smoother (0.55-0.70) than the cloth around it and darker than the
    // pouches bolted to it. Quilted stitch grid, scuffed high points.
    this.sets.plate = bake(
      size,
      (u, v, out) => {
        // quilting: a diamond stitch grid pressed into the laminate, and the
        // panels between it bulging over the foam
        const qu = cellDist(u * 5 + v * 2.5);
        const qv = cellDist(u * -2.5 + v * 5);
        let h = -(ridgeLine(qu, 0.045) + ridgeLine(qv, 0.045)) * 0.42;
        h += (1 - Math.max(ridgeLine(qu, 0.30), ridgeLine(qv, 0.30))) * 0.26;
        // laminate grain + abrasion
        const grain = nz.fbm(u, v, 90, 3);
        h += (grain - 0.5) * 0.24;
        const scuff = smooth(0.62, 0.86, nz.ridge(u * 0.7, v * 2.4, 22, 3));
        h -= scuff * 0.18;
        out.h = h;
        // Macro value variation. A carrier is the one part of the kit that is
        // pure flat colour if you let it be, and a flat slab in the middle of
        // the chest is the single loudest "moulded toy" cue on the model: sun
        // fade on the panels that face up, dust settled in the quilting, dried
        // sweat salt along the cummerbund.
        const fade = nz.fbm(u + 3.3, v, 3, 3);
        const soil = nz.fbm(u + 7.7, v + 2.1, 8, 3);
        const shade = 0.74 + 0.40 * fade;
        const base = 0.212 * KIT_CAL * shade;
        out.r = base * 1.04;
        out.g = base * 1.0;
        out.b = base * 0.93;
        // ground-in dust and grease darken the low panels
        out.r = mix(out.r, out.r * 0.66, smooth(0.44, 0.68, soil));
        out.g = mix(out.g, out.g * 0.64, smooth(0.44, 0.68, soil));
        out.b = mix(out.b, out.b * 0.60, smooth(0.44, 0.68, soil));
        // scuffs abrade to a paler, rougher grey
        out.r = mix(out.r, 0.283 * KIT_CAL, scuff * 0.7);
        out.g = mix(out.g, 0.274 * KIT_CAL, scuff * 0.7);
        out.b = mix(out.b, 0.258 * KIT_CAL, scuff * 0.7);
        // 0.55-0.72: laminate, markedly smoother than the 0.87-0.92 cloth
        // around it, and rougher again where it has been abraded
        out.rough = 0.590 + 0.060 * smooth(-0.5, 0.7, -h) + 0.09 * scuff +
          0.05 * smooth(0.44, 0.68, soil) + 0.025 * (nz.fbm(u, v + 5.1, 13, 2) - 0.5);
        out.metal = 0;
        out.ao = 0.82 + 0.18 * smooth(-0.7, 0.7, h);
      },
      aniso,
      1.05
    );

    // ---- skin ---------------------------------------------------------
    this.sets.skin = bake(
      size,
      (u, v, out) => {
        const pores = nz.fbm(u, v, 150, 3);
        const macro = nz.fbm(u, v, 11, 3);
        const fine = nz.fbm(u, v, 320, 2);
        out.h = (pores - 0.5) * 0.5 + (fine - 0.5) * 0.25;
        // Fitzpatrick IV base; per-instance tint shifts it
        const base = [0.295, 0.199, 0.148];
        const flush = [0.330, 0.186, 0.142];
        let col = mix3(base, flush, smooth(0.4, 0.75, macro));
        // stubble / beard shadow band handled by vertex colour; here just
        // follicle speckle
        const st = nz.fbm(u * 1.3, v * 1.3, 110, 2);
        col = mix3(col, [0.115, 0.086, 0.074], smooth(0.62, 0.72, st) * 0.5);
        out.r = col[0]; out.g = col[1]; out.b = col[2];
        out.rough = 0.50 + 0.16 * macro - 0.10 * pores;
        out.metal = 0;
        out.ao = 0.9 + 0.1 * pores;
      },
      aniso,
      0.75
    );

    // ---- glass-filled polymer: weapon furniture, knee pads, buckles ---
    this.sets.polymer = bake(
      size,
      (u, v, out) => {
        // moulded pebble stipple + parting-line sheen
        const stip = nz.fbm(u, v, 128, 3);
        const peb = smooth(0.45, 0.62, nz.fbm(u, v, 64, 2));
        out.h = (stip - 0.5) * 0.6 + peb * 0.35;
        const scr = smooth(0.86, 1.0, nz.ridge(u * 0.6, v * 3.0, 26, 2));
        const v0 = 0.052 * (0.9 + 0.2 * nz.fbm(u, v, 8, 2));
        out.r = mix(v0 * 1.02, 0.20, scr * 0.5);
        out.g = mix(v0, 0.195, scr * 0.5);
        out.b = mix(v0 * 0.98, 0.19, scr * 0.5);
        out.rough = 0.55 - 0.18 * peb + 0.10 * stip - 0.25 * scr;
        out.metal = 0;
        out.ao = 0.88 + 0.12 * stip;
      },
      aniso,
      1.0
    );

    // ---- parkerised / phosphated steel --------------------------------
    this.sets.steel = bake(
      size,
      (u, v, out) => {
        const grain = nz.fbm(u * 0.25, v * 3.0, 90, 3);
        const scratch = smooth(0.80, 1.0, nz.ridge(u * 0.3, v * 6.0, 40, 3));
        const pits = smooth(0.72, 0.9, nz.fbm(u, v, 190, 2));
        out.h = (grain - 0.5) * 0.35 + scratch * 0.5 - pits * 0.45;
        const base = 0.055 + 0.02 * grain;
        // bare steel where the finish has rubbed through
        const bare = scratch * 0.85;
        out.r = mix(base, 0.52, bare);
        out.g = mix(base, 0.53, bare);
        out.b = mix(base * 1.02, 0.55, bare);
        out.rough = mix(0.46 + 0.14 * grain + 0.2 * pits, 0.20, bare);
        out.metal = 1;
        out.ao = 0.9 + 0.1 * grain - 0.2 * pits;
      },
      aniso,
      1.1
    );

    // ---- vulcanised rubber: boot soles, sling pads --------------------
    this.sets.rubber = bake(
      size,
      (u, v, out) => {
        // lug pattern: deep sipes cut between raised blocks
        const lug = Math.max(ridgeLine(cellDist(u * 9), 0.085), ridgeLine(cellDist(v * 5.5), 0.095));
        const grain = nz.fbm(u, v, 160, 3);
        out.h = -lug * 1.1 + (grain - 0.5) * 0.4;
        const c = 0.036 + 0.016 * grain;
        out.r = c; out.g = c * 0.99; out.b = c * 0.97;
        out.rough = 0.82 - 0.1 * grain + 0.08 * lug;
        out.metal = 0;
        out.ao = 0.72 + 0.28 * (1 - lug);
      },
      aniso,
      1.4
    );

    /* ---------------- detail tiles: the high-frequency half -------------- */
    // 5 cm of surface per tile. Blended into the base normal + roughness inside
    // the shader, so a 1.5 mm weave survives no matter how large the base tile
    // has to be to carry the macro camo blotches.
    this.details = {};
    const dsize = Math.min(512, size);

    // ripstop cloth: 2-over-2 twill at ~1.5 mm plus the 7 mm ripstop lattice
    this.details.cloth = bakeDetail(
      dsize,
      (u, v, out) => {
        const threads = 33; // 50 mm / 1.5 mm
        const tu = u * threads, tv = v * threads;
        const wu = Math.sin(tu * Math.PI * 2);
        const wv = Math.sin(tv * Math.PI * 2);
        const over = Math.sin((tu + tv) * Math.PI) > 0;
        let h = (over ? wu * 0.62 + wv * 0.22 : wv * 0.62 + wu * 0.22) * 0.5;
        // ripstop reinforcement lattice: a doubled thread every 8 mm
        h += (ridgeLine(cellDist(u * 6), 0.055) + ridgeLine(cellDist(v * 6), 0.055)) * 0.30;
        // fibre fuzz
        h += (nz.fbm(u, v, 160, 2) - 0.5) * 0.26;
        out.h = h;
        // raised fuzz scatters more: nap crowns read rougher than the valleys
        out.rough = 0.32 * h - 0.18 * (nz.fbm(u + 2.7, v, 90, 2) - 0.5);
      },
      aniso,
      1.05
    );

    // nylon webbing / cordura: chunky basket weave with a resin sheen
    this.details.nylon = bakeDetail(
      dsize,
      (u, v, out) => {
        const cellsU = 25, cellsV = 25; // 2 mm basket
        const cu = Math.abs((((u * cellsU) % 1) + 1) % 1 - 0.5);
        const cv = Math.abs((((v * cellsV) % 1) + 1) % 1 - 0.5);
        const over = Math.sin((u * cellsU + v * cellsV) * Math.PI) > 0;
        let h = (over ? smooth(0.5, 0.1, cu) : smooth(0.5, 0.1, cv)) * 0.7 - 0.25;
        h += (nz.fbm(u, v, 140, 2) - 0.5) * 0.22;
        out.h = h;
        // the resin on the crowns of the weave is markedly smoother
        out.rough = -0.42 * h + 0.10 * (nz.fbm(u + 4.1, v, 70, 2) - 0.5);
      },
      aniso,
      1.15
    );

    this.bakeMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    for (const k in this.sets) {
      const s = this.sets[k];
      this._disposables.push(s.albedo, s.normal, s.orm);
    }
    for (const k in this.details) this._disposables.push(this.details[k]);
  }

  /**
   * Build (and cache) a MeshStandardMaterial for a set.
   * opts: { tint:[r,g,b], rough, metal, normalScale, key, side, transparent,
   *         detail: { set, scale, normal, rough } }
   *
   * Everything here stays a plain MeshStandardMaterial, which is what lets
   * render's MaterialPatcher inject the CSM shadow, the contact shadow, GTAO and
   * SSR into it. The detail layer is added through `onBeforeCompile`, and the
   * patcher chains our hook (it calls the previous one first), so the two
   * coexist. `customProgramCacheKey` is mandatory: without it three would hand
   * the detail-blended program to the skin material, which shares every define.
   */
  get(setName, opts = {}) {
    const d = opts.detail;
    const key = `${setName}|${opts.key ?? ''}|${(opts.tint ?? []).join(',')}|${opts.rough ?? ''}|${
      opts.metal ?? ''
    }|${d ? `${d.set},${d.scale},${d.normal},${d.rough}` : ''}`;
    let m = this.materials.get(key);
    if (m) return m;
    const set = this.sets[setName];
    if (!set) throw new Error(`[ai] unknown material set "${setName}"`);
    m = new THREE.MeshStandardMaterial({
      map: set.albedo,
      normalMap: set.normal,
      roughnessMap: set.orm,
      metalnessMap: set.orm,
      aoMap: set.orm,
      vertexColors: true,
      roughness: opts.rough ?? 1,
      metalness: opts.metal ?? 1,
      color: opts.tint ? new THREE.Color(opts.tint[0], opts.tint[1], opts.tint[2]) : 0xffffff,
      side: opts.side ?? THREE.FrontSide,
      dithering: true,
    });
    m.normalScale.set(opts.normalScale ?? 1, opts.normalScale ?? 1);
    m.aoMapIntensity = opts.ao ?? 0.85;
    m.name = `ai_${setName}`;
    this._attachShader(m, d && this.details[d.set] ? d : null, opts.rim);
    this.materials.set(key, m);
    return m;
  }

  /**
   * Install the character shader hooks: the high-frequency detail tile (when the
   * set has one) and the silhouette edge-darkening term (always).
   *
   * Both live in ONE onBeforeCompile because render's MaterialPatcher chains
   * whatever hook it finds — it calls ours first, then injects the CSM shadow,
   * contact shadow, GTAO and bounce fill. `customProgramCacheKey` must describe
   * every branch below or three hands the detail-blended program to the skin
   * material, which shares every define.
   */
  _attachShader(m, d, rimScale = 1) {
    const rim = new THREE.Vector4(
      RIM.strength * rimScale,
      RIM.edge,
      RIM.power,
      0
    );
    const uni = {
      owDetailTex: { value: d ? this.details[d.set] : null },
      owDetailParams: {
        value: new THREE.Vector3(d?.scale ?? 8, d?.normal ?? 0.7, d?.rough ?? 0.2),
      },
      owCharRim: { value: rim },
    };
    m.userData.owDetailUniforms = uni;
    m.userData.owCharRim = uni.owCharRim;
    const tag = `ai-${d ? `detail-${d.set}-${d.scale}` : 'plain'}-rim${rim.x.toFixed(2)}`;
    m.customProgramCacheKey = () => tag;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.owCharRim = uni.owCharRim;
      shader.fragmentShader = 'uniform vec4 owCharRim;\n' + shader.fragmentShader;
      if (d) {
        shader.uniforms.owDetailTex = uni.owDetailTex;
        shader.uniforms.owDetailParams = uni.owDetailParams;
        shader.fragmentShader =
          'uniform sampler2D owDetailTex;\nuniform vec3 owDetailParams;\n' + shader.fragmentShader;
        // roughness: the detail alpha is a signed delta around 0.5
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = clamp( roughnessFactor +
            ( texture2D( owDetailTex, vNormalMapUv * owDetailParams.x ).w - 0.5 ) * owDetailParams.z,
            0.04, 1.0 );`
        );
        // normal: add the detail tangent slope to the base one before the TBN
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `vec3 owMapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
          owMapN.xy *= normalScale;
          owMapN.xy += ( texture2D( owDetailTex, vNormalMapUv * owDetailParams.x ).xy * 2.0 - 1.0 )
            * owDetailParams.y;
          normal = normalize( tbn * normalize( owMapN ) );`
        );
      }
      // silhouette: darken the grazing sliver of every closed surface, using the
      // geometric normal so the band cannot crawl with the detail tile.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `{
          float owF = 1.0 - abs( dot( normalize( vViewPosition ), nonPerturbedNormal ) );
          float owEdge = pow( smoothstep( owCharRim.y, 1.0, owF ), owCharRim.z );
          outgoingLight *= 1.0 - owCharRim.x * owEdge;
        }
        #include <opaque_fragment>`
      );
    };
  }

  /** Flat material for goggle lenses / optic glass. */
  glass(tint = [0.06, 0.07, 0.08]) {
    let m = this.materials.get('glass');
    if (m) return m;
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tint[0], tint[1], tint[2]),
      roughness: 0.11,
      metalness: 0.0,
      vertexColors: true,
      envMapIntensity: 1.4,
    });
    m.name = 'ai_glass';
    // A goggle lens is the one place a *bright* grazing highlight is correct, so
    // the edge term runs at half strength: enough that the lens rim does not
    // bloom into the sky, not enough to kill the sheen that makes it read glass.
    this._attachShader(m, null, 0.5);
    this.materials.set('glass', m);
    return m;
  }

  dispose() {
    for (const t of this._disposables) t.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    this._disposables.length = 0;
  }
}
