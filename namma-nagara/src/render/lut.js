import * as THREE from 'three';

/**
 * Procedurally generated 33^3 colour grading LUT (Data3DTexture, RGBA8).
 *
 * No external .cube file — the grade is *computed*, which means it can be
 * re-authored per time-of-day and stays inside the "no external assets" rule.
 *
 * The transform is a real colourist chain applied in display-referred space:
 *   ASC-CDL slope/offset/power per channel  ->  split tone (cool shadows,
 *   warm highlights, the modern shooter signature)  ->  luminance-preserving
 *   saturation  ->  highlight desaturation (film shoulder behaviour)  ->
 *   a filmic S-curve pivoted on 18% grey.
 */

const SIZE = 33;

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  c = Math.max(0, c);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
const LUM = [0.2126, 0.7152, 0.0722];

export const GRADE_PRESETS = {
  // Neutral-but-cinematic default: slightly cool shadows, warm highlights,
  // a touch of contrast, mild highlight desaturation.
  default: {
    slope: [1.0, 0.995, 0.985],
    offset: [-0.004, -0.002, 0.004],
    power: [1.0, 1.005, 1.02],
    shadowTint: [-0.001, 0.006, 0.022],
    highlightTint: [0.030, 0.014, -0.006],
    // Display-space saturation. It has to be well over unity because AgX's
    // inset/outset pair is a *desaturating* transform by construction and the
    // shoulder takes another chunk out of anything bright: measured on the
    // 16:30 frame the zenith came out of the tone map at B-R = +15 code values
    // for a sky whose scene radiance is 3:1 blue over red.
    saturation: 1.20,
    // Global contrast, as a power about a pivot.
    //
    // The pivot is the CODE VALUE that must not move, and it has to sit at
    // mid-grey or the "contrast" is really an exposure lift: at 0.42 (code 107)
    // everything above a fairly dark mid-tone got brighter, which is half of
    // why 18% scene grey was landing on code 153 instead of ~120 and the whole
    // frame read as a milky pastel wash with no blacks in it. AgX puts 18%
    // scene grey near 0.50 display, so that is where the pivot belongs.
    contrast: 1.28,
    pivot: 0.50,
    // Film loses chroma in the shoulder, but 0.28 on top of AgX's own
    // desaturation is what turned the sunset into a cream void and the noon
    // zenith into grey. A tenth is enough to keep a specular hit from going
    // neon without bleaching the sky.
    highlightDesat: 0.10,
    // Toe lift, in code values / 255. A modern shooter frame does keep a couple
    // of code values of atmosphere in its darkest corner rather than a true
    // zero — but 0.017 (four and a half codes) added to a curve that was
    // already lifting the low mids is a grey veil over the bottom third of the
    // histogram. 0.008 is two codes: visible as "not a hole", invisible as haze.
    toe: 0.008,
    // Shoulder knee, in code values. The grade runs in display space, so the
    // contrast power routinely pushes 0.8 up past 1.0 and *something* has to
    // roll it off; an exponential approach to 1.0 from this knee keeps cloud
    // and specular separation that a hard divide-by would flatten to 3 codes.
    shoulder: 0.60,
    // Shoulder softness, in the SAME post-contrast units as the knee. The
    // exponential is divided through by its own value at the largest output the
    // contrast power can produce — pivot * (1/pivot)^contrast — so that
    //   scurve(1) == 1 EXACTLY
    // and display white is actually reachable.
    //
    // This is the fix for "p99.9 = 230, nothing above 88% luminance, milky
    // pastel wash". The shoulder used to be UNNORMALISED with a knee of 0.66 and
    // a softness of (1 - k), so input 1.0 landed on
    //   0.66 + 0.34 * (1 - e^-1) = 0.875  ->  223 code values,
    // and the sky, the sunlit stucco and every specular highlight piled up inside
    // 220..232. The knee comes DOWN rather than up, with a much longer softness:
    // that reproduces the old curve to within 3 code values everywhere below
    // 0.83 — the mid-tones were never the problem — while the last fifth
    // continues to 255 instead of asymptoting 32 codes short of it.
    shoulderSoft: 1.20,
  },
};

/**
 * Shoulder constants for a preset: knee, softness, and the normaliser that
 * makes the curve land on 1.0 at input 1.0.
 */
function shoulderParams(g) {
  const k = Math.min(0.98, Math.max(0.05, g.shoulder));
  const s = Math.max(1e-3, g.shoulderSoft ?? 0.55 * (1 - k));
  // Largest post-contrast value an in-gamut input (1.0) can produce.
  const cMax = g.pivot * Math.pow(1 / g.pivot, g.contrast);
  const norm = 1 - Math.exp(-Math.max(cMax - k, 1e-3) / s);
  return { k, s, norm };
}

function applyGrade(rgb, g, sh) {
  let r = rgb[0];
  let gg = rgb[1];
  let b = rgb[2];

  // ASC CDL: slope / offset / power
  r = Math.pow(Math.max(0, r * g.slope[0] + g.offset[0]), g.power[0]);
  gg = Math.pow(Math.max(0, gg * g.slope[1] + g.offset[1]), g.power[1]);
  b = Math.pow(Math.max(0, b * g.slope[2] + g.offset[2]), g.power[2]);

  // split toning by luminance
  const l = r * LUM[0] + gg * LUM[1] + b * LUM[2];
  const shadowW = Math.pow(1 - Math.min(1, l), 2.2);
  const highW = Math.pow(Math.min(1, l), 2.0);
  r += g.shadowTint[0] * shadowW + g.highlightTint[0] * highW;
  gg += g.shadowTint[1] * shadowW + g.highlightTint[1] * highW;
  b += g.shadowTint[2] * shadowW + g.highlightTint[2] * highW;

  // saturation about luminance
  const l2 = r * LUM[0] + gg * LUM[1] + b * LUM[2];
  r = l2 + (r - l2) * g.saturation;
  gg = l2 + (gg - l2) * g.saturation;
  b = l2 + (b - l2) * g.saturation;

  // highlights lose saturation the way film does
  const hd = g.highlightDesat * Math.pow(Math.min(1, Math.max(0, l2)), 3.0);
  r += (l2 - r) * hd;
  gg += (l2 - gg) * hd;
  b += (l2 - b) * hd;

  // filmic S-curve around the pivot, with a lifted toe for that "there is
  // atmosphere in the shadows" look rather than crushed black
  const scurve = (x) => {
    const t = Math.max(0, x);
    // contrast as a power about the pivot: the pivot itself never moves
    let c = t <= 0 ? 0 : g.pivot * Math.pow(t / g.pivot, g.contrast);
    // Soft shoulder so the top end rolls off instead of clipping flat, but
    // NORMALISED so that the shoulder still arrives at 1.0. Without the
    // division by `sh.norm` the curve asymptotes short of white.
    if (c > sh.k) {
      c = sh.k + (1 - sh.k) * ((1 - Math.exp(-(c - sh.k) / sh.s)) / sh.norm);
    }
    return g.toe + (1 - g.toe) * Math.min(1, Math.max(0, c));
  };
  return [scurve(r), scurve(gg), scurve(b)];
}

export function createGradeLut(preset = 'default') {
  const g = GRADE_PRESETS[preset] ?? GRADE_PRESETS.default;
  const sh = shoulderParams(g);
  const n = SIZE;
  const data = new Uint8Array(n * n * n * 4);
  let p = 0;
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const inp = [x / (n - 1), y / (n - 1), z / (n - 1)];
        const out = applyGrade(inp, g, sh);
        data[p++] = Math.round(Math.min(1, Math.max(0, out[0])) * 255);
        data[p++] = Math.round(Math.min(1, Math.max(0, out[1])) * 255);
        data[p++] = Math.round(Math.min(1, Math.max(0, out[2])) * 255);
        data[p++] = 255;
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, n, n, n);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  tex.name = 'ow-grade-lut';
  return { texture: tex, size: n };
}

export { srgbToLinear, linearToSrgb };
