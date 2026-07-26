/**
 * WORLD — the ACTIVE map.
 *
 * The level itself lives under `src/world/levels/<id>/layout.js`. This module is
 * the indirection that lets more than one of them exist.
 *
 * WHY IT LOOKS LIKE THIS
 * `ground.js` and `dressing.js` were written against `import { STREET, ALLEYS,
 * BUILDINGS, GATE, SET_PIECES } from './layout.js'` — roughly forty call sites
 * between them. Threading a layout argument through every builder signature
 * would have been a large mechanical diff across two of the biggest files in the
 * repo, and the market level has to stay bit-identical (see the pixel gate).
 *
 * ES module exports are LIVE BINDINGS, so re-assigning an `export let` here is
 * observed by every importer with no change on their side at all. `setLayout()`
 * is therefore the whole level-switch mechanism, and the cost is that exactly
 * one level is loaded at a time — which is true of the game anyway.
 *
 * `setLayout()` must run BEFORE anything reads these, i.e. before the Assembler
 * starts building. `WorldSystem.init` does that as its first act.
 *
 * Sides, everywhere: 0 = -Z, 1 = +X, 2 = +Z, 3 = -X.
 */
import { MARKET_LAYOUT } from './levels/market/layout.js';

/** Street corridor: asphalt half-width, kerb/building line, pavement height, extent. */
export let STREET = MARKET_LAYOUT.STREET;
/** Alleys and open ground, as rects [x0, z0, x1, z1] with a surface tag. */
export let ALLEYS = MARKET_LAYOUT.ALLEYS;
/** Building footprints + facade programmes + normalised interior room plans. */
export let BUILDINGS = MARKET_LAYOUT.BUILDINGS;
/** The structure closing the far vista. */
export let GATE = MARKET_LAYOUT.GATE;
/** Hand-placed set pieces; dressing scatters the hundreds of small props around them. */
export let SET_PIECES = MARKET_LAYOUT.SET_PIECES;

/** Which level's layout is currently installed. */
export let ACTIVE = 'market';

/**
 * Install a level's layout. Every key is required — a level that genuinely has
 * no gate or no alleys passes an empty object/array rather than omitting it, so
 * a missing key stays a loud bug instead of silently inheriting the last level.
 */
export function setLayout(id, spec) {
  for (const k of ['STREET', 'ALLEYS', 'BUILDINGS', 'GATE', 'SET_PIECES']) {
    if (spec[k] === undefined) throw new Error(`level "${id}" layout is missing ${k}`);
  }
  STREET = spec.STREET;
  ALLEYS = spec.ALLEYS;
  BUILDINGS = spec.BUILDINGS;
  GATE = spec.GATE;
  SET_PIECES = spec.SET_PIECES;
  ACTIVE = id;
}
