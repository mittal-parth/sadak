#!/usr/bin/env node
/** Pixel statistics for a shot directory. Not part of the game build. */
import { readFileSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';

const dir = process.argv[2] ?? '/tmp/tone-0';
const shots = (process.argv[3] ?? 'hero,detail,interior,sunset,night,weapon,ads,muzzle,combat,impacts,hud').split(',');

function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

// Regions to probe: [name, x0,y0,x1,y1] in 1920x1080 fractions
const REGIONS = {
  sky: [0.40, 0.03, 0.60, 0.13],
  zenith: [0.45, 0.005, 0.55, 0.04],
  midsky: [0.42, 0.20, 0.58, 0.30],
  street: [0.40, 0.72, 0.55, 0.82],
  leftwall: [0.05, 0.40, 0.18, 0.60],
  rightwall: [0.82, 0.30, 0.95, 0.50],
};

for (const s of shots) {
  const f = `${dir}/${s}.png`;
  if (!existsSync(f)) { console.log(`${s}: MISSING`); continue; }
  const png = PNG.sync.read(readFileSync(f));
  const { width: W, height: H, data } = png;
  const hist = new Uint32Array(256);
  let n = 0, sr = 0, sg = 0, sb = 0, maxL = 0, satSum = 0;
  // exclude HUD corners crudely: skip bottom 8% and top 6%
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const L = lum(r, g, b);
      hist[Math.min(255, Math.round(L))]++;
      n++; sr += r; sg += g; sb += b;
      if (L > maxL) maxL = L;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      satSum += mx > 0 ? (mx - mn) / mx : 0;
    }
  }
  const pct = (p) => { let c = 0, t = n * p; for (let i = 0; i < 256; i++) { c += hist[i]; if (c >= t) return i; } return 255; };
  let above250 = 0, below12 = 0, above245 = 0;
  for (let i = 250; i < 256; i++) above250 += hist[i];
  for (let i = 245; i < 256; i++) above245 += hist[i];
  for (let i = 0; i < 12; i++) below12 += hist[i];
  const parts = [];
  for (const [k, [x0, y0, x1, y1]] of Object.entries(REGIONS)) {
    let rr = 0, gg = 0, bb = 0, cnt = 0;
    for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++)
      for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x++) {
        const i = (y * W + x) * 4; rr += data[i]; gg += data[i + 1]; bb += data[i + 2]; cnt++;
      }
    parts.push(`${k}=${(rr / cnt).toFixed(0)}/${(gg / cnt).toFixed(0)}/${(bb / cnt).toFixed(0)}(L${lum(rr / cnt, gg / cnt, bb / cnt).toFixed(0)},BR${((bb - rr) / cnt).toFixed(0)})`);
  }
  console.log(
    `${s.padEnd(9)} mean=${(sr / n).toFixed(0)}/${(sg / n).toFixed(0)}/${(sb / n).toFixed(0)} L=${lum(sr / n, sg / n, sb / n).toFixed(1)} ` +
    `sat=${(100 * satSum / n).toFixed(1)}% p1=${pct(0.01)} p50=${pct(0.5)} p99=${pct(0.99)} p999=${pct(0.999)} max=${maxL.toFixed(0)} ` +
    `>250=${(100 * above250 / n).toFixed(3)}% >245=${(100 * above245 / n).toFixed(3)}% <12=${(100 * below12 / n).toFixed(2)}%`
  );
  console.log(`          ${parts.join(' ')}`);
}
