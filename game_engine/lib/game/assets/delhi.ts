/**
 * Old Delhi / Purani Sadak kit.
 *
 * Signature reads: a pointed-arch bazaar gate crowned with chhatri domes, a
 * three-wheeled cycle-rickshaw (NOT an auto — pedal-driven, open canopy,
 * bench seat behind), a jalebi stall built around a big kadhai, and a
 * sandstone haveli facade punched through with a jharokha jali screen.
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

const SANDSTONE = 0xb5651d;
const SANDSTONE_DK = 0x8f4d1a;
const CREAM_INLAY = 0xe8d6b3;
const JALI_DARK = 0x3a2416;

/* ------------------------------------------------------------------ *
 * Hero: Mughal bazaar gate — piers, pointed tympanum, three chhatris.
 * ~11m tall, ~10m wide.
 * ------------------------------------------------------------------ */
export function makeBazaarGate(mats?: AssetMaterialLib, seed = 1): THREE.Group {
  const rand = mulberry32(seed);
  const stone = stdMat(SANDSTONE, { roughness: 0.88 }, mats);
  const inlay = stdMat(CREAM_INLAY, { roughness: 0.75 }, mats);
  const dark = stdMat(JALI_DARK, { roughness: 0.9 }, mats);

  const parts: Part[] = [];

  // Piers flanking an 8m-wide passage.
  for (const x of [-5, 5]) {
    parts.push({ geo: bakedBox(2, 9, 2, x, 4.5, 0), mat: stone });
    parts.push({ geo: bakedBox(2.4, 0.35, 2.4, x, 9.2, 0), mat: inlay }); // pier cap band
    parts.push({ geo: bakedBox(2.4, 0.35, 2.4, x, 5.8, 0), mat: inlay }); // mid band
    // Jali lattice suggestion: a grid of small recessed dark squares.
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 2; c++) {
        parts.push({
          geo: bakedBox(0.5, 0.5, 0.15, x - 0.4 + c * 0.8, 2.4 + r * 1.1, 1.05),
          mat: dark,
        });
      }
    }
  }

  // Lintel across the passage.
  parts.push({ geo: bakedBox(12, 1.1, 2.3, 0, 9.6, 0), mat: stone });
  parts.push({ geo: bakedBox(12.4, 0.2, 2.5, 0, 10.2, 0), mat: inlay });

  // Pointed tympanum (pishtaq): a tall thin flattened cone reads as a pointed
  // arch panel standing proud of the gate face.
  parts.push({ geo: bakedCone(5.6, 4.6, 16, 0, 12.6, 0, 0, 0, 1, 0.32), mat: inlay });
  parts.push({ geo: bakedCone(4.9, 4.0, 16, 0, 12.5, 0.05, 0, 0, 1, 0.22), mat: stone });

  const gateTopY = 14.4;

  const gate = mergeByMaterial(parts);
  gate.name = "delhi-bazaar-gate";

  // The chhatris were baked with y starting at 0 (ground); lift the whole
  // merged mesh set for them separately so they sit on the roofline.
  const chhatriParts: Part[] = [];
  const addChhatriAt = (cx: number, baseY: number, cz: number, scale: number) => {
    const s = scale;
    for (const [px, pz] of [
      [-0.5 * s, -0.5 * s],
      [0.5 * s, -0.5 * s],
      [-0.5 * s, 0.5 * s],
      [0.5 * s, 0.5 * s],
    ]) {
      chhatriParts.push({
        geo: bakedCyl(0.09 * s, 0.09 * s, 1.4 * s, 6, cx + px, baseY + 0.7 * s, cz + pz),
        mat: stone,
      });
    }
    chhatriParts.push({ geo: bakedBox(1.3 * s, 0.14 * s, 1.3 * s, cx, baseY + 1.42 * s, cz), mat: inlay });
    chhatriParts.push({
      geo: bakedSphere(0.72 * s, cx, baseY + 1.9 * s, cz, {
        wSeg: 10,
        hSeg: 6,
        thetaLength: Math.PI * 0.62,
      }),
      mat: inlay,
    });
    chhatriParts.push({ geo: bakedCyl(0.04 * s, 0.04 * s, 0.5 * s, 5, cx, baseY + 2.55 * s, cz), mat: stone });
  };
  addChhatriAt(0, gateTopY, 0.5, 1.15);
  addChhatriAt(-5, 9.4, 0, 0.72);
  addChhatriAt(5, 9.4, 0, 0.72);

  const chhatris = mergeByMaterial(chhatriParts);
  const g = new THREE.Group();
  g.add(gate, chhatris);
  g.name = "delhi-bazaar-gate";
  void rand;
  return g;
}

/* ------------------------------------------------------------------ *
 * Hero: sandstone haveli facade with a projecting jharokha jali balcony.
 * ~9m tall, ~6m wide slice of streetfront.
 * ------------------------------------------------------------------ */
export function makeHaveliBalcony(mats?: AssetMaterialLib, seed = 2): THREE.Group {
  const rand = mulberry32(seed);
  const stone = stdMat(SANDSTONE_DK, { roughness: 0.85 }, mats);
  const inlay = stdMat(CREAM_INLAY, { roughness: 0.7 }, mats);
  const dark = stdMat(JALI_DARK, { roughness: 0.92 }, mats);
  const wood = stdMat(0x5c3a21, { roughness: 0.8 }, mats);

  const parts: Part[] = [];

  // Facade slab, two storeys.
  parts.push({ geo: bakedBox(6, 9, 3.2, 0, 4.5, 0), mat: stone });
  parts.push({ geo: bakedBox(6.3, 0.25, 3.5, 0, 4.6, 0), mat: inlay }); // floor ledge
  parts.push({ geo: bakedBox(6.4, 0.4, 3.6, 0, 9.05, 0), mat: inlay }); // cornice
  parts.push({ geo: bakedBox(6.6, 0.5, 3.8, 0, 9.5, 0), mat: stone }); // parapet

  // Ground floor arched doorway suggestion (recessed dark bay + frame).
  parts.push({ geo: bakedBox(1.6, 2.6, 0.3, 0, 1.4, 1.65), mat: dark });
  parts.push({ geo: bakedBox(2.0, 0.3, 0.4, 0, 2.75, 1.65), mat: inlay });

  // Projecting jharokha: a stone bracket-supported bay window, capped by a
  // small chhatri, with the jali screen as a grid of small punched squares —
  // this is the single most recognisable Delhi haveli detail.
  const jY = 6.4;
  parts.push({ geo: bakedBox(3.2, 0.3, 0.9, 0, jY - 0.85, 1.9), mat: stone }); // floor slab
  // Chajja support brackets (small angled struts under the bay).
  for (const x of [-1.3, 0, 1.3]) {
    parts.push({ geo: bakedBox(0.22, 0.6, 0.22, x, jY - 1.05, 1.5, 0.5), mat: stone });
  }
  parts.push({ geo: bakedBox(3.2, 1.7, 0.18, 0, jY, 2.3), mat: dark }); // jali screen backing
  // Perforation grid — small proud studs reading as carved lattice.
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) continue;
      parts.push({
        geo: bakedBox(0.18, 0.18, 0.08, -1.4 + c * 0.4, jY - 0.6 + r * 0.32, 2.4),
        mat: inlay,
      });
    }
  }
  parts.push({ geo: bakedBox(3.4, 0.15, 1.0, 0, jY + 0.9, 2.0, 0.18), mat: stone }); // chajja canopy lip
  parts.push({ geo: bakedBox(0.15, 0.15, 0.15, 0, jY + 1.15, 1.9), mat: stone }); // finial

  // Wooden shutters flanking the jharokha.
  for (const x of [-1.8, 1.8]) {
    parts.push({ geo: bakedBox(0.5, 1.6, 0.1, x, jY, 2.15), mat: wood });
  }

  // Second small window above.
  parts.push({ geo: bakedBox(1.0, 1.1, 0.15, 0, 8.1, 1.75), mat: dark });
  parts.push({ geo: bakedBox(1.2, 0.15, 0.2, 0, 8.68, 1.8), mat: inlay });

  void rand;
  const grp = mergeByMaterial(parts);
  grp.name = "delhi-haveli";
  return grp;
}

/* ------------------------------------------------------------------ *
 * Vehicle: cycle-rickshaw — pedal frame, three wheels, canopy, bench.
 * ------------------------------------------------------------------ */
export function makeCycleRickshaw(mats?: AssetMaterialLib, seed = 3): THREE.Group {
  const rand = mulberry32(seed);
  const frameCol = [0x2e6f3e, 0x8e3b3b, 0x2e4f7a][Math.floor(rand() * 3)];
  const frame = stdMat(frameCol, { roughness: 0.6, metalness: 0.5 }, mats);
  const seatMat = stdMat(0xc9a26a, { roughness: 0.9 }, mats);
  const canopyMat = stdMat([0xf5c518, 0xe74c3c, 0x27ae60][Math.floor(rand() * 3)], {
    roughness: 0.85,
  }, mats);
  const black = stdMat(0x161616, { roughness: 0.75 }, mats);
  const chrome = stdMat(0xcfd4d8, { roughness: 0.3, metalness: 0.85 }, mats);

  const frameParts: Part[] = [];
  const wheelParts: Part[] = [];
  const canopyParts: Part[] = [];
  const seatParts: Part[] = [];

  // Main chassis rail running front to back.
  frameParts.push({ geo: bakedBox(0.1, 0.1, 2.6, 0, 0.62, 0.2), mat: frame });
  // Front fork + single steering wheel.
  frameParts.push({ geo: bakedCyl(0.03, 0.03, 0.7, 6, 0, 0.55, 1.55, 0.25), mat: chrome });
  wheelParts.push({ geo: bakedTorus(0.42, 0.05, 0, 0.42, 1.75, Math.PI / 2), mat: black });
  frameParts.push({ geo: bakedCyl(0.05, 0.05, 0.08, 10, 0, 0.42, 1.75, Math.PI / 2), mat: chrome }); // hub
  // Handlebar.
  frameParts.push({ geo: bakedBox(0.55, 0.05, 0.05, 0, 0.98, 1.85), mat: chrome });
  // Pedal crank + seat post for the rider up front.
  frameParts.push({ geo: bakedCyl(0.14, 0.14, 0.08, 8, 0, 0.32, 1.2), mat: black });
  frameParts.push({ geo: bakedBox(0.32, 0.06, 0.18, 0, 0.75, 1.15), mat: seatMat }); // rider saddle

  // Rear axle + two large wheels (the tricycle signature).
  for (const x of [-0.62, 0.62]) {
    wheelParts.push({ geo: bakedTorus(0.46, 0.06, x, 0.46, -0.75, Math.PI / 2), mat: black });
    frameParts.push({ geo: bakedCyl(0.06, 0.06, 0.1, 10, x, 0.46, -0.75, Math.PI / 2), mat: chrome });
    // spokes
    for (let s = 0; s < 4; s++) {
      frameParts.push({
        geo: bakedCyl(0.02, 0.02, 0.86, 4, x, 0.46, -0.75, (Math.PI / 4) * s),
        mat: chrome,
      });
    }
  }
  frameParts.push({ geo: bakedBox(1.3, 0.08, 0.08, 0, 0.46, -0.75), mat: frame }); // rear axle bar

  // Passenger bench seat, sits between the rear wheels.
  seatParts.push({ geo: bakedBox(1.15, 0.42, 0.65, 0, 0.85, -0.7), mat: seatMat });
  seatParts.push({ geo: bakedBox(1.15, 0.55, 0.1, 0, 1.15, -1.0), mat: seatMat }); // backrest

  // Canopy: four thin posts + a curved-ish folding hood over the bench.
  for (const [x, z] of [
    [-0.58, -1.0],
    [0.58, -1.0],
    [-0.58, -0.35],
    [0.58, -0.35],
  ]) {
    canopyParts.push({ geo: bakedCyl(0.025, 0.025, 1.1, 6, x, 1.65, z), mat: chrome });
  }
  canopyParts.push({ geo: bakedBox(1.3, 0.06, 1.5, 0, 2.2, -0.68), mat: canopyMat });
  canopyParts.push({ geo: bakedCone(0.9, 0.35, 8, 0, 2.42, -0.68, 0, 0, 1.05, 0.7), mat: canopyMat }); // domed hood peak
  // Mudguard over the rear wheels.
  for (const x of [-0.62, 0.62]) {
    canopyParts.push({ geo: bakedBox(0.14, 0.3, 0.7, x, 0.85, -0.75, 0, 0, 0.5), mat: frame });
  }

  const g = new THREE.Group();
  g.add(
    mergeByMaterial(frameParts),
    mergeByMaterial(wheelParts),
    mergeByMaterial(canopyParts),
    mergeByMaterial(seatParts)
  );
  g.name = "delhi-cycle-rickshaw";
  return g;
}

/* ------------------------------------------------------------------ *
 * Street prop: jalebi stall — big kadhai, gas ring, syrup vat, stool, cart.
 * ------------------------------------------------------------------ */
export function makeJalebiStall(mats?: AssetMaterialLib, seed = 4): THREE.Group {
  const rand = mulberry32(seed);
  const wood = stdMat(0x7a5230, { roughness: 0.88 }, mats);
  const metal = stdMat(0x8d8f92, { roughness: 0.35, metalness: 0.8 }, mats);
  const dark = stdMat(0x1c1c1c, { roughness: 0.5, metalness: 0.3 }, mats);
  const jalebi = stdMat(0xe8940c, { roughness: 0.55, metalness: 0.15 }, mats);
  const canopy = stdMat(0xc0392b, { roughness: 0.85 }, mats);
  const flame = stdMat(0xff8a1e, { roughness: 0.4, emissive: 0xff5500, emissiveIntensity: 0.9 }, mats);

  const woodParts: Part[] = [];
  const metalParts: Part[] = [];
  const foodParts: Part[] = [];
  const canopyParts: Part[] = [];

  // Cart counter.
  woodParts.push({ geo: bakedBox(2.2, 0.9, 1.1, 0, 0.45, 0), mat: wood });
  for (const [x, z] of [
    [-1.0, -0.45],
    [1.0, -0.45],
    [-1.0, 0.45],
    [1.0, 0.45],
  ]) {
    woodParts.push({ geo: bakedCyl(0.05, 0.05, 0.9, 6, x, 0.45, z), mat: wood });
  }
  // Cart wheels (it's a pushcart).
  for (const x of [-1.15, 1.15]) {
    metalParts.push({ geo: bakedCyl(0.28, 0.28, 0.1, 12, x, 0.28, 0, Math.PI / 2), mat: dark });
  }

  // Gas ring stand.
  metalParts.push({ geo: bakedCyl(0.22, 0.26, 0.3, 10, 0.6, 1.05, 0), mat: dark });
  foodParts.push({ geo: bakedTorus(0.2, 0.03, 0.6, 1.22, 0, Math.PI / 2), mat: flame });

  // The big kadhai (wide shallow wok) sitting on the ring, brimming with oil
  // — the single detail that reads as "jalebi stall" from 20m.
  metalParts.push({
    geo: bakedSphere(0.55, 0.6, 1.28, 0, { wSeg: 12, hSeg: 8, thetaLength: Math.PI * 0.42 }),
    mat: metal,
  });
  metalParts.push({ geo: bakedTorus(0.55, 0.05, 0.6, 1.5, 0), mat: dark }); // rim
  // Coiled jalebi shapes floating in the kadhai.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    foodParts.push({
      geo: bakedTorus(0.09, 0.03, 0.6 + Math.cos(a) * 0.22, 1.42, 0.1 + Math.sin(a) * 0.22),
      mat: jalebi,
    });
  }

  // Syrup vat beside the kadhai.
  metalParts.push({ geo: bakedCyl(0.3, 0.34, 0.5, 10, -0.7, 0.9, 0), mat: metal });
  foodParts.push({ geo: bakedCyl(0.26, 0.26, 0.04, 10, -0.7, 1.16, 0), mat: jalebi });

  // Stacked serving trays on the counter.
  for (let i = 0; i < 3; i++) {
    foodParts.push({ geo: bakedCyl(0.32, 0.32, 0.05, 10, -1.5 + i * 0.0, 0.95 + i * 0.06, -0.2), mat: jalebi });
  }

  // Canopy over the stall on four posts.
  for (const [x, z] of [
    [-1.15, -0.6],
    [1.15, -0.6],
    [-1.15, 0.6],
    [1.15, 0.6],
  ]) {
    canopyParts.push({ geo: bakedCyl(0.04, 0.04, 2.1, 6, x, 1.95, z), mat: wood });
  }
  canopyParts.push({ geo: bakedBox(2.6, 0.08, 1.7, 0, 3.0, 0, 0.05), mat: canopy });

  void rand;
  const g = new THREE.Group();
  g.add(
    mergeByMaterial(woodParts),
    mergeByMaterial(metalParts),
    mergeByMaterial(foodParts),
    mergeByMaterial(canopyParts)
  );
  g.name = "delhi-jalebi-stall";
  return g;
}

/* ------------------------------------------------------------------ *
 * Hero: India Gate — simplified triumph arch, sandstone, ~8m wide.
 * ------------------------------------------------------------------ */
export function makeIndiaGate(mats?: AssetMaterialLib, seed = 5): THREE.Group {
  void seed;
  const stone = stdMat(SANDSTONE, { roughness: 0.88 }, mats);
  const inlay = stdMat(CREAM_INLAY, { roughness: 0.75 }, mats);
  const dark = stdMat(JALI_DARK, { roughness: 0.9 }, mats);

  const parts: Part[] = [];

  // Central passage flanked by piers.
  for (const x of [-3.2, 3.2]) {
    parts.push({ geo: bakedBox(1.4, 8.5, 1.6, x, 4.25, 0), mat: stone });
    parts.push({ geo: bakedBox(1.5, 0.25, 1.7, x, 8.65, 0), mat: inlay });
  }

  // Lintels and attic storey.
  parts.push({ geo: bakedBox(8.2, 0.9, 1.8, 0, 8.8, 0), mat: stone });
  parts.push({ geo: bakedBox(8.4, 0.18, 1.9, 0, 9.35, 0), mat: inlay });
  parts.push({ geo: bakedBox(5.6, 2.2, 1.4, 0, 10.5, 0), mat: stone });
  parts.push({ geo: bakedBox(5.8, 0.2, 1.5, 0, 11.65, 0), mat: inlay });

  // Shallow dome cap.
  parts.push({
    geo: bakedSphere(1.4, 0, 12.2, 0, { wSeg: 12, hSeg: 8, thetaLength: Math.PI * 0.55 }),
    mat: inlay,
  });

  // Names-inscribed panel suggestion on the attic.
  parts.push({ geo: bakedBox(4.2, 0.9, 0.12, 0, 10.3, 0.78), mat: dark });

  const grp = mergeByMaterial(parts);
  grp.name = "delhi-india-gate";
  return grp;
}

/* ------------------------------------------------------------------ *
 * Street mandir — compact neighbourhood temple for mission sites.
 * ~3.5m wide, shikhara spire, torana entrance.
 * ------------------------------------------------------------------ */
export function makeStreetMandir(mats?: AssetMaterialLib, seed = 6): THREE.Group {
  const rand = mulberry32(seed);
  const stone = stdMat(SANDSTONE_DK, { roughness: 0.85 }, mats);
  const inlay = stdMat(CREAM_INLAY, { roughness: 0.72 }, mats);
  const saffron = stdMat(0xe67e22, { roughness: 0.8 }, mats);
  const flag = stdMat(0xf5c518, { roughness: 0.85 }, mats);

  const parts: Part[] = [];

  // Raised plinth.
  parts.push({ geo: bakedBox(3.6, 0.35, 3.2, 0, 0.175, 0), mat: stone });

  // Garbhagriha (sanctum).
  parts.push({ geo: bakedBox(2.4, 2.4, 2.2, 0, 1.55, 0), mat: stone });
  parts.push({ geo: bakedBox(2.6, 0.15, 2.4, 0, 2.75, 0), mat: inlay });

  // Shikhara spire — stacked tapering boxes read as a north-Indian temple tower.
  let shW = 1.8;
  let shY = 2.85;
  for (let tier = 0; tier < 4; tier++) {
    const h = 0.55 - tier * 0.06;
    parts.push({ geo: bakedBox(shW, h, shW * 0.85, 0, shY + h / 2, 0), mat: inlay });
    shW *= 0.78;
    shY += h;
  }
  parts.push({ geo: bakedSphere(0.22, 0, shY + 0.22, 0), mat: flag });

  // Torana entrance arch.
  parts.push({ geo: bakedBox(0.25, 2.2, 0.25, -0.85, 1.45, 1.15), mat: stone });
  parts.push({ geo: bakedBox(0.25, 2.2, 0.25, 0.85, 1.45, 1.15), mat: stone });
  parts.push({ geo: bakedBox(2.0, 0.25, 0.3, 0, 2.55, 1.15), mat: inlay });
  parts.push({ geo: bakedCone(0.95, 0.7, 12, 0, 2.95, 1.15, 0, 0, 1, 0.35), mat: saffron });

  // Small saffron flag on a mast beside the shrine.
  parts.push({ geo: bakedCyl(0.03, 0.03, 2.8, 6, 1.55, 2.2, 0.4), mat: stone });
  parts.push({ geo: bakedBox(0.55, 0.35, 0.04, 1.55, 3.45, 0.4), mat: saffron });

  void rand;
  const grp = mergeByMaterial(parts);
  grp.name = "delhi-street-mandir";
  return grp;
}
