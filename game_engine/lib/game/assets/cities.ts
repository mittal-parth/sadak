/**
 * Hero landmarks for the six seed districts.
 *
 * These districts previously had no kit of their own: the `Landmark` union
 * only had four values, so Hyderabad, Ahmedabad, Amritsar and Mumbai all
 * pointed at Delhi's bazaar gate and Bhubaneswar at Kolkata's trams. Five of
 * ten cities were dressed identically, which is why the districts read as one
 * recoloured street however different their palettes were.
 *
 * Each factory below builds the one silhouette that names its city — the thing
 * you would draw if you had a single shape to say "this is Hyderabad". Same
 * conventions as delhi.ts / chennai.ts: baked transforms, merged by material,
 * a couple of hundred triangles each, nothing loaded from disk.
 */

import * as THREE from "three";
import {
  bakedBox,
  bakedCone,
  bakedCyl,
  bakedSphere,
  bakedTorus,
  mergeByMaterial,
  mulberry32,
  stdMat,
  type AssetMaterialLib,
  type Part,
} from "./shared";

const GRANITE = 0x9c9384;
const GRANITE_DK = 0x6f6862;
const LIMEWASH = 0xefe4cb;
const TEAK = 0x6b4423;
const TEAK_DK = 0x4a2f18;
const GOLD = 0xd4a017;
const GOLD_BRIGHT = 0xf5c73a;
const MARBLE = 0xf4f0e4;
const LATERITE = 0xb5651d;
const SANDSTONE = 0xc98f52;

/** Small helper: a ring of pillars carrying something. */
function pillarRing(
  parts: Part[],
  mat: THREE.Material,
  cx: number,
  cz: number,
  radius: number,
  baseY: number,
  h: number,
  n = 4
) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 4;
    parts.push({
      geo: bakedCyl(0.14, 0.16, h, 6, cx + Math.cos(a) * radius, baseY + h / 2, cz + Math.sin(a) * radius),
      mat,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Hyderabad — Charminar. Four minarets on a square arched base.
 * ~16m tall, ~9m square.
 * ------------------------------------------------------------------ */
export function makeCharminar(mats?: AssetMaterialLib, seed = 11): THREE.Group {
  const rand = mulberry32(seed);
  const stone = stdMat(GRANITE, { roughness: 0.9 }, mats);
  const trim = stdMat(LIMEWASH, { roughness: 0.8 }, mats);
  const dark = stdMat(GRANITE_DK, { roughness: 0.92 }, mats);

  const parts: Part[] = [];
  const half = 4.2;
  // Squatter than the real thing on purpose. The chase camera crops around 15m
  // at landmark distance, and what identifies a Charminar is the four minarets
  // — so the base gives up height to keep them inside the frame.
  const baseH = 6.6;

  // Four corner piers, with the great arch between them on each face.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({ geo: bakedBox(2.2, baseH, 2.2, sx * half, baseH / 2, sz * half), mat: stone });
    }
  }

  // Arch spandrels: a solid header across each face with a pointed void cut
  // suggested by two angled shoulders rather than a real boolean.
  for (const rot of [0, Math.PI / 2]) {
    const w = half * 2 + 2.2;
    parts.push({
      geo: bakedBox(w, 1.6, 2.2, 0, baseH - 0.8, 0, 0, rot, 0),
      mat: stone,
    });
    // Shoulders of the pointed arch.
    for (const s of [-1, 1]) {
      const g = bakedBox(2.6, 0.5, 2.25, s * 2.4, baseH - 2.6, 0, 0, 0, s * -0.5);
      g.rotateY(rot);
      parts.push({ geo: g, mat: stone });
    }
  }

  // String courses.
  for (const y of [3.0, 5.6, baseH + 0.35]) {
    parts.push({ geo: bakedBox(11.2, 0.34, 11.2, 0, y, 0), mat: trim });
  }

  // Balcony deck and its balustrade.
  parts.push({ geo: bakedBox(11.8, 0.5, 11.8, 0, baseH + 1.0, 0), mat: stone });
  for (const s of [-1, 1]) {
    parts.push({ geo: bakedBox(11.8, 0.7, 0.25, 0, baseH + 1.6, s * 5.8), mat: trim });
    parts.push({ geo: bakedBox(0.25, 0.7, 11.8, s * 5.8, baseH + 1.6, 0), mat: trim });
  }

  // The four minarets — the whole point of the silhouette.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const mx = sx * half;
      const mz = sz * half;
      const shaftY = baseH + 1.25;

      parts.push({ geo: bakedCyl(0.72, 0.9, 4.6, 10, mx, shaftY + 2.3, mz), mat: stone });
      // Two gallery rings up the shaft.
      parts.push({ geo: bakedCyl(1.0, 1.0, 0.28, 10, mx, shaftY + 2.0, mz), mat: trim });
      parts.push({ geo: bakedCyl(0.92, 0.92, 0.28, 10, mx, shaftY + 3.9, mz), mat: trim });
      // Petal drum, onion dome, finial.
      parts.push({ geo: bakedCyl(0.62, 0.78, 0.7, 10, mx, shaftY + 4.9, mz), mat: dark });
      parts.push({
        geo: bakedSphere(0.72, mx, shaftY + 5.5, mz, { wSeg: 12, hSeg: 8, sy: 1.25 }),
        mat: trim,
      });
      parts.push({ geo: bakedCyl(0.03, 0.07, 0.9, 5, mx, shaftY + 6.6, mz), mat: dark });
    }
  }

  void rand;
  const g = mergeByMaterial(parts);
  g.name = "hyderabad-charminar";
  return g;
}

/* ------------------------------------------------------------------ *
 * Kochi — cantilevered Chinese fishing net. Nothing else in India looks
 * remotely like it. ~9m tall, ~11m long.
 * ------------------------------------------------------------------ */
export function makeChineseFishingNet(mats?: AssetMaterialLib, seed = 12): THREE.Group {
  const rand = mulberry32(seed);
  const timber = stdMat(TEAK, { roughness: 0.9 }, mats);
  const dark = stdMat(TEAK_DK, { roughness: 0.92 }, mats);
  const rope = stdMat(0xcfc0a0, { roughness: 0.95 }, mats);
  const netMat = stdMat(0x8a7f66, { roughness: 0.95 }, mats);

  const parts: Part[] = [];

  // A-frame gantry on the bank.
  for (const s of [-1, 1]) {
    parts.push({ geo: bakedCyl(0.13, 0.17, 8.4, 6, s * 1.5, 4.2, 0, 0, s * -0.14), mat: timber });
    parts.push({ geo: bakedCyl(0.11, 0.14, 6.0, 6, s * 1.5, 3.0, -2.6, 0.42, 0), mat: timber });
  }
  // Cross-bracing.
  parts.push({ geo: bakedBox(3.4, 0.16, 0.16, 0, 2.4, 0), mat: dark });
  parts.push({ geo: bakedBox(3.2, 0.16, 0.16, 0, 5.4, 0), mat: dark });

  // The long cantilever arm reaching out over the water.
  parts.push({ geo: bakedCyl(0.1, 0.16, 10.5, 6, 0, 6.6, 4.4, 0.26, 0), mat: timber });
  // Counterweight tail: a run of stones hung on short ropes.
  parts.push({ geo: bakedCyl(0.1, 0.13, 3.6, 6, 0, 7.4, -1.9, -0.3, 0), mat: timber });
  for (let i = 0; i < 4; i++) {
    const z = -1.0 - i * 0.65;
    parts.push({ geo: bakedCyl(0.03, 0.03, 1.1, 4, 0.25, 7.0 - i * 0.2, z), mat: rope });
    parts.push({ geo: bakedSphere(0.26, 0.25, 6.4 - i * 0.2, z, { wSeg: 6, hSeg: 5 }), mat: dark });
  }

  // Net: four spreader poles from the arm tip down to a square mouth, with a
  // slack mesh suggested by a shallow inverted pyramid.
  const tipY = 4.4;
  const tipZ = 9.4;
  const mouth = 3.0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({
        geo: bakedCyl(
          0.05,
          0.07,
          4.4,
          4,
          (sx * mouth) / 2,
          tipY - 1.4,
          tipZ + (sz * mouth) / 2,
          0,
          0
        ),
        mat: timber,
      });
    }
  }
  parts.push({
    geo: bakedCone(mouth * 0.78, 1.9, 4, 0, tipY - 3.5, tipZ, Math.PI, 0),
    mat: netMat,
  });
  // Hoist ropes from the arm down to the net corners.
  for (const sx of [-1, 1]) {
    parts.push({
      geo: bakedCyl(0.025, 0.025, 2.6, 4, (sx * mouth) / 2, tipY + 0.6, tipZ, 0, sx * 0.12),
      mat: rope,
    });
  }

  void rand;
  const g = mergeByMaterial(parts);
  g.name = "kochi-fishing-net";
  return g;
}

/* ------------------------------------------------------------------ *
 * Mumbai — Art Deco cinema. Stepped vertical fin, curved corner, neon-era
 * signboard. ~12m tall.
 * ------------------------------------------------------------------ */
export function makeArtDecoCinema(mats?: AssetMaterialLib, seed = 13): THREE.Group {
  const rand = mulberry32(seed);
  const cream = stdMat(0xf0e2c8, { roughness: 0.8 }, mats);
  const band = stdMat(0xd85a3c, { roughness: 0.7 }, mats);
  const teal = stdMat(0x2f8f8a, { roughness: 0.7 }, mats);
  const glassMat = stdMat(0x2b4a5a, { roughness: 0.14, metalness: 0.3 }, mats);
  const neon = stdMat(0xffd23f, { emissive: 0xffb703, emissiveIntensity: 1.4, roughness: 0.3 }, mats);

  const parts: Part[] = [];

  // Main block with the classic Deco curved corner.
  parts.push({ geo: bakedBox(9, 10, 6, 0, 5, 0), mat: cream });
  parts.push({ geo: bakedCyl(3.0, 3.0, 10, 16, -4.5, 5, 0), mat: cream });

  // Horizontal speed-stripes wrapping the corner.
  for (let i = 0; i < 3; i++) {
    const y = 6.4 + i * 0.85;
    parts.push({ geo: bakedBox(9.25, 0.26, 6.25, 0, y, 0), mat: i === 1 ? teal : band });
    parts.push({ geo: bakedCyl(3.14, 3.14, 0.26, 16, -4.5, y, 0), mat: i === 1 ? teal : band });
  }

  // Stepped central fin — the Deco signature.
  parts.push({ geo: bakedBox(1.6, 4.2, 1.0, 1.2, 11.4, 3.0), mat: cream });
  parts.push({ geo: bakedBox(1.15, 2.4, 0.85, 1.2, 14.0, 3.0), mat: cream });
  parts.push({ geo: bakedBox(0.75, 1.4, 0.7, 1.2, 15.6, 3.0), mat: band });
  parts.push({ geo: bakedCyl(0.05, 0.08, 1.2, 5, 1.2, 16.8, 3.0), mat: teal });

  // Marquee canopy over the entrance, with a lit sign band.
  parts.push({ geo: bakedBox(8.4, 0.5, 2.6, 0, 4.4, 4.2), mat: band });
  parts.push({ geo: bakedBox(8.0, 1.05, 0.24, 0, 5.35, 5.3), mat: neon });
  for (const s of [-1, 1]) {
    parts.push({ geo: bakedCyl(0.07, 0.07, 4.2, 6, s * 3.8, 2.1, 5.3), mat: teal });
  }

  // Ground-floor glazing and doors.
  parts.push({ geo: bakedBox(7.2, 3.4, 0.16, 0, 1.9, 3.05), mat: glassMat });
  parts.push({ geo: bakedBox(2.0, 2.9, 0.2, 0, 1.45, 3.16), mat: teal });

  // Upper windows in vertical Deco strips.
  for (let i = 0; i < 4; i++) {
    parts.push({ geo: bakedBox(0.9, 3.6, 0.14, -2.7 + i * 1.8, 8.2, 3.06), mat: glassMat });
  }

  void rand;
  const g = mergeByMaterial(parts);
  g.name = "mumbai-art-deco-cinema";
  return g;
}

/* ------------------------------------------------------------------ *
 * Ahmedabad — carved timber pol house. Deep bracketed balcony, close-set
 * turned columns, the ornate woodwork of the old walled city. ~10m tall.
 * ------------------------------------------------------------------ */
export function makePolHouse(mats?: AssetMaterialLib, seed = 14): THREE.Group {
  const rand = mulberry32(seed);
  const lime = stdMat(LIMEWASH, { roughness: 0.85 }, mats);
  const timber = stdMat(TEAK, { roughness: 0.86 }, mats);
  const dark = stdMat(TEAK_DK, { roughness: 0.9 }, mats);
  const ochre = stdMat(0xd9903f, { roughness: 0.8 }, mats);

  const parts: Part[] = [];

  // Narrow, tall plot — pol houses are deep and thin.
  parts.push({ geo: bakedBox(6.5, 9.5, 5.0, 0, 4.75, 0), mat: lime });
  parts.push({ geo: bakedBox(6.9, 0.4, 5.4, 0, 0.2, 0), mat: dark });

  // Ground floor otla (raised plinth seat) behind turned columns.
  parts.push({ geo: bakedBox(6.5, 0.55, 1.5, 0, 0.75, 3.0), mat: ochre });
  for (let i = 0; i < 4; i++) {
    const x = -2.4 + i * 1.6;
    // Turned column: three stacked drums reads as lathe-work from the street.
    parts.push({ geo: bakedCyl(0.16, 0.2, 1.5, 8, x, 1.75, 3.1), mat: timber });
    parts.push({ geo: bakedCyl(0.24, 0.24, 0.22, 8, x, 2.6, 3.1), mat: dark });
    parts.push({ geo: bakedCyl(0.2, 0.16, 0.9, 8, x, 3.2, 3.1), mat: timber });
    // Carved bracket capital.
    parts.push({ geo: bakedBox(0.62, 0.4, 0.34, x, 3.75, 3.1, 0, 0, 0), mat: dark });
  }

  // First-floor projecting balcony on heavy brackets.
  const balY = 4.1;
  parts.push({ geo: bakedBox(6.7, 0.32, 2.0, 0, balY, 3.3), mat: timber });
  for (let i = 0; i < 5; i++) {
    const x = -2.7 + i * 1.35;
    parts.push({ geo: bakedBox(0.2, 0.75, 0.6, x, balY - 0.5, 2.9, 0.55, 0, 0), mat: dark });
  }
  // Balustrade of close-set turned balusters — the pol house tell.
  parts.push({ geo: bakedBox(6.7, 0.16, 0.18, 0, balY + 1.1, 4.25), mat: dark });
  for (let i = 0; i < 20; i++) {
    parts.push({
      geo: bakedCyl(0.05, 0.06, 0.95, 6, -3.15 + i * 0.33, balY + 0.63, 4.25),
      mat: timber,
    });
  }

  // Carved timber screen behind the balcony.
  parts.push({ geo: bakedBox(5.4, 2.1, 0.14, 0, balY + 1.3, 2.5), mat: dark });
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 11; c++) {
      if ((r + c) % 2 === 0) continue;
      parts.push({
        geo: bakedBox(0.26, 0.26, 0.08, -2.5 + c * 0.5, balY + 0.6 + r * 0.48, 2.6),
        mat: ochre,
      });
    }
  }

  // Second floor: a row of arched timber windows under a deep eave.
  for (let i = 0; i < 3; i++) {
    const x = -1.9 + i * 1.9;
    parts.push({ geo: bakedBox(1.15, 1.7, 0.16, x, 7.1, 2.55), mat: dark });
    parts.push({ geo: bakedCyl(0.62, 0.62, 0.16, 10, x, 7.95, 2.55, Math.PI / 2, 0), mat: timber });
  }
  parts.push({ geo: bakedBox(7.4, 0.28, 1.5, 0, 9.1, 2.9, -0.1, 0, 0), mat: timber });
  for (const x of [-2.8, 0, 2.8]) {
    parts.push({ geo: bakedBox(0.18, 0.6, 0.5, x, 8.7, 2.7, 0.5, 0, 0), mat: dark });
  }
  parts.push({ geo: bakedBox(6.9, 0.55, 5.4, 0, 9.75, 0), mat: ochre });

  void rand;
  const g = mergeByMaterial(parts);
  g.name = "ahmedabad-pol-house";
  return g;
}

/* ------------------------------------------------------------------ *
 * Amritsar — gilded gurdwara pavilion. Square marble base, gold-clad upper
 * storey, ribbed dome, chhatris at the corners. ~11m tall.
 * ------------------------------------------------------------------ */
export function makeGurdwara(mats?: AssetMaterialLib, seed = 15): THREE.Group {
  const rand = mulberry32(seed);
  const marble = stdMat(MARBLE, { roughness: 0.5 }, mats);
  // Low metalness on purpose. There is no environment map in this scene, and a
  // high-metalness surface with nothing to reflect renders near-black — which
  // is exactly what a gilded dome must not do. The gold reads as gold here
  // through a bright base colour and a faint emissive lift instead.
  const gold = stdMat(
    GOLD_BRIGHT,
    { roughness: 0.35, metalness: 0.15, emissive: 0x6b4a06, emissiveIntensity: 0.35 },
    mats
  );
  const goldDk = stdMat(
    GOLD,
    { roughness: 0.45, metalness: 0.12, emissive: 0x4a3204, emissiveIntensity: 0.25 },
    mats
  );
  const inlay = stdMat(0x2f6b58, { roughness: 0.6 }, mats);

  const parts: Part[] = [];

  // Marble podium.
  parts.push({ geo: bakedBox(11, 0.7, 11, 0, 0.35, 0), mat: marble });
  parts.push({ geo: bakedBox(10, 0.4, 10, 0, 0.85, 0), mat: marble });

  // Lower storey, arcaded on all four sides.
  parts.push({ geo: bakedBox(8.4, 4.2, 8.4, 0, 3.15, 0), mat: marble });
  for (const rot of [0, Math.PI / 2]) {
    for (let i = 0; i < 3; i++) {
      const x = -2.6 + i * 2.6;
      const col = bakedCyl(0.19, 0.22, 3.0, 8, x, 1.9, 4.25);
      col.rotateY(rot);
      parts.push({ geo: col, mat: gold });
      // Cusped arch head between the columns.
      const arch = bakedCyl(0.95, 0.95, 0.3, 12, x, 3.6, 4.25, Math.PI / 2, 0);
      arch.rotateY(rot);
      parts.push({ geo: arch, mat: goldDk });
    }
  }
  parts.push({ geo: bakedBox(9.2, 0.45, 9.2, 0, 5.4, 0), mat: gold });

  // Upper storey, fully gilded.
  parts.push({ geo: bakedBox(6.0, 3.0, 6.0, 0, 7.1, 0), mat: gold });
  for (const rot of [0, Math.PI / 2]) {
    const panel = bakedBox(4.4, 1.9, 0.14, 0, 7.1, 3.05);
    panel.rotateY(rot);
    parts.push({ geo: panel, mat: inlay });
  }
  parts.push({ geo: bakedBox(6.6, 0.4, 6.6, 0, 8.75, 0), mat: goldDk });

  // Ribbed onion dome.
  const domeY = 9.1;
  parts.push({ geo: bakedCyl(1.9, 2.3, 0.7, 14, 0, domeY + 0.35, 0), mat: goldDk });
  parts.push({
    geo: bakedSphere(2.15, 0, domeY + 1.1, 0, { wSeg: 16, hSeg: 10, sy: 1.35, thetaLength: Math.PI * 0.62 }),
    mat: gold,
  });
  // Ribs, so the dome is not a bare sphere.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push({
      geo: bakedTorus(1.05, 0.055, Math.cos(a) * 1.05, domeY + 1.5, Math.sin(a) * 1.05, Math.PI / 2),
      mat: goldDk,
    });
  }
  // Lotus finial.
  parts.push({ geo: bakedSphere(0.42, 0, domeY + 3.0, 0, { wSeg: 10, hSeg: 6, sy: 0.7 }), mat: goldDk });
  parts.push({ geo: bakedCyl(0.045, 0.09, 1.3, 6, 0, domeY + 3.7, 0), mat: gold });

  // Corner chhatris.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * 3.5;
      const cz = sz * 3.5;
      pillarRing(parts, gold, cx, cz, 0.5, 5.65, 1.3, 4);
      parts.push({ geo: bakedBox(1.5, 0.16, 1.5, cx, 7.03, cz), mat: goldDk });
      parts.push({
        geo: bakedSphere(0.68, cx, 7.25, cz, { wSeg: 10, hSeg: 7, sy: 1.2, thetaLength: Math.PI * 0.6 }),
        mat: gold,
      });
      parts.push({ geo: bakedCyl(0.03, 0.05, 0.55, 5, cx, 8.1, cz), mat: goldDk });
    }
  }

  void rand;
  const g = mergeByMaterial(parts);
  g.name = "amritsar-gurdwara";
  return g;
}

/* ------------------------------------------------------------------ *
 * Bhubaneswar — Kalinga deul. The curvilinear beehive spire (rekha deul)
 * with its ribbed vertical bands, amalaka disc and kalasha. ~14m tall.
 * ------------------------------------------------------------------ */
export function makeKalingaDeul(mats?: AssetMaterialLib, seed = 16): THREE.Group {
  const rand = mulberry32(seed);
  const stone = stdMat(LATERITE, { roughness: 0.92 }, mats);
  const stoneDk = stdMat(0x8f4d1a, { roughness: 0.93 }, mats);
  const light = stdMat(SANDSTONE, { roughness: 0.88 }, mats);

  const parts: Part[] = [];

  // Jagamohana — the squat pyramidal assembly hall behind the tower. Kept low
  // so it frames the spire instead of competing with it.
  parts.push({ geo: bakedBox(5.4, 2.4, 5.4, 0, 1.2, 6.4), mat: stone });
  for (let i = 0; i < 5; i++) {
    const s = 5.0 - i * 0.85;
    parts.push({ geo: bakedBox(s, 0.5, s, 0, 2.6 + i * 0.48, 6.4), mat: i % 2 ? light : stone });
  }
  parts.push({ geo: bakedSphere(0.7, 0, 5.3, 6.4, { wSeg: 12, hSeg: 4, sy: 0.42 }), mat: stoneDk });

  // Deul base. Deliberately short: a rekha deul is nearly all spire, and a
  // tall plinth turns the whole thing into a box with a lump on top.
  parts.push({ geo: bakedBox(6.0, 0.7, 6.0, 0, 0.35, 0), mat: stoneDk });
  parts.push({ geo: bakedBox(5.3, 2.3, 5.3, 0, 1.85, 0), mat: stone });
  // Mouldings round the plinth.
  for (const y of [1.1, 1.9, 2.9]) {
    parts.push({ geo: bakedBox(5.6, 0.26, 5.6, 0, y, 0), mat: light });
  }

  // The curvilinear spire: stacked squares whose half-width follows a
  // convex-then-inflecting curve, which is what gives a rekha deul its
  // distinctive beehive profile rather than a straight pyramid.
  const steps = 20;
  const spireBase = 3.1;
  const spireH = 10.5;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    // Slow taper low down, sharp pull-in near the top.
    const w = 5.2 * (1 - Math.pow(t, 2.35) * 0.88);
    const y = spireBase + t * spireH;
    const h = spireH / steps + 0.12;
    parts.push({ geo: bakedBox(w, h, w, 0, y, 0), mat: i % 2 ? stone : stoneDk });
    // Vertical pagas (projecting bands) on each face.
    if (i % 2 === 0) {
      for (const rot of [0, Math.PI / 2]) {
        const paga = bakedBox(w * 0.3, h, w * 0.55, 0, y, w * 0.42);
        paga.rotateY(rot);
        parts.push({ geo: paga, mat: light });
      }
    }
  }

  // Beki (neck), amalaka (ribbed disc), kalasha (pot finial).
  const topY = spireBase + spireH;
  parts.push({ geo: bakedCyl(1.1, 1.25, 0.5, 12, 0, topY + 0.25, 0), mat: stoneDk });
  parts.push({
    geo: bakedSphere(1.55, 0, topY + 0.95, 0, { wSeg: 16, hSeg: 8, sy: 0.44 }),
    mat: light,
  });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    parts.push({
      geo: bakedBox(0.16, 0.6, 0.34, Math.cos(a) * 1.42, topY + 0.95, Math.sin(a) * 1.42, 0, -a, 0),
      mat: stoneDk,
    });
  }
  parts.push({ geo: bakedCyl(0.42, 0.22, 0.5, 10, 0, topY + 1.5, 0), mat: stone });
  parts.push({ geo: bakedSphere(0.46, 0, topY + 2.0, 0, { wSeg: 10, hSeg: 7 }), mat: light });
  parts.push({ geo: bakedCone(0.2, 0.7, 8, 0, topY + 2.6, 0), mat: stoneDk });

  void rand;
  const g = mergeByMaterial(parts);
  g.name = "bhubaneswar-kalinga-deul";
  return g;
}
