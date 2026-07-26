import { PB } from './pb.js';
import { paintMasks } from '../../util.js';

/**
 * WORLD — the Bengaluru street prop library.
 *
 * These replace the market level's war dressing (sandbags, jersey barriers,
 * ammo crates, oil drums) with what is actually on an Indian commercial street.
 *
 * Chosen for SIGNAL PER TRIANGLE. The things that say "India" from 15 m are not
 * the detailed ones — they are the tender-coconut pyramid, the BESCOM pole with
 * its cable nest, the stack of plastic chairs, and the strips of foil sachets
 * hanging outside every petty shop. All four are cheap.
 *
 * Every builder returns geometry with its origin at the FOOT, in metres, with
 * masks painted (r = wear, g = grime, b = AO), same as `src/world/props.js`.
 */

// ------------------------------------------------------------ coconut cart --
/**
 * The tender-coconut cart. A wooden handcart on bicycle wheels heaped with
 * green coconuts, with the machete stuck in the top one.
 *
 * The pyramid is the whole asset. It gets built as a real stacked pile with
 * jitter rather than a cone, because the silhouette of a heap of spheres is
 * unmistakable and a cone is not.
 */
export function coconutCart(rng) {
  const p = new PB();
  const W = 1.15;
  const D = 0.72;
  const deckY = 0.62;

  // deck + side boards
  p.box(W, 0.06, D, 0, deckY, 0, { bevel: 0.008, grime: 0.4 });
  for (const s of [-1, 1]) {
    p.box(W, 0.14, 0.05, 0, deckY + 0.09, s * (D / 2), { bevel: 0.006, grime: 0.45, wear: 0.8 });
    p.box(0.05, 0.14, D, s * (W / 2), deckY + 0.09, 0, { bevel: 0.006, grime: 0.45, wear: 0.8 });
  }
  // frame + legs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.box(0.055, deckY, 0.055, sx * (W / 2 - 0.06), deckY / 2, sz * (D / 2 - 0.06), {
        bevel: 0.005,
        grime: 0.55,
      });
    }
  }
  // handle bar out the back
  p.cyl(0.022, 0.5, 0, deckY + 0.1, -D / 2 - 0.22, { radial: 7, rx: Math.PI / 2, grime: 0.4 });

  // two cart wheels
  for (const s of [-1, 1]) {
    p.cyl(0.28, 0.05, s * (W / 2 + 0.02), 0.28, 0.05, {
      radial: 14,
      rz: Math.PI / 2,
      grime: 0.65,
    });
    p.cyl(0.07, 0.07, s * (W / 2 + 0.02), 0.28, 0.05, {
      radial: 8,
      rz: Math.PI / 2,
      grime: 0.4,
      wear: 0.6,
    });
  }

  // ---- the heap -----------------------------------------------------------
  // Tender coconuts are ~18 cm husked, faceted rather than round, and they sit
  // in courses. Four courses, each smaller, each jittered.
  const COURSES = [
    { n: 9, r: 0.44, y: 0.16 },
    { n: 7, r: 0.32, y: 0.29 },
    { n: 5, r: 0.2, y: 0.4 },
    { n: 2, r: 0.08, y: 0.48 },
  ];
  for (const c of COURSES) {
    for (let i = 0; i < c.n; i++) {
      const a = (i / c.n) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const rr = c.r * rng.range(0.82, 1.0);
      p.ball(0.095 * rng.range(0.9, 1.1), Math.cos(a) * rr, deckY + 0.06 + c.y, Math.sin(a) * rr, {
        seg: 7,
        rings: 5,
        // Coconuts are pointed at one end — squash and tilt so the heap is not
        // a bag of marbles.
        sy: rng.range(1.15, 1.4),
        rx: rng.range(-0.6, 0.6),
        rz: rng.range(-0.6, 0.6),
        grime: 0.15,
      });
    }
  }
  // the machete, stuck in the top
  p.box(0.035, 0.3, 0.008, 0.06, deckY + 0.7, 0.02, { bevel: 0.002, rz: 0.3, wear: 0.2 });
  p.box(0.03, 0.1, 0.025, 0.115, deckY + 0.9, 0.02, { bevel: 0.008, rz: 0.3, grime: 0.5 });

  const g = p.build();
  paintMasks(g, (x, y, z, nx, ny, nz, out) => {
    const low = 1 - Math.min(1, y / 0.6);
    out[1] = Math.min(1, out[1] + low * low * 0.5);
  });
  return g;
}

// -------------------------------------------------------------- flower tray --
/**
 * The flower seller's pitch: low trays of loose marigold and a rail of strung
 * garlands. Sits directly on the pavement.
 */
export function flowerStall(rng) {
  const p = new PB();
  // three shallow cane baskets
  const SPOTS = [
    [-0.42, 0, 0.3],
    [0.0, 0.06, 0.32],
    [0.44, -0.04, 0.28],
  ];
  for (const [x, z, r] of SPOTS) {
    p.cyl(r, 0.13, x, 0.065, z, { radial: 12, taper: 0.82, grime: 0.4, wear: 0.7 });
    // the heap of blooms — small spheres, densely packed, in two sizes
    for (let i = 0; i < 22; i++) {
      const a = rng.float() * Math.PI * 2;
      const rr = Math.sqrt(rng.float()) * (r - 0.045);
      p.ball(rng.range(0.026, 0.042), x + Math.cos(a) * rr, 0.14 + rng.range(0, 0.03), z + Math.sin(a) * rr, {
        seg: 6,
        rings: 4,
      });
    }
  }
  // the garland rail: two uprights and a bar
  for (const s of [-1, 1]) {
    p.cyl(0.018, 1.15, s * 0.6, 0.575, -0.3, { radial: 7, grime: 0.5 });
  }
  p.cyl(0.014, 1.2, 0, 1.13, -0.3, { radial: 6, rz: Math.PI / 2, grime: 0.4 });
  // hanging garlands — a strand of beads each
  for (let i = 0; i < 7; i++) {
    const x = -0.5 + (i / 6) * 1.0;
    const len = rng.range(0.42, 0.68);
    const beads = Math.round(len / 0.055);
    for (let b = 0; b < beads; b++) {
      p.ball(0.028, x, 1.1 - (b + 0.5) * 0.055, -0.3 + rng.range(-0.015, 0.015), {
        seg: 6,
        rings: 4,
      });
    }
  }
  return p.build();
}

// ------------------------------------------------------------ vegetable cart --
export function vegCart(rng) {
  const p = new PB();
  const W = 1.5;
  const D = 0.8;
  const deckY = 0.7;

  p.box(W, 0.06, D, 0, deckY, 0, { bevel: 0.008, grime: 0.45 });
  for (const s of [-1, 1]) {
    p.box(W, 0.12, 0.045, 0, deckY + 0.08, s * (D / 2), { bevel: 0.005, grime: 0.5, wear: 0.8 });
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.box(0.05, deckY, 0.05, sx * (W / 2 - 0.06), deckY / 2, sz * (D / 2 - 0.06), {
        bevel: 0.005,
        grime: 0.6,
      });
    }
  }
  for (const s of [-1, 1]) {
    p.cyl(0.3, 0.05, s * (W / 2 + 0.02), 0.3, 0.06, { radial: 14, rz: Math.PI / 2, grime: 0.7 });
  }

  // Produce in sorted piles — a vegetable cart is always laid out in rows,
  // which is what separates it from a heap of rubbish at a distance.
  const ROWS = 4;
  for (let r = 0; r < ROWS; r++) {
    const x = -W / 2 + 0.22 + (r / (ROWS - 1)) * (W - 0.44);
    const big = rng.float() < 0.4;
    const rad = big ? 0.055 : 0.032;
    for (let i = 0; i < (big ? 12 : 22); i++) {
      const a = rng.float() * Math.PI * 2;
      const rr = Math.sqrt(rng.float()) * 0.16;
      p.ball(rad * rng.range(0.85, 1.15), x + Math.cos(a) * rr, deckY + 0.1 + rng.range(0, 0.07), Math.sin(a) * rr * 1.5, {
        seg: 6,
        rings: 5,
        sy: rng.range(0.85, 1.2),
      });
    }
  }
  // the hanging balance scale
  p.cyl(0.012, 0.5, W / 2 - 0.1, deckY + 0.36, -D / 2 + 0.1, { radial: 6 });
  p.cyl(0.09, 0.02, W / 2 - 0.1, deckY + 0.16, -D / 2 + 0.1, { radial: 10, wear: 0.5 });
  return p.build();
}

// ---------------------------------------------------------------- chai cart --
/**
 * The tea / dosa cart: a steel-topped trolley with a gas cylinder underneath,
 * a tawa, a kettle and a stack of steel tumblers.
 */
export function chaiCart(rng) {
  const p = new PB();
  const W = 1.25;
  const D = 0.66;
  const topY = 0.86;

  // steel worktop and the box under it
  p.box(W, 0.045, D, 0, topY, 0, { bevel: 0.006, wear: 0.4, grime: 0.35 });
  p.box(W * 0.94, 0.5, D * 0.9, 0, topY - 0.28, 0, { bevel: 0.01, grime: 0.55 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.cyl(0.02, 0.34, sx * (W / 2 - 0.07), 0.17, sz * (D / 2 - 0.07), { radial: 6, grime: 0.7 });
    }
  }
  // wheels at one end only — these carts pivot on two castors
  for (const s of [-1, 1]) {
    p.cyl(0.075, 0.04, s * (W / 2 - 0.08), 0.075, D / 2 - 0.1, {
      radial: 9,
      rz: Math.PI / 2,
      grime: 0.7,
    });
  }

  // the tawa: a big flat black griddle, the thing you see first
  p.cyl(0.31, 0.035, -0.24, topY + 0.04, 0, { radial: 18, grime: 0.85, wear: 0.5 });
  p.cyl(0.28, 0.02, -0.24, topY + 0.06, 0, { radial: 16, grime: 0.9 });

  // LPG cylinder under the counter — always there, never strapped down
  p.cyl(0.145, 0.58, 0.34, 0.29, 0, { radial: 12, grime: 0.4, wear: 0.6 });
  p.cyl(0.05, 0.09, 0.34, 0.61, 0, { radial: 8, grime: 0.3, wear: 0.5 });

  // kettle + tumblers
  p.cyl(0.085, 0.17, 0.2, topY + 0.11, -0.12, { radial: 10, taper: 0.86, wear: 0.35 });
  p.cyl(0.03, 0.05, 0.2, topY + 0.21, -0.12, { radial: 7, wear: 0.3 });
  for (let i = 0; i < 5; i++) {
    p.cyl(0.036, 0.085, 0.42, topY + 0.045 + i * 0.055, 0.2, {
      radial: 9,
      taper: 0.8,
      wear: 0.25,
    });
  }
  return p.build();
}

// -------------------------------------------------------------- BESCOM pole --
/**
 * The electricity pole. In Bengaluru these are square-section spun-concrete
 * poles with a stepped taper, carrying an absurd bundle of cables, a couple of
 * insulator crossarms, a street-light arm and usually a stapled-on poster.
 *
 * The cable nest is the point. It is modelled as short stub bundles leaving the
 * head in several directions — the long spans between poles are catenaries
 * placed separately by the dressing pass.
 */
export function bescomPole(rng) {
  const p = new PB();
  const H = 8.2;

  // spun-concrete pole: three stepped sections, narrowing with height
  p.box(0.24, H * 0.42, 0.19, 0, H * 0.21, 0, { bevel: 0.012, grime: 0.6 });
  p.box(0.2, H * 0.35, 0.16, 0, H * 0.42 + H * 0.175, 0, { bevel: 0.01, grime: 0.45 });
  p.box(0.16, H * 0.25, 0.13, 0, H * 0.77 + H * 0.125, 0, { bevel: 0.01, grime: 0.3 });

  // crossarms with insulators
  for (const [y, len] of [
    [H * 0.78, 1.35],
    [H * 0.9, 1.05],
  ]) {
    p.box(len, 0.07, 0.07, 0, y, 0, { bevel: 0.008, grime: 0.5, wear: 0.7 });
    for (let i = 0; i < 4; i++) {
      const x = -len / 2 + 0.12 + (i / 3) * (len - 0.24);
      p.cyl(0.038, 0.11, x, y + 0.085, 0, { radial: 8, taper: 0.7, wear: 0.4 });
      p.cyl(0.05, 0.035, x, y + 0.15, 0, { radial: 8, wear: 0.4 });
    }
  }

  // the nest: stub cables leaving the head at every angle
  for (let i = 0; i < 14; i++) {
    const a = rng.float() * Math.PI * 2;
    const y = H * 0.72 + rng.range(-0.1, 0.24);
    const len = rng.range(0.5, 1.1);
    p.cyl(0.011, len, (Math.cos(a) * len) / 2, y + rng.range(-0.06, 0.02), (Math.sin(a) * len) / 2, {
      radial: 4,
      rz: Math.PI / 2,
      ry: -a,
      rx: rng.range(-0.2, 0.2),
      grime: 0.6,
    });
  }
  // the coil of slack every pole carries
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    p.cyl(0.01, 0.34, Math.cos(a) * 0.16, H * 0.63, Math.sin(a) * 0.16, {
      radial: 4,
      rz: Math.PI / 2,
      ry: -a + Math.PI / 2,
      grime: 0.6,
    });
  }

  // street-light arm
  p.cyl(0.03, 1.2, 0.5, H * 0.95, 0, { radial: 7, rz: Math.PI / 2 - 0.28, grime: 0.4 });
  p.box(0.42, 0.1, 0.2, 1.0, H * 0.95 + 0.3, 0, { bevel: 0.02, wear: 0.5, grime: 0.4 });

  // the junction box, and a poster stapled to the pole at eye height
  p.box(0.22, 0.34, 0.16, 0.13, 2.5, 0, { bevel: 0.01, grime: 0.55, wear: 0.6 });
  p.box(0.26, 0.36, 0.006, 0, 1.72, 0.1, { bevel: 0.002, grime: 0.35 });

  const g = p.build();
  paintMasks(g, (x, y, z, nx, ny, nz, out) => {
    // Everything below head height is filthy; the top weathers pale.
    const low = 1 - Math.min(1, y / 2.6);
    out[1] = Math.min(1, out[1] + low * 0.55);
    if (y > 5) out[0] = Math.min(1, out[0] + 0.35);
  });
  return g;
}

// ----------------------------------------------------------- plastic chairs --
/** The white monobloc chair. Universal, and unmistakable in silhouette. */
export function plasticChair(rng) {
  const p = new PB();
  const seatY = 0.44;
  p.box(0.44, 0.035, 0.42, 0, seatY, 0, { bevel: 0.012, grime: 0.3, wear: 0.6 });
  // splayed legs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.box(0.035, seatY, 0.035, sx * 0.185, seatY / 2, sz * 0.175, {
        bevel: 0.006,
        rx: sz * -0.06,
        rz: sx * -0.06,
        grime: 0.45,
      });
    }
  }
  // back: two uprights and a curved-ish panel
  for (const sx of [-1, 1]) {
    p.box(0.04, 0.42, 0.04, sx * 0.185, seatY + 0.21, -0.19, { bevel: 0.008, rx: 0.1, grime: 0.3 });
  }
  p.box(0.4, 0.3, 0.03, 0, seatY + 0.3, -0.215, { bevel: 0.01, rx: 0.1, grime: 0.25, wear: 0.5 });
  return p.build();
}

/** Four of them stacked, which is how they actually live outside a shop. */
export function chairStack(rng) {
  const p = new PB();
  for (let i = 0; i < 4; i++) {
    const y = i * 0.115;
    const r = rng.range(-0.06, 0.06);
    p.box(0.44, 0.035, 0.42, 0, 0.44 + y, 0, { bevel: 0.012, ry: r, grime: 0.35 });
    p.box(0.4, 0.3, 0.03, 0, 0.74 + y, -0.215, { bevel: 0.01, ry: r, rx: 0.1, grime: 0.3 });
    for (const sx of [-1, 1]) {
      p.box(0.035, 0.44, 0.035, sx * 0.185, 0.22 + y, 0.175, { bevel: 0.006, ry: r, grime: 0.45 });
      p.box(0.04, 0.42, 0.04, sx * 0.185, 0.65 + y, -0.19, { bevel: 0.008, ry: r, grime: 0.3 });
    }
  }
  return p.build();
}

// ------------------------------------------------------------------- sundry --
/** Galvanised steel drum used as a street bin, dented and overflowing. */
export function streetBin(rng) {
  const p = new PB();
  p.cyl(0.29, 0.78, 0, 0.39, 0, { radial: 14, taper: 0.94, grime: 0.8, wear: 0.7 });
  for (let i = 0; i < 3; i++) {
    p.cyl(0.3, 0.03, 0, 0.16 + i * 0.24, 0, { radial: 14, grime: 0.75, wear: 0.9 });
  }
  // the overflow
  for (let i = 0; i < 9; i++) {
    const a = rng.float() * Math.PI * 2;
    const rr = rng.float() * 0.24;
    p.box(rng.range(0.06, 0.16), rng.range(0.04, 0.1), rng.range(0.06, 0.14),
      Math.cos(a) * rr, 0.8 + rng.range(0, 0.1), Math.sin(a) * rr,
      { bevel: 0.004, ry: rng.float() * 3, rx: rng.range(-0.6, 0.6), grime: 0.7 });
  }
  return p.build();
}

/**
 * A hanging strip of foil sachets — shampoo, gutka, chips — pegged outside
 * every petty shop. Enormous signal, almost no cost. Origin at the TOP, since
 * this hangs from a shopfront rather than standing on the ground.
 */
export function sachetStrip(rng) {
  const p = new PB();
  const n = 7 + Math.floor(rng.float() * 4);
  for (let i = 0; i < n; i++) {
    const y = -0.09 - i * 0.115;
    p.box(0.1, 0.11, 0.004, 0, y, 0, {
      bevel: 0.002,
      rz: rng.range(-0.09, 0.09),
      ry: rng.range(-0.2, 0.2),
      wear: 0.3,
    });
  }
  return p.build();
}

/** Milk crates, stacked. The other universal plastic object. */
export function crateStack(rng) {
  const p = new PB();
  const n = 3 + Math.floor(rng.float() * 3);
  for (let i = 0; i < n; i++) {
    const y = 0.145 + i * 0.29;
    const r = rng.range(-0.12, 0.12);
    // open box: four walls and a base, so the stack reads as crates not blocks
    p.box(0.46, 0.02, 0.46, 0, y - 0.135, 0, { bevel: 0.004, ry: r, grime: 0.4 });
    for (const s of [-1, 1]) {
      p.box(0.46, 0.27, 0.022, 0, y, s * 0.22, { bevel: 0.004, ry: r, grime: 0.35, wear: 0.7 });
      p.box(0.022, 0.27, 0.46, s * 0.22, y, 0, { bevel: 0.004, ry: r, grime: 0.35, wear: 0.7 });
    }
  }
  return p.build();
}

/**
 * A small Ganesha shrine set into a compound wall — tiled surround, a step for
 * offerings, a bell above. Origin at the foot, meant to be placed against a wall
 * facing +Z.
 */
export function wallShrine(rng) {
  const p = new PB();
  // tiled back panel and the niche
  p.box(0.72, 1.0, 0.06, 0, 0.95, 0, { bevel: 0.008, grime: 0.3 });
  p.box(0.5, 0.66, 0.14, 0, 0.95, 0.06, { bevel: 0.01, grime: 0.2, ao: 0.5 });
  // little canopy with a stepped shikhara
  for (let i = 0; i < 4; i++) {
    const s = 1 - i * 0.19;
    p.box(0.68 * s, 0.075, 0.24 * s, 0, 1.48 + i * 0.075, 0.06, { bevel: 0.006, wear: 0.5 });
  }
  p.ball(0.05, 0, 1.82, 0.06, { seg: 7, rings: 5, wear: 0.3 });
  // the idol: a seated mass, deliberately not detailed — it reads as a
  // silhouette in shadow behind a garland, which is all you ever see.
  p.ball(0.13, 0, 0.86, 0.08, { seg: 8, rings: 6, sy: 1.25, grime: 0.2 });
  p.ball(0.085, 0, 1.06, 0.08, { seg: 8, rings: 6, grime: 0.2 });
  // offering step and a brass lamp
  p.box(0.62, 0.09, 0.22, 0, 0.5, 0.14, { bevel: 0.01, grime: 0.45 });
  p.cyl(0.045, 0.05, -0.18, 0.57, 0.16, { radial: 9, taper: 0.7, wear: 0.3 });
  // garland across the niche head
  for (let i = 0; i < 9; i++) {
    const x = -0.2 + (i / 8) * 0.4;
    const sag = Math.sin((i / 8) * Math.PI) * 0.07;
    p.ball(0.024, x, 1.22 - sag, 0.13, { seg: 6, rings: 4 });
  }
  return p.build();
}

// ============================================================== registration ==
/**
 * Register the Bengaluru prop prototypes. Called from the level's build().
 *
 * `skirt` drops a contact-dust fillet under the prop; `tilt`/`sink` let the
 * placement pass knock loose objects out of true. Fixed things (poles, shrines)
 * get neither.
 */
export function registerBengaluruProps(A, rng) {
  const P = (id, key, geo, opts = {}) => A.proto(id, { geo, key, ...opts });

  P('blr_coconut_cart', 'wood_prop', coconutCart(rng), { skirt: 0.7, maxDist: 90 });
  P('blr_flower_stall', 'fabric_cream', flowerStall(rng), { skirt: 0.6, maxDist: 80 });
  P('blr_veg_cart', 'wood_prop', vegCart(rng), { skirt: 0.8, maxDist: 90 });
  P('blr_chai_cart', 'steel', chaiCart(rng), { skirt: 0.7, maxDist: 85 });
  P('blr_pole', 'concrete_prop', bescomPole(rng), { maxDist: 140 });
  P('blr_chair', 'plastic_white', plasticChair(rng), {
    skirt: 0.3,
    tilt: 0.07,
    sink: 0.008,
    maxDist: 60,
  });
  P('blr_chair_stack', 'plastic_white', chairStack(rng), { skirt: 0.35, maxDist: 65 });
  P('blr_bin', 'metal_rust_prop', streetBin(rng), { skirt: 0.34, tilt: 0.05, sink: 0.01, maxDist: 70 });
  P('blr_sachets', 'plastic_white', sachetStrip(rng), { maxDist: 45, castShadow: false });
  P('blr_crates', 'plastic_crate', crateStack(rng), { skirt: 0.36, tilt: 0.05, sink: 0.01, maxDist: 70 });
  P('blr_shrine', 'tile_floor', wallShrine(rng), { maxDist: 75 });

  return A;
}
