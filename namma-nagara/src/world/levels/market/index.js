import { MARKET_LAYOUT } from './layout.js';
import { BUILDINGS } from '../../layout.js';
import { buildGround } from '../../ground.js';
import { buildBuilding, collapseRoof } from '../../buildings.js';
import { registerProps } from '../../props.js';
import {
  registerDressingProps,
  dressStreet,
  dressBuildings,
  scatterDebris,
  buildGate,
  buildPerimeter,
} from '../../dressing.js';

/**
 * LEVEL — "market". A ~120 x 120 m Middle-Eastern market street in the spirit of
 * Crash / Backlot: one main street, flanking alleys, eighteen buildings (three
 * enterable and furnished across multiple floors), an arched gate closing the
 * vista, and several thousand props.
 *
 * This is also the REFERENCE LEVEL for the pixel gate (`tools/baseline.mjs` +
 * `tools/imagediff.mjs`). The order of the calls in `build()` is load-bearing:
 * every builder draws from one shared seeded RNG stream, so inserting, removing
 * or reordering a single call moves every subsequent random draw in the level
 * and shifts the baseline. Do not touch it to add content — add a new level.
 */

/**
 * LEVEL -> WORLD. The street is authored down -Z; this yaw puts it on the axis
 * the canonical hero/sunset cameras look along, with the market in the near
 * third of the frame and the gate closing the far end.
 */
const LEVEL_YAW = 0.5877;
const LEVEL_TX = 0.9;
const LEVEL_TZ = 1.34;

/** Spawn points in LEVEL space: [x, z, yaw, tag]. */
const SPAWNS = [
  [0.4, 22.5, Math.PI, 'north street'],
  [-2.4, 30.0, Math.PI, 'north plaza'],
  [3.6, 5.0, Math.PI, 'market'],
  [-3.4, -12.0, 0, 'mid street'],
  [2.6, -32.0, 0, 'south street'],
  [-1.0, -39.0, 0, 'gate'],
  [10.5, 4.6, -Math.PI / 2, 'east alley'],
  [-9.0, -10.2, Math.PI / 2, 'west alley'],
];

export const marketLevel = {
  id: 'market',
  layout: MARKET_LAYOUT,
  transform: { yaw: LEVEL_YAW, tx: LEVEL_TX, tz: LEVEL_TZ },
  spawns: SPAWNS,
  /** Playable area in LEVEL space; WorldSystem bakes it to world space. */
  bounds: [
    [-62, -2, -62],
    [62, 26, 62],
  ],
  /**
   * Visible point-light slots to hold constant. Must be at least the worst-case
   * number of practicals in range at once: a sweep of the whole playable area at
   * three eye heights puts that at 10 for the world's own lights, plus whatever
   * `fx` keeps live. See `WorldSystem._addBallast`.
   */
  lightSlots: 20,

  /**
   * Build the level into the Assembler. Returns `{ buildings }` — the per-building
   * info records other systems (interiors, dressing, minimap) key off.
   */
  build(A, rng) {
    // 1. prototypes first: the level references them by id while it builds
    registerProps(A, rng);
    registerDressingProps(A, rng);

    // 2. ground, then the shells, then what people put in and on them
    buildGround(A, rng);

    const infos = [];
    for (const spec of BUILDINGS) {
      const info = buildBuilding(A, rng, spec);
      infos.push(info);
      if (spec.collapse) {
        collapseRoof(A, rng, spec, info, {
          x: spec.x + rng.range(-2, 2),
          z: spec.z + rng.range(-2, 2),
        });
      }
    }

    buildGate(A, rng);
    buildPerimeter(A, rng);
    dressStreet(A, rng);
    dressBuildings(A, rng, infos);
    scatterDebris(A, rng);

    return { buildings: infos };
  },
};
