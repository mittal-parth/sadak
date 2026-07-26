import * as THREE from 'three';
import { LL, BOX_THIN } from '../../kit.js';
import { chamferBox, tubeY, fillMasks } from '../../util.js';

/**
 * WORLD — Indian facade pass.
 *
 * Runs AFTER `buildBuilding` and decorates the shells it produced, using the
 * anchor records it returns (`info.windows`, `info.awnings`, `info.roofY`).
 * Nothing here edits `buildings.js` or `kit.js`, which are shared with the
 * market level and whose RNG draw order is load-bearing.
 *
 * PANEL SPACE, as everywhere in the kit: x along the wall, y up from the floor,
 * z in from the OUTER face — so anything projecting into the street is at
 * NEGATIVE z.
 *
 * WHAT GOES ON, AND WHY THESE FOUR
 *
 *  1. CHAJJA — the cantilevered concrete weather ledge over every opening.
 *     This is the highest-signal element on an Indian building and it is doing
 *     two jobs: it is a shape no Levantine facade has, and it is what generates
 *     the black monsoon tail down the wall beneath it. The shader draws that
 *     streak off world Y, so the chajja gets a grime mask driven to ~1 on its
 *     underside lip to seed the run (see util.runoffStreak / the OW_VCOL_MASKS
 *     branch in shader.js).
 *
 *  2. WINDOW GRILLE — mild-steel bars over every opening on every floor. The
 *     base kit only grilles ~55% of GROUND-floor windows; in India they go all
 *     the way up, and their absence upstairs is very visible.
 *
 *  3. ROLLING SHUTTER — the corrugated steel shutter on every ground-floor
 *     shop, half of them down.
 *
 *  4. SINTEX TANK — the black water tank on the roof. Every building has one
 *     and it breaks the roofline the way nothing else does.
 */

const _m = new THREE.Matrix4();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function levelMat(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(0, ry, 0);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

// ------------------------------------------------------------------ chajja --
/**
 * The weather ledge. A real chajja is a thin RCC slab, 45-60 cm of projection,
 * with a drip groove on the underside and a slight fall so water runs off the
 * front edge rather than back into the wall.
 */
function chajja(A, pm, x, y, w, wallKey, opts = {}) {
  // SIZING, corrected after looking at it in the level. The first pass used the
  // real-world 45-60 cm projection at 7.5 cm thick, which is accurate for a
  // chajja over a DOOR but reads as a continuous concrete shelf when it is
  // repeated over every window on every floor — the facade turned into a stack
  // of balconies. Over a window the ledge is shallower, and what has to survive
  // is the thin cantilevered LINE, not the mass.
  const proj = opts.proj ?? 0.3;
  const th = opts.th ?? 0.055;
  const width = w + (opts.over ?? 0.16);
  const box = BOX_THIN(A);

  // The slab itself, sloping very slightly down toward the street.
  A.add('concrete', box, LL(pm, x, y, -proj / 2 + 0.02, 0, width, th, proj), {
    masks: [0.25, 0.35, 0],
  });
  // Front lip — a chajja is read from below, and this edge is its silhouette.
  // Kept to a nose rather than a fascia, or it reads as a beam.
  A.add('concrete', box, LL(pm, x, y - 0.012, -proj + 0.02, 0, width, th * 1.15, 0.04), {
    masks: [0.4, 0.5, 0],
  });
  // The drip groove line, dirty: this is where the water leaves and it is the
  // source of the stain on the wall below.
  A.add('concrete_dark', box, LL(pm, x, y - th * 0.55, -proj * 0.62, 0, width * 0.98, 0.018, 0.05), {
    masks: [0, 1.0, 0.9],
  });
  // Seed the runoff. shader.js turns a high grime mask on a near-vertical face
  // into a rain streak (the OW_VCOL_MASKS branch), so this is a wafer of the
  // WALL's own material sitting 2 mm proud under the ledge with g driven to 1.
  // It has to be the wall key or the stain is a different material to the wall.
  A.add(wallKey, box, LL(pm, x, y - 0.95, 0.002, 0, width * 0.72, 1.8, 0.004), {
    masks: [0, 1.0, 0.2],
  });
}

// ------------------------------------------------------------------ grille --
/**
 * MS window grille: a welded grid of square-section bar sitting in the reveal.
 * Verticals every ~11 cm with two or three horizontal rails, which is what a
 * fabricator actually makes. Bars are 16 mm — thin enough that the 12-tri box
 * is the right primitive, and there are a lot of them.
 */
function grille(A, pm, x, y, w, h, rng, opts = {}) {
  const key = opts.key ?? 'steel';
  const z = opts.z ?? 0.055;
  const bar = 0.016;
  const box = BOX_THIN(A);
  const inset = 0.03;
  const gw = w - inset * 2;
  const gh = h - inset * 2;

  // Perimeter frame — heavier flat bar than the infill.
  A.add(key, box, LL(pm, x, y + gh / 2, z, 0, gw, 0.028, 0.028), { masks: [0.5, 0.3, 0] });
  A.add(key, box, LL(pm, x, y - gh / 2, z, 0, gw, 0.028, 0.028), { masks: [0.5, 0.4, 0] });
  A.add(key, box, LL(pm, x - gw / 2, y, z, 0, 0.028, gh, 0.028), { masks: [0.5, 0.3, 0] });
  A.add(key, box, LL(pm, x + gw / 2, y, z, 0, 0.028, gh, 0.028), { masks: [0.5, 0.3, 0] });

  const n = Math.max(3, Math.round(gw / 0.11));
  for (let i = 1; i < n; i++) {
    const bx = x - gw / 2 + (i / n) * gw;
    A.add(key, box, LL(pm, bx, y, z, 0, bar, gh, bar), { masks: [0.45, 0.35, 0] });
  }
  const rails = gh > 1.5 ? 3 : 2;
  for (let i = 1; i <= rails; i++) {
    const by = y - gh / 2 + (i / (rails + 1)) * gh;
    A.add(key, box, LL(pm, x, by, z, 0, gw, bar, bar), { masks: [0.45, 0.4, 0] });
  }

  // Roughly a third of grilles have the decorative bent-bar motif in the
  // middle panel — the cheap fabricator's flourish. A single diagonal cross is
  // enough to break the grid at a distance.
  if (rng.float() < 0.34) {
    const d = Math.min(gw, gh) * 0.34;
    for (const s of [-1, 1]) {
      A.add(key, box, LL(pm, x, y, z - 0.006, 0, d * 1.4, bar * 0.9, bar * 0.9, 0, s * 0.78), {
        masks: [0.5, 0.35, 0],
      });
    }
  }
}
// ---------------------------------------------------------- rolling shutter --
/**
 * Corrugated steel roller shutter. Drawn as a slatted panel from the head down
 * to `openFrac` of the opening height, plus the barrel housing above it.
 */
function rollingShutter(A, pm, x, yTop, w, h, rng, key) {
  const box = BOX_THIN(A);
  const drop = h;
  // Nothing at all if this bay has no shutter. The first pass drew the barrel
  // housing unconditionally, which parked a dark box over every awning anchor
  // on the building including the upper floors, where no shutter exists.
  if (drop < 0.05) return;

  // Barrel housing over the opening.
  A.add('metal_dark', box, LL(pm, x, yTop + 0.14, -0.1, 0, w + 0.12, 0.26, 0.24), {
    masks: [0.4, 0.5, 0],
  });
  // The curtain: individual slats so it catches a highlight per slat rather
  // than reading as one flat sheet. 8 cm slats is standard.
  const slats = Math.max(1, Math.round(drop / 0.08));
  for (let i = 0; i < slats; i++) {
    const sy = yTop - (i + 0.5) * (drop / slats);
    A.add(key, box, LL(pm, x, sy, -0.05, 0, w, drop / slats - 0.008, 0.035), {
      masks: [0.35 + (i % 2) * 0.15, 0.3 + (i / slats) * 0.45, 0],
    });
  }
  // Bottom rail — heavier, and the thing that gets kicked and dented.
  A.add('metal_dark', box, LL(pm, x, yTop - drop, -0.05, 0, w + 0.03, 0.07, 0.055), {
    masks: [0.8, 0.5, 0],
  });
  // Side guide channels.
  for (const s of [-1, 1]) {
    A.add('metal_dark', box, LL(pm, x + s * (w / 2 + 0.03), yTop - drop / 2, -0.05, 0, 0.05, drop, 0.07), {
      masks: [0.5, 0.45, 0],
    });
  }
}

// ------------------------------------------------------------- sintex tank --
/**
 * The rooftop water tank. Vertically ribbed polyethylene, on a low plinth of
 * bricks, with the inlet pipe running down. Black is the common one; the
 * three-layer tanks are also sold in that particular pale blue.
 */
function waterTank(A, rng, x, y, z) {
  const r = 0.52;
  const hgt = 0.95;
  const key = rng.float() < 0.72 ? 'tank_black' : 'tank_blue';

  // tubeY already translates so the origin is at the base of the tube.
  const body = A.cache('sintex:body', () => tubeY(r, hgt, { radial: 14 }));
  A.add(key, body, levelMat(x, y + 0.14, z), { masks: [0.3, 0.45, 0] });

  // Domed lid, and the little handle on it.
  const lid = A.cache('sintex:lid', () => {
    const g = new THREE.SphereGeometry(r * 0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
    fillMasks(g, 0.3, 0.3, 0);
    return g;
  });
  A.add(key, lid, levelMat(x + r * 0.3, y + hgt + 0.14, z), null);

  // Brick plinth — a tank never sits straight on the slab.
  const plinth = A.cache('sintex:plinth', () => chamferBox(r * 2.1, 0.14, r * 2.1, 0.01));
  A.add('brick', plinth, levelMat(x, y + 0.07, z, rng.range(-0.2, 0.2)), {
    masks: [0.3, 0.6, 0.2],
  });

  // Inlet pipe down the side.
  const pipe = A.cache('sintex:pipe', () => tubeY(0.026, 1.5, { radial: 7 }));
  A.add('pvc_pipe', pipe, levelMat(x + r + 0.05, y, z + r * 0.4), {
    masks: [0.2, 0.4, 0],
  });
}

// =============================================================== the pass ==
export function indianFacade(A, rng, infos) {
  for (const info of infos) {
    const spec = info.spec;
    const wallKey = spec.wallKey ?? 'plaster_cream';

    // ---- chajjas + grilles over every opening ---------------------------
    for (const wnd of info.windows) {
      // Ground-floor shopfronts get a shutter housing instead of a chajja.
      chajja(A, wnd.pm, wnd.x, wnd.y + wnd.h / 2 + 0.12, wnd.w, wallKey, {
        proj: 0.28 + rng.range(-0.03, 0.07),
      });
      if (wnd.state !== 'boarded') {
        grille(A, wnd.pm, wnd.x, wnd.y, wnd.w, wnd.h, rng, {
          key: rng.float() < 0.25 ? 'metal_blue' : 'steel',
        });
      }
    }

    // ---- rolling shutters on the shopfronts ------------------------------
    for (const aw of info.awnings) {
      // `aw.y` is the awning height; the shopfront head sits just under it.
      const head = aw.y - 0.5;
      // Half the shops are shut. An open one still shows its housing.
      const closed = rng.float();
      const drop = closed < 0.34 ? head - 0.1 : closed < 0.6 ? (head - 0.1) * rng.range(0.3, 0.6) : 0;
      rollingShutter(
        A,
        aw.pm,
        aw.x,
        head,
        Math.min(aw.w, 2.6),
        drop,
        rng,
        rng.pick(['shutter_blue', 'shutter_green', 'shutter_grey'])
      );
    }

    // ---- roof tanks -------------------------------------------------------
    const y = info.roofY ?? info.top ?? 0;
    const n = spec.floors >= 4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const ox = rng.range(-spec.w * 0.28, spec.w * 0.28);
      const oz = rng.range(-spec.d * 0.28, spec.d * 0.28);
      waterTank(A, rng, spec.x + ox, y + 0.05, spec.z + oz);
    }
  }
}
