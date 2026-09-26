/**
 * Barber shop exterior — a world landmark on the street. The player never goes
 * inside: the haircut is talked through at the door and resolves into a
 * cutscene still, so there is no interior scene to build.
 *
 * Procedural geometry only, bar the fascia lettering, which has to be a texture
 * because a district's script cannot be spelled out in boxes.
 */

import * as THREE from "three";
import { buildBarberPoleGeo } from "../clutter";
import {
  bakedBox,
  bakedCyl,
  mergeByMaterial,
  stdMat,
  type AssetMaterialLib,
  type Part,
} from "./shared";

/* ---------------- exterior palette ---------------- */

const EX_BRICK = 0xb0442c;      // exposed brickwork
const EX_MORTAR = 0xcfc2ad;     // mortar courses
const EX_CONCRETE = 0xbdb6a8;   // plinth + coping
const EX_TIN = 0xc6cbd0;        // corrugated sheet
const EX_TIN_DK = 0x939aa2;     // sheet edges, in shade
const EX_SHOP_RED = 0xbf3b2b;   // painted interior walls
const EX_FRAME = 0x2f5f9e;      // blue shutter frame around the opening
const EX_WOOD = 0x8a5a33;
const EX_CREAM = 0xf2efe4;      // trim + lettering
const EX_TILE = 0xe4dccb;       // shop floor
const EX_DARK = 0x241d18;       // recesses, shadow gaps
const EX_CHROME = 0xc0c8d0;
const EX_LEATHER = 0xc0392b;    // barber chair
const EX_MIRROR = 0xa8d4e8;
const EX_GOLD = 0xd6a017;       // shrine idol
const EX_SIGN_BG = 0x1f4a7a;    // painted name board

/**
 * Tiling brick. Courses are the one thing that cannot be faked with a flat
 * colour at this scale — a plain terracotta box reads as painted stucco, which
 * is exactly what this shop is not. One 256px canvas, shared by every wall.
 */
let brickTex: THREE.CanvasTexture | null = null;
function brickTexture(): THREE.CanvasTexture {
  if (brickTex) return brickTex;
  const S = 256;
  const ROWS = 8;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

  ctx.fillStyle = hex(EX_MORTAR);
  ctx.fillRect(0, 0, S, S);

  const h = S / ROWS;
  const w = h * 2.2;
  const gap = 2.5;
  // Deterministic jitter: bricks want tonal variation, but a random() here
  // would reshuffle the wall on every reload.
  let seed = 9;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  for (let r = 0; r < ROWS; r++) {
    const offset = (r % 2) * (w / 2);
    for (let x = -w; x < S + w; x += w) {
      const shade = 0.86 + rand() * 0.28;
      const c = new THREE.Color(EX_BRICK).multiplyScalar(shade);
      ctx.fillStyle = `#${c.getHexString()}`;
      ctx.fillRect(x + offset + gap / 2, r * h + gap / 2, w - gap, h - gap);
    }
  }

  brickTex = new THREE.CanvasTexture(canvas);
  brickTex.wrapS = THREE.RepeatWrapping;
  brickTex.wrapT = THREE.RepeatWrapping;
  brickTex.repeat.set(2.4, 1.8);
  brickTex.colorSpace = THREE.SRGBColorSpace;
  brickTex.anisotropy = 4;
  brickTex.needsUpdate = true;
  return brickTex;
}

/** Brick wall material. Not routed through stdMat's cache — it carries a map. */
let brickMatCache: THREE.MeshStandardMaterial | null = null;
function brickMat(): THREE.MeshStandardMaterial {
  if (!brickMatCache) {
    brickMatCache = new THREE.MeshStandardMaterial({
      map: brickTexture(),
      roughness: 0.95,
      metalness: 0,
    });
  }
  return brickMatCache;
}

/**
 * The fascia is the one place a texture earns its cost: a district's script
 * cannot be spelled out in boxes. Everything else on the shop stays procedural
 * geometry. Cached per string so ten districts share at most ten canvases.
 */
const signTexCache = new Map<string, THREE.CanvasTexture>();

const SIGN_FONT_STACK =
  '"Noto Sans", "Noto Sans Devanagari", "Noto Sans Tamil", "Noto Sans Telugu", ' +
  '"Noto Sans Kannada", "Noto Sans Malayalam", "Noto Sans Gujarati", ' +
  '"Noto Sans Bengali", "Noto Sans Gurmukhi", "Noto Sans Oriya", ' +
  "system-ui, sans-serif";

/**
 * Fascia board: native script large, romanisation small beneath, on a solid
 * ground. Indic strings run two to three times the width of their Latin gloss,
 * so the main line is shrunk to fit rather than trusting a fixed size.
 */
function signTexture(native: string, roman: string, bg: number, fg: number): THREE.CanvasTexture {
  const key = `${native}|${roman}|${bg}|${fg}`;
  const hit = signTexCache.get(key);
  if (hit) return hit;

  const W = 1024;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = hex(bg);
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = hex(fg);

  // Hairline rule top and bottom, the way a painted board is bordered.
  ctx.globalAlpha = 0.55;
  ctx.fillRect(48, 26, W - 96, 3);
  ctx.fillRect(48, H - 29, W - 96, 3);
  ctx.globalAlpha = 1;

  let size = 118;
  const maxW = W * 0.84;
  do {
    ctx.font = `${size}px ${SIGN_FONT_STACK}`;
    if (ctx.measureText(native).width <= maxW) break;
    size -= 4;
  } while (size > 34);
  ctx.fillText(native, W / 2, H * 0.44);

  ctx.font = `34px ${SIGN_FONT_STACK}`;
  ctx.globalAlpha = 0.72;
  // Letterspacing the gloss keeps it reading as a subtitle, not a second title.
  const spaced = roman.split("").join(" ");
  ctx.fillText(spaced, W / 2, H * 0.79);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  signTexCache.set(key, tex);
  return tex;
}

/** Flat, unlit-ish board material so the lettering stays readable at dusk. */
function signMat(native: string, roman: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: signTexture(native, roman, EX_SIGN_BG, EX_CREAM),
    roughness: 0.85,
    metalness: 0,
  });
}

function poleMesh(mats?: AssetMaterialLib): THREE.Mesh {
  const geo = buildBarberPoleGeo();
  // The pole's red/white/blue lives in a vertex-colour attribute, the way
  // everything in clutter.ts is authored. Without vertexColors the whole thing
  // renders as a blank white tube.
  const mat = stdMat(0xffffff, { roughness: 0.7, vertexColors: true }, mats);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Exterior shopfront placed in the open world. Fronts along +z, so the caller
 * only has to rotate the group to face whichever street it sits on.
 *
 * This is a single-room brick lock-up with no front wall — the shop opens
 * straight onto the pavement under a corrugated sheet, the way these actually
 * stand. That means the inside is on show from the street, so the chair, mirror
 * and counter are part of the exterior model rather than a separate scene.
 */
export function makeBarberShop(
  sign: { native: string; roman: string },
  mats?: AssetMaterialLib
): THREE.Group {
  const brick = brickMat();
  const concrete = stdMat(EX_CONCRETE, { roughness: 0.95 }, mats);
  const tin = stdMat(EX_TIN, { roughness: 0.55, metalness: 0.45 }, mats);
  const tinDk = stdMat(EX_TIN_DK, { roughness: 0.6, metalness: 0.45 }, mats);
  const painted = stdMat(EX_SHOP_RED, { roughness: 0.9 }, mats);
  const frame = stdMat(EX_FRAME, { roughness: 0.8 }, mats);
  const wood = stdMat(EX_WOOD, { roughness: 0.92 }, mats);
  const cream = stdMat(EX_CREAM, { roughness: 0.88 }, mats);
  const tile = stdMat(EX_TILE, { roughness: 0.7 }, mats);
  const dark = stdMat(EX_DARK, { roughness: 1 }, mats);
  const chrome = stdMat(EX_CHROME, { roughness: 0.35, metalness: 0.6 }, mats);
  const leather = stdMat(EX_LEATHER, { roughness: 0.7 }, mats);
  const mirror = stdMat(EX_MIRROR, { roughness: 0.12, metalness: 0.85 }, mats);
  const gold = stdMat(EX_GOLD, { roughness: 0.45, metalness: 0.5 }, mats);

  /* Opening spans x -1.6 .. 0.35, floor to y 2.15. Everything front-facing is
   * positioned off those numbers so the jambs and lintel stay flush. */
  const OPEN_L = -1.6;
  const OPEN_R = 0.35;
  const OPEN_TOP = 2.15;
  const FLOOR = 0.24;
  const WALL_TOP = 2.94;

  const parts: Part[] = [
    /* plinth */
    { geo: bakedBox(4.3, 0.24, 3.5, 0, 0.12, 0), mat: concrete },

    /* brick shell — three sides plus the pier and lintel that frame the front */
    { geo: bakedBox(3.9, 2.7, 0.25, 0, 1.59, -1.5), mat: brick },
    { geo: bakedBox(0.25, 2.7, 3.25, -1.825, 1.59, 0), mat: brick },
    { geo: bakedBox(0.25, 2.7, 3.25, 1.825, 1.59, 0), mat: brick },
    { geo: bakedBox(1.6, 2.7, 0.25, 1.15, 1.59, 1.5), mat: brick },
    { geo: bakedBox(0.35, 2.7, 0.25, -1.775, 1.59, 1.5), mat: brick },
    { geo: bakedBox(1.95, WALL_TOP - OPEN_TOP, 0.25, -0.625, (WALL_TOP + OPEN_TOP) / 2, 1.5), mat: brick },
    { geo: bakedBox(4.02, 0.12, 3.37, 0, WALL_TOP + 0.06, 0), mat: concrete },

    /* blue frame round the opening */
    { geo: bakedBox(2.18, 0.14, 0.3, -0.625, OPEN_TOP - 0.07, 1.52), mat: frame },
    { geo: bakedBox(0.14, OPEN_TOP - FLOOR, 0.3, OPEN_L - 0.07, (OPEN_TOP + FLOOR) / 2, 1.52), mat: frame },
    { geo: bakedBox(0.14, OPEN_TOP - FLOOR, 0.3, OPEN_R + 0.07, (OPEN_TOP + FLOOR) / 2, 1.52), mat: frame },

    /* inside, on show from the pavement */
    { geo: bakedBox(3.4, 0.04, 2.9, 0, FLOOR + 0.02, -0.05), mat: tile },
    { geo: bakedBox(3.4, 2.0, 0.06, 0, 1.24, -1.34), mat: painted },
    { geo: bakedBox(0.06, 2.0, 2.9, -1.67, 1.24, -0.05), mat: painted },
    { geo: bakedBox(0.06, 2.0, 2.9, 1.67, 1.24, -0.05), mat: painted },
    { geo: bakedBox(1.12, 1.22, 0.03, -0.55, 1.45, -1.31), mat: cream },
    { geo: bakedBox(1.0, 1.1, 0.03, -0.55, 1.45, -1.29), mat: mirror },
    { geo: bakedBox(2.3, 0.08, 0.5, -0.45, 0.95, -1.06), mat: cream },
    { geo: bakedBox(2.3, 0.68, 0.44, -0.45, 0.6, -1.06), mat: wood },
    { geo: bakedBox(0.7, 0.05, 0.24, 0.95, 1.5, -1.3), mat: wood },

    /* barber chair */
    { geo: bakedCyl(0.3, 0.3, 0.1, 12, -0.55, FLOOR + 0.09, 0.15), mat: chrome },
    { geo: bakedCyl(0.07, 0.07, 0.45, 8, -0.55, FLOOR + 0.35, 0.15), mat: chrome },
    { geo: bakedBox(0.64, 0.14, 0.64, -0.55, FLOOR + 0.63, 0.15), mat: leather },
    { geo: bakedBox(0.64, 0.86, 0.14, -0.55, FLOOR + 1.1, -0.18), mat: leather },
    { geo: bakedBox(0.1, 0.07, 0.5, -0.87, FLOOR + 0.78, 0.15), mat: chrome },
    { geo: bakedBox(0.1, 0.07, 0.5, -0.23, FLOOR + 0.78, 0.15), mat: chrome },

    /* Shrine on the pier. Stands proud of the brick rather than recessed into
     * it — the pier is only 0.25m thick, so a recess would be swallowed whole. */
    { geo: bakedBox(0.64, 0.74, 0.14, 1.15, 1.45, 1.69), mat: dark },
    { geo: bakedBox(0.86, 0.1, 0.3, 1.15, 1.87, 1.71), mat: wood },
    { geo: bakedBox(0.92, 0.1, 0.34, 1.15, 1.05, 1.73), mat: wood },
    { geo: bakedBox(0.11, 0.84, 0.3, 0.74, 1.45, 1.71), mat: wood },
    { geo: bakedBox(0.11, 0.84, 0.3, 1.56, 1.45, 1.71), mat: wood },
    { geo: bakedCyl(0.1, 0.13, 0.26, 8, 1.15, 1.29, 1.73), mat: gold },
    { geo: bakedCyl(0.09, 0.09, 0.12, 8, 1.15, 1.48, 1.73), mat: gold },
  ];

  /* Corrugated sheet over the front, pitched down toward the street. Ridges run
   * with the fall, which is what makes it read as sheet rather than a slab. */
  const TILT = 0.16;
  /* Kept to a 0.9m projection sitting clear above the lintel. A deeper sheet is
   * truer to the reference photo but the game camera looks DOWN at the street,
   * and anything deeper roofs over the interior the open front exists to show. */
  for (let i = 0; i < 22; i++) {
    parts.push({
      geo: bakedBox(0.15, 0.07, 0.95, -1.95 + i * 0.185, 2.42, 2.0, TILT),
      mat: i % 2 === 0 ? tin : tinDk,
    });
  }
  parts.push({ geo: bakedBox(4.15, 0.06, 0.12, 0, 2.35, 2.44), mat: tinDk });
  parts.push({ geo: bakedBox(4.15, 0.12, 0.1, 0, 2.5, 1.6), mat: tinDk });
  /* timber brackets carrying the sheet */
  for (const bx of [-1.82, 1.82]) {
    parts.push({ geo: bakedBox(0.09, 0.09, 0.9, bx, 2.38, 2.0, TILT), mat: wood });
    parts.push({ geo: bakedBox(0.09, 0.34, 0.09, bx, 2.2, 1.66), mat: wood });
  }

  const g = mergeByMaterial(parts);

  /* Name board on the brick above the sheet, in the district's own script. */
  const fascia = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.44), signMat(sign.native, sign.roman));
  fascia.position.set(0, 2.7, 1.632);
  g.add(fascia);

  /* Pole on the jamb beside the opening. */
  const pole = poleMesh(mats);
  pole.scale.set(0.95, 0.95, 0.95);
  pole.position.set(OPEN_L - 0.07, FLOOR + 0.35, 1.7);
  g.add(pole);

  return g;
}
