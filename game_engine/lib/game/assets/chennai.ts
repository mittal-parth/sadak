/**
 * Chennai / Marina Nagar kit.
 *
 * Signature reads: a tiered, tapering gopuram tower (the whole point of this
 * city — must be unmistakable in silhouette alone), a kattumaram catamaran
 * with a lashed-log hull and a genuine outrigger, a coconut palm with real
 * radiating fronds instead of a green blob, and a filter-coffee tiffin cart.
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
  jitter,
  stdMat,
  type AssetMaterialLib,
  type Part,
} from "./shared";

/* ------------------------------------------------------------------ *
 * Hero: temple gopuram — 7 stepped, tapering tiers, figure blocks on each
 * cornice, a barrel-vaulted shikhara cap with a row of kalasha finials.
 * ~15m tall.
 * ------------------------------------------------------------------ */
export function makeGopuram(mats?: AssetMaterialLib, seed = 10): THREE.Group {
  const rand = mulberry32(seed);
  const palette = [0xd9683a, 0xe8b34a, 0x3d7a72, 0xc0392b, 0xe8d6a0];
  const bodyMats = palette.map((c) => stdMat(c, { roughness: 0.82 }, mats));
  const trim = stdMat(0xf2ead2, { roughness: 0.7 }, mats);
  const figureMat = stdMat(0x9c3b2e, { roughness: 0.75 }, mats);
  const gold = stdMat(0xd4af37, { roughness: 0.4, metalness: 0.6 }, mats);

  const byMatParts = new Map<THREE.Material, Part[]>();
  const push = (mat: THREE.Material, geo: THREE.BufferGeometry) => {
    const list = byMatParts.get(mat) ?? [];
    list.push({ geo, mat });
    byMatParts.set(mat, list);
  };

  const tiers = 7;
  let y = 0;
  let w = 6.2;
  let d = 4.6;
  for (let t = 0; t < tiers; t++) {
    const h = t === 0 ? 3.2 : 1.55 - t * 0.06;
    const mat = bodyMats[t % bodyMats.length];
    push(mat, bakedBox(w, h, d, 0, y + h / 2, 0));
    // Cornice ledge, slightly wider than the tier, catches light and marks
    // the step to the next level.
    push(trim, bakedBox(w + 0.35, 0.2, d + 0.35, 0, y + h + 0.1, 0));

    // Small figure blocks along the front and two side edges of the ledge —
    // the deity/guardian statues that read as texture from a distance and
    // as figures up close.
    const nFig = Math.max(3, Math.round(w / 1.1));
    for (let i = 0; i < nFig; i++) {
      const fx = -w / 2 + 0.6 + (i * (w - 1.2)) / Math.max(1, nFig - 1);
      push(figureMat, bakedBox(0.34, 0.55, 0.3, fx, y + h + 0.4, d / 2 + 0.12));
      push(figureMat, bakedSphere(0.16, fx, y + h + 0.72, d / 2 + 0.12, { wSeg: 6, hSeg: 5 }));
    }

    y += h + 0.2;
    w *= 0.82;
    d *= 0.82;
  }

  // Shikhara cap: a short barrel-like vault (flattened wide cone) plus a
  // ridge of kalasha finials (pot-on-spike shapes).
  push(bodyMats[0], bakedCone(w * 0.75, 1.6, 12, 0, y + 0.8, 0, 0, 0, 1.15, 0.75));
  const finials = 5;
  for (let i = 0; i < finials; i++) {
    const fx = -w * 0.55 + (i * (w * 1.1)) / (finials - 1);
    push(gold, bakedSphere(0.22, fx, y + 1.75, 0, { wSeg: 8, hSeg: 6 }));
    push(gold, bakedCone(0.09, 0.5, 6, fx, y + 2.15, 0));
  }
  push(gold, bakedSphere(0.3, 0, y + 2.3, 0, { wSeg: 8, hSeg: 6 }));
  push(gold, bakedCone(0.12, 0.7, 6, 0, y + 2.85, 0));

  void rand;
  const groups: THREE.Group[] = [];
  for (const [, list] of byMatParts) groups.push(mergeByMaterial(list));
  const g = new THREE.Group();
  groups.forEach((gr) => g.add(gr));
  g.name = "chennai-gopuram";
  return g;
}

/* ------------------------------------------------------------------ *
 * Vehicle-ish landmark: kattumaram catamaran with a lashed-log hull and a
 * true outrigger arm + float, beached on the shore road.
 * ------------------------------------------------------------------ */
export function makeCatamaran(mats?: AssetMaterialLib, seed = 11): THREE.Group {
  const rand = mulberry32(seed);
  const wood = stdMat(0x8a6a45, { roughness: 0.85 }, mats);
  const woodDk = stdMat(0x5c4630, { roughness: 0.85 }, mats);
  const rope = stdMat(0x3a2f22, { roughness: 0.95 }, mats);
  const sail = stdMat(0xe8dfc8, { roughness: 0.9, side: THREE.DoubleSide }, mats);

  const woodParts: Part[] = [];
  const ropeParts: Part[] = [];
  const sailParts: Part[] = [];

  // Hull: 5 lashed tapered logs, the middle ones longer, tips lifted at the
  // bow — the real kattumaram silhouette (not a single carved boat body).
  const logCount = 5;
  for (let i = 0; i < logCount; i++) {
    const z = -1.0 + i * 0.5;
    const len = 5.6 - Math.abs(i - 2) * 0.9;
    woodParts.push({
      geo: bakedCyl(0.14, 0.19, len, 8, 0, 0.32, z + len * 0.06, Math.PI / 2 - 0.12),
      mat: i % 2 === 0 ? wood : woodDk,
    });
  }
  // Cross lashing bars binding the logs, plus rope coil ties.
  for (const x of [-1.6, -0.3, 1.0]) {
    ropeParts.push({ geo: bakedBox(0.12, 0.1, 2.4, x, 0.42, 0), mat: rope });
  }
  for (let i = 0; i < 4; i++) {
    ropeParts.push({ geo: bakedTorus(0.22, 0.035, -1.4 + i * 0.9, 0.5, 0.3) , mat: rope });
  }

  // Outrigger: two poles reaching out to one side to a slim parallel float.
  for (const dz of [-0.8, 0.8]) {
    woodParts.push({ geo: bakedCyl(0.05, 0.05, 2.6, 6, 1.3, 0.4, dz, 0, Math.PI / 2 - 0.35), mat: woodDk });
  }
  woodParts.push({ geo: bakedCyl(0.1, 0.12, 2.6, 8, 2.5, 0.3, 0, Math.PI / 2), mat: wood });

  // Mast + a furled sail bundle lashed to it (boats are beached, sail down).
  woodParts.push({ geo: bakedCyl(0.06, 0.08, 3.6, 6, -0.4, 2.1, 0), mat: woodDk });
  sailParts.push({ geo: bakedCyl(0.22, 0.22, 2.2, 8, -0.4, 2.0, 0), mat: sail });
  ropeParts.push({ geo: bakedTorus(0.24, 0.03, -0.4, 2.8, 0), mat: rope });
  ropeParts.push({ geo: bakedTorus(0.24, 0.03, -0.4, 1.2, 0), mat: rope });

  // A fishing basket and paddle for readability up close.
  woodParts.push({ geo: bakedCyl(0.3, 0.36, 0.4, 8, -1.6, 0.55, 0.3), mat: woodDk });
  woodParts.push({ geo: bakedBox(0.14, 0.02, 0.9, 1.9, 0.5, -1.0, 0, 0, 0.25), mat: woodDk });

  void rand;
  const g = new THREE.Group();
  g.add(mergeByMaterial(woodParts), mergeByMaterial(ropeParts), mergeByMaterial(sailParts));
  g.name = "chennai-catamaran";
  return g;
}

/* ------------------------------------------------------------------ *
 * Hero: coconut palm — segmented curved trunk, radiating drooping fronds,
 * a cluster of coconuts. NOT a green sphere. ~11m tall.
 * ------------------------------------------------------------------ */
export function makeCoconutPalm(mats?: AssetMaterialLib, seed = 12): THREE.Group {
  const rand = mulberry32(seed);
  const bark = stdMat(0x8a7355, { roughness: 0.9 }, mats);
  const frondMat = stdMat(0x3d7a42, { roughness: 0.75 }, mats);
  const nutMat = stdMat(0x6b4a2a, { roughness: 0.8 }, mats);

  const barkParts: Part[] = [];
  const frondParts: Part[] = [];
  const nutParts: Part[] = [];

  // Trunk: 8 stacked tapered segments with a gentle accumulating lean, plus
  // ring nodes where fronds fell — a real palm silhouette.
  const segs = 8;
  let x = 0;
  let y = 0;
  let lean = (rand() - 0.5) * 0.08;
  for (let i = 0; i < segs; i++) {
    const segLen = 1.05 - i * 0.02;
    const rTop = 0.26 - i * 0.02;
    const rBot = 0.3 - i * 0.02;
    lean += (rand() - 0.5) * 0.03;
    barkParts.push({
      geo: bakedCyl(rTop, rBot, segLen, 7, x, y + segLen / 2, 0, lean),
      mat: bark,
    });
    barkParts.push({ geo: bakedTorus(rBot + 0.02, 0.025, x, y + 0.02, 0), mat: bark });
    x += Math.sin(lean) * segLen;
    y += Math.cos(lean) * segLen;
  }

  const crownY = y;
  const crownX = x;

  // Fronds: 10 blades radiating from the crown, each a flattened, tapering,
  // slightly drooping shape built from a scaled cone laid near-horizontal.
  const fronds = 10;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2;
    const droop = 0.3 + rand() * 0.45;
    const len = 2.6 + rand() * 0.6;
    // Build the blade pointing straight up with its base at the local
    // origin, then tip it outward-and-down (droop) and spin it around the
    // trunk axis before moving the whole thing up to the crown — this keeps
    // the base pinned at the crown regardless of rotation.
    const geo = new THREE.ConeGeometry(0.32, len, 6);
    geo.scale(1, 1, 0.16);
    geo.translate(0, len / 2, 0);
    geo.rotateZ(Math.PI / 2 + droop);
    geo.rotateY(a);
    geo.translate(crownX, crownY, 0);
    frondParts.push({ geo, mat: frondMat });
  }
  // Central spike frond (unopened new leaf) pointing straight up.
  frondParts.push({ geo: bakedCone(0.1, 1.3, 6, crownX, crownY + 0.6, 0), mat: frondMat });

  // Coconut cluster beneath the crown.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    nutParts.push({
      geo: bakedSphere(0.22, crownX + Math.cos(a) * 0.28, crownY - 0.35, Math.sin(a) * 0.28, {
        wSeg: 7,
        hSeg: 6,
      }),
      mat: nutMat,
    });
  }

  const g = new THREE.Group();
  g.add(mergeByMaterial(barkParts), mergeByMaterial(frondParts), mergeByMaterial(nutParts));
  g.name = "chennai-coconut-palm";
  return g;
}

/* ------------------------------------------------------------------ *
 * Street prop: filter-coffee tiffin cart — stacked tiffin carriers, a
 * davara-tumbler set, a small stove, an awning.
 * ------------------------------------------------------------------ */
export function makeTiffinCart(mats?: AssetMaterialLib, seed = 13): THREE.Group {
  const rand = mulberry32(seed);
  const wood = stdMat(0x6b4a2a, { roughness: 0.85 }, mats);
  const steel = stdMat(0xc9ccd0, { roughness: 0.3, metalness: 0.8 }, mats);
  const steelDk = stdMat(0x8a8f94, { roughness: 0.35, metalness: 0.75 }, mats);
  const canopyMat = stdMat(0xf1c40f, { roughness: 0.85 }, mats);
  const coffee = stdMat(0x3b2314, { roughness: 0.5 }, mats);

  const woodParts: Part[] = [];
  const steelParts: Part[] = [];
  const canopyParts: Part[] = [];
  const coffeeParts: Part[] = [];

  woodParts.push({ geo: bakedBox(1.5, 0.85, 0.8, 0, 0.42, 0), mat: wood });
  for (const x of [-1.1, 1.1]) {
    steelParts.push({ geo: bakedCyl(0.24, 0.24, 0.08, 12, x, 0.24, 0, Math.PI / 2), mat: steelDk });
  }

  // Stacked tiffin-carrier tower (3 tiers) on one side of the counter.
  for (let i = 0; i < 3; i++) {
    steelParts.push({ geo: bakedCyl(0.24, 0.26, 0.22, 12, -0.45, 0.85 + i * 0.24 + i * 0.02, 0.15), mat: steel });
  }
  steelParts.push({ geo: bakedCyl(0.02, 0.02, 0.3, 6, -0.45, 1.72, 0.15), mat: steelDk }); // carry handle

  // Davara-tumbler set (small cup + wide bowl) plus a boiling kettle.
  coffeeParts.push({ geo: bakedCyl(0.12, 0.09, 0.14, 8, 0.35, 0.92, 0.2), mat: steel });
  coffeeParts.push({ geo: bakedCyl(0.14, 0.1, 0.06, 8, 0.35, 0.86, 0.2), mat: coffee });
  steelParts.push({ geo: bakedCyl(0.16, 0.13, 0.22, 8, 0.7, 0.96, -0.1), mat: steel }); // kettle body
  steelParts.push({ geo: bakedCyl(0.02, 0.02, 0.18, 6, 0.7, 1.16, -0.22, 0.6), mat: steelDk }); // spout

  // Small stove beneath the kettle.
  steelParts.push({ geo: bakedCyl(0.2, 0.24, 0.28, 10, 0.7, 0.42, -0.1), mat: steelDk });

  // Umbrella-style awning on a single pole.
  woodParts.push({ geo: bakedCyl(0.04, 0.04, 2.1, 6, -0.6, 1.5, -0.3), mat: wood });
  canopyParts.push({ geo: bakedCone(1.1, 0.5, 10, -0.6, 2.65, -0.3, 0, 0, 1, 1), mat: canopyMat });

  void rand;
  const g = new THREE.Group();
  g.add(
    mergeByMaterial(woodParts),
    mergeByMaterial(steelParts),
    mergeByMaterial(canopyParts),
    mergeByMaterial(coffeeParts)
  );
  g.name = "chennai-tiffin-cart";
  return g;
}

/* ------------------------------------------------------------------ *
 * Mission stall: South Indian tiffin counter — dosa tawa, idli stack,
 * vada, sambar/chutney, filter coffee, tiffin carriers, menu board.
 * Sized to match makeStall() so task anchors line up.
 * ------------------------------------------------------------------ */
export function makeTiffinStall(
  mats?: AssetMaterialLib,
  seed = 13,
  canopyColour = 0xf1c40f
): THREE.Group {
  const rand = mulberry32(seed);
  const wood = stdMat(0x7a5230, { roughness: 0.88 }, mats);
  const steel = stdMat(0xc9ccd0, { roughness: 0.3, metalness: 0.8 }, mats);
  const steelDk = stdMat(0x8a8f94, { roughness: 0.35, metalness: 0.75 }, mats);
  const canopyMat = stdMat(canopyColour, { roughness: 0.85 }, mats);
  const post = stdMat(0x4a3a2a, { roughness: 0.9 }, mats);
  const dosa = stdMat(0xd4a017, { roughness: 0.65 }, mats);
  const idli = stdMat(0xf5f0e6, { roughness: 0.7 }, mats);
  const vada = stdMat(0x8b4513, { roughness: 0.75 }, mats);
  const sambar = stdMat(0xc0392b, { roughness: 0.55 }, mats);
  const chutneyG = stdMat(0x27ae60, { roughness: 0.6 }, mats);
  const chutneyR = stdMat(0xe74c3c, { roughness: 0.6 }, mats);
  const leaf = stdMat(0x2ecc71, { roughness: 0.8 }, mats);
  const coffee = stdMat(0x3b2314, { roughness: 0.5 }, mats);
  const board = stdMat(0x1a252f, { roughness: 0.9 }, mats);
  const chalk = stdMat(0xfdfefe, { roughness: 0.95 }, mats);

  const woodParts: Part[] = [];
  const steelParts: Part[] = [];
  const canopyParts: Part[] = [];
  const foodParts: Part[] = [];
  const miscParts: Part[] = [];

  // Counter — same footprint as generic makeStall().
  woodParts.push({ geo: bakedBox(2.6, 1.0, 1.4, 0, 0.5, 0), mat: wood });

  // Canopy posts and roof.
  for (const [x, z] of [
    [-1.2, -0.6],
    [1.2, -0.6],
    [-1.2, 0.6],
    [1.2, 0.6],
  ]) {
    canopyParts.push({ geo: bakedCyl(0.07, 0.07, 2.4, 6, x, 1.2, z), mat: post });
  }
  canopyParts.push({ geo: bakedBox(3.0, 0.1, 1.9, 0, 2.45, 0, 0.06), mat: canopyMat });

  // Dosa tawa on a gas ring at the front-left of the counter.
  steelParts.push({ geo: bakedCyl(0.2, 0.24, 0.12, 10, -0.85, 1.06, 0.35), mat: steelDk });
  steelParts.push({ geo: bakedCyl(0.38, 0.4, 0.04, 12, -0.85, 1.14, 0.35), mat: steel });
  foodParts.push({ geo: bakedCyl(0.34, 0.36, 0.02, 12, -0.85, 1.17, 0.35), mat: dosa });
  // Rolled dosa waiting on a plate beside the tawa.
  foodParts.push({ geo: bakedCyl(0.14, 0.08, 0.28, 8, -0.45, 1.12, 0.35, 0.4), mat: dosa });

  // Idli stack (3 tiers) and medu vada.
  for (let i = 0; i < 3; i++) {
    foodParts.push({ geo: bakedCyl(0.11, 0.11, 0.06, 10, 0.15, 1.06 + i * 0.07, 0.1), mat: idli });
  }
  foodParts.push({ geo: bakedTorus(0.1, 0.04, 0.45, 1.08, 0.35), mat: vada });
  foodParts.push({ geo: bakedTorus(0.09, 0.035, 0.55, 1.06, 0.15), mat: vada });

  // Sambar bucket and chutney bowls.
  steelParts.push({ geo: bakedCyl(0.22, 0.24, 0.32, 10, 0.75, 1.14, -0.15), mat: steel });
  foodParts.push({ geo: bakedCyl(0.18, 0.18, 0.04, 10, 0.75, 1.32, -0.15), mat: sambar });
  foodParts.push({ geo: bakedCyl(0.09, 0.07, 0.05, 8, 0.55, 1.08, -0.15), mat: chutneyG });
  foodParts.push({ geo: bakedCyl(0.09, 0.07, 0.05, 8, 0.68, 1.08, -0.15), mat: chutneyR });

  // Stacked tiffin carriers on the far side.
  for (let i = 0; i < 3; i++) {
    steelParts.push({ geo: bakedCyl(0.2, 0.22, 0.18, 12, -1.05, 1.06 + i * 0.2, -0.35), mat: steel });
  }
  steelParts.push({ geo: bakedCyl(0.02, 0.02, 0.26, 6, -1.05, 1.72, -0.35), mat: steelDk });

  // Filter coffee: davara-tumbler set and boiling kettle on a small stove.
  foodParts.push({ geo: bakedCyl(0.1, 0.08, 0.12, 8, 1.0, 1.1, -0.4), mat: steel });
  foodParts.push({ geo: bakedCyl(0.12, 0.09, 0.05, 8, 1.0, 1.04, -0.4), mat: coffee });
  steelParts.push({ geo: bakedCyl(0.14, 0.12, 0.2, 8, 1.25, 1.12, -0.4), mat: steel });
  steelParts.push({ geo: bakedCyl(0.02, 0.02, 0.16, 6, 1.25, 1.28, -0.52, 0.55), mat: steelDk });
  steelParts.push({ geo: bakedCyl(0.18, 0.22, 0.1, 10, 1.25, 1.02, -0.4), mat: steelDk });

  // Banana-leaf stack and steel tumblers for service.
  for (let i = 0; i < 4; i++) {
    foodParts.push({
      geo: bakedBox(0.32, 0.012, 0.22, 1.05, 1.04 + i * 0.014, 0.35 + jitter(rand, 0.02)),
      mat: leaf,
    });
  }
  for (let i = 0; i < 3; i++) {
    steelParts.push({ geo: bakedCyl(0.05, 0.04, 0.14, 8, 1.05 + i * 0.08, 1.08, 0.05), mat: steel });
  }

  // Hand-written menu board behind the counter.
  miscParts.push({ geo: bakedBox(0.9, 0.55, 0.06, 0, 1.65, -0.72), mat: board });
  miscParts.push({ geo: bakedBox(0.75, 0.04, 0.02, -0.05, 1.78, -0.68), mat: chalk });
  miscParts.push({ geo: bakedBox(0.6, 0.03, 0.02, 0.08, 1.68, -0.68), mat: chalk });
  miscParts.push({ geo: bakedBox(0.5, 0.03, 0.02, -0.1, 1.58, -0.68), mat: chalk });

  void rand;
  const g = new THREE.Group();
  g.add(
    mergeByMaterial(woodParts),
    mergeByMaterial(steelParts),
    mergeByMaterial(canopyParts),
    mergeByMaterial(foodParts),
    mergeByMaterial(miscParts)
  );
  g.name = "chennai-tiffin-stall";
  return g;
}
