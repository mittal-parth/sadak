import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import {
  facadeWall,
  windowUnit,
  windowState,
  doorUnit,
  shopfront,
  balcony,
  parapet,
  stairRun,
  awning,
  drainpipe,
  spallPatch,
  rubbleMound,
  BOX,
  BOX_SOFT,
  IDENT,
  LL,
  worldOf,
} from './kit.js';
import { chamferBox, clothGeometry, fbm3, patchGeometry, runoffStreak } from './util.js';
import { furnishRoom } from './interiors.js';

/**
 * WORLD — building assembly.
 *
 * A building is a footprint, a floor count and a per-side facade programme. The
 * generator walks each side in ~3 m bays and picks a kit element per bay per
 * floor (shopfront, door, window, arched window, balcony door, blank), then
 * dresses it: plinth, string courses, sills, lintels, shutters, drainpipes,
 * spalled render, bullet damage, roof parapet and roof clutter anchors.
 *
 * Sides are indexed 0:-Z 1:+X 2:+Z 3:-X. Every side gets a panel matrix whose
 * local +Z points INTO the building, so kit elements can work in a single
 * consistent panel space (see kit.js).
 */

const SIDE = [
  { ry: 0, n: [0, 0, -1] },
  { ry: -Math.PI / 2, n: [1, 0, 0] },
  { ry: Math.PI, n: [0, 0, 1] },
  { ry: Math.PI / 2, n: [-1, 0, 0] },
];

const _pm = new THREE.Matrix4();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

function panelMatrix(spec, side, y) {
  const { x, z, w, d } = spec;
  const s = SIDE[side];
  let px = x;
  let pz = z;
  if (side === 0) pz = z - d / 2;
  else if (side === 2) pz = z + d / 2;
  else if (side === 1) px = x + w / 2;
  else px = x - w / 2;
  _e.set(0, s.ry, 0);
  _q.setFromEuler(_e);
  _p.set(px, y, pz);
  _s.set(1, 1, 1);
  return _pm.compose(_p, _q, _s);
}

/** Repair-render key per wall colour: close in value, different in mix. */
const PATCH_KEY = {
  plaster_cream: 'plaster_sand',
  plaster_sand: 'plaster_cream',
  // A white patch on a blue-grey wall is nearly a stop brighter than the wall and
  // reads as a sheet of paper taped to the building — a cement repair does not.
  plaster_blue: 'concrete',
  plaster_pink: 'plaster_sand',
  plaster_white: 'concrete',
};

const sideLen = (spec, side) => (side === 0 || side === 2 ? spec.w : spec.d);

/**
 * Per-floor footprint. `spec.setback = { from, depth, side? }` pulls every floor
 * at or above `from` back from one face, leaving a roof terrace over the floor
 * below — the standard Mediterranean/Levantine form, and the thing that lets
 * afternoon sun down onto the street instead of walling it into shade.
 */
function floorSpec(spec, f) {
  const sb = spec.setback;
  if (!sb || f < sb.from) return spec;
  const d = sb.depth;
  const side = sb.side ?? spec.streetSide ?? 0;
  const o = { ...spec };
  if (side === 1) {
    o.x = spec.x - d / 2;
    o.w = spec.w - d;
  } else if (side === 3) {
    o.x = spec.x + d / 2;
    o.w = spec.w - d;
  } else if (side === 0) {
    o.z = spec.z + d / 2;
    o.d = spec.d - d;
  } else {
    o.z = spec.z - d / 2;
    o.d = spec.d - d;
  }
  return o;
}

/** The strip of roof left exposed by a setback: slab, coping and a parapet. */
function terrace(A, rng, spec, y, t) {
  const sb = spec.setback;
  const side = sb.side ?? spec.streetSide ?? 0;
  const d = sb.depth;
  const horiz = side === 1 || side === 3;
  const sign = side === 1 || side === 2 ? 1 : -1;
  const cx = horiz ? spec.x + sign * (spec.w / 2 - d / 2) : spec.x;
  const cz = horiz ? spec.z : spec.z + sign * (spec.d / 2 - d / 2);
  const sx = horiz ? d : spec.w;
  const sz = horiz ? spec.d : d;
  A.add('roof_screed', BOX(A), LL(IDENT, cx, y - 0.13, cz, 0, sx + 0.08, 0.26, sz + 0.08), {
    masks: [0.45, 0.3, 0.15],
  });
  A.box('concrete', cx, y - 0.13, cz, sx + 0.08, 0.26, sz + 0.08);
  // parapet along the exposed edge, low enough to fight over from the terrace
  const ph = 0.92;
  const px = horiz ? spec.x + sign * (spec.w / 2 - 0.11) : spec.x;
  const pz = horiz ? spec.z : spec.z + sign * (spec.d / 2 - 0.11);
  A.add(spec.wallKey ?? 'plaster_cream', BOX(A), LL(IDENT, px, y + ph / 2, pz, 0, horiz ? 0.22 : spec.w + 0.1, ph, horiz ? spec.d + 0.1 : 0.22), {
    masks: [0.5, 0.5, 0.2],
  });
  A.add('concrete', BOX_SOFT(A), LL(IDENT, px, y + ph + 0.05, pz, 0, horiz ? 0.32 : spec.w + 0.2, 0.1, horiz ? spec.d + 0.2 : 0.32), {
    masks: [0.8, 0.35, 0.1],
  });
  A.box('concrete', px, y + ph / 2, pz, horiz ? 0.26 : spec.w + 0.1, ph + 0.1, horiz ? spec.d + 0.1 : 0.26);
  // the returns at each end of the terrace
  for (const s of [-1, 1]) {
    const ex = horiz ? cx : spec.x + s * (spec.w / 2 - 0.11);
    const ez = horiz ? spec.z + s * (spec.d / 2 - 0.11) : cz;
    A.add(spec.wallKey ?? 'plaster_cream', BOX(A), LL(IDENT, ex, y + ph / 2, ez, 0, horiz ? d : 0.22, ph, horiz ? 0.22 : d), {
      masks: [0.5, 0.5, 0.2],
    });
    A.box('concrete', ex, y + ph / 2, ez, horiz ? d : 0.26, ph, horiz ? 0.26 : d);
  }
  return { cx, cz, sx, sz, y };
}

/**
 * @returns {object} anchors for the dressing pass:
 *   { facades:[{side, x, y, ry, wx, wz, nx, nz}], roof:{...}, doors:[], balconies:[] }
 */
export function buildBuilding(A, rng, spec) {
  const t = spec.t ?? 0.34;
  const floors = spec.floors ?? 3;
  const groundH = spec.groundH ?? 3.45;
  const upperH = spec.upperH ?? 3.05;
  const wallKey = spec.wallKey ?? 'plaster_cream';
  const streetSide = spec.streetSide ?? 0;
  const info = {
    spec,
    floorY: [],
    doors: [],
    balconies: [],
    roofY: 0,
    windows: [],
    awnings: [],
    top: 0,
  };

  // ---------------------------------------------------------------- plinth --
  // A base course everywhere: catches the ground grime band and stops the walls
  // reading as slabs dropped on a plane.
  const plinthH = spec.plinthH ?? 0.42;
  A.add(
    spec.plinthKey ?? 'concrete',
    BOX(A),
    LL(IDENT, spec.x, plinthH / 2, spec.z, 0, spec.w + 0.14, plinthH, spec.d + 0.14),
    { masks: [0.55, 0.75, 0.45] }
  );
  A.box('concrete', spec.x, plinthH / 2, spec.z, spec.w + 0.14, plinthH, spec.d + 0.14);

  let y = 0;
  info.terraces = [];
  for (let f = 0; f < floors; f++) {
    const h = f === 0 ? groundH : upperH;
    const fs = floorSpec(spec, f);
    info.floorY.push(y);
    for (let side = 0; side < 4; side++) {
      if (spec.skipSides?.includes(side)) continue;
      buildFacade(A, rng, fs, info, { side, f, y, h, t, wallKey, streetSide, floors });
    }
    // ---- floor / ceiling slab of the NEXT level ----
    y += h;
    if (f < floors - 1) {
      interiorSlab(A, rng, floorSpec(spec, f + 1), y, t, f + 1);
      // the setback happens on top of this floor: dress the exposed strip
      if (spec.setback && f + 1 === spec.setback.from) {
        info.terraces.push(terrace(A, rng, spec, y, t));
      }
    }
  }
  info.roofY = y;
  info.top = y;

  // ------------------------------------------------------------------ roof --
  const ts = floorSpec(spec, floors - 1);
  interiorSlab(A, rng, ts, y, t, floors, true);
  if (spec.parapet !== false) {
    parapet(A, spec.parapetKey ?? wallKey, ts.x, ts.z, ts.w + 0.1, ts.d + 0.1, y, rng, {
      h: spec.parapetH ?? 0.78,
      t: 0.22,
    });
  }
  info.roofSpec = ts;

  // ----------------------------------------------------------- interiors ---
  if (spec.enterable) {
    buildInterior(A, rng, spec, info, t, groundH, upperH, floors);
  } else {
    // Non-enterable: a dark core so windows read as depth, not as a hole into
    // a lit empty shell.
    // Sized off the SMALLEST floor plate so a setback never leaves the core
    // poking out through an upper wall.
    const top = floorSpec(spec, floors - 1);
    const inset = 2.0;
    const cw = Math.max(1.0, top.w - inset * 2);
    const cd = Math.max(1.0, top.d - inset * 2);
    // Stop the core short of the roof slab: coplanar faces z-fight, and a dark
    // core showing through the roof turns every rooftop into a grey blotch.
    const coreH = Math.max(0.5, y - 0.45);
    // `interior_shell`, not white plaster: seen through a doorway or a blown-out
    // hole a bright core reads as a sheet of paper taped behind the opening.
    A.add(
      'interior_shell',
      BOX(A),
      LL(IDENT, top.x, coreH / 2, top.z, 0, cw, coreH, cd),
      { masks: [0.1, 0.95, 0.9] }
    );
    A.box('concrete', top.x, coreH / 2, top.z, cw, coreH, cd);
    for (let f = 0; f <= floors; f++) {
      const fs = floorSpec(spec, Math.min(f, floors - 1));
      const fy = f === 0 ? 0.1 : info.floorY[f] ?? y;
      A.add(
        'floor_concrete',
        BOX(A),
        LL(IDENT, fs.x, fy - 0.06, fs.z, 0, fs.w - t * 2, 0.16, fs.d - t * 2),
        { masks: [0.2, 0.8, 0.6] }
      );
      if (f === 0) A.box('concrete', fs.x, fy - 0.06, fs.z, fs.w, 0.2, fs.d);
    }
  }

  // ------------------------------------------------------------- drainpipe --
  // A downpipe has to die into the wall it is clipped to. On a setback face the
  // wall STOPS at the terrace, so a pipe run to the main roof height carries on
  // three metres into open sky and reads as a floating mast — which is exactly
  // what it was doing. Clamp the top to the parapet of whatever surface is
  // actually above the pipe.
  const dpSide = streetSide;
  const pmD = panelMatrix(spec, dpSide, 0);
  const len = sideLen(spec, dpSide);
  const sbSide = spec.setback ? spec.setback.side ?? streetSide : -1;
  const dpTop =
    sbSide === dpSide
      ? (info.floorY[spec.setback.from] ?? info.roofY) + 0.55
      : info.roofY + 0.4;
  drainpipe(A, pmD.clone(), rng.range(-len / 2 + 0.4, -len / 2 + 1.0), dpTop, dpTop, rng);
  if (rng.float() < 0.6) {
    drainpipe(A, pmD.clone(), rng.range(len / 2 - 1.0, len / 2 - 0.4), dpTop, dpTop, rng);
  }

  return info;
}

// =============================================================== facades ====
function buildFacade(A, rng, spec, info, ctx) {
  const { side, f, y, h, t, wallKey, streetSide, floors } = ctx;
  const len = sideLen(spec, side);
  const pm = panelMatrix(spec, side, y).clone();
  const street = side === streetSide;
  const secondary = spec.secondarySide === side;
  const openFace = street || secondary;

  const bays = Math.max(1, Math.round(len / 3.05));
  const bw = len / bays;
  const openings = [];
  const deco = [];

  const ruinTop = spec.ruin && f === floors - 1;

  for (let b = 0; b < bays; b++) {
    const bx = -len / 2 + (b + 0.5) * bw;
    // edge bays keep more solid wall so corners stay strong
    const room = Math.min(bw - 1.0, 2.6);
    let kind = 'blank';
    if (f === 0) {
      if (openFace) {
        const shopHere = spec.shops !== false && room > 2.0 && rng.float() < (street ? 0.5 : 0.25);
        if (spec.doorBays?.[side] === b) kind = 'door';
        else if (shopHere) kind = 'shop';
        else if (rng.float() < 0.72) kind = 'window';
      } else if (rng.float() < 0.4) kind = 'window';
    } else {
      if (rng.float() < (openFace ? 0.88 : 0.6)) {
        kind = spec.arches && f === 1 ? 'arch' : 'window';
        if (openFace && f >= 1 && rng.float() < (spec.balconies ?? 0.35)) kind = 'balconyDoor';
      }
    }
    if (ruinTop && rng.float() < 0.5) kind = kind === 'blank' ? 'blank' : 'ragged';

    /**
     * Hand-authored override for the bays that carry a sightline the map
     * depends on (the shop the interior camera looks out of, the doorway that
     * connects an alley to a stairwell). A string names the kind; an object
     * additionally passes options to the kit element.
     */
    let forced = spec.bayKinds?.[side]?.[f]?.[b];
    if (typeof forced === 'string') forced = { kind: forced };
    if (forced) kind = forced.kind;

    switch (kind) {
      case 'door': {
        const o = { x: bx, y: 1.08, w: 1.12, h: 2.16, kind };
        openings.push(o);
        deco.push(() =>
          doorUnit(A, pm, o, rng, {
            t,
            open: rng.float() < 0.45 ? rng.range(0.5, 1.6) : 0,
            leafKey: rng.pick(['metal_green', 'metal_blue', 'wood_dark']),
          })
        );
        info.doors.push({ side, x: bx, pm, wp: worldOf(pm, bx, 0, 0).slice() });
        break;
      }
      case 'shop': {
        const sw = Math.min(bw - 0.75, 3.1);
        const o = { x: bx, y: 1.32, w: sw, h: 2.58, kind };
        openings.push(o);
        // Never fully shuttered: a market street with every shop closed is dead,
        // and a shutter over an interior sightline blocks the shot.
        const drop = forced?.drop ?? (rng.float() < 0.5 ? rng.range(0.1, 0.55) : 0);
        deco.push(() => shopfront(A, pm, o, rng, { t, drop }));
        if (rng.float() < 0.8) {
          const aw = sw + 0.5;
          deco.push(() =>
            awning(A, pm, bx, o.y + o.h / 2 + 0.55, aw, rng, {
              depth: rng.range(1.3, 1.9),
              key: rng.pick(['fabric_red', 'fabric_teal', 'fabric_cream']),
              legs: rng.float() < 0.4,
            })
          );
          info.awnings.push({ side, x: bx, y: o.y + o.h / 2 + 0.55, w: aw, pm });
        }
        break;
      }
      case 'window': {
        const ww = Math.min(room, rng.range(1.05, 1.3));
        const wh = f === 0 ? 1.62 : 1.48;
        const o = { x: bx, y: (f === 0 ? 1.05 : 0.95) + wh / 2, w: ww, h: wh, kind };
        openings.push(o);
        const broken = rng.float() < (spec.damage ?? 0.15) * 1.6;
        // One window per bay is not the same window per bay: pick a state so the
        // facade carries open casements, boarded holes, shut louvres, curtains and
        // the occasional lit room instead of one repeated glazed panel.
        const st = broken ? 'open' : windowState(rng, f, spec.damage ?? 0.15, { allowLit: !openFace || f > 0 });
        deco.push(() =>
          windowUnit(A, pm, o, rng, {
            t,
            broken,
            state: st,
            back: !spec.enterable,
            grille: f === 0 && st !== 'boarded' && rng.float() < 0.55,
            shutters: f > 0 && (st === 'shuttered' || rng.float() < 0.4),
            shutterKey: spec.shutterKey ?? rng.pick(['metal_blue', 'metal_green', 'wood_dark']),
            curtain: st === 'curtain' || (st === 'glazed' && rng.float() < 0.25),
          })
        );
        info.windows.push({ side, f, x: bx, y: o.y, w: ww, h: wh, pm, state: st });
        break;
      }
      case 'arch': {
        const ww = Math.min(room, 1.35);
        const o = { x: bx, y: 1.05 + 0.9, w: ww, h: 1.9, arch: 0.62, kind };
        openings.push(o);
        const st = windowState(rng, f, spec.damage ?? 0.15);
        deco.push(() =>
          windowUnit(A, pm, o, rng, {
            t,
            broken: rng.float() < 0.2,
            state: st,
            back: !spec.enterable,
            shutters: false,
            curtain: st === 'curtain' || rng.float() < 0.3,
            lintel: false,
          })
        );
        info.windows.push({ side, f, x: bx, y: o.y, w: ww, h: o.h, pm, state: st });
        break;
      }
      case 'balconyDoor': {
        const ww = Math.min(room, 1.15);
        const o = { x: bx, y: 1.12, w: ww, h: 2.24, kind };
        openings.push(o);
        const bwid = Math.min(bw - 0.35, 2.6);
        deco.push(() => {
          doorUnit(A, pm, o, rng, {
            t,
            open: rng.float() < 0.5 ? rng.range(0.6, 1.5) : 0,
            leafKey: 'wood_dark',
          });
          const balY = 0.02;
          const bal = balcony(A, pm, bx, balY, bwid, rng, {
            depth: rng.range(1.0, 1.35),
            railing: rng.float() < 0.45 ? 'concrete' : 'metal',
            key: spec.wallKey ?? 'plaster_cream',
          });
          // `y` here is PANEL-LOCAL, like info.windows/info.awnings: `pm`
          // already carries the floor height. Publishing the world floor `y`
          // made dressing place balcony clutter at 2*floorY (props and rugs
          // floating in mid-air above the street).
          info.balconies.push({ side, x: bx, y: balY, w: bal.w, d: bal.d, pm });
        });
        break;
      }
      case 'ragged': {
        const o = { x: bx, y: h * 0.55, w: Math.min(bw - 0.4, 2.2), h: h * 0.8, ragged: 0.22, kind };
        openings.push(o);
        break;
      }
      default:
        break;
    }
  }

  // ---- the wall itself ----
  const isTop = f === floors - 1;
  facadeWall(A, pm, {
    w: len,
    h: h + (isTop ? 0.02 : 0),
    t,
    key: wallKey,
    openings,
    rng,
    top: spec.ruin && isTop && (side === streetSide || side === spec.ruinSide) ? 'ragged' : 'flat',
    raggedAmp: 0.55,
    jag: isTop && !spec.ruin ? 0.03 : 0,
    warp: 0.02,
    paint: (x, wy, z, nx, ny, nz, out) => {
      // extra grime toward the base of the ground floor and under the eaves
      const base = f === 0 ? Math.max(0, 1 - wy / 1.4) : 0;
      const n = fbm3(x * 0.7, wy * 0.7, z * 0.7, 2);
      out[1] = Math.min(1, out[1] + base * base * 0.55 * (0.5 + n));
      out[2] = Math.min(1, out[2] + base * base * 0.4);
    },
  });

  for (const fn of deco) fn();

  // ---- rain runoff below every opening and ledge --------------------------
  // The world knows where the water comes off: sills, shopfront heads, awning
  // bars and balcony slabs. A facade with no runs below its openings reads as
  // freshly painted, which is the one thing a street like this never is.
  //
  // Drawn from a stream keyed to this panel's identity rather than from `rng`, so
  // adding or tuning the weathering never re-rolls the level's layout.
  const wr = new Rng(
    (Math.round((spec.x + 512) * 977 + (spec.z + 512) * 7919) ^ (side * 131 + f * 1237)) >>> 0
  );
  for (const o of openings) {
    if (o.kind === 'ragged') continue;
    const sillY = o.y - o.h / 2;
    // Not every sill sheds the same amount, and a couple are bone dry.
    if (wr.float() < 0.22) continue;
    const run = Math.min(wr.range(0.7, 1.8), Math.max(0.25, sillY - 0.12));
    const g = runoffStreak(wr, o.w * wr.range(0.6, 1.0), run, {
      amount: wr.range(0.72, 1.0),
    });
    A.addOnce(wallKey, g, LL(pm, o.x + wr.range(-0.1, 0.1), sillY - 0.03, -0.012, 0, 1, 1, 1));
    // a second, narrower run off one corner of the sill: water finds a low spot
    if (wr.float() < 0.55) {
      const sgn = wr.float() < 0.5 ? -1 : 1;
      const run2 = Math.min(wr.range(0.5, 1.3), Math.max(0.2, sillY - 0.1));
      const g2 = runoffStreak(wr, wr.range(0.1, 0.22), run2, { amount: wr.range(0.8, 1.0), cols: 3 });
      A.addOnce(
        wallKey,
        g2,
        LL(pm, o.x + sgn * o.w * wr.range(0.32, 0.5), sillY - 0.02, -0.013, 0, 1, 1, 1)
      );
    }
  }
  // and one long run off the string course / cornice per open facade
  if (openFace && wr.float() < 0.8) {
    const g = runoffStreak(wr, wr.range(0.18, 0.4), wr.range(1.0, 1.8), {
      amount: wr.range(0.78, 1.0),
      cols: 4,
    });
    A.addOnce(
      wallKey,
      g,
      LL(pm, wr.range(-len / 2 + 0.4, len / 2 - 0.4), h - 0.16, -0.012, 0, 1, 1, 1)
    );
  }

  // ---- string course between floors ----
  if (f < ctx.floors - 1 && (openFace || rng.float() < 0.5)) {
    A.add(
      spec.trimKey ?? 'concrete',
      BOX_SOFT(A),
      LL(pm, 0, h - 0.09, -0.055, 0, len + 0.06, 0.13, 0.12),
      { masks: [0.7, 0.45, 0.2] }
    );
  }
  // ---- top cornice ----
  if (f === ctx.floors - 1 && !spec.ruin) {
    A.add(
      spec.trimKey ?? 'concrete',
      BOX_SOFT(A),
      LL(pm, 0, h - 0.14, -0.11, 0, len + 0.14, 0.22, 0.2),
      { masks: [0.75, 0.5, 0.25] }
    );
  }

  // ---- damage: spalled render exposing brick, bullet-pocked plaster ----
  const dmg = spec.damage ?? 0.2;
  const spalls = Math.round(dmg * 5 * (openFace ? 1.4 : 0.7));
  for (let i = 0; i < spalls; i++) {
    const sx = rng.range(-len / 2 + 0.5, len / 2 - 0.5);
    const sy = rng.range(0.4, h - 0.5);
    const g = spallPatch(rng, rng.range(0.35, 1.0), rng.range(0.3, 0.8), 0.03);
    A.addOnce('brick_fine', g, LL(pm, sx, sy, 0.01, 0, 1, 1, 1));
  }
  // patched render — a slightly different mix where somebody repaired it. Kept
  // in the same value family as the wall, or it reads as a paper poster.
  if (openFace && rng.float() < 0.5) {
    const px = rng.range(-len / 2 + 1, len / 2 - 1);
    const py = rng.range(0.5, h - 1.2);
    const g = spallPatch(rng, rng.range(0.6, 1.4), rng.range(0.5, 1.1), 0.02);
    // Same value family as the wall: a bright white patch on cream render reads
    // as a sheet of paper stuck to the building.
    A.addOnce(PATCH_KEY[wallKey] ?? 'plaster_sand', g, LL(pm, px, py, 0.013, 0, 1, 1, 1));
  }

  // ---- bullet pocks, clustered where somebody took cover ----
  if (A.has('pock')) {
    const bursts = Math.round(dmg * 6) + (openFace ? 2 : 0);
    for (let i = 0; i < bursts; i++) {
      const cx = rng.range(-len / 2 + 0.4, len / 2 - 0.4);
      const cy = rng.range(0.5, Math.min(h - 0.4, 3.0));
      const n = rng.int(3, 9);
      for (let j = 0; j < n; j++) {
        const px = cx + rng.gauss() * 0.45;
        const py = cy + rng.gauss() * 0.32;
        if (Math.abs(px) > len / 2 - 0.15) continue;
        if (py < 0.15 || py > h - 0.15) continue;
        // skip pocks that would land inside an opening
        let inHole = false;
        for (const o of openings) {
          if (
            px > o.x - o.w / 2 - 0.05 &&
            px < o.x + o.w / 2 + 0.05 &&
            py > o.y - o.h / 2 - 0.05 &&
            py < o.y + o.h / 2 + 0.05
          ) {
            inHole = true;
            break;
          }
        }
        if (inHole) continue;
        // Just proud of the render. The pock is a raised-rim crater now, not a
        // solid cone, so burying the origin 4 mm inside the wall (which is what
        // hid the old cone's base) would sink the whole thing out of sight.
        const wp = worldOf(pm, px, py, 0.0015);
        const s = rng.range(0.55, 1.5);
        A.putS('pock', wp[0], wp[1], wp[2], SIDE[side].ry + Math.PI, s, s, rng.range(0.5, 1.2), [
          1,
          rng.range(0.7, 1.3),
          1,
        ]);
      }
    }
  }
}

// ================================================================= slabs ====
/** Floor slab for one level, with the stairwell void left open. */
function interiorSlab(A, rng, spec, y, t, level, roof = false) {
  const iw = spec.w - t * 2;
  const id = spec.d - t * 2;
  const key = roof ? 'roof_screed' : 'floor_concrete';
  const hole = spec.enterable ? (spec.stairHoles?.[level] ?? null) : null;
  const thick = roof ? 0.26 : 0.2;
  if (!hole) {
    A.add(key, BOX(A), LL(IDENT, spec.x, y - thick / 2, spec.z, 0, iw, thick, id), {
      masks: roof ? [0.45, 0.25, 0.12] : [0.3, 0.55, 0.35],
    });
    A.box('concrete', spec.x, y - thick / 2, spec.z, iw, thick, id);
  } else {
    // picture-frame decomposition around the void
    const x0 = spec.x - iw / 2;
    const x1 = spec.x + iw / 2;
    const z0 = spec.z - id / 2;
    const z1 = spec.z + id / 2;
    const hx0 = hole.x0;
    const hx1 = hole.x1;
    const hz0 = hole.z0;
    const hz1 = hole.z1;
    const parts = [
      [x0, z0, x1, hz0],
      [x0, hz1, x1, z1],
      [x0, hz0, hx0, hz1],
      [hx1, hz0, x1, hz1],
    ];
    for (const [ax, az, bx, bz] of parts) {
      const w = bx - ax;
      const d = bz - az;
      if (w < 0.05 || d < 0.05) continue;
      A.add(key, BOX(A), LL(IDENT, (ax + bx) / 2, y - thick / 2, (az + bz) / 2, 0, w, thick, d), {
        masks: roof ? [0.45, 0.25, 0.12] : [0.3, 0.55, 0.35],
      });
      A.box('concrete', (ax + bx) / 2, y - thick / 2, (az + bz) / 2, w, thick, d);
    }
  }
  // exposed ceiling beams / joists under the slab, seen from inside
  if (!roof && spec.enterable) {
    const n = Math.max(2, Math.round(id / 1.5));
    for (let i = 0; i < n; i++) {
      const bz = spec.z - id / 2 + ((i + 0.5) / n) * id;
      A.add('wood_dark', BOX(A), LL(IDENT, spec.x, y - thick - 0.08, bz, 0, iw, 0.16, 0.13), {
        masks: [0.4, 0.6, 0.5],
      });
    }
  }
}

// ============================================================= interiors ====
function buildInterior(A, rng, spec, info, t, groundH, upperH, floors) {
  const it = 0.16; // partition thickness
  const g0 = floorSpec(spec, 0);

  // ground slab, a step up from the street
  A.add('floor_concrete', BOX(A), LL(IDENT, g0.x, 0.06, g0.z, 0, g0.w - t * 2, 0.14, g0.d - t * 2), {
    masks: [0.3, 0.6, 0.4],
  });
  A.box('concrete', g0.x, 0.06, g0.z, g0.w - t * 2, 0.16, g0.d - t * 2);

  const rooms = spec.rooms ?? [];
  for (let f = 0; f < floors; f++) {
    // Room plans are normalised, so they follow a setback automatically.
    const fs = floorSpec(spec, f);
    const iw = fs.w - t * 2;
    const id = fs.d - t * 2;
    const x0 = fs.x - iw / 2;
    const z0 = fs.z - id / 2;
    const fy = info.floorY[f] + (f === 0 ? 0.13 : 0.0);
    const fh = f === 0 ? groundH - 0.13 : upperH;
    // partitions for this floor
    const plan = rooms[f] ?? rooms[rooms.length - 1] ?? null;
    if (plan) {
      for (const wall of plan.walls) {
        const [ax, az, bx, bz, doorAt] = wall;
        const wx0 = x0 + ax * iw;
        const wz0 = z0 + az * id;
        const wx1 = x0 + bx * iw;
        const wz1 = z0 + bz * id;
        const len = Math.hypot(wx1 - wx0, wz1 - wz0);
        const ry = Math.atan2(wx1 - wx0, wz1 - wz0) - Math.PI / 2;
        _e.set(0, ry, 0);
        _q.setFromEuler(_e);
        _p.set((wx0 + wx1) / 2 - Math.sin(ry) * (it / 2), fy, (wz0 + wz1) / 2 - Math.cos(ry) * (it / 2));
        _s.set(1, 1, 1);
        const pm = new THREE.Matrix4().compose(_p, _q, _s);
        const holes = [];
        if (doorAt !== undefined && doorAt !== null) {
          holes.push({ x: -len / 2 + doorAt * len, y: 1.06, w: 1.05, h: 2.12 });
        }
        facadeWall(A, pm, {
          w: len,
          h: fh,
          t: it,
          key: 'plaster_white',
          openings: holes,
          rng,
          warp: 0.012,
          bevel: 0.012,
          paint: (px, py, pz, nx, ny, nz, out) => {
            const base = Math.max(0, 1 - py / 1.1);
            out[1] = Math.min(1, out[1] + base * base * 0.5);
            out[2] = Math.min(1, out[2] + base * base * 0.35);
          },
        });
        for (const hole of holes) {
          doorUnit(A, pm, hole, rng, { t: it, leaf: rng.float() < 0.4, open: 1.4, leafKey: 'wood_dark' });
        }
      }
    }

    // ---- stairs rising out of this floor ----
    for (const fl of spec.stairFlights ?? []) {
      if (fl.floor !== f) continue;
      const base = info.floorY[f] + (f === 0 ? 0.13 : 0);
      const climb = (info.floorY[f + 1] ?? info.roofY) - base;
      const steps = Math.max(6, Math.round(climb / 0.19));
      const rise = climb / steps;
      const run = fl.run ?? 0.275;
      const sw = fl.w ?? 1.2;
      _e.set(0, fl.ry ?? 0, 0);
      _q.setFromEuler(_e);
      _p.set(x0 + fl.x * iw, base, z0 + fl.z * id);
      _s.set(1, 1, 1);
      const pm = new THREE.Matrix4().compose(_p, _q, _s);
      stairRun(A, pm, 0, 0, 0, sw, steps, rise, run, {
        key: 'concrete_dark',
        railing: fl.railing ?? 'right',
      });
      const D = steps * run;
      const H = steps * rise;
      A.add('concrete_dark', BOX(A), LL(pm, 0, H - 0.1, D + 0.55, 0, sw + 0.1, 0.2, 1.1), {
        masks: [0.4, 0.5, 0.3],
      });
      const wp = worldOf(pm, 0, H - 0.1, D + 0.55);
      A.box('concrete', wp[0], wp[1], wp[2], sw + 0.1, 0.2, 1.1, fl.ry ?? 0);
    }

    // furnishing
    if (plan?.furnish) {
      for (const r of plan.furnish) {
        furnishRoom(A, rng, {
          kind: r.kind,
          // so furnishing never stacks a shelf across a shopfront opening
          street: spec.streetSide,
          x0: x0 + r.x0 * iw,
          z0: z0 + r.z0 * id,
          x1: x0 + r.x1 * iw,
          z1: z0 + r.z1 * id,
          y: fy,
          h: fh,
          spec,
        });
      }
    }
  }

  // roof access: a stair penthouse box with an open doorway
  if (spec.roofAccess) {
    const rs = floorSpec(spec, floors - 1);
    const riw = rs.w - t * 2;
    const rid = rs.d - t * 2;
    const st = spec.stairFlights?.[spec.stairFlights.length - 1];
    const px = rs.x - riw / 2 + (st?.x ?? 0.5) * riw;
    const pz = rs.z - rid / 2 + (st?.z ?? 0.5) * rid + 3.6;
    const y = info.roofY;
    for (let side = 0; side < 4; side++) {
      const pm = panelMatrix({ x: px, z: pz, w: 2.4, d: 2.6 }, side, y).clone();
      const holes = side === 2 ? [{ x: 0, y: 1.08, w: 1.05, h: 2.16 }] : [];
      facadeWall(A, pm, {
        w: side === 0 || side === 2 ? 2.4 : 2.6,
        h: 2.5,
        t: 0.22,
        key: spec.wallKey ?? 'plaster_cream',
        openings: holes,
        rng,
        warp: 0.015,
      });
    }
    A.add('concrete', BOX(A), LL(IDENT, px, y + 2.6, pz, 0, 2.7, 0.2, 2.9), {
      masks: [0.5, 0.45, 0.2],
    });
    A.box('concrete', px, y + 2.6, pz, 2.7, 0.2, 2.9);
  }
}

/** A hole in the roof slab and a matching heap of rubble on the floor below. */
export function collapseRoof(A, rng, spec, info, hole) {
  rubbleMound(A, rng, hole.x, info.floorY[info.floorY.length - 1] + 0.15, hole.z, 2.1, 26, {
    key: 'concrete',
  });
}
