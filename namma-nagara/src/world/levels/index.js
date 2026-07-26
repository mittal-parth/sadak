import { marketLevel } from './market/index.js';
import { bengaluruLevel } from './bengaluru/index.js';

/**
 * WORLD — the level registry.
 *
 * A level module is:
 *
 *   {
 *     id          string, matches the directory name and the `?level=` value
 *     layout      { STREET, ALLEYS, BUILDINGS, GATE, SET_PIECES } — installed
 *                 into the live bindings in `../layout.js` before anything builds
 *     transform   { yaw, tx, tz } LEVEL -> WORLD, baked into every vertex
 *     spawns      [[x, z, yaw, tag], …] in LEVEL space
 *     bounds      [[minX,minY,minZ], [maxX,maxY,maxZ]] in LEVEL space
 *     lightSlots  visible point-light count to hold constant (see _addBallast)
 *     build(A, rng) -> { buildings }   writes the level into the Assembler
 *   }
 *
 * `market` is the default and is under the zero-pixel-change gate; see
 * `./market/index.js`.
 */
export const LEVELS = {
  [marketLevel.id]: marketLevel,
  [bengaluruLevel.id]: bengaluruLevel,
};

export const DEFAULT_LEVEL = marketLevel.id;

export function getLevel(id) {
  const level = LEVELS[id];
  if (!level) {
    console.warn(
      `[world] unknown level "${id}" — falling back to "${DEFAULT_LEVEL}". ` +
        `known: ${Object.keys(LEVELS).join(', ')}`
    );
    return LEVELS[DEFAULT_LEVEL];
  }
  return level;
}
