import * as THREE from 'three';
import { mergeSimple } from '../../kit.js';
import { chamferBox, tubeY, fillMasks, paintMasks, clothGeometry } from '../../util.js';

/**
 * WORLD — Bengaluru vehicles.
 *
 * The auto-rickshaw is the hero asset of this level, so it is authored from the
 * real vehicle rather than from a silhouette. Bajaj RE, the one that is
 * actually on the road:
 *
 *   length 2.635 m · width 1.30 m · height 1.71 m · wheelbase 2.00 m
 *   wheel 4.00-8, so ~0.45 m outside diameter · track 1.115 m
 *   one wheel at the front on a motorcycle fork, two driven at the rear
 *
 * Bengaluru livery is a BLACK body with a YELLOW canopy and hood band, which is
 * what the reference image shows and what distinguishes it from the all-green
 * CNG autos of Delhi or the all-yellow ones of Chennai.
 *
 * The thing that makes an auto read as an auto, in order: the three-wheel
 * stance, the tall narrow canopy with an open back, the single front wheel
 * under a mudguard, and the sheet-metal hood curving down to a point. Get those
 * four and the rest is detail.
 *
 * LOCAL SPACE: +Z is forward (the front wheel), +Y up, origin on the ground
 * between the rear wheels — so `A.put(id, x, y, z, ry)` stands it on the road.
 */

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

function mat(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

/**
 * Local part accumulator, same shape as the one in props.js. Kept here rather
 * than exported from there so this level owns its own vehicle geometry and
 * cannot disturb the shared prop library's RNG stream.
 *
 * Mask convention as everywhere: r = edge wear, g = grime, b = extra AO.
 */
class PB {
  constructor() {
    this.list = [];
  }

  _push(g, wear, grime, ao) {
    if (!g.getAttribute('color')) fillMasks(g, 0.2, 0, 0);
    if (wear !== 1 || grime > 0 || ao > 0) {
      const c = g.getAttribute('color');
      for (let i = 0; i < c.count; i++) {
        c.setXYZ(
          i,
          Math.min(1, c.getX(i) * wear),
          Math.min(1, Math.max(c.getY(i), grime)),
          Math.min(1, Math.max(c.getZ(i), ao))
        );
      }
    }
    this.list.push(g);
    return g;
  }

  box(sx, sy, sz, x = 0, y = 0, z = 0, o = {}) {
    const g = chamferBox(sx, sy, sz, o.bevel ?? 0.01);
    g.applyMatrix4(mat(x, y, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0));
    return this._push(g, o.wear ?? 1, o.grime ?? 0, o.ao ?? 0);
  }

  cyl(r, h, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.CylinderGeometry(
      (o.taper ?? 1) * r,
      r,
      h,
      o.radial ?? 12,
      o.seg ?? 1,
      o.open ?? false
    );
    g.applyMatrix4(mat(x, y, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0));
    return this._push(g, o.wear ?? 1, o.grime ?? 0, o.ao ?? 0);
  }

  geo(g, x = 0, y = 0, z = 0, o = {}) {
    g.applyMatrix4(
      mat(x, y, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)
    );
    return this._push(g, o.wear ?? 1, o.grime ?? 0, o.ao ?? 0);
  }

  build() {
    const g = mergeSimple(this.list);
    for (const p of this.list) p.dispose();
    this.list.length = 0;
    return g;
  }
}

/** A road wheel: tyre, sidewall shoulder and a hub. Axis along X. */
function wheel(p, x, y, z, r = 0.225, width = 0.11) {
  const o = { radial: 14, rz: Math.PI / 2, grime: 0.55 };
  // tyre
  p.cyl(r, width, x, y, z, o);
  // sidewall relief, so the tyre is not one smooth drum
  p.cyl(r * 0.82, width * 1.06, x, y, z, { ...o, grime: 0.4 });
  // rim + hub
  p.cyl(r * 0.52, width * 1.1, x, y, z, { ...o, radial: 12, grime: 0.3, wear: 0.7 });
  p.cyl(r * 0.16, width * 1.3, x, y, z, { ...o, radial: 8, grime: 0.2, wear: 0.5 });
}

// ========================================================= auto-rickshaw ==
export function autoRickshaw(rng) {
  // TWO geometries, because one InstancedMesh is one material. The Bengaluru
  // auto is black steel with a yellow canvas top, and that two-tone IS the
  // vehicle — faking it with a single mid material loses the whole read. So
  // `body` collects everything painted black or bare, `yel` collects the
  // canopy, valances, rolled flaps and the hood band. Both are placed at the
  // same transform, costing one extra draw call for the whole level.
  const p = new PB();
  const yel = new PB();

  const W = 1.3; // overall width
  const WB = 2.0; // wheelbase
  const rWheel = 0.225;
  const axleY = rWheel;
  const zRear = -WB * 0.42; // rear axle
  const zFront = WB * 0.58; // front wheel

  // ---------------------------------------------------------------- floor --
  // The tub: a shallow steel pan the whole vehicle is built on.
  p.box(W * 0.94, 0.09, 1.72, 0, 0.34, -0.16, { bevel: 0.02, grime: 0.5 });
  // side sills
  for (const s of [-1, 1]) {
    p.box(0.07, 0.2, 1.66, s * (W * 0.46), 0.42, -0.16, { bevel: 0.02, grime: 0.6, wear: 0.8 });
  }

  // ----------------------------------------------------------------- hood --
  // The sheet-metal nose. This is the signature curve: it starts at the
  // floor pan, rises over the driver's legs, and tapers to a rounded point at
  // the front wheel. Built as a stack of boxes with decreasing width and a
  // slight pitch, which is cheaper than a loft and reads the same at 3 m.
  const HOOD = [
    // [z,      y,     w,     h,     rx]
    [0.28, 0.5, W * 0.9, 0.36, 0.0],
    [0.62, 0.6, W * 0.82, 0.34, -0.1],
    [0.94, 0.66, W * 0.68, 0.3, -0.18],
    [1.18, 0.66, W * 0.5, 0.26, -0.26],
    [1.34, 0.62, W * 0.3, 0.22, -0.34],
  ];
  for (const [z, y, w, h, rx] of HOOD) {
    p.box(w, h, 0.36, 0, y, z, { bevel: 0.05, rx, grime: 0.3, wear: 0.9 });
  }
  // The yellow band across the hood front — Bengaluru livery.
  yel.box(W * 0.56, 0.16, 0.06, 0, 0.72, 1.22, { bevel: 0.02, rx: -0.3, wear: 0.8 });

  // headlamp in the nose
  p.cyl(0.105, 0.09, 0, 0.72, 1.36, { radial: 14, rx: Math.PI / 2 + 0.25, wear: 0.5 });
  p.cyl(0.085, 0.03, 0, 0.735, 1.4, { radial: 14, rx: Math.PI / 2 + 0.25, wear: 0.3 });
  // the two little indicator pods either side
  for (const s of [-1, 1]) {
    p.cyl(0.035, 0.05, s * 0.19, 0.66, 1.3, { radial: 8, rx: Math.PI / 2, wear: 0.4 });
  }

  // ---------------------------------------------------------- front wheel --
  // Motorcycle fork, mudguard, single wheel.
  wheel(p, 0, axleY, zFront, rWheel, 0.09);
  for (const s of [-1, 1]) {
    p.cyl(0.026, 0.62, s * 0.075, axleY + 0.3, zFront - 0.02, {
      radial: 7,
      rx: 0.16,
      grime: 0.4,
    });
  }
  // mudguard: an arc of short boxes over the tyre
  for (let i = 0; i < 5; i++) {
    const a = -0.55 + (i / 4) * 1.65;
    p.box(0.24, 0.02, 0.13, 0, axleY + Math.cos(a) * 0.3, zFront + Math.sin(a) * 0.3, {
      bevel: 0.006,
      rx: -a,
      grime: 0.55,
      wear: 0.8,
    });
  }

  // ----------------------------------------------------------- rear wheels --
  for (const s of [-1, 1]) wheel(p, s * 0.5575, axleY, zRear, rWheel, 0.11);
  // rear axle housing + the engine lump behind the seat
  p.cyl(0.055, 1.02, 0, axleY, zRear, { radial: 8, rz: Math.PI / 2, grime: 0.7 });
  p.box(0.44, 0.34, 0.42, 0, 0.42, zRear - 0.16, { bevel: 0.03, grime: 0.8, wear: 0.7 });

  // ---------------------------------------------------------------- cabin --
  // Four corner posts carrying the canopy. Thin tube — this is what makes the
  // silhouette read as open-sided rather than as a van.
  const postY = 1.62;
  const POSTS = [
    [-W * 0.46, 0.52],
    [W * 0.46, 0.52],
    [-W * 0.46, -0.92],
    [W * 0.46, -0.92],
  ];
  for (const [px, pz] of POSTS) {
    p.cyl(0.022, postY - 0.5, px, 0.5 + (postY - 0.5) / 2, pz, { radial: 7, wear: 0.6 });
  }
  // roof rails
  for (const s of [-1, 1]) {
    p.cyl(0.02, 1.5, s * W * 0.46, postY, -0.2, { radial: 7, rx: Math.PI / 2, wear: 0.6 });
  }
  p.cyl(0.02, W * 0.92, 0, postY, 0.52, { radial: 7, rz: Math.PI / 2, wear: 0.6 });
  p.cyl(0.02, W * 0.92, 0, postY, -0.92, { radial: 7, rz: Math.PI / 2, wear: 0.6 });

  // ---------------------------------------------------------------- canopy --
  // Yellow canvas over the frame, sagging slightly between the rails.
  const roof = clothGeometry(W * 0.96, 1.5, { segX: 5, segY: 6, sag: 0.035, wrinkle: 0.012 });
  yel.geo(roof, 0, postY + 0.015, -0.2, { rx: -Math.PI / 2, grime: 0.35, wear: 0.8 });
  // the stiff front valance the roof is stretched over
  yel.box(W * 0.94, 0.12, 0.04, 0, postY - 0.03, 0.53, { bevel: 0.01, wear: 0.85 });
  // rear valance, cut higher so the open back reads
  yel.box(W * 0.94, 0.2, 0.04, 0, postY - 0.08, -0.93, { bevel: 0.01, wear: 0.85 });
  // side flaps rolled up and tied at the rail — always, in dry weather
  for (const s of [-1, 1]) {
    yel.cyl(0.05, 1.2, s * W * 0.45, postY - 0.11, -0.2, {
      radial: 8,
      rx: Math.PI / 2,
      grime: 0.4,
      wear: 0.9,
    });
  }

  // ------------------------------------------------------------ windscreen --
  p.box(W * 0.82, 0.5, 0.02, 0, 1.12, 0.6, { bevel: 0.008, rx: -0.2, wear: 0.4 });
  // screen frame
  p.box(W * 0.86, 0.55, 0.03, 0, 1.11, 0.585, { bevel: 0.01, rx: -0.2, wear: 0.7, grime: 0.3 });

  // ---------------------------------------------------------------- seats --
  // Driver: a small pad, no backrest to speak of.
  p.box(0.5, 0.1, 0.4, 0, 0.62, 0.02, { bevel: 0.03, grime: 0.5 });
  p.box(0.5, 0.34, 0.09, 0, 0.8, -0.16, { bevel: 0.03, rx: 0.12, grime: 0.5 });
  // Passenger bench across the back, and its high vinyl backrest.
  p.box(W * 0.9, 0.13, 0.52, 0, 0.63, -0.66, { bevel: 0.04, grime: 0.45 });
  p.box(W * 0.9, 0.44, 0.1, 0, 0.88, -0.9, { bevel: 0.04, rx: 0.1, grime: 0.45 });

  // ------------------------------------------------------------ handlebar --
  // The scooter-style bar. Very visible through the open side.
  p.cyl(0.018, 0.62, 0, 0.98, 0.42, { radial: 7, rz: Math.PI / 2, wear: 0.4 });
  p.cyl(0.03, 0.3, 0, 0.8, 0.5, { radial: 7, rx: 0.4, wear: 0.5 });
  for (const s of [-1, 1]) {
    p.cyl(0.024, 0.12, s * 0.26, 0.98, 0.42, { radial: 7, rz: Math.PI / 2, grime: 0.4 });
    // mirrors on stalks
    p.cyl(0.008, 0.16, s * 0.3, 1.06, 0.42, { radial: 5, wear: 0.5 });
    p.box(0.11, 0.07, 0.02, s * 0.3, 1.15, 0.42, { bevel: 0.008, ry: s * 0.3, wear: 0.4 });
  }
  // the meter, on its bracket outside the windscreen
  p.box(0.11, 0.09, 0.08, -0.3, 1.06, 0.66, { bevel: 0.012, ry: 0.3, wear: 0.5 });

  // ------------------------------------------------------- number plates ---
  // Front and rear. Kept as clean geometry so M2's signage system can drop a
  // real "KA 01 AB 1234" texture onto them later.
  p.box(0.28, 0.11, 0.012, 0, 0.5, 1.29, { bevel: 0.004, rx: -0.3, wear: 0.3 });
  p.box(0.3, 0.12, 0.012, 0, 0.52, -1.06, { bevel: 0.004, wear: 0.3 });

  // rear bumper bar
  p.cyl(0.022, W * 0.8, 0, 0.4, -1.1, { radial: 7, rz: Math.PI / 2, grime: 0.6, wear: 0.7 });

  // Weather both: dirt climbs from the road, and the canopy bleaches on top.
  const weather = (g) =>
    paintMasks(g, (px, py, pz, nx, ny, nz, out) => {
      const road = 1 - Math.min(1, py / 0.75);
      out[1] = Math.min(1, out[1] + road * road * 0.55);
      if (ny > 0.4 && py > 1.4) out[0] = Math.min(1, out[0] + 0.4);
    });

  return { body: weather(p.build()), canopy: weather(yel.build()) };
}

// ================================================================ register ==
/**
 * Register the vehicle prototypes. Called from the level's build(), on the
 * level's own RNG stream.
 */
export function registerVehicles(A, rng) {
  const auto = autoRickshaw(rng);
  A.proto('auto_body', { geo: auto.body, key: 'auto_black', skirt: 0.9, maxDist: 120 });
  A.proto('auto_canopy', { geo: auto.canopy, key: 'auto_yellow', maxDist: 120 });
  return A;
}

/**
 * Park autos along the street. Real ones cluster: a stand near the junction, a
 * couple nosed into the kerb outside the shops, one abandoned in a side lane.
 */
export function placeVehicles(A, rng) {
  // All of these are on open ground — the carriageway, the kerb line, or the
  // gravel auto stand in the east lane (ALLEYS[3], z -20..-12). Parking an auto
  // inside a building footprint is the same class of mistake as an alley rect
  // that overlaps one, and just as invisible until you stand there.
  const STANDS = [
    // the stand itself, nosed in a rough rank
    [7.6, -14.2, 0.2],
    [8.9, -14.6, 0.12],
    [10.2, -14.3, 0.24],
    [7.8, -17.6, 2.9],
    [9.4, -18.0, 3.05],
    // nosed into the kerb outside the shops
    [-4.2, 12.0, 1.35],
    [-4.3, 3.2, 1.42],
    [4.3, -3.5, -1.5],
    [4.4, 18.5, -1.45],
    // moving / waiting on the carriageway
    [2.0, 27.0, 3.05],
    [-2.2, -30.0, 0.08],
    [2.6, -38.0, 3.14],
  ];
  for (const [x, z, ry] of STANDS) {
    // Both halves share one transform, including the yaw jitter.
    const yaw = ry + rng.range(-0.05, 0.05);
    A.put('auto_body', x, 0, z, yaw);
    A.put('auto_canopy', x, 0, z, yaw);
  }
}
