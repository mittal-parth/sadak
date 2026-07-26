#!/usr/bin/env node
/** Crop + optional scale a PNG region. tools/crop.mjs in.png out.png x y w h [scale] */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const [, , inp, outp, X, Y, W, H, S] = process.argv;
const src = PNG.sync.read(readFileSync(inp));
const x = +X, y = +Y, w = +W, h = +H, s = S ? +S : 1;
const dst = new PNG({ width: Math.round(w * s), height: Math.round(h * s) });
for (let j = 0; j < dst.height; j++)
  for (let i = 0; i < dst.width; i++) {
    const sx = Math.min(src.width - 1, x + Math.floor(i / s));
    const sy = Math.min(src.height - 1, y + Math.floor(j / s));
    const a = (sy * src.width + sx) * 4, b = (j * dst.width + i) * 4;
    dst.data[b] = src.data[a]; dst.data[b + 1] = src.data[a + 1];
    dst.data[b + 2] = src.data[a + 2]; dst.data[b + 3] = 255;
  }
writeFileSync(outp, PNG.sync.write(dst));
// also print mean
let r = 0, g = 0, bl = 0, n = 0;
for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
  const a = (Math.min(src.height - 1, j) * src.width + Math.min(src.width - 1, i)) * 4;
  r += src.data[a]; g += src.data[a + 1]; bl += src.data[a + 2]; n++;
}
console.log(`${inp} [${x},${y},${w}x${h}] mean=${(r / n).toFixed(1)}/${(g / n).toFixed(1)}/${(bl / n).toFixed(1)}`);
