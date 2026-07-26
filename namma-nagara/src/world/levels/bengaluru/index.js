import { BENGALURU_LAYOUT } from './layout.js';
import { BENGALURU_PALETTE } from './palette.js';
import { bengaluruStreet } from './street.js';
import { indianFacade } from './facade.js';
import { registerVehicles, placeVehicles } from './vehicles.js';
import { registerBengaluruProps } from './props.js';
import { dressBengaluru } from './dressing.js';
import { buildVidhanaSoudha } from './landmark.js';
import { BUILDINGS } from '../../layout.js';
import { buildGround } from '../../ground.js';
import { buildBuilding } from '../../buildings.js';
import { registerProps } from '../../props.js';
import {
  registerDressingProps,
  dressStreet,
  dressBuildings,
  buildPerimeter,
} from '../../dressing.js';

/**
 * LEVEL — "bengaluru". A commercial street in central Bengaluru.
 *
 * STATUS: skeleton. This is the M0 deliverable — it proves the level fork works
 * end to end and gives the Indian content somewhere to land. Right now it is the
 * existing kit and prop library arranged to Indian proportions with the war
 * dressing switched off; it does not yet READ as India. That comes from:
 *
 *   M1  Indian material set (tarpaulin, monsoon-stained plaster, moss concrete)
 *   M2  Kannada signage
 *   M3  Bengaluru ground: speed breakers, potholes, open drains, painted kerbs
 *   M4  Indian RCC kit: window grilles, rolling shutters, chajjas, Sintex tanks
 *   M5  Landmarks: Vidhana Soudha closing the -Z vista, temple, BMTC stand
 *   M6  Auto-rickshaws and traffic
 *   M7  Civilian crowd
 *   M8  The Indian street prop library
 *
 * Unlike `market`, this level is NOT under the zero-pixel-change gate — it is
 * expected to move every milestone. Reorder its build calls freely.
 */

/**
 * LEVEL -> WORLD. Same yaw as the market level so the canonical shot cameras
 * frame the street the same way and the two levels stay comparable.
 */
const LEVEL_YAW = 0.5877;
const LEVEL_TX = 0.9;
const LEVEL_TZ = 1.34;

/** Spawn points in LEVEL space: [x, z, yaw, tag]. */
const SPAWNS = [
  [0.0, 24.0, Math.PI, 'north street'],
  [-2.2, 32.0, Math.PI, 'north junction'],
  [3.0, 6.0, Math.PI, 'market'],
  [-3.0, -10.0, 0, 'mid street'],
  [2.4, -30.0, 0, 'south street'],
  [-1.0, -39.0, 0, 'vidhana soudha vista'],
  [9.5, 4.8, -Math.PI / 2, 'side lane'],
  [7.5, -19.5, -Math.PI / 2, 'auto stand'],
];

export const bengaluruLevel = {
  id: 'bengaluru',
  layout: BENGALURU_LAYOUT,
  paletteOverrides: BENGALURU_PALETTE,
  transform: { yaw: LEVEL_YAW, tx: LEVEL_TX, tz: LEVEL_TZ },
  spawns: SPAWNS,
  bounds: [
    [-62, -2, -62],
    [62, 26, 62],
  ],
  /**
   * Higher than the market level's 20: an Indian street at dusk is lit by shop
   * tube-lights, temple lamps and headlights, and M6/M8 add a lot of them. The
   * slot budget has to cover the worst case or the point-light count moves and
   * every lit material recompiles — see `WorldSystem._addBallast`.
   */
  lightSlots: 28,

  build(A, rng) {
    registerProps(A, rng);
    registerDressingProps(A, rng);
    registerBengaluruProps(A, rng);
    registerVehicles(A, rng);

    buildGround(A, rng);
    // Indian street furniture over the shared ground: speed breakers, painted
    // kerbs, storm-drain lids, tar patches.
    bengaluruStreet(A, rng);

    const infos = [];
    for (const spec of BUILDINGS) {
      infos.push(buildBuilding(A, rng, spec));
    }

    // Chajjas, window grilles, rolling shutters and roof tanks over the shells
    // the shared builder just produced.
    indianFacade(A, rng, infos);

    // No `buildGate` — the -Z vista terminator is a landmark, not an arch.
    buildVidhanaSoudha(A, rng);
    buildPerimeter(A, rng);
    // war: false — no barriers, sandbags, wrecks, rubble or oil-drum cover
    // clusters. Keeps stalls, palms, lamps, overhead lines and the floor.
    dressStreet(A, rng, { war: false });
    dressBuildings(A, rng, infos);
    // NO `scatterDebris`. That pass exists to sell a street that has been
    // shelled — brick chunks, slab shards, rebar, blown litter and rubble
    // mounds against every wall. On a working commercial street it just reads
    // as mess, and mess is what was making this level look cluttered rather
    // than Indian. Density here should come from ORDER: rows of vendor pitches,
    // a rank of autos, a line of poles.
    // The Indian layer on top of the shared dressing: vendor carts, BESCOM
    // poles, plastic chairs, bins, shrines, sachet strips.
    dressBengaluru(A, rng);
    // Autos last, so they sit on top of the dressing rather than under it.
    placeVehicles(A, rng);

    return { buildings: infos };
  },
};
