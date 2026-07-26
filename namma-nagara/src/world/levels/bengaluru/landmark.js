import { PB, mat } from './pb.js';
import { paintMasks } from '../../util.js';

/**
 * WORLD — Vidhana Soudha, the vista terminator.
 *
 * The Karnataka state legislature building closes the -Z end of the street,
 * taking the compositional slot the market level gives to its arched gate. It
 * is the one asset on this level that is a SPECIFIC BUILDING rather than a kit
 * assembly, so it is authored from photographs rather than from a programme.
 *
 * SCALE. The real thing is 213 m wide and 46 m tall — three and a half times
 * the width of this entire level. It is built here at 46 m wide and ~24 m tall,
 * which is not a scale model of the real proportions but is the size that reads
 * as monumental from 90 m down the street while still fitting the map. The
 * detail hierarchy is preserved even though the dimensions are not: rusticated
 * plinth, grand stair, deep colonnade, heavy entablature, central dome on a
 * drum, four corner chhatris.
 *
 * STYLE. Neo-Dravidian: classical massing and a colonnade, but with Indian
 * temple vocabulary on top — the stepped shikhara-like dome, the chhatri
 * pavilions, and the cornice that reads as a chajja at building scale.
 *
 * Authored in LEVEL space, facing +Z (toward the street and the camera).
 * Merged static geometry, not instanced — there is exactly one of these.
 */

const KEY = 'granite';
const KEY_DARK = 'granite_dark';

/** A column with base, shaft and capital. Origin at the foot. */
function column(p, x, y, z, h, r, key = null) {
  p.cyl(r * 1.28, h * 0.055, x, y + h * 0.027, z, { radial: 12, wear: 0.6 });
  p.box(r * 2.7, h * 0.03, r * 2.7, x, y + h * 0.07, z, { bevel: 0.02, wear: 0.6 });
  // Shaft with a very slight entasis — two stacked tapers rather than a cone.
  p.cyl(r, h * 0.55, x, y + h * 0.085 + h * 0.275, z, { radial: 12, taper: 0.96 });
  p.cyl(r * 0.96, h * 0.28, x, y + h * 0.635 + h * 0.14, z, { radial: 12, taper: 0.93 });
  // Capital: a flared bell and an abacus.
  p.cyl(r * 1.05, h * 0.05, x, y + h * 0.79, z, { radial: 12, taper: 1.35 });
  p.box(r * 2.9, h * 0.045, r * 2.9, x, y + h * 0.84, z, { bevel: 0.02, wear: 0.5 });
}

/** A chhatri: four short pillars carrying a small ribbed dome. */
function chhatri(p, x, y, z, s) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.cyl(0.16 * s, 2.2 * s, x + sx * 0.85 * s, y + 1.1 * s, z + sz * 0.85 * s, { radial: 8 });
    }
  }
  p.box(2.6 * s, 0.22 * s, 2.6 * s, x, y + 2.3 * s, z, { bevel: 0.04, wear: 0.5 });
  p.cyl(1.15 * s, 0.3 * s, x, y + 2.55 * s, z, { radial: 14, taper: 0.86 });
  p.ball(1.05 * s, x, y + 2.7 * s, z, { seg: 14, rings: 8, sy: 0.78 });
  p.cyl(0.12 * s, 0.5 * s, x, y + 3.6 * s, z, { radial: 8, taper: 0.5 });
  p.ball(0.16 * s, x, y + 4.0 * s, z, { seg: 8, rings: 6 });
}

export function vidhanaSoudha(rng) {
  const p = new PB();
  const W = 46; // overall width
  const D = 17; // overall depth
  const plinthH = 3.2;
  const baseH = 8.6; // main storey, plinth top to entablature
  const entabH = 1.9;

  // ------------------------------------------------------------- plinth ----
  // Rusticated: three receding courses so the base reads as heavy masonry and
  // catches a shadow line per course.
  for (let i = 0; i < 3; i++) {
    const inset = i * 0.35;
    p.box(W - inset * 2, plinthH / 3, D - inset * 2, 0, (i + 0.5) * (plinthH / 3), -inset, {
      bevel: 0.06,
      grime: 0.35 - i * 0.08,
      wear: 0.8,
    });
  }

  // -------------------------------------------------------- grand stair ----
  // Wide central flight up the front. 14 risers.
  const stairW = 17;
  const risers = 14;
  for (let i = 0; i < risers; i++) {
    const y = ((i + 0.5) * plinthH) / risers;
    const depth = 5.4 * (1 - i / risers) + 0.5;
    p.box(stairW + (risers - i) * 0.16, plinthH / risers, depth, 0, y, D / 2 + depth / 2 - 0.2, {
      bevel: 0.02,
      grime: 0.4,
      wear: 0.9,
    });
  }
  // cheek walls either side of the flight
  for (const s of [-1, 1]) {
    p.box(1.1, plinthH * 0.9, 5.6, s * (stairW / 2 + 1.0), plinthH * 0.45, D / 2 + 2.6, {
      bevel: 0.05,
      grime: 0.4,
    });
  }

  // ---------------------------------------------------------- main mass ----
  p.box(W - 1.4, baseH, D - 1.4, 0, plinthH + baseH / 2, 0, { bevel: 0.06, grime: 0.2 });

  // -------------------------------------------------------- the colonnade --
  // The defining feature. A deep arcade the full width of the front, with the
  // columns standing PROUD of the wall so they read as a colonnade rather than
  // as pilasters — the shadow between column and wall is the whole effect.
  const colY = plinthH;
  const colH = baseH - 0.4;
  const colZ = D / 2 - 1.2;
  const bays = 15;
  for (let i = 0; i < bays; i++) {
    const x = -(W - 6) / 2 + (i / (bays - 1)) * (W - 6);
    // The centre five bays belong to the portico and are handled below.
    if (Math.abs(x) < 8.5) continue;
    column(p, x, colY, colZ, colH, 0.44);
  }
  // The architrave the colonnade carries.
  p.box(W - 2.0, 0.7, 1.5, 0, plinthH + colH + 0.3, colZ, { bevel: 0.04, wear: 0.6 });

  // Return colonnades down the two flanks, three bays each.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = D / 2 - 3.6 - i * 3.4;
      column(p, s * (W / 2 - 1.2), colY, z, colH, 0.4);
    }
  }

  // ------------------------------------------------------------- portico ---
  // Central entrance block: projects forward, taller columns, its own pediment.
  const porW = 18;
  const porZ = D / 2 + 1.4;
  p.box(porW, baseH + 1.6, 3.4, 0, plinthH + (baseH + 1.6) / 2, porZ - 1.0, {
    bevel: 0.06,
    grime: 0.18,
  });
  for (let i = 0; i < 6; i++) {
    const x = -porW / 2 + 1.6 + (i / 5) * (porW - 3.2);
    column(p, x, colY, porZ + 0.9, colH + 1.4, 0.56);
  }
  // Entablature over the portico, then a shallow stepped attic.
  p.box(porW + 1.6, entabH, 4.4, 0, plinthH + colH + 1.4 + entabH / 2, porZ, {
    bevel: 0.05,
    wear: 0.55,
  });
  for (let i = 0; i < 3; i++) {
    const s = 1 - i * 0.16;
    p.box(
      (porW - 1) * s,
      0.55,
      3.6 * s,
      0,
      plinthH + colH + 1.4 + entabH + 0.28 + i * 0.55,
      porZ - 0.2,
      { bevel: 0.04, wear: 0.5 }
    );
  }

  // ---------------------------------------------------- main entablature ---
  // Deep overhanging cornice — at this scale it is doing a chajja's job, and
  // the shadow it throws across the colonnade is what gives the facade depth.
  p.box(W + 1.2, entabH, D + 1.2, 0, plinthH + baseH + entabH / 2, 0, {
    bevel: 0.05,
    wear: 0.6,
    grime: 0.25,
  });
  p.box(W + 2.0, 0.42, D + 2.0, 0, plinthH + baseH + entabH - 0.1, 0, {
    bevel: 0.06,
    wear: 0.7,
    grime: 0.4,
  });
  // Parapet with a run of small piers.
  const parY = plinthH + baseH + entabH + 0.2;
  p.box(W, 0.75, D, 0, parY + 0.375, 0, { bevel: 0.04, wear: 0.5 });
  for (let i = 0; i < 23; i++) {
    const x = -(W - 2) / 2 + (i / 22) * (W - 2);
    p.box(0.55, 0.6, 0.55, x, parY + 1.05, D / 2 - 0.3, { bevel: 0.03, wear: 0.6 });
  }

  // --------------------------------------------------------------- dome ----
  // Drum, ribbed dome, lantern, finial. Set back from the front so it sits over
  // the mass rather than over the portico.
  const drumY = parY + 0.9;
  const drumR = 6.2;
  p.cyl(drumR + 0.5, 0.5, 0, drumY + 0.25, -1.0, { radial: 22, wear: 0.5 });
  p.cyl(drumR, 3.4, 0, drumY + 0.5 + 1.7, -1.0, { radial: 22 });
  // Pilasters and openings around the drum.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    p.box(0.42, 3.0, 0.42, Math.cos(a) * (drumR + 0.16), drumY + 2.2, -1.0 + Math.sin(a) * (drumR + 0.16), {
      bevel: 0.03,
      ry: -a,
      wear: 0.6,
    });
  }
  p.cyl(drumR + 0.7, 0.45, 0, drumY + 4.1, -1.0, { radial: 22, wear: 0.55 });

  // The dome itself, slightly pointed rather than hemispherical.
  p.ball(drumR * 0.98, 0, drumY + 4.3, -1.0, { seg: 24, rings: 14, sy: 1.15 });
  // Ribs.
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    p.box(0.2, 0.16, drumR * 1.9, Math.cos(a) * drumR * 0.55, drumY + 5.7, -1.0 + Math.sin(a) * drumR * 0.55, {
      bevel: 0.02,
      ry: -a + Math.PI / 2,
      rx: 0.5,
      wear: 0.5,
    });
  }
  // Lantern and finial — the kalash.
  p.cyl(1.5, 1.4, 0, drumY + 9.8, -1.0, { radial: 14, taper: 0.9 });
  p.cyl(1.75, 0.3, 0, drumY + 10.6, -1.0, { radial: 14, wear: 0.5 });
  p.ball(1.15, 0, drumY + 11.0, -1.0, { seg: 14, rings: 9, sy: 0.85 });
  p.cyl(0.22, 1.5, 0, drumY + 11.6, -1.0, { radial: 8, taper: 0.4 });
  p.ball(0.34, 0, drumY + 12.5, -1.0, { seg: 10, rings: 7 });

  // ----------------------------------------------------------- chhatris ----
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      chhatri(p, sx * (W / 2 - 3.4), parY + 0.9, sz * (D / 2 - 3.0), 1.0);
    }
  }

  // ------------------------------------------------------------ windows ----
  // Recessed openings between the columns, dark, so the facade is not a slab.
  for (let i = 0; i < bays; i++) {
    const x = -(W - 6) / 2 + (i / (bays - 1)) * (W - 6);
    if (Math.abs(x) < 8.5) continue;
    p.box(1.5, 3.0, 0.4, x, plinthH + 3.0, D / 2 - 2.0, { bevel: 0.03, ao: 0.85, grime: 0.6 });
  }

  const g = p.build();
  paintMasks(g, (x, y, z, nx, ny, nz, out) => {
    // Rain and pollution: the lower storeys are dirty, the dome weathers pale.
    const low = 1 - Math.min(1, y / 12);
    out[1] = Math.min(1, out[1] + low * low * 0.35);
    if (ny > 0.5) out[1] = Math.min(1, out[1] + 0.25); // upward faces collect
    if (y > 20) out[0] = Math.min(1, out[0] + 0.3);
  });
  return g;
}

/**
 * Build it into the level. Placed at the -Z end, set back beyond the cross
 * street, facing back up the street toward the player.
 */
export function buildVidhanaSoudha(A, rng) {
  const z = -62;
  const g = vidhanaSoudha(rng);
  A.addOnce(KEY, g, mat(0, 0, z));

  // Collision: the podium and the main mass as two boxes. The BVH never needs
  // 40 columns and a ribbed dome.
  A.box('concrete', 0, 1.6, z, 46, 3.2, 17);
  A.box('concrete', 0, 7.5, z, 44.6, 8.6, 15.6);

  // A low forecourt wall with a gap on the axis, so the building sits in
  // grounds rather than growing straight out of the road.
  for (const s of [-1, 1]) {
    A.addBox(
      KEY_DARK,
      A.cache('vs:wall', () => {
        const q = new PB();
        q.box(1, 1, 1, 0, 0.5, 0, { bevel: 0.02, grime: 0.5 });
        return q.build();
      }),
      s * 15.5,
      0,
      z + 12.5,
      0,
      17,
      1.05,
      0.55
    );
    A.box('concrete', s * 15.5, 0.52, z + 12.5, 17, 1.05, 0.55);
  }
}
