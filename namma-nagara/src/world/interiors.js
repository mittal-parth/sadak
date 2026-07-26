import * as THREE from 'three';
import { BOX, BOX_FINE, BOX_THIN, IDENT, LL, rubbleMound } from './kit.js';
import { clothGeometry, patchGeometry, chamferBox, fillMasks } from './util.js';

/**
 * WORLD — interior furnishing.
 *
 * Rooms get furniture against the walls, clutter in the middle, something on
 * every horizontal surface and rubbish in the corners. An interior screenshot
 * has to be interesting on its own, so each room type has a deliberate silhouette
 * mix: tall (shelves, cabinets), mid (tables, counters, crate stacks) and low
 * (rugs, sacks, litter) plus one or two hanging elements to break up the
 * ceiling.
 */

/** Furnish one room. Rect is in level space; y is the floor surface. */
export function furnishRoom(A, rng, r) {
  const { kind, x0, z0, x1, z1, y, h } = r;
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  if (w < 1.2 || d < 1.2) return;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const m = 0.45; // wall margin

  // floor dressing everybody gets: dust patches, plaster fall, litter
  const patches = rng.int(2, 4);
  for (let i = 0; i < patches; i++) {
    const g = patchGeometry(rng, rng.range(0.4, 1.1), { lobes: 8, wobble: 0.5 });
    A.addOnce(
      'dirt',
      g,
      LL(IDENT, rng.range(x0 + 0.3, x1 - 0.3), y + 0.012, rng.range(z0 + 0.3, z1 - 0.3), rng.float() * 6.28),
      { masks: [0.1, 0.8, 0.5] }
    );
  }
  for (let i = 0; i < rng.int(4, 9); i++) {
    A.put(
      'litter',
      rng.range(x0 + 0.2, x1 - 0.2),
      y + 0.015,
      rng.range(z0 + 0.2, z1 - 0.2),
      rng.float() * 6.28,
      rng.range(0.7, 1.3),
      [1, 1.3, 1]
    );
  }
  for (let i = 0; i < rng.int(2, 5); i++) {
    A.put(
      rng.pick(['brick_a', 'brick_b', 'rock_b']),
      rng.range(x0 + 0.25, x1 - 0.25),
      y + 0.04,
      rng.range(z0 + 0.25, z1 - 0.25),
      rng.float() * 6.28,
      rng.range(0.5, 1.0),
      [1, 1.4, 1]
    );
  }

  switch (kind) {
    case 'shop':
      furnishShop(A, rng, r, cx, cz, w, d, m);
      break;
    case 'living':
      furnishLiving(A, rng, r, cx, cz, w, d, m);
      break;
    case 'storage':
      furnishStorage(A, rng, r, cx, cz, w, d, m);
      break;
    case 'ruin':
      furnishRuin(A, rng, r, cx, cz, w, d, m);
      break;
    default:
      furnishStorage(A, rng, r, cx, cz, w, d, m);
      break;
  }

  // Everything above dresses the MIDDLE of the room. An interior camera is
  // almost always 2-3 m off a wall, so the walls and the wall/floor junction
  // are most of the frame and have to carry the shot on their own.
  dressWalls(A, rng, r);
  dressCeiling(A, rng, r);

  // hanging bulb, roughly central, offset so it isn't dead centre
  if (kind !== 'ruin' || rng.float() < 0.5) {
    hangingBulb(A, rng, cx + rng.range(-0.8, 0.8), y + h - 0.05, cz + rng.range(-0.8, 0.8), rng);
  }
}

/**
 * WALL DRESSING.
 *
 * Runs on every furnished room, along all four walls. A bare interior wall is
 * the single flattest thing a renderer can show you, and the interior shot
 * scored lowest of the eleven for exactly that reason: "zero props, bare stud
 * walls and empty boxes". Each wall gets, at random:
 *
 *   - a plank shelf on two brackets with goods on it
 *   - surface-run electrical conduit and a junction box (every building here
 *     is wired on the surface, and a 3 m vertical line breaks a flat panel
 *     better than any amount of noise)
 *   - something leaning against it at 8-12 degrees
 *   - a row of objects standing ON the floor AGAINST the skirting
 *   - a swept wedge of dust and plaster fall in the junction itself
 *
 * Everything is placed in contact: the leaning objects touch top and bottom,
 * the floor row sits at y, and the dust wedge is a flat patch straddling the
 * line, so nothing reads as a decal pasted onto a plane.
 */
function dressWalls(A, rng, r) {
  const { x0, z0, x1, z1, y, h, kind } = r;
  const sides = [
    { px: (x0 + x1) / 2, pz: z0, tx: 1, tz: 0, nx: 0, nz: 1, len: x1 - x0, yaw: 0 },
    { px: x1, pz: (z0 + z1) / 2, tx: 0, tz: 1, nx: -1, nz: 0, len: z1 - z0, yaw: Math.PI / 2 },
    { px: (x0 + x1) / 2, pz: z1, tx: 1, tz: 0, nx: 0, nz: -1, len: x1 - x0, yaw: 0 },
    { px: x0, pz: (z0 + z1) / 2, tx: 0, tz: -1, nx: 1, nz: 0, len: z1 - z0, yaw: Math.PI / 2 },
  ];

  const at = (s, t, off) => [s.px + s.tx * t + s.nx * off, s.pz + s.tz * t + s.nz * off];

  for (let side = 0; side < 4; side++) {
    const s = sides[side];
    if (s.len < 1.6) continue;
    const half = s.len / 2 - 0.35;
    /**
     * The building's street side is a shopfront: a 3 m hole, not a wall. Any
     * shelf, conduit run or leaning sheet placed on it hangs in mid-air across
     * the opening — which is exactly how it looked the first time round. That
     * face gets floor-level dressing only.
     */
    const isOpening = side === r.street;
    /**
     * ...but the piers each side of that opening are wall, and in the canonical
     * interior camera they are two thirds of the frame. So the opening face is
     * not skipped outright: everything above floor level is confined to the
     * outer 30% of its length, which is pier in every bay layout here.
     */
    const pierT = () =>
      (rng.float() < 0.5 ? -1 : 1) * rng.range(half * 0.62, half) ;
    const anyT = () => rng.range(-half, half);
    const wallT = isOpening ? pierT : anyT;

    // ---- surface conduit: two drops and a run under the ceiling ----------
    if (rng.float() < 0.8) {
      const pipe = A.cache('conduit', () => {
        const g = new THREE.CylinderGeometry(0.016, 0.016, 1, 6, 1);
        fillMasks(g, 0.35, 0.5, 0.1);
        return g;
      });
      const runY = y + h - rng.range(0.18, 0.4);
      const t0 = isOpening ? wallT() : rng.range(-half, 0);
      const t1 = isOpening
        ? t0 + Math.sign(-t0 || 1) * rng.range(0.3, 0.55)
        : t0 + rng.range(0.8, Math.max(1.0, half - t0));
      const [rx0, rz0] = at(s, (t0 + t1) / 2, 0.045);
      A.add(
        'metal_dark',
        pipe,
        LL(IDENT, rx0, runY, rz0, s.yaw, 1, Math.abs(t1 - t0), 1, 0, Math.PI / 2)
      );
      // the drop, plus the junction box it feeds
      const dropT = rng.float() < 0.5 ? t0 : t1;
      const boxY = y + rng.range(1.15, 1.55);
      const [dx, dz] = at(s, dropT, 0.045);
      A.add('metal_dark', pipe, LL(IDENT, dx, (runY + boxY) / 2, dz, 0, 1, runY - boxY, 1));
      A.add('metal_dark', BOX_FINE(A), LL(IDENT, ...insert(at(s, dropT, 0.055), boxY), s.yaw, 0.15, 0.19, 0.09), {
        masks: [0.55, 0.5, 0.2],
      });
      // and a stub of flex hanging out of it
      if (rng.float() < 0.5) {
        A.add(
          'metal_dark',
          pipe,
          LL(IDENT, ...insert(at(s, dropT + 0.06, 0.05), boxY - 0.28), 0, 0.4, 0.34, 0.4)
        );
      }
    }

    // ---- a plank shelf on two brackets, with goods --------------------------
    if (kind !== 'ruin' && rng.float() < 0.55) {
      const sy = y + rng.range(1.05, 1.65);
      const sLen = Math.min(rng.range(isOpening ? 0.6 : 0.9, isOpening ? 1.0 : 1.8), s.len - 0.6);
      const st = isOpening
        ? wallT()
        : rng.range(-half + sLen / 2, half - sLen / 2);
      const [sx, sz] = at(s, st, 0.15);
      A.add('wood_prop_dark', BOX(A), LL(IDENT, sx, sy, sz, s.yaw, sLen, 0.035, 0.28), {
        masks: [0.85, 0.5, 0.15],
      });
      for (const bt of [-1, 1]) {
        const [bx, bz] = at(s, st + bt * (sLen / 2 - 0.12), 0.1);
        A.add('metal_dark', BOX_FINE(A), LL(IDENT, bx, sy - 0.09, bz, s.yaw, 0.03, 0.16, 0.18), {
          masks: [0.6, 0.6, 0.3],
        });
      }
      for (let i = 0; i < rng.int(2, 5); i++) {
        const [gx, gz] = at(s, st + rng.range(-sLen / 2 + 0.12, sLen / 2 - 0.12), rng.range(0.11, 0.2));
        A.put(
          rng.pick(['bottle', 'can', 'box_card_b', 'bucket']),
          gx,
          sy + 0.02,
          gz,
          rng.float() * 6.28,
          rng.range(0.6, 0.95),
          [1, 1.1, 1]
        );
      }
    }

    // ---- something leaning on it -------------------------------------------
    if (!isOpening && rng.float() < 0.5) {
      const lean = rng.range(0.13, 0.22);
      const lt = rng.range(-half, half);
      const lh = rng.range(1.1, 1.8);
      const lw = rng.range(0.5, 1.0);
      const off = 0.06 + (Math.sin(lean) * lh) / 2;
      const [lx, lz] = at(s, lt, off);
      const key = rng.pick(['plywood', 'corrugated', 'wood_prop_dark']);
      // Tip the top INTO the wall. After the yaw the sheet's local -Z faces
      // the wall on sides 0/3 and its +Z on sides 1/2, so the sign of the
      // tilt has to follow the inward normal or the sheet leans out into the
      // room and floats at both ends.
      const leanSign = s.nz !== 0 ? -s.nz : -s.nx;
      A.add(
        key,
        BOX_THIN(A),
        LL(IDENT, lx, y + (Math.cos(lean) * lh) / 2, lz, s.yaw, lw, lh, 0.022, leanSign * lean, 0),
        { masks: [0.7, 0.55, 0.3] }
      );
    }

    // ---- objects standing against the skirting ------------------------------
    const nBase = rng.int(2, 5);
    for (let i = 0; i < nBase; i++) {
      const bt = rng.range(-half, half);
      const [bx, bz] = at(s, bt, rng.range(0.18, 0.42));
      A.put(
        rng.pick([
          'sandbag_a',
          'sandbag_b',
          'crate_b',
          'box_card_a',
          'box_card_b',
          'bucket',
          'jerry_can',
          'tyre_small',
          'barrel_wood',
        ]),
        bx,
        y + 0.01,
        bz,
        rng.float() * 6.28,
        rng.range(0.8, 1.05),
        [1, 1.2, 1]
      );
    }

    // ---- swept dust and plaster fall in the junction ------------------------
    // A wall does not meet a floor on a line. Three flat lobes straddling the
    // join plus a handful of chips is the cheapest thing that grounds a room.
    const nWedge = Math.max(2, Math.round(s.len / 1.5));
    for (let i = 0; i < nWedge; i++) {
      const wt = ((i + rng.range(0.2, 0.8)) / nWedge - 0.5) * s.len;
      const [wx, wz] = at(s, wt, rng.range(0.05, 0.3));
      const g = patchGeometry(rng, rng.range(0.3, 0.75), { lobes: 9, wobble: 0.55 });
      A.addOnce('dirt', g, LL(IDENT, wx, y + 0.011, wz, rng.float() * 6.28, 1, 1, rng.range(0.35, 0.6)), {
        masks: [0.1, 0.85, 0.55],
      });
      if (rng.float() < 0.7) {
        const [cx2, cz2] = at(s, wt + rng.range(-0.3, 0.3), rng.range(0.06, 0.34));
        A.put(
          rng.pick(['brick_a', 'brick_b', 'rock_b', 'litter', 'litter']),
          cx2,
          y + 0.03,
          cz2,
          rng.float() * 6.28,
          rng.range(0.45, 0.9),
          [1, 1.4, 1]
        );
      }
    }

    // ---- a sack or a cloth hung on a nail ----------------------------------
    if (rng.float() < 0.45) {
      const ht = wallT();
      const [hx, hz] = at(s, ht, 0.05);
      const hy = y + rng.range(1.3, 1.85);
      const cl = clothGeometry(rng.range(0.45, 0.8), rng.range(0.6, 1.0), {
        segX: 6,
        segY: 7,
        sag: 0.1,
        wrinkle: 0.09,
        thickness: 0.003,
        fray: 0.014,
        rng,
      });
      A.addOnce(rng.pick(['fabric_red', 'fabric_teal', 'fabric_cream']), cl, LL(IDENT, hx, hy, hz, s.yaw), {
        masks: [0.35, 0.6, 0.3],
      });
      A.add('metal_dark', BOX_FINE(A), LL(IDENT, hx, hy + 0.34, hz, s.yaw, 0.02, 0.02, 0.05), {
        masks: [0.7, 0.5, 0],
      });
    }
  }
}

/** [x, z] + y -> the (x, y, z) argument triple LL wants. */
function insert(xz, y) {
  return [xz[0], y, xz[1]];
}

/**
 * Exposed structure overhead. A ceiling plane with nothing on it reads as the
 * inside of a box; joists, a conduit run and a hanging cable give the top of
 * the frame something to occlude and something for the bulb to rim-light.
 */
function dressCeiling(A, rng, r) {
  const { x0, z0, x1, z1, y, h } = r;
  const w = x1 - x0;
  const d = z1 - z0;
  if (h < 2.1 || w < 1.6 || d < 1.6) return;
  const alongX = w < d;
  const span = alongX ? w : d;
  const runLen = alongX ? d : w;
  const n = Math.max(2, Math.round(runLen / rng.range(0.75, 1.15)));
  for (let i = 1; i < n; i++) {
    const t = (i / n - 0.5) * runLen;
    const jx = alongX ? (x0 + x1) / 2 : (x0 + x1) / 2 + t;
    const jz = alongX ? (z0 + z1) / 2 + t : (z0 + z1) / 2;
    A.add(
      'wood_prop_dark',
      BOX(A),
      LL(
        IDENT,
        jx,
        y + h - 0.06,
        jz,
        alongX ? 0 : Math.PI / 2,
        span - 0.05,
        0.11,
        rng.range(0.055, 0.075)
      ),
      { masks: [0.35, 0.6, 0.45] }
    );
  }
}

/** Bare bulb on a twisted flex — the only light source in most of these rooms. */
export function hangingBulb(A, rng, x, yCeil, z, rngIn) {
  const drop = rng.range(0.35, 0.95);
  const wire = A.cache('bulbwire', () => {
    const g = new THREE.CylinderGeometry(0.006, 0.006, 1, 5, 1);
    fillMasks(g, 0.2, 0.4, 0);
    return g;
  });
  A.add('metal_dark', wire, LL(IDENT, x, yCeil - drop / 2, z, 0, 1, drop, 1));
  A.add('metal_dark', BOX_FINE(A), LL(IDENT, x, yCeil - 0.02, z, 0, 0.09, 0.04, 0.09), {
    masks: [0.5, 0.6, 0.3],
  });
  const bulb = A.cache('bulb', () => {
    const g = new THREE.SphereGeometry(0.045, 10, 7);
    g.scale(1, 1.25, 1);
    fillMasks(g, 0.1, 0.2, 0);
    return g;
  });
  A.add('emissive_warm', bulb, LL(IDENT, x, yCeil - drop - 0.05, z, 0, 1, 1, 1));
  A.add('metal_dark', BOX_FINE(A), LL(IDENT, x, yCeil - drop + 0.02, z, 0, 0.05, 0.06, 0.05), {
    masks: [0.6, 0.4, 0],
  });
  A.interiorLights?.push({ x, y: yCeil - drop - 0.05, z });
}

// ------------------------------------------------------------------- shop --
function furnishShop(A, rng, r, cx, cz, w, d, m) {
  const { x0, z0, x1, z1, y } = r;
  const frontZ = r.street === 0 ? -1 : r.street === 2 ? 1 : 0;
  // rug on the floor
  addRug(A, rng, cx + rng.range(-0.5, 0.5), y, cz + rng.range(-0.5, 0.5), rng.range(1.6, 2.4));

  /**
   * The counter runs PARALLEL to the shop's frontage, a metre inside it, the way
   * a real market shop is arranged: it fills the lower third of the view out of
   * the shop with goods instead of walling the opening off.
   */
  const alongZ = r.street === 1 || r.street === 3;
  const ccx = alongZ ? (r.street === 1 ? x1 - 1.3 : x0 + 1.3) : cx;
  const ccz = alongZ ? cz : frontZ ? cz - frontZ * (d * 0.5 - 1.3) : cz + d * 0.18;
  const clen = Math.min((alongZ ? d : w) - 1.4, 4.4);
  const cSX = alongZ ? 0.74 : clen;
  const cSZ = alongZ ? clen : 0.74;
  A.add('wood_prop_dark', BOX(A), LL(IDENT, ccx, y + 0.9, ccz, 0, cSX, 0.06, cSZ), {
    masks: [0.9, 0.4, 0.1],
  });
  A.add('wood_prop_dark', BOX(A), LL(IDENT, ccx + (alongZ ? -0.32 : 0), y + 0.45, ccz + (alongZ ? 0 : 0.32), 0, alongZ ? 0.09 : cSX, 0.9, alongZ ? cSZ : 0.09), {
    masks: [0.5, 0.6, 0.4],
  });
  A.add('wood_prop_dark', BOX(A), LL(IDENT, ccx, y + 0.28, ccz, 0, cSX - 0.2, 0.04, cSZ - 0.2), {
    masks: [0.4, 0.7, 0.5],
  });
  A.box('wood', ccx, y + 0.45, ccz, cSX, 0.9, cSZ);
  for (let i = 0; i < 6; i++) {
    const t = rng.range(-clen / 2 + 0.3, clen / 2 - 0.3);
    const px = ccx + (alongZ ? rng.range(-0.22, 0.22) : t);
    const pz = ccz + (alongZ ? t : rng.range(-0.22, 0.22));
    if (rng.float() < 0.45) {
      A.put('tray', px, y + 0.94, pz, rng.range(-0.4, 0.4) + (alongZ ? Math.PI / 2 : 0), 1, [1, 1.1, 1]);
      A.put('produce', px, y + 0.96, pz, rng.float() * 6.28, 1, [1, 1, 1]);
    } else {
      A.put(
        rng.pick(['box_card_a', 'box_card_b', 'crate_b', 'bottle', 'can', 'bucket']),
        px,
        y + 0.94,
        pz,
        rng.float() * 6.28,
        rng.range(0.6, 0.9),
        [1, 1.15, 1]
      );
    }
  }
  // sacks and trays stacked on the customer side of the counter
  for (let i = 0; i < rng.int(3, 6); i++) {
    const t = rng.range(-clen / 2, clen / 2);
    const off = rng.range(0.55, 1.05);
    const px = ccx + (alongZ ? (r.street === 1 ? off : -off) : t);
    const pz = ccz + (alongZ ? t : frontZ ? frontZ * off : off);
    A.put(
      rng.pick(['sandbag_a', 'sandbag_b', 'tray', 'crate_b', 'crate_flat']),
      px,
      y + 0.02 + (i % 2) * 0.16,
      pz,
      rng.float() * 6.28,
      rng.range(0.9, 1.05),
      [1, rng.range(1.0, 1.3), 1]
    );
  }
  // Shelving against the side walls — but never against the shop's own
  // frontage, or it blockades the opening the street is seen through.
  for (const sx of [-1, 1]) {
    if ((r.street === 1 && sx > 0) || (r.street === 3 && sx < 0)) continue;
    const n = Math.max(1, Math.floor(d / 1.5) - 1);
    for (let i = 0; i < n; i++) {
      const sz = z0 + 0.8 + i * 1.35;
      if (sz > z1 - 0.7) break;
      if (rng.float() < 0.25) continue;
      A.put(
        'shelf',
        cx + sx * (w / 2 - 0.22),
        y,
        sz,
        sx > 0 ? -Math.PI / 2 : Math.PI / 2,
        rng.range(0.92, 1.08),
        [1, rng.range(0.8, 1.4), 1]
      );
      // goods on the shelves
      for (let k = 0; k < 3; k++) {
        A.put(
          rng.pick(['box_card_b', 'bottle', 'can']),
          cx + sx * (w / 2 - 0.24) + rng.range(-0.1, 0.1),
          y + 0.25 + k * 0.55,
          sz + rng.range(-0.35, 0.35),
          rng.float() * 6.28,
          rng.range(0.7, 1.1),
          [1, 1.2, 1]
        );
      }
    }
  }
  // crate stacks and sacks
  stackCrates(A, rng, x0 + 0.7, y, z1 - 0.9, rng.int(3, 6));
  for (let i = 0; i < rng.int(3, 6); i++) {
    A.put(
      rng.pick(['sandbag_a', 'sandbag_b', 'sandbag_c']),
      rng.range(x0 + 0.4, x0 + 1.6),
      y + 0.02 + (i % 2) * 0.19,
      rng.range(z0 + 0.5, z0 + 2.0),
      rng.float() * 6.28,
      rng.range(0.9, 1.1),
      [1, 1.2, 1]
    );
  }
  A.put('barrel_wood', x1 - 0.6, y, z0 + 0.7, rng.float() * 6.28, 1, [1, 1.2, 1]);
  A.put('table_small', cx - w * 0.28, y, cz - d * 0.28, rng.range(-0.4, 0.4), 1, [1, 1, 1]);
  A.put('chair', cx - w * 0.28 + 0.7, y, cz - d * 0.2, rng.range(2, 4), 1, [1, 1.2, 1]);
  A.box('wood', cx - w * 0.28, y + 0.4, cz - d * 0.28, 1.0, 0.8, 0.8);
}

// ----------------------------------------------------------------- living --
function furnishLiving(A, rng, r, cx, cz, w, d, m) {
  const { x0, z0, x1, z1, y, h } = r;
  addRug(A, rng, cx, y, cz, rng.range(2.0, 2.8));
  A.put('mattress', x0 + 1.1, y, z1 - 0.9, rng.range(-0.1, 0.1), 1, [1, 1.1, 1]);
  A.box('fabric', x0 + 1.1, y + 0.1, z1 - 0.9, 1.9, 0.2, 0.9);
  // blanket
  const bl = clothGeometry(1.5, 0.9, { segX: 7, segY: 6, sag: 0.05, wrinkle: 0.05, thickness: 0.0032, fray: 0.012, rng });
  A.addOnce('fabric_teal', bl, LL(IDENT, x0 + 1.2, y + 0.19, z1 - 1.0, 0, 1, 1, 1, -Math.PI / 2), {
    masks: [0.3, 0.5, 0.2],
  });
  // cushions
  for (let i = 0; i < 3; i++) {
    const g = chamferBox(0.42, 0.14, 0.42, 0.06);
    fillMasks(g, 0.2, 0.4, 0.2);
    A.addOnce(
      rng.pick(['fabric_red', 'fabric_teal', 'fabric_cream']),
      g,
      LL(IDENT, cx + rng.range(-1, 1), y + 0.07, cz + rng.range(-1, 1), rng.float() * 6.28)
    );
  }
  A.put('cabinet', x1 - 0.35, y, cz + rng.range(-0.6, 0.6), -Math.PI / 2, 1, [1, 1, 1]);
  A.box('wood', x1 - 0.35, y + 0.6, cz, 0.5, 1.2, 0.9);
  A.put('table_small', cx + 0.4, y, cz - 0.8, rng.range(0, 0.4), 1, [1, 1, 1]);
  A.put('chair', cx - 0.8, y, cz - 1.2, rng.range(1.5, 2.5), 1, [1, 1.2, 1]);
  A.put('chair', cx + 1.4, y, cz - 0.4, rng.range(-1.5, -0.5), 1, [1, 1.2, 1]);
  // stuff on the small table
  A.put('bottle', cx + 0.4, y + 0.74, cz - 0.8, 0, 1, [1, 1, 1]);
  A.put('can', cx + 0.6, y + 0.74, cz - 0.7, 1, 1, [1, 1, 1]);
  // wall-hung rug / poster
  const wall = clothGeometry(1.7, 1.1, { segX: 8, segY: 7, sag: 0.04, wrinkle: 0.05, thickness: 0.0036, fray: 0.02, bow: -1, rng });
  A.addOnce('fabric_red', wall, LL(IDENT, cx - 0.4, y + 1.65, z0 + 0.09, 0, 1, 1, 1), {
    masks: [0.3, 0.4, 0.2],
  });
  stackCrates(A, rng, x1 - 0.9, y, z0 + 0.8, rng.int(1, 3));
}

// ---------------------------------------------------------------- storage --
function furnishStorage(A, rng, r, cx, cz, w, d, m) {
  const { x0, z0, x1, z1, y } = r;
  const spots = rng.int(4, 7);
  for (let i = 0; i < spots; i++) {
    const sx = rng.range(x0 + 0.6, x1 - 0.6);
    const sz = rng.range(z0 + 0.6, z1 - 0.6);
    const pick = rng.float();
    if (pick < 0.35) stackCrates(A, rng, sx, y, sz, rng.int(2, 5));
    else if (pick < 0.55) {
      A.put('pallet', sx, y + 0.01, sz, rng.float() * 6.28, 1, [1, 1.3, 1]);
      for (let k = 0; k < rng.int(1, 4); k++) {
        A.put(
          rng.pick(['sandbag_a', 'sandbag_b', 'box_card_a']),
          sx + rng.range(-0.3, 0.3),
          y + 0.11 + k * 0.2,
          sz + rng.range(-0.25, 0.25),
          rng.float() * 6.28,
          1,
          [1, 1.2, 1]
        );
      }
      A.box('wood', sx, y + 0.1, sz, 1.2, 0.2, 1.0);
    } else if (pick < 0.72) {
      A.put(rng.pick(['barrel_rust', 'barrel_blue', 'barrel_wood']), sx, y, sz, rng.float() * 6.28, 1, [
        1, 1.2, 1,
      ]);
      A.box('metal', sx, y + 0.45, sz, 0.62, 0.9, 0.62);
    } else if (pick < 0.85) {
      A.put('tyre', sx, y, sz, rng.float() * 6.28, 1, [1, 1.3, 1]);
      if (rng.float() < 0.6) {
        A.skirts = false;
        A.put('tyre', sx + 0.03, y + 0.19, sz + 0.02, rng.float() * 6.28, 1, [1, 1.3, 1]);
        A.skirts = true;
      }
    } else {
      A.put('shelf', sx, y, sz, rng.float() * 6.28, 1, [1, 1.2, 1]);
    }
  }
  for (let i = 0; i < rng.int(2, 5); i++) {
    A.put('plank_a', rng.range(x0 + 0.5, x1 - 0.5), y + 0.02, rng.range(z0 + 0.5, z1 - 0.5), rng.float() * 6.28, 1, [
      1, 1.3, 1,
    ]);
  }
  A.put('jerry_can', x1 - 0.5, y, z1 - 0.5, rng.float() * 6.28, 1, [1, 1.3, 1]);
  A.put('bucket', x0 + 0.5, y, z1 - 0.6, rng.float() * 6.28, 1, [1, 1.4, 1]);
}

// ------------------------------------------------------------------- ruin --
function furnishRuin(A, rng, r, cx, cz, w, d, m) {
  const { x0, z0, x1, z1, y } = r;
  rubbleMound(A, rng, cx + rng.range(-1, 1), y, cz + rng.range(-1, 1), rng.range(1.4, 2.2), 22);
  for (let i = 0; i < rng.int(3, 6); i++) {
    A.put('slab_shard', rng.range(x0 + 0.5, x1 - 0.5), y + 0.05, rng.range(z0 + 0.5, z1 - 0.5), rng.float() * 6.28, 1, [
      1, 1.4, 1,
    ]);
  }
  for (let i = 0; i < rng.int(6, 12); i++) {
    A.put(
      rng.pick(['brick_a', 'brick_b', 'rock_a', 'rock_b']),
      rng.range(x0 + 0.3, x1 - 0.3),
      y + 0.06,
      rng.range(z0 + 0.3, z1 - 0.3),
      rng.float() * 6.28,
      rng.range(0.6, 1.3),
      [1, 1.5, 1]
    );
  }
  A.put('rebar', cx + rng.range(-1, 1), y + 0.06, cz + rng.range(-1, 1), rng.float() * 6.28, 1, [1, 1.4, 1]);
  for (let i = 0; i < 3; i++) {
    A.put('plank_b', rng.range(x0 + 0.4, x1 - 0.4), y + 0.03, rng.range(z0 + 0.4, z1 - 0.4), rng.float() * 6.28, 1, [
      1, 1.4, 1,
    ]);
  }
  A.put('chair', rng.range(x0 + 0.6, x1 - 0.6), y + 0.05, rng.range(z0 + 0.6, z1 - 0.6), rng.float() * 6.28, 1, [
    1, 1.5, 1,
  ]);
  // dust sheet snagged on the rubble
  const sheet = clothGeometry(1.4, 1.1, { segX: 7, segY: 7, sag: 0.24, wrinkle: 0.075, twist: 0.08, fray: 0.02, rng });
  A.addOnce(
    'fabric_cream',
    sheet,
    LL(IDENT, cx + rng.range(-1.5, 1.5), y + 0.55, cz + rng.range(-1.5, 1.5), rng.float() * 6.28, 1, 1, 1, -1.2),
    { masks: [0.4, 0.7, 0.3] }
  );
}

// ---------------------------------------------------------------- helpers --
function addRug(A, rng, x, y, z, size) {
  const g = clothGeometry(size, size * rng.range(0.55, 0.75), {
    segX: 8,
    segY: 6,
    sag: 0.0,
    wrinkle: 0.02,
    thickness: 0.0038,
    fray: 0.012,
    rng,
  });
  A.addOnce(
    rng.pick(['fabric_red', 'fabric_teal', 'fabric_cream']),
    g,
    LL(IDENT, x, y + 0.014, z, rng.range(-0.4, 0.4), 1, 1, 1, -Math.PI / 2),
    { masks: [0.45, 0.55, 0.25] }
  );
}

export function stackCrates(A, rng, x, y, z, n) {
  let cy = y;
  const wasSkirt = A.skirts;
  for (let i = 0; i < n; i++) {
    A.skirts = wasSkirt && i === 0;
    const id = rng.pick(['crate_a', 'crate_b', 'crate_c', 'crate_flat']);
    const s = rng.range(0.92, 1.08);
    const hh = id === 'crate_c' ? 0.82 * 0.85 : id === 'crate_b' ? 0.48 * 0.85 : 0.62 * 0.85;
    A.put(
      id,
      x + rng.range(-0.12, 0.12),
      cy,
      z + rng.range(-0.12, 0.12),
      rng.range(-0.5, 0.5),
      s,
      [1, rng.range(0.7, 1.4), 1]
    );
    A.box('wood', x, cy + (hh * s) / 2, z, 0.7, hh * s, 0.7);
    cy += hh * s;
    if (rng.float() < 0.2) break;
  }
  A.skirts = wasSkirt;
  return cy;
}
