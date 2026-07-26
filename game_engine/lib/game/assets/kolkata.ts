/**
 * Kolkata / Park Gully kit.
 *
 * Signature reads: a rounded 1950s yellow Ambassador (bulbous, unmistakably
 * not the boxy auto), a tram with a roof pantograph reaching for an overhead
 * wire, a colonial facade with columns and louvred shutters, and a lashed
 * bamboo Durga Puja pandal frame.
 */

import * as THREE from "three";
import {
  bakedBox,
  bakedCyl,
  bakedSphere,
  mergeByMaterial,
  mulberry32,
  stdMat,
  type AssetMaterialLib,
  type Part,
} from "./shared";

/* ------------------------------------------------------------------ *
 * Vehicle: yellow Ambassador taxi — rounded body, domed roof, bulging
 * fenders, round headlamps. Deliberately bulbous next to the boxy auto.
 * ------------------------------------------------------------------ */
export function makeAmbassadorTaxi(mats?: AssetMaterialLib, seed = 30): THREE.Group {
  const rand = mulberry32(seed);
  const yellow = stdMat(0xe8b825, { roughness: 0.45, metalness: 0.25 }, mats);
  const black = stdMat(0x141414, { roughness: 0.5, metalness: 0.2 }, mats);
  const chrome = stdMat(0xd8dce0, { roughness: 0.2, metalness: 0.9 }, mats);
  const glass = stdMat(0x394855, { roughness: 0.2, metalness: 0.4, transparent: true, opacity: 0.75 }, mats);

  const bodyParts: Part[] = [];
  const trimParts: Part[] = [];
  const wheelParts: Part[] = [];
  const glassParts: Part[] = [];

  // Main body: a rounded lower shell built from a stretched sphere rather
  // than a box, so the fenders bulge instead of reading as a crate.
  bodyParts.push({ geo: bakedSphere(1.0, 0, 0.72, 0, { wSeg: 14, hSeg: 10, sx: 2.15, sy: 0.62, sz: 1.0 }), mat: yellow });
  // Domed cabin roof, set back towards the rear.
  bodyParts.push({
    geo: bakedSphere(0.78, 0, 1.18, -0.15, { wSeg: 14, hSeg: 8, thetaLength: Math.PI * 0.58, sx: 1.35, sy: 0.9, sz: 1.0 }),
    mat: black,
  });
  // Rounded front and rear fender bulges.
  for (const z of [1.55, -1.6]) {
    bodyParts.push({ geo: bakedSphere(0.42, 0, 0.5, z, { wSeg: 10, hSeg: 8, sx: 1.1, sy: 0.85, sz: 0.7 }), mat: yellow });
  }
  // Running board strip along the base — a period-correct chrome accent.
  trimParts.push({ geo: bakedBox(1.95, 0.08, 3.3, 0, 0.42, 0), mat: chrome });
  trimParts.push({ geo: bakedBox(2.02, 0.05, 0.15, 0, 0.72, 1.68), mat: chrome }); // front bumper
  trimParts.push({ geo: bakedBox(2.02, 0.05, 0.15, 0, 0.72, -1.68), mat: chrome }); // rear bumper

  // Round headlamps, prominent and separate from the body — the classic
  // Ambassador face.
  for (const x of [-0.62, 0.62]) {
    trimParts.push({ geo: bakedCyl(0.13, 0.13, 0.1, 12, x, 0.78, 1.68, Math.PI / 2), mat: chrome });
  }
  // Split windscreen + side glass band.
  glassParts.push({ geo: bakedBox(1.1, 0.5, 0.06, 0, 1.05, 0.78, 0.15), mat: glass });
  glassParts.push({ geo: bakedBox(0.06, 0.42, 1.5, 0.68, 1.05, -0.2), mat: glass });
  glassParts.push({ geo: bakedBox(0.06, 0.42, 1.5, -0.68, 1.05, -0.2), mat: glass });

  // Black roof-mounted taxi light box.
  trimParts.push({ geo: bakedBox(0.3, 0.14, 0.16, 0, 1.66, -0.15), mat: black });

  // Wheels with a chrome hubcap.
  for (const [x, z] of [
    [-0.85, 1.05],
    [0.85, 1.05],
    [-0.85, -1.1],
    [0.85, -1.1],
  ]) {
    wheelParts.push({ geo: bakedCyl(0.36, 0.36, 0.24, 14, x, 0.38, z, 0, Math.PI / 2), mat: black });
    trimParts.push({ geo: bakedCyl(0.16, 0.16, 0.26, 10, x, 0.38, z, 0, Math.PI / 2), mat: chrome });
  }

  void rand;
  const g = new THREE.Group();
  g.add(mergeByMaterial(bodyParts), mergeByMaterial(trimParts), mergeByMaterial(wheelParts), mergeByMaterial(glassParts));
  g.name = "kolkata-ambassador-taxi";
  return g;
}

/* ------------------------------------------------------------------ *
 * Vehicle: tram with a folding roof pantograph reaching an overhead wire.
 * ------------------------------------------------------------------ */
export function makeTramWithPantograph(mats?: AssetMaterialLib, seed = 31): THREE.Group {
  const rand = mulberry32(seed);
  const body = stdMat(0xc9a227, { roughness: 0.7 }, mats);
  const trim = stdMat(0x2b3a44, { roughness: 0.6 }, mats);
  const wheelMat = stdMat(0x141414, { roughness: 0.7 }, mats);
  const pantoMat = stdMat(0x3a3f45, { roughness: 0.4, metalness: 0.7 }, mats);
  const wireMat = stdMat(0x1a1a1a, { roughness: 0.5, metalness: 0.6 }, mats);

  const bodyParts: Part[] = [];
  const trimParts: Part[] = [];
  const wheelParts: Part[] = [];
  const pantoParts: Part[] = [];

  bodyParts.push({ geo: bakedBox(2.6, 2.6, 9, 0, 1.9, 0), mat: body });
  trimParts.push({ geo: bakedBox(2.8, 0.2, 9.2, 0, 3.3, 0), mat: trim }); // roof
  for (const x of [-1.32, 1.32]) {
    trimParts.push({ geo: bakedBox(0.06, 0.9, 7.6, x, 2.4, 0), mat: trim }); // window band
  }
  trimParts.push({ geo: bakedBox(2.7, 0.15, 9.1, 0, 0.65, 0), mat: trim }); // skirt

  for (const [x, z] of [
    [-1.1, 3],
    [1.1, 3],
    [-1.1, -3],
    [1.1, -3],
  ]) {
    wheelParts.push({ geo: bakedCyl(0.42, 0.42, 0.22, 10, x, 0.42, z, 0, Math.PI / 2), mat: wheelMat });
  }

  // Pantograph: a folding diamond frame on the roof reaching up to a
  // horizontal contact strip, plus the overhead catenary wire it touches.
  const baseY = 3.4;
  for (const side of [-1, 1]) {
    pantoParts.push({ geo: bakedCyl(0.03, 0.03, 1.1, 6, side * 0.35, baseY + 0.55, -0.3, 0, 0.55 * side * -1), mat: pantoMat });
    pantoParts.push({ geo: bakedCyl(0.03, 0.03, 1.1, 6, side * 0.35, baseY + 0.55, 0.3, 0, 0.55 * side * -1), mat: pantoMat });
  }
  pantoParts.push({ geo: bakedBox(0.8, 0.05, 0.7, 0, baseY + 1.35, 0), mat: pantoMat }); // base frame
  pantoParts.push({ geo: bakedBox(1.0, 0.04, 0.1, 0, baseY + 1.9, 0), mat: pantoMat }); // contact strip
  pantoParts.push({ geo: bakedCyl(0.02, 0.02, 4.5, 5, -2.0, baseY + 1.92, 0, 0, Math.PI / 2), mat: wireMat }); // overhead wire segment
  pantoParts.push({ geo: bakedCyl(0.015, 0.015, 4.5, 5, 2.5, baseY + 1.92, 0, 0, Math.PI / 2), mat: wireMat });

  void rand;
  const g = new THREE.Group();
  g.add(mergeByMaterial(bodyParts), mergeByMaterial(trimParts), mergeByMaterial(wheelParts), mergeByMaterial(pantoParts));
  g.name = "kolkata-tram";
  return g;
}

/* ------------------------------------------------------------------ *
 * Hero: colonial facade — columns, pediment, louvred shutters, iron
 * balcony. ~9m tall streetfront slice.
 * ------------------------------------------------------------------ */
export function makeColonialFacade(mats?: AssetMaterialLib, seed = 32): THREE.Group {
  const rand = mulberry32(seed);
  const wall = stdMat(0xb5544a, { roughness: 0.85 }, mats);
  const trim = stdMat(0xf0e6d2, { roughness: 0.7 }, mats);
  const shutter = stdMat(0x2c5e4a, { roughness: 0.75 }, mats);
  const iron = stdMat(0x2a2a2a, { roughness: 0.55, metalness: 0.4 }, mats);

  const wallParts: Part[] = [];
  const trimParts: Part[] = [];
  const shutterParts: Part[] = [];
  const ironParts: Part[] = [];

  wallParts.push({ geo: bakedBox(7, 8.2, 3.4, 0, 4.1, 0), mat: wall });
  trimParts.push({ geo: bakedBox(7.3, 0.3, 3.7, 0, 8.3, 0), mat: trim }); // cornice
  trimParts.push({ geo: bakedBox(7.5, 0.6, 1.4, 0, 8.9, 1.0, 0.1), mat: trim }); // pediment slope
  trimParts.push({ geo: bakedBox(7.5, 0.2, 0.2, 0, 9.15, 1.6), mat: trim }); // pediment ridge

  // Fluted-ish columns: a shaft plus base and capital rings, four across
  // the ground floor.
  for (const x of [-2.6, -0.9, 0.9, 2.6]) {
    wallParts.push({ geo: bakedCyl(0.28, 0.32, 5.6, 10, x, 2.8, 1.75), mat: trim });
    trimParts.push({ geo: bakedCyl(0.4, 0.4, 0.25, 10, x, 0.15, 1.75), mat: trim }); // base
    trimParts.push({ geo: bakedCyl(0.36, 0.28, 0.3, 10, x, 5.65, 1.75), mat: trim }); // capital
  }
  trimParts.push({ geo: bakedBox(7.2, 0.3, 1.9, 0, 5.85, 1.7), mat: trim }); // entablature over the colonnade

  // Louvred shutters at three upper-floor windows, slats reading as ribs.
  for (const x of [-2.2, 0, 2.2]) {
    wallParts.push({ geo: bakedBox(1.1, 1.7, 0.12, x, 7.0, 1.75), mat: shutter });
    for (let i = 0; i < 7; i++) {
      shutterParts.push({ geo: bakedBox(1.02, 0.15, 0.03, x, 6.3 + i * 0.22, 1.82), mat: trim });
    }
    trimParts.push({ geo: bakedBox(1.3, 0.15, 0.2, x, 7.9, 1.78), mat: trim }); // lintel
  }

  // Iron-railed balcony spanning the first floor.
  trimParts.push({ geo: bakedBox(6.2, 0.15, 0.7, 0, 5.15, 2.1), mat: trim });
  for (const x of [-2.9, -1.5, -0.1, 1.3, 2.7]) {
    ironParts.push({ geo: bakedBox(0.05, 0.7, 0.05, x, 5.55, 2.42), mat: iron });
  }
  ironParts.push({ geo: bakedBox(6.2, 0.05, 0.05, 0, 5.9, 2.42), mat: iron });
  for (const x of [-2.9, 2.9]) {
    ironParts.push({ geo: bakedBox(0.06, 0.9, 0.06, x, 5.15, 2.42) , mat: iron });
    ironParts.push({ geo: bakedCyl(0.06, 0.06, 0.9, 8, x, 5.15, 2.42), mat: iron });
  }
  for (const [cx, cz] of [
    [-2.9, 1.75],
    [2.9, 1.75],
  ]) {
    ironParts.push({ geo: bakedCyl(0.05, 0.05, 0.9, 8, cx, 5.15, cz), mat: iron });
  }

  void rand;
  const g = new THREE.Group();
  g.add(mergeByMaterial(wallParts), mergeByMaterial(trimParts), mergeByMaterial(shutterParts), mergeByMaterial(ironParts));
  g.name = "kolkata-colonial-facade";
  return g;
}

/* ------------------------------------------------------------------ *
 * Hero: Durga Puja pandal frame — lashed bamboo scaffold with a fabric
 * canopy and a decorative crown. ~11m tall.
 * ------------------------------------------------------------------ */
export function makePandalFrame(mats?: AssetMaterialLib, seed = 33): THREE.Group {
  const rand = mulberry32(seed);
  const bamboo = stdMat(0xc9b06a, { roughness: 0.8 }, mats);
  const rope = stdMat(0x4a3a24, { roughness: 0.9 }, mats);
  const fabricA = stdMat(0xc0392b, { roughness: 0.85 }, mats);
  const fabricB = stdMat(0xf1c40f, { roughness: 0.85 }, mats);

  const bambooParts: Part[] = [];
  const ropeParts: Part[] = [];
  const fabricParts: Part[] = [];

  const h = 9.5;
  const w = 6.5;
  const d = 5.5;

  // Four raked corner bamboo posts (real pandals lean their corner poles
  // slightly inward for stability, which is what sells the "lashed", not
  // "built", read).
  const corners: [number, number][] = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [w / 2, d / 2],
  ];
  for (const [cx, cz] of corners) {
    const lean = 0.05 * Math.sign(cx || 1);
    bambooParts.push({ geo: bakedCyl(0.07, 0.09, h, 6, cx * 0.9, h / 2, cz * 0.9, lean), mat: bamboo });
    // Doubled bamboo lashed alongside for the "bundled pole" look.
    bambooParts.push({ geo: bakedCyl(0.05, 0.06, h * 0.85, 6, cx * 0.9 + 0.14, h * 0.42, cz * 0.9, lean), mat: bamboo });
  }

  // Horizontal lashed cross-members at three heights, forming the scaffold
  // grid the fabric drapes over.
  for (const y of [2.4, 5.0, 7.6]) {
    bambooParts.push({ geo: bakedBox(w + 0.3, 0.08, 0.08, 0, y, -d / 2), mat: bamboo });
    bambooParts.push({ geo: bakedBox(w + 0.3, 0.08, 0.08, 0, y, d / 2), mat: bamboo });
    bambooParts.push({ geo: bakedBox(0.08, 0.08, d + 0.3, -w / 2, y, 0), mat: bamboo });
    bambooParts.push({ geo: bakedBox(0.08, 0.08, d + 0.3, w / 2, y, 0), mat: bamboo });
    for (const [cx, cz] of corners) {
      ropeParts.push({ geo: bakedCyl(0.09, 0.09, 0.18, 8, cx * 0.9, y, cz * 0.9), mat: rope });
    }
  }

  // Diagonal cross-bracing on the front face for real structural read.
  bambooParts.push({
    geo: bakedBox(Math.hypot(w, 5), 0.06, 0.06, 0, 5, -d / 2, 0, 0, Math.atan2(5, w)),
    mat: bamboo,
  });
  bambooParts.push({
    geo: bakedBox(Math.hypot(w, 5), 0.06, 0.06, 0, 5, -d / 2, 0, 0, -Math.atan2(5, w)),
    mat: bamboo,
  });

  // Draped fabric canopy panels between the top members, alternating colour
  // — the festive skin over the bamboo skeleton.
  fabricParts.push({ geo: bakedBox(w + 0.2, 3.2, 0.05, 0, 6.2, -d / 2 - 0.05), mat: fabricA });
  fabricParts.push({ geo: bakedBox(w + 0.2, 3.2, 0.05, 0, 6.2, d / 2 + 0.05), mat: fabricB });
  fabricParts.push({ geo: bakedBox(0.05, 3.2, d + 0.2, -w / 2 - 0.05, 6.2, 0), mat: fabricB });
  fabricParts.push({ geo: bakedBox(0.05, 3.2, d + 0.2, w / 2 + 0.05, 6.2, 0), mat: fabricA });

  // Decorative bamboo crown / finial cluster on top, tapering to a point —
  // the ornamental spire every pandal gate has.
  bambooParts.push({ geo: bakedCyl(0.03, 0.12, 2.2, 6, 0, h + 1.1, 0), mat: bamboo });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    bambooParts.push({
      geo: bakedCyl(0.02, 0.05, 1.4, 5, Math.cos(a) * 0.5, h + 0.6, Math.sin(a) * 0.5, 0.3),
      mat: bamboo,
    });
  }
  fabricParts.push({ geo: bakedBox(1.6, 0.5, 1.6, 0, h + 0.2, 0), mat: fabricA });

  void rand;
  const g = new THREE.Group();
  g.add(mergeByMaterial(bambooParts), mergeByMaterial(ropeParts), mergeByMaterial(fabricParts));
  g.name = "kolkata-pandal-frame";
  return g;
}

/* ------------------------------------------------------------------ *
 * Street prop: hand-pulled rickshaw — two big wheels, bench, folding hood,
 * long pulling shafts. No pedals, no engine: distinct from both the
 * cycle-rickshaw and the auto.
 * ------------------------------------------------------------------ */
export function makeHandRickshaw(mats?: AssetMaterialLib, seed = 34): THREE.Group {
  const rand = mulberry32(seed);
  const wood = stdMat(0x5c3a21, { roughness: 0.85 }, mats);
  const black = stdMat(0x171717, { roughness: 0.7 }, mats);
  const canopyMat = stdMat(0x1f4a3a, { roughness: 0.85 }, mats);
  const brass = stdMat(0xb8963f, { roughness: 0.4, metalness: 0.7 }, mats);

  const bodyParts: Part[] = [];
  const wheelParts: Part[] = [];
  const canopyParts: Part[] = [];

  bodyParts.push({ geo: bakedBox(1.0, 0.5, 0.85, 0, 0.85, -0.1), mat: wood }); // bench box
  bodyParts.push({ geo: bakedBox(1.0, 0.6, 0.1, 0, 1.2, -0.5), mat: wood }); // backrest

  // Two large spoked wheels either side.
  for (const x of [-0.62, 0.62]) {
    wheelParts.push({ geo: bakedCyl(0.5, 0.5, 0.08, 16, x, 0.5, -0.1, 0, Math.PI / 2), mat: black });
    for (let s = 0; s < 6; s++) {
      wheelParts.push({ geo: bakedCyl(0.02, 0.02, 0.94, 4, x, 0.5, -0.1, (Math.PI / 3) * s), mat: brass });
    }
    bodyParts.push({ geo: bakedCyl(0.05, 0.05, 0.14, 8, x, 0.5, -0.1, 0, Math.PI / 2), mat: brass }); // hub cap
  }

  // Long pulling shafts extending forward, with a crossbar handle — this is
  // the unmistakable "hand-pulled" tell.
  for (const x of [-0.35, 0.35]) {
    bodyParts.push({ geo: bakedBox(0.06, 0.06, 2.4, x, 0.62, 1.35), mat: wood });
  }
  bodyParts.push({ geo: bakedBox(0.9, 0.05, 0.05, 0, 0.62, 2.5), mat: wood }); // handle crossbar
  bodyParts.push({ geo: bakedCyl(0.08, 0.08, 0.5, 6, -0.9, 0.72, -0.4, Math.PI / 2), mat: wood }); // kickstand leg
  bodyParts.push({ geo: bakedCyl(0.08, 0.08, 0.5, 6, 0.9, 0.72, -0.4, Math.PI / 2), mat: wood });

  // Folding fabric hood over the bench.
  for (const [x, z] of [
    [-0.5, -0.5],
    [0.5, -0.5],
  ]) {
    canopyParts.push({ geo: bakedCyl(0.02, 0.02, 0.9, 6, x, 1.5, z, -0.6), mat: black });
  }
  canopyParts.push({ geo: bakedBox(1.05, 0.05, 0.9, 0, 1.9, -0.85, 0.35), mat: canopyMat });

  void rand;
  const g = new THREE.Group();
  g.add(mergeByMaterial(bodyParts), mergeByMaterial(wheelParts), mergeByMaterial(canopyParts));
  g.name = "kolkata-hand-rickshaw";
  return g;
}
