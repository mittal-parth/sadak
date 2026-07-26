/**
 * AI self-test — builds every soldier variant headlessly (no WebGL) and reports
 * NaN / degenerate geometry per part, triangle counts and skin-weight sanity,
 * then audits the *albedo budget*: the linear value every piece of kit actually
 * ends up with, and whether the camo macro pattern still has contrast once it is
 * mip-averaged down to its on-screen footprint at 25 m.
 *
 *   node src/ai/selftest.mjs
 */

import { Rng } from '../core/rng.js';
import { RIG } from './rig.js';
import { CharacterBuilder, Noise, vcount } from './geo.js';
import * as P from './parts.js';
import { buildWeapon } from './weapon.js';
import { VARIANTS, buildSoldier } from './soldier.js';
import { CAMO, CLOTH_TILE, TileNoise, makeCamoSampler, CLOTH_BUDGET, budgetFor, KIT_CAL } from './textures.js';

const rng = new Rng(1234);
const nz = new Noise(rng.fork());

function check(name, m) {
  let nan = 0, deg = 0;
  for (let i = 0; i < m.p.length; i++) if (!Number.isFinite(m.p[i])) nan++;
  for (let i = 0; i < m.n.length; i++) if (!Number.isFinite(m.n[i])) deg++;
  for (let i = 0; i < m.uv.length; i++) if (!Number.isFinite(m.uv[i])) nan++;
  const status = nan || deg ? `NaN pos/uv:${nan} nrm:${deg}` : 'ok';
  console.log(
    `${status === 'ok' ? '  ' : '!!'} ${name.padEnd(18)} v=${String(vcount(m)).padStart(5)} t=${String(
      m.i.length / 3
    ).padStart(5)}  ${status}`
  );
  return nan + deg;
}

const bp = (n) => {
  const v = RIG.bindPos[RIG.index(n)];
  return [v.x, v.y, v.z];
};

let bad = 0;
const head = bp('Head');
bad += check('jacketTorso', P.jacketTorso(nz, {}));
bad += check('pelvis', P.pelvis(nz));
bad += check('collar', P.collar(nz));
bad += check('limbTube arm', P.limbTube(nz, bp('UpperArmR'), bp('ForearmR'), bp('HandR'), [0.07, 0.058, 0.052, 0.05, 0.046, 0.043, 0.04], { rings: 13, seg: 15 }));
bad += check('limbTube leg', P.limbTube(nz, bp('UpLegR'), bp('LegR'), bp('FootR'), [0.098, 0.092, 0.082, 0.074, 0.068, 0.066, 0.07], { rings: 13, seg: 16 }));
bad += check('shoulderCap', P.shoulderCap(nz, bp('UpperArmR'), -1));
bad += check('headMesh', P.headMesh(nz, head, {}));
bad += check('nose', P.nose(nz, head));
bad += check('ear', P.ear(nz, head, -1));
bad += check('eyeball', P.eyeball(head, -1));
bad += check('faceWrap', P.faceWrap(nz, head, {}));
bad += check('helmet', P.helmet(nz, head, {}));
bad += check('helmetHardware', P.helmetHardware(nz, head));
bad += check('chinStrap', P.chinStrap(head));
const g = P.goggles(head);
bad += check('goggleFrame', g.frame);
bad += check('goggleStrap', g.strap);
bad += check('goggleLens', P.goggleLens(head));
bad += check('plateCarrier', P.plateCarrier(nz, {}));
bad += check('carrierWebbing', P.carrierWebbing());
bad += check('pouch', P.pouch(nz, { x: 0, y: 1.2, z: 0.13, bend: 0.2 }));
bad += check('belt', P.belt(nz));
bad += check('hipPouch', P.hipPouch(nz, -1));
bad += check('kneePad', P.kneePad(nz, bp('LegR'), -1));
bad += check('boot', P.boot(nz, bp('FootR'), -1));
bad += check('bootSole', P.bootSole(bp('FootR')));
bad += check('bootLaces', P.bootLaces(bp('FootR')));
bad += check('glove', P.glove(nz, bp('HandR'), [0.18, 0.92, -0.34], [-0.55, 0.35, -0.75], -1));
bad += check('knuckleGuard', P.knuckleGuard(bp('HandR'), [0.18, 0.92, -0.34], [-0.55, 0.35, -0.75]));
for (const style of ['carbine', 'ak']) {
  const W = buildWeapon(nz, style, rng.fork());
  bad += check(`wpn ${style} steel`, W.steel);
  bad += check(`wpn ${style} poly`, W.polymer);
  bad += check(`wpn ${style} rubber`, W.rubber);
  if (W.glass.p.length) bad += check(`wpn ${style} glass`, W.glass);
  bad += check(`sling ${style}`, P.sling(W.foregrip, W.stockTop));
  for (const k of ['muzzle', 'foregrip', 'stockTop']) {
    if (!W[k].every(Number.isFinite)) console.log(`!! weapon.${k} NaN`);
  }
}

console.log(bad ? `\nFAIL — ${bad} bad components` : '\nall parts finite');

// rig sanity
for (let i = 0; i < RIG.count; i++) {
  const p = RIG.bindPos[i], q = RIG.bindQuat[i];
  if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite)) {
    console.log(`!! rig bone ${RIG.names[i]} NaN`);
  }
  if (RIG.length[i] < 1e-4) console.log(`!! rig bone ${RIG.names[i]} zero length`);
}
console.log(`rig: ${RIG.count} bones, eye ${RIG.eyeHeight}m`);

/* ------------------------------------------------------------------ */
/* camouflage: does the macro pattern survive to 25 m?                 */
/* ------------------------------------------------------------------ */

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Box-downsample a luminance field and report mean / sd / min / max. */
function fieldStats(f, n, step = 1) {
  let s = 0, s2 = 0, mn = Infinity, mx = -Infinity, k = 0;
  for (let y = 0; y + step <= n; y += step) {
    for (let x = 0; x + step <= n; x += step) {
      let a = 0;
      for (let j = 0; j < step; j++) for (let i = 0; i < step; i++) a += f[(y + j) * n + x + i];
      a /= step * step;
      s += a; s2 += a * a; k++;
      if (a < mn) mn = a;
      if (a > mx) mx = a;
    }
  }
  const avg = s / k;
  return { avg, sd: Math.sqrt(Math.max(0, s2 / k - avg * avg)), mn, mx };
}

console.log('\ncamouflage — linear luminance, and what is left of it at 25 m');
{
  const N = 256;
  const nz = new TileNoise(new Rng(99).fork());
  const out = { r: 0, g: 0, b: 0, h: 0, rough: 0, metal: 0, ao: 1 };
  // A 1.75 m soldier at 25 m through a 80 deg / 1920 px frame is ~215 px tall,
  // so one screen pixel covers ~8 mm of cloth. Averaging the tile down to that
  // footprint is exactly what the mip chain does.
  const mmPerPx = 8;
  const mmPerTexel = (CLOTH_TILE * 1000) / N;
  const step = Math.max(1, Math.round(mmPerPx / mmPerTexel));
  for (const name in CAMO) {
    const f = new Float64Array(N * N);
    const sample = makeCamoSampler(nz, CAMO[name]);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        sample(x / N, y / N, out);
        f[y * N + x] = lum([out.r, out.g, out.b]);
      }
    }
    const full = fieldStats(f, N, 1);
    const far = fieldStats(f, N, step);
    const B = budgetFor(CAMO[name]);
    const ok =
      far.sd > 0.022 &&
      full.avg > B.mean - 0.02 &&
      full.avg < B.mean + 0.02 &&
      full.mn >= CLOTH_BUDGET.min - 1e-3 &&
      full.mx <= CLOTH_BUDGET.max + 1e-3;
    console.log(
      `${ok ? '  ' : '!!'} ${name.padEnd(9)} avg ${full.avg.toFixed(3)}  ` +
        `range ${full.mn.toFixed(3)}-${full.mx.toFixed(3)}  sd ${full.sd.toFixed(4)}  ` +
        `| at 25 m (${step}x box) sd ${far.sd.toFixed(4)} range ${far.mn.toFixed(3)}-${far.mx.toFixed(3)}`
    );
  }
  console.log(
    `   (budget: per-pattern avg +-0.02, every texel inside ` +
      `${CLOTH_BUDGET.min}-${CLOTH_BUDGET.max}, macro contrast sd > 0.022 at 25 m)`
  );
}

/* ------------------------------------------------------------------ */
/* albedo budget: effective linear value of every piece of kit         */
/* ------------------------------------------------------------------ */

console.log('\nalbedo budget — map avg x vertex tint, per part (linear)');
{
  // stub material factory: the audit only needs the geometry + vertex colours
  const stub = { get: () => ({}), glass: () => ({}) };
  // Measured map averages, kept next to the bakes they describe. The nylon and
  // laminate bakes are written as `mean-before-calibration x KIT_CAL` so this
  // audit follows the one constant that scales the whole kit instead of silently
  // reporting last round's numbers.
  const MAP_AVG = {
    cloth: null,
    plate: 0.196 * KIT_CAL,
    gear: 0.276 * KIT_CAL,
    boot: 0.276 * KIT_CAL,
    skin: 0.204,
    polymer: 0.054,
    steel: 0.079,
    rubber: 0.043,
  };
  const N = 128;
  const out = { r: 0, g: 0, b: 0, h: 0, rough: 0, metal: 0, ao: 1 };
  const nz = new TileNoise(new Rng(99).fork());
  for (const vname in VARIANTS) {
    const V = VARIANTS[vname];
    let s = 0;
    const sample = makeCamoSampler(nz, CAMO[V.camo]);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        sample(x / N, y / N, out);
        s += lum([out.r, out.g, out.b]);
      }
    }
    MAP_AVG.cloth = s / (N * N);
    const built = buildSoldier(vname, { rng: new Rng(7).fork(), materials: stub });
    const col = built.geometry.getAttribute('color');
    const rows = [];
    for (const p of built.parts) {
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < p.count; i++) {
        r += col.getX(p.start + i); g += col.getY(p.start + i); b += col.getZ(p.start + i);
      }
      const vc = lum([r / p.count, g / p.count, b / p.count]);
      const map = MAP_AVG[p.material] ?? 0.1;
      const tintL =
        p.material === 'cloth'
          ? lum(V.clothTint)
          : p.material === 'plate'
            ? lum(V.plateTint)
            : p.material === 'gear' || p.material === 'boot'
              ? lum(V.gearTint)
              : 1;
      rows.push({ name: p.name, mat: p.material, v: map * vc * tintL });
    }
    console.log(`  ${vname}: ${built.stats.triangles} tris`);
    for (const r of rows) {
      console.log(`     ${r.name.padEnd(13)} ${r.mat.padEnd(8)} ${r.v.toFixed(3)}`);
    }
  }
}
