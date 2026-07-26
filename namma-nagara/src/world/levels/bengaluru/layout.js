/**
 * WORLD — the map: "bengaluru".
 *
 * A commercial street in central Bengaluru. Same authoring conventions as the
 * market level (LEVEL space, street running -Z, sides 0=-Z 1=+X 2=+Z 3=-X), but
 * proportioned Indian rather than Levantine:
 *
 *   - NARROWER CARRIAGEWAY, WIDER FOOTPATH. The road is ~8 m kerb to kerb, and
 *     the footpath is generous but half-obstructed. Indian streets are tight.
 *   - TALLER, THINNER BLOCKS. 3-4 storeys on 8-12 m frontages instead of 2
 *     storeys on 12-16 m. Mixed use: shutters at ground, homes above.
 *   - NO WAR DAMAGE. `damage` stays under 0.12 and nothing is a ruin. Indian
 *     buildings are weathered, not shelled — the wear comes from monsoon
 *     staining and unfinished concrete, which is a materials job (M1/M3), not a
 *     geometry one.
 *   - THE VISTA TERMINATOR IS A LANDMARK, not a gate. Vidhana Soudha lands at
 *     the -Z end in M5; until then `GATE` is present but unused.
 *
 * Building fields are documented in `../market/layout.js`.
 */

export const STREET = {
  halfWidth: 4.0, // asphalt: ~8 m kerb to kerb
  kerb: 5.8, // building line — a 1.8 m footpath, half of it occupied
  walkH: 0.16, // Indian kerbs are high; storm drains run under the footpath
  zMin: -58,
  zMax: 46,
};

/**
 * Cross lanes and open ground, as rects [x0, z0, x1, z1].
 *
 * These are REAL GAPS in the building rows, not overlays — the rows below are
 * laid out around them. An alley rect that sits inside a building footprint
 * puts gravel under a floor and a camera inside a wall.
 */
export const ALLEYS = [
  { rect: [-26, 20.0, -6.0, 26.0], surface: 'dirt' }, // west lane, north
  { rect: [6.0, 14.0, 28, 22.0], surface: 'dirt' }, // east lane to the market yard
  { rect: [-25, -12.0, -6.0, -6.0], surface: 'dirt' }, // west lane, mid
  { rect: [6.0, -20.0, 28, -12.0], surface: 'gravel' }, // the auto stand
  { rect: [-30, -56, 30, -50], surface: 'dirt' }, // cross street at the far end
];

export const BUILDINGS = [
  // -------------------------------------------------------------- west row --
  {
    id: 'BW1',
    x: -11.5,
    z: 31.5,
    w: 11,
    d: 11,
    floors: 3,
    wallKey: 'plaster_white',
    trimKey: 'concrete',
    streetSide: 1,
    secondarySide: 0,
    damage: 0.08,
    balconies: 0.45,
    doorBays: { 1: 1 },
    roofProps: 2,
  },
  {
    id: 'BW2',
    x: -11.0,
    z: 14.0,
    w: 10,
    d: 12,
    floors: 4,
    wallKey: 'plaster_pink',
    streetSide: 1,
    secondarySide: 2,
    damage: 0.06,
    balconies: 0.55,
    doorBays: { 1: 1 },
    roofProps: 2,
  },
  {
    id: 'BW3',
    x: -12.0,
    z: 1.0,
    w: 12,
    d: 14,
    floors: 3,
    wallKey: 'plaster_cream',
    trimKey: 'concrete',
    streetSide: 1,
    secondarySide: 0,
    damage: 0.1,
    balconies: 0.4,
    doorBays: { 1: 1 },
    roofProps: 2,
  },
  {
    id: 'BW4',
    x: -11.5,
    z: -18.0,
    w: 11,
    d: 12,
    floors: 4,
    wallKey: 'plaster_blue',
    streetSide: 1,
    secondarySide: 2,
    damage: 0.09,
    balconies: 0.5,
    doorBays: { 1: 1 },
    roofProps: 2,
  },
  {
    id: 'BW5',
    x: -12.5,
    z: -31.0,
    w: 13,
    d: 14,
    floors: 3,
    wallKey: 'plaster_sand',
    streetSide: 1,
    secondarySide: 0,
    damage: 0.11,
    balconies: 0.35,
    doorBays: { 1: 1 },
    roofProps: 1,
  },
  {
    id: 'BW6',
    x: -12.0,
    z: -44.0,
    w: 12,
    d: 10,
    floors: 3,
    wallKey: 'plaster_white',
    trimKey: 'concrete',
    streetSide: 1,
    secondarySide: 2,
    damage: 0.07,
    balconies: 0.45,
    doorBays: { 1: 1 },
    roofProps: 2,
  },

  // -------------------------------------------------------------- east row --
  {
    id: 'BE1',
    x: 11.5,
    z: 28.0,
    w: 11,
    d: 12,
    floors: 3,
    wallKey: 'plaster_cream',
    streetSide: 3,
    secondarySide: 0,
    damage: 0.08,
    balconies: 0.4,
    doorBays: { 3: 1 },
    roofProps: 2,
  },
  {
    id: 'BE2',
    x: 11.0,
    z: 8.0,
    w: 10,
    d: 12,
    floors: 4,
    wallKey: 'plaster_blue',
    trimKey: 'concrete',
    streetSide: 3,
    secondarySide: 2,
    damage: 0.06,
    balconies: 0.55,
    doorBays: { 3: 1 },
    roofProps: 2,
  },
  {
    id: 'BE3',
    x: 12.0,
    z: -6.0,
    w: 12,
    d: 12,
    floors: 3,
    wallKey: 'plaster_pink',
    streetSide: 3,
    secondarySide: 0,
    damage: 0.1,
    balconies: 0.4,
    doorBays: { 3: 1 },
    roofProps: 2,
  },
  {
    id: 'BE4',
    x: 11.5,
    z: -27.0,
    w: 11,
    d: 14,
    floors: 4,
    wallKey: 'plaster_white',
    streetSide: 3,
    secondarySide: 2,
    damage: 0.07,
    balconies: 0.5,
    doorBays: { 3: 1 },
    roofProps: 2,
  },
  {
    id: 'BE5',
    x: 12.0,
    z: -41.0,
    w: 12,
    d: 12,
    floors: 3,
    wallKey: 'plaster_sand',
    trimKey: 'concrete',
    streetSide: 3,
    secondarySide: 0,
    damage: 0.09,
    balconies: 0.35,
    doorBays: { 3: 1 },
    roofProps: 1,
  },
];

/**
 * Present so the layout key set matches every other level, but this level does
 * not call `buildGate` — the -Z vista is closed by Vidhana Soudha (M5).
 */
export const GATE = {
  z: -42.5,
  depth: 3.2,
  span: 5.6,
  height: 4.9,
  outerW: 17,
  bodyH: 6.7,
  xL0: -8.6,
  xL1: -2.8,
  hL: 7.9,
  xR0: 2.8,
  xR1: 6.1,
  hR: 9.5,
  eastProud: 0.55,
  xT0: 6.1,
  xT1: 9.4,
  hT: 12.4,
  towerProud: 1.5,
};

/**
 * Hand-placed set pieces.
 *
 * The empty arrays are deliberate and are how this level opts out of the war
 * dressing without touching `dressing.js`: `dressStreet` / `scatterDebris` loop
 * over these, so an empty list places nothing. Jersey barriers, sandbag
 * emplacements, burnt-out vehicles and shelling rubble all read as a conflict
 * zone and have no place on a Bengaluru high street.
 */
export const SET_PIECES = {
  /** Market stalls: [x, z, ry, width] — these stay; they become vendor carts. */
  stalls: [
    [-2.9, 8.2, 0.06, 2.2],
    [3.0, 5.6, 3.06, 2.4],
    [-3.0, -13.0, 0.1, 2.2],
    [2.9, -31.0, 3.1, 2.2],
  ],
  jerseys: [],
  sandbagWalls: [],
  wrecks: [],
  /** Coconut palms and rain trees: [x, z, scale] */
  palms: [
    [-5.0, 21.5, 1.05],
    [5.1, 8.0, 1.15],
    [-5.1, -3.0, 0.95],
    [5.2, -19.0, 1.1],
    [-5.1, -30.5, 1.0],
    [8.0, 5.5, 0.88],
    [-8.6, -10.8, 0.92],
    [5.1, 33.0, 1.0],
  ],
  /** Street lamps: [x, z, ry] — ry points the arm across the street. */
  lamps: [
    [-5.3, 16.5, -Math.PI / 2],
    [5.3, 4.5, Math.PI / 2],
    [-5.3, -9.5, -Math.PI / 2],
    [5.3, -22.5, Math.PI / 2],
    [-5.3, -34.5, -Math.PI / 2],
  ],
  /**
   * Overhead cable spans: [x0, y0, z0, x1, y1, z1, sag].
   * Denser and saggier than the market level — the overhead cable nest is one of
   * the strongest silhouette cues an Indian street has. M8 adds the BESCOM pole
   * bundles that make this read properly.
   */
  cables: [
    [-5.7, 6.9, 11.5, 5.7, 6.4, 14.0, 1.3],
    [-5.7, 8.1, -0.5, 5.7, 7.6, 1.0, 1.6],
    [-5.7, 6.0, -14.5, 5.7, 6.4, -13.0, 1.2],
    [-5.7, 7.4, -28.5, 5.7, 7.0, -26.5, 1.4],
  ],
  /** Laundry lines with hanging cloth: [x0, y0, z0, x1, y1, z1] */
  laundry: [
    [5.65, 3.6, 10.5, 5.65, 3.75, 15.7],
    [-5.65, 6.6, -19.0, -5.65, 6.4, -14.0],
    [5.65, 6.5, -4.5, 5.65, 6.7, 0.5],
  ],
  /** Hanging cloth on facades: [x, y, z, ry, w, h] — sari lengths, awning cloth. */
  hangings: [
    [-5.75, 2.6, 10.0, Math.PI / 2, 1.5, 2.1],
    [5.75, 2.7, 7.5, -Math.PI / 2, 1.6, 2.2],
    [-5.75, 2.5, -14.5, Math.PI / 2, 1.4, 2.0],
  ],
  rubble: [],
  /** Tyre stacks: [x, z, n] — puncture shops, not barricades. */
  tyres: [[5.4, -20.5, 4]],
};

export const BENGALURU_LAYOUT = { STREET, ALLEYS, BUILDINGS, GATE, SET_PIECES };
