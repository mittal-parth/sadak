/**
 * Elevated metro: viaduct, station and trains.
 *
 * Seven of the ten cities have an elevated metro running over an arterial
 * road, and it is one of the strongest skyline cues a modern Indian city has:
 * a concrete U-girder deck on hammerhead piers marching down the median, a
 * station box bridging the road, and a train in the city's livery gliding in
 * overhead. Kolkata's metro is underground here (it has trams), and Amritsar
 * and Bhubaneswar have none, so those three get no viaduct.
 *
 * The viaduct runs the full length of one avenue along z. Two trains, one per
 * track, run opposite ways on a fixed schedule: arrive at speed, brake into
 * the station, dwell with doors open, pull away, run off the end of the
 * world, and come round again.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Landmark } from "./assets";
import type { Box } from "./city";

export type MetroLine = {
  /** Train body, window-band stripe, and the line colour used on signage. */
  body: number;
  stripe: number;
  line: number;
  /** Station name: local script, then English. */
  native: string;
  en: string;
  /** Font family app/globals.css loads for the script. */
  font: string;
};

export const METRO: Partial<Record<Landmark, MetroLine>> = {
  // Chandni Chowk is on the Yellow Line.
  delhi: { body: 0xc9ccd1, stripe: 0xf2c230, line: 0xf2c230, native: "चाँदनी चौक", en: "CHANDNI CHOWK", font: "Noto Sans Devanagari" },
  mumbai: { body: 0xf2f2f0, stripe: 0x2356a8, line: 0x2356a8, native: "दादर", en: "DADAR", font: "Noto Sans Devanagari" },
  chennai: { body: 0xdfe3e8, stripe: 0x1f5fb3, line: 0x1f5fb3, native: "மெரினா நகர்", en: "MARINA NAGAR", font: "Noto Sans Tamil" },
  // Namma Metro's Purple Line runs through Majestic.
  bengaluru: { body: 0x6a2c91, stripe: 0xd9d6e8, line: 0x6a2c91, native: "ಮೆಜೆಸ್ಟಿಕ್", en: "MAJESTIC", font: "Noto Sans Kannada" },
  hyderabad: { body: 0xe9ecef, stripe: 0x2a5caa, line: 0xc8322b, native: "చార్మినార్", en: "CHARMINAR", font: "Noto Sans Telugu" },
  kochi: { body: 0xeaf2f0, stripe: 0x1a9e9a, line: 0x1a9e9a, native: "ഫോർട്ട് കൊച്ചി", en: "FORT KOCHI", font: "Noto Sans Malayalam" },
  ahmedabad: { body: 0xf2f2f0, stripe: 0x2a5caa, line: 0xe86a2c, native: "માણેક ચોક", en: "MANEK CHOWK", font: "Noto Sans Gujarati" },
};

/* ------------------------------------------------------------------ *
 * Schedule
 * ------------------------------------------------------------------ */

export type Schedule = {
  /** Track runs from -reach to +reach along the viaduct. */
  reach: number;
  /** Station centre along the viaduct. */
  station: number;
  cruise: number;
  accel: number;
  dwell: number;
  /** Time spent out of the world before the next run. */
  layover: number;
};

/** Duration of one full run including dwell and layover. */
export function schedulePeriod(s: Schedule): number {
  const brake = (s.cruise * s.cruise) / (2 * s.accel);
  const dA = s.station + s.reach;
  const dB = s.reach - s.station;
  const tA = (dA - brake) / s.cruise + s.cruise / s.accel;
  const tB = s.cruise / s.accel + (dB - brake) / s.cruise;
  return tA + s.dwell + tB + s.layover;
}

/**
 * Where a train is `t` seconds into its cycle, running from -reach to +reach:
 * cruise in, brake to a stop at the station, dwell, accelerate out, cruise to
 * the far end, then lay over off-screen. Also reports whether it is standing
 * at the platform (doors open).
 */
export function trainPosition(s: Schedule, t: number): { pos: number; speed: number; atPlatform: boolean } {
  const period = schedulePeriod(s);
  let u = ((t % period) + period) % period;
  const brake = (s.cruise * s.cruise) / (2 * s.accel);
  const dA = s.station + s.reach;
  const dB = s.reach - s.station;

  // Arrival: cruise, then brake.
  const cruiseA = (dA - brake) / s.cruise;
  if (u < cruiseA) return { pos: -s.reach + s.cruise * u, speed: s.cruise, atPlatform: false };
  u -= cruiseA;
  const brakeT = s.cruise / s.accel;
  if (u < brakeT) {
    const d = s.cruise * u - 0.5 * s.accel * u * u;
    return { pos: s.station - brake + d, speed: s.cruise - s.accel * u, atPlatform: false };
  }
  u -= brakeT;
  if (u < s.dwell) return { pos: s.station, speed: 0, atPlatform: true };
  u -= s.dwell;
  // Departure: accelerate, then cruise out.
  if (u < brakeT) return { pos: s.station + 0.5 * s.accel * u * u, speed: s.accel * u, atPlatform: false };
  u -= brakeT;
  const cruiseB = (dB - brake) / s.cruise;
  if (u < cruiseB) return { pos: s.station + brake + s.cruise * u, speed: s.cruise, atPlatform: false };
  return { pos: s.reach + 1000, speed: 0, atPlatform: false };
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

const _c = new THREE.Color();
function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  _c.setHex(hex);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) _c.toArray(cols, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) =>
  paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);

const CONCRETE = 0xcfcac0;
const CONCRETE_DARK = 0xb4afa5;
const DECK_Y = 10.2; // rail level
const DECK_W = 8.6;
const TRACK_OFF = 1.75;

/** One train of three cars, facing +z, vertex-coloured; glass separate. */
function makeTrain(line: MetroLine): { body: THREE.BufferGeometry; glass: THREE.BufferGeometry; length: number } {
  const carL = 19;
  const gap = 0.6;
  const W = 2.9;
  const H = 3.5;
  const parts: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const total = carL * 3 + gap * 2;

  for (let c = 0; c < 3; c++) {
    const z0 = -total / 2 + c * (carL + gap) + carL / 2;
    const y = 0.55 + H / 2;
    parts.push(box(W, H, carL, 0, y, z0, line.body));
    // Stripe band under the windows, and a darker skirt.
    parts.push(box(W + 0.02, 0.28, carL - 0.2, 0, 1.45, z0, line.stripe));
    parts.push(box(W - 0.2, 0.45, carL - 1.4, 0, 0.35, z0, 0x3a3d42));
    // Roof equipment pods.
    parts.push(box(1.6, 0.25, 3.2, 0, 0.55 + H + 0.12, z0 - 4, 0xa9adb3));
    parts.push(box(1.6, 0.25, 3.2, 0, 0.55 + H + 0.12, z0 + 4, 0xa9adb3));
    for (const sx of [-1, 1]) {
      // Window band.
      glass.push(new THREE.BoxGeometry(0.04, 1.0, carL - 1.2).translate(sx * (W / 2 + 0.01), 2.45, z0));
      // Four doors a side.
      for (let d = 0; d < 4; d++) {
        const dz = z0 - carL / 2 + 2.4 + d * ((carL - 4.8) / 3);
        parts.push(box(0.05, 2.05, 1.4, sx * (W / 2 + 0.02), 1.65, dz, 0x5a5f66));
        glass.push(new THREE.BoxGeometry(0.03, 0.9, 1.0).translate(sx * (W / 2 + 0.05), 2.2, dz));
      }
    }
  }
  // Cab ends: a raked windscreen band and headlamps at each end.
  for (const end of [1, -1]) {
    const z = end * (total / 2 + 0.02);
    glass.push(new THREE.BoxGeometry(W - 0.5, 1.1, 0.04).translate(0, 2.6, z));
    parts.push(box(W - 0.3, 0.3, 0.06, 0, 1.45, z, line.stripe));
    for (const sx of [-0.95, 0.95]) parts.push(box(0.3, 0.14, 0.06, sx, 1.0, z, 0xfff3c8));
  }
  const body = BufferGeometryUtils.mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  const glassGeo = BufferGeometryUtils.mergeGeometries(glass, false)!;
  glass.forEach((p) => p.dispose());
  return { body, glass: glassGeo, length: total };
}

function stationBoard(line: MetroLine): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext("2d")!;
  const paintBoard = () => {
    ctx.fillStyle = "#1c2230";
    ctx.fillRect(0, 0, 1024, 192);
    ctx.fillStyle = `#${new THREE.Color(line.line).getHexString()}`;
    ctx.fillRect(0, 0, 1024, 18);
    // Metro roundel.
    ctx.beginPath();
    ctx.arc(96, 104, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 70px "${line.font}", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("M", 96, 108);
    ctx.textAlign = "left";
    ctx.font = `600 64px "${line.font}", system-ui, sans-serif`;
    ctx.fillText(line.native, 190, 78);
    ctx.font = `600 40px "${line.font}", system-ui, sans-serif`;
    ctx.fillText(line.en, 192, 148);
  };
  paintBoard();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  document.fonts
    ?.load(`600 64px "${line.font}"`, line.native)
    .then(() => {
      paintBoard();
      tex.needsUpdate = true;
    })
    .catch((err: unknown) => console.warn(`[metro] "${line.font}" failed to load for the station board`, err));
  return tex;
}

/* ------------------------------------------------------------------ *
 * Metro
 * ------------------------------------------------------------------ */

export type MetroOpts = {
  line: MetroLine;
  /** Road centreline x the viaduct runs along (the road runs along z). */
  x: number;
  /** Viaduct extends from -reach to +reach in z. */
  reach: number;
  /** Station centre in z. */
  stationZ: number;
  /** Cross-street centrelines; piers keep out of their junction boxes. */
  crossLines: number[];
  roadWidth: number;
  groundY: number;
};

export type Metro = {
  group: THREE.Group;
  colliders: Box[];
  /** True while a train stands at the platform on either track. */
  trainAtPlatform(): boolean;
  update(t: number): void;
  dispose(): void;
};

export function createMetro(opts: MetroOpts): Metro {
  const { line, x } = opts;
  const group = new THREE.Group();
  group.name = "metro";
  const colliders: Box[] = [];
  const parts: THREE.BufferGeometry[] = [];

  const junction = (z: number, clear: number) =>
    opts.crossLines.some((c) => Math.abs(z - c) < opts.roadWidth / 2 + clear);

  // --- deck: U-girder (floor slab plus two upstand walls), full length.
  const len = opts.reach * 2;
  const deckBase = DECK_Y - 0.55;
  parts.push(box(DECK_W, 0.55, len, x, deckBase + 0.275, 0, CONCRETE));
  for (const sx of [-1, 1]) {
    parts.push(box(0.28, 1.25, len, x + sx * (DECK_W / 2 - 0.14), DECK_Y + 0.4, 0, CONCRETE));
    // Soffit shadow line.
    parts.push(box(0.3, 0.9, len, x + sx * (DECK_W / 2 - 0.9), deckBase - 0.45, 0, CONCRETE_DARK));
  }
  // Rails: two pairs, on sleeper plinths.
  for (const tx of [-TRACK_OFF, TRACK_OFF]) {
    parts.push(box(2.2, 0.2, len, x + tx, DECK_Y + 0.1, 0, 0x8d8a83));
    for (const r of [-0.76, 0.76]) parts.push(box(0.08, 0.14, len, x + tx + r, DECK_Y + 0.27, 0, 0x5e6167));
  }

  // --- piers: single column with a hammerhead cap, in the median.
  const pierH = deckBase - 1.3;
  for (let z = -opts.reach + 12; z < opts.reach - 6; z += 26) {
    if (junction(z, 3)) continue;
    const col = new THREE.CylinderGeometry(0.8, 0.9, pierH, 8).translate(x, pierH / 2 + opts.groundY, z);
    parts.push(paint(col, CONCRETE));
    // Hammerhead: a tapered cap under the deck.
    const cap = new THREE.CylinderGeometry(DECK_W / 2 - 0.6, 1.0, 1.3, 4, 1).rotateY(Math.PI / 4);
    cap.scale(1, 1, 0.34).translate(x, pierH + 0.65 + opts.groundY, z);
    parts.push(paint(cap, CONCRETE_DARK));
    parts.push(box(2.2, 0.35, 2.2, x, opts.groundY + 0.17, z, 0xe8c547)); // painted crash plinth
    colliders.push({ x, z, hw: 1.1, hd: 1.1 });
  }

  // Viaduct parapet OHE masts (overhead wire) every 36m.
  for (let z = -opts.reach + 18; z < opts.reach; z += 36) {
    for (const sx of [-1, 1]) {
      parts.push(box(0.18, 4.2, 0.18, x + sx * (DECK_W / 2 - 0.35), DECK_Y + 2.6, z, 0x6d7076));
      parts.push(box(DECK_W / 2 - 0.6, 0.12, 0.12, x + sx * (DECK_W / 4), DECK_Y + 4.5, z, 0x6d7076));
    }
  }

  // --- station: platforms either side of the tracks, a canopy, glazed
  // walls, and a stair tower down to each footpath.
  const sLen = 34;
  const sz = opts.stationZ;
  const platW = 3.2;
  const outer = DECK_W / 2 + platW;
  for (const sx of [-1, 1]) {
    const px = x + sx * (DECK_W / 2 + platW / 2 - 0.2);
    parts.push(box(platW + 0.4, 0.6, sLen, px, DECK_Y - 0.05, sz, CONCRETE));
    // Yellow tactile edge.
    parts.push(box(0.4, 0.04, sLen, x + sx * (DECK_W / 2 - 0.1), DECK_Y + 0.27, sz, 0xf2c230));
    // Glazed side wall with mullions.
    parts.push(box(0.2, 1.0, sLen, x + sx * outer, DECK_Y + 0.75, sz, line.line));
    for (let i = 0; i <= 8; i++) {
      parts.push(box(0.16, 3.2, 0.16, x + sx * outer, DECK_Y + 1.8, sz - sLen / 2 + (sLen * i) / 8, 0x6d7076));
    }
    // Station floor soffit and support columns down to the footpath edge.
    for (const cz of [sz - sLen / 2 + 3, sz, sz + sLen / 2 - 3]) {
      const cx = x + sx * (outer - 0.6);
      const c = new THREE.CylinderGeometry(0.45, 0.5, deckBase, 8).translate(cx, deckBase / 2 + opts.groundY, cz);
      parts.push(paint(c, CONCRETE));
      colliders.push({ x: cx, z: cz, hw: 0.6, hd: 0.6 });
    }
    // Stair tower: a covered flight climbing along the footpath.
    // Half in the parking strip, half in the kerb zone: clear of the walking
    // lines on the footpath and of the two-wheeler lane.
    const stx = x + sx * (opts.roadWidth / 2 + 0.1);
    const stz = sz + sx * (sLen / 2 - 5);
    const flight = new THREE.BoxGeometry(1.9, 0.4, 13);
    flight.rotateX(-Math.atan2(DECK_Y - 0.6, 13) * sx);
    flight.translate(stx, DECK_Y / 2, stz - sx * 1.5);
    parts.push(paint(flight, CONCRETE_DARK));
    parts.push(box(2.3, 0.15, 14, stx, DECK_Y + 2.7, stz - sx * 1.5, line.line));
    // Link bridge from the stair head to the platform.
    parts.push(box(Math.abs(outer - opts.roadWidth / 2 - 0.1) + 0.5, 0.4, 2.2, (stx + x + sx * outer) / 2, DECK_Y - 0.2, stz + sx * 5, CONCRETE));
    colliders.push({ x: stx, z: stz - sx * 1.5, hw: 1.2, hd: 7 });
  }
  // Canopy: a shallow gable over the whole station.
  for (const sx of [-1, 1]) {
    const roof = new THREE.BoxGeometry(outer + 0.8, 0.16, sLen + 2);
    roof.rotateZ(sx * -0.12);
    roof.translate(x + sx * (outer + 0.8) / 2, DECK_Y + 3.6, sz);
    parts.push(paint(roof, 0xe6e3dc));
  }
  parts.push(box(outer * 2 + 1.2, 0.5, sLen + 2.2, x, DECK_Y + 3.2, sz, line.line));

  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const structure = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(parts, false)!, material);
  parts.forEach((p) => p.dispose());
  structure.castShadow = true;
  structure.receiveShadow = true;
  group.add(structure);

  // Name boards on both faces of the station fascia.
  const tex = stationBoard(line);
  if (tex) {
    const boardMat = new THREE.MeshLambertMaterial({ map: tex });
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), boardMat);
      b.position.set(x + sx * (outer + 0.62), DECK_Y + 2.3, sz);
      b.rotation.y = sx * (Math.PI / 2);
      group.add(b);
    }
  }

  // --- trains
  const train = makeTrain(line);
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1b2331, emissive: 0x2a3548, emissiveIntensity: 0.3 });
  const schedule: Schedule = {
    reach: opts.reach + train.length,
    station: sz,
    cruise: 15,
    accel: 1.1,
    dwell: 14,
    layover: 22,
  };
  const period = schedulePeriod(schedule);
  const trains = [-1, 1].map((dir, i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(train.body, material);
    body.castShadow = true;
    g.add(body, new THREE.Mesh(train.glass, glassMat));
    // Same side of the road as the traffic below runs in this direction.
    g.position.set(x + dir * TRACK_OFF, DECK_Y + 0.25, 0);
    g.rotation.y = dir === -1 ? 0 : Math.PI;
    group.add(g);
    // Offset the second train by half a period so they cross mid-route.
    return { g, dir, offset: i * period * 0.5, atPlatform: false };
  });

  return {
    group,
    colliders,
    trainAtPlatform: () => trains.some((t) => t.atPlatform),
    update(t) {
      for (const tr of trains) {
        // Each train runs its schedule in its own direction of travel; the
        // mirrored one sees the station at -stationZ.
        const s = tr.dir === -1 ? schedule : { ...schedule, station: -schedule.station };
        const p = trainPosition(s, t + tr.offset);
        tr.g.position.z = tr.dir === -1 ? p.pos : -p.pos;
        tr.atPlatform = p.atPlatform;
      }
    },
    dispose() {
      train.body.dispose();
      train.glass.dispose();
      tex?.dispose();
    },
  };
}
