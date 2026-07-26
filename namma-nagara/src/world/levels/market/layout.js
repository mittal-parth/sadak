/**
 * WORLD — the map.
 *
 * A Middle-Eastern market street in the spirit of Crash / Backlot: one long
 * main street running -Z, buildings tight to both kerbs, two flanking alleys, a
 * plaza, and an arched gate closing the far vista. All coordinates are in LEVEL
 * space; the WorldSystem rotates the whole thing so the street runs down the
 * canonical hero-shot camera axis.
 *
 * Sides: 0 = -Z, 1 = +X, 2 = +Z, 3 = -X.
 */

export const STREET = {
  halfWidth: 4.5, // asphalt
  kerb: 6.5, // building line
  walkH: 0.145,
  zMin: -58,
  zMax: 46,
};

/** Alleys and open ground, as rects [x0, z0, x1, z1]. */
export const ALLEYS = [
  { rect: [-27, -12.2, -6.5, -8.2], surface: 'dirt' }, // west alley (mid street)
  { rect: [-26, 20.2, -6.5, 24.2], surface: 'dirt' }, // west alley (near)
  { rect: [-25, 5.6, -6.5, 9.6], surface: 'dirt' }, // west courtyard — lets the
  // late sun through onto the market, and flanks the main street
  { rect: [6.5, 1.8, 29, 7.8], surface: 'dirt' }, // east alley — main flank
  { rect: [6.5, -14.2, 29, -30.2], surface: 'gravel' }, // yard behind the ruin
  { rect: [-30, -50, 30, -44], surface: 'dirt' }, // far cross street
];

/**
 * Buildings. `w` is the X extent, `d` the Z extent.
 * Interiors are described in normalised room coordinates (0..1 across the
 * interior), so a plan survives a change of footprint.
 */
export const BUILDINGS = [
  // ------------------------------------------------------------- west row --
  {
    id: 'W5',
    x: -12.5,
    z: 31,
    w: 12,
    d: 14,
    floors: 2,
    setback: { from: 1, depth: 2.2, side: 1 },
    wallKey: 'plaster_cream',
    streetSide: 1,
    secondarySide: 0,
    damage: 0.15,
    balconies: 0.3,
    doorBays: { 1: 1 },
    roofProps: 3,
  },
  {
    id: 'W1',
    x: -13.5,
    z: 15,
    w: 14,
    d: 10,
    floors: 2,
    setback: { from: 1, depth: 2.6, side: 1 },
    wallKey: 'plaster_cream',
    trimKey: 'concrete',
    streetSide: 1,
    secondarySide: 2,
    damage: 0.25,
    balconies: 0.55,
    arches: true,
    doorBays: { 1: 1 },
    roofProps: 4,
  },
  {
    id: 'W2',
    x: -14,
    z: -1.5,
    w: 15,
    d: 13,
    floors: 2,
    setback: { from: 1, depth: 2.4, side: 1 },
    wallKey: 'plaster_sand',
    streetSide: 1,
    secondarySide: 0,
    damage: 0.3,
    balconies: 0.6,
    doorBays: { 1: 2 },
    // The interior camera stands in the shop and looks out through bay 1 of the
    // street facade, so that bay is an open shopfront by hand, not by dice.
    bayKinds: { 1: { 0: { 1: { kind: 'shop', drop: 0 } } } },
    enterable: true,
    roofAccess: false,
    roofProps: 5,
    stairFlights: [{ floor: 0, x: 0.14, z: 0.28, ry: 0, w: 1.2, railing: 'right' }],
    stairHoles: { 1: { x0: -20.4, x1: -18.0, z0: -4.8, z1: 1.5 } },
    rooms: [
      {
        // ground floor: a shop opening onto the street, storage and a back room
        walls: [
          [0.55, 0.0, 0.55, 1.0, 0.34],
          [0.0, 0.52, 0.55, 0.52, 0.7],
        ],
        furnish: [
          { kind: 'shop', x0: 0.55, z0: 0.0, x1: 1.0, z1: 1.0 },
          { kind: 'storage', x0: 0.0, z0: 0.0, x1: 0.55, z1: 0.52 },
          { kind: 'living', x0: 0.0, z0: 0.52, x1: 0.55, z1: 1.0 },
        ],
      },
      {
        // first floor: apartment
        walls: [
          [0.48, 0.0, 0.48, 1.0, 0.62],
          [0.48, 0.45, 1.0, 0.45, 0.25],
        ],
        furnish: [
          { kind: 'living', x0: 0.48, z0: 0.45, x1: 1.0, z1: 1.0 },
          { kind: 'storage', x0: 0.48, z0: 0.0, x1: 1.0, z1: 0.45 },
          { kind: 'living', x0: 0.0, z0: 0.0, x1: 0.48, z1: 1.0 },
        ],
      },
      {
        walls: [[0.5, 0.0, 0.5, 1.0, 0.5]],
        furnish: [
          { kind: 'ruin', x0: 0.5, z0: 0.0, x1: 1.0, z1: 1.0 },
          { kind: 'storage', x0: 0.0, z0: 0.0, x1: 0.5, z1: 1.0 },
        ],
      },
    ],
  },
  {
    id: 'W3',
    x: -13,
    z: -19,
    w: 13,
    d: 14,
    floors: 2,
    wallKey: 'plaster_blue',
    streetSide: 1,
    secondarySide: 2,
    damage: 0.55,
    ruin: true,
    ruinSide: 1,
    balconies: 0.3,
    doorBays: { 1: 0 },
    roofProps: 2,
  },
  {
    id: 'W4',
    x: -14.5,
    z: -34.5,
    w: 16,
    d: 15,
    floors: 2,
    setback: { from: 1, depth: 2.8, side: 1 },
    wallKey: 'plaster_pink',
    streetSide: 1,
    secondarySide: 0,
    damage: 0.3,
    balconies: 0.5,
    arches: true,
    doorBays: { 1: 2 },
    roofProps: 4,
  },

  // ------------------------------------------------------------- east row --
  {
    id: 'E5',
    x: 12.5,
    z: 33,
    w: 12,
    d: 14,
    floors: 2,
    wallKey: 'plaster_blue',
    streetSide: 3,
    damage: 0.2,
    doorBays: { 3: 2 },
    roofProps: 3,
  },
  {
    id: 'E1',
    x: 14,
    z: 16,
    w: 15,
    d: 16,
    floors: 3,
    wallKey: 'plaster_cream',
    streetSide: 3,
    secondarySide: 0,
    damage: 0.3,
    balconies: 0.45,
    doorBays: { 3: 2, 0: 1 },
    enterable: true,
    roofAccess: true,
    roofProps: 6,
    stairFlights: [
      { floor: 0, x: 0.72, z: 0.12, ry: 0, w: 1.2, railing: 'right' },
      { floor: 1, x: 0.72, z: 0.12, ry: 0, w: 1.2, railing: 'right' },
    ],
    stairHoles: {
      1: { x0: 16.3, x1: 18.1, z0: 9.4, z1: 16.2 },
      2: { x0: 16.3, x1: 18.1, z0: 9.4, z1: 16.2 },
    },
    rooms: [
      {
        walls: [
          [0.0, 0.42, 0.62, 0.42, 0.3],
          [0.62, 0.0, 0.62, 0.42, 0.5],
        ],
        furnish: [
          { kind: 'shop', x0: 0.0, z0: 0.42, x1: 0.62, z1: 1.0 },
          { kind: 'storage', x0: 0.0, z0: 0.0, x1: 0.62, z1: 0.42 },
        ],
      },
      {
        walls: [[0.0, 0.45, 0.62, 0.45, 0.72]],
        furnish: [
          { kind: 'living', x0: 0.0, z0: 0.45, x1: 0.62, z1: 1.0 },
          { kind: 'ruin', x0: 0.0, z0: 0.0, x1: 0.62, z1: 0.45 },
        ],
      },
    ],
  },
  {
    id: 'E2',
    x: 13.5,
    z: -5,
    w: 14,
    d: 14,
    floors: 3,
    wallKey: 'plaster_blue',
    streetSide: 3,
    secondarySide: 2,
    damage: 0.3,
    balconies: 0.7,
    doorBays: { 3: 1 },
    roofProps: 5,
  },
  {
    id: 'E3',
    x: 14,
    z: -22,
    w: 15,
    d: 16,
    floors: 2,
    wallKey: 'plaster_sand',
    streetSide: 3,
    secondarySide: 0,
    damage: 0.75,
    ruin: true,
    ruinSide: 3,
    collapse: true,
    doorBays: { 3: 1 },
    enterable: true,
    roofProps: 2,
    rooms: [
      {
        walls: [[0.45, 0.0, 0.45, 0.7, 0.4]],
        furnish: [
          { kind: 'ruin', x0: 0.45, z0: 0.0, x1: 1.0, z1: 1.0 },
          { kind: 'storage', x0: 0.0, z0: 0.0, x1: 0.45, z1: 0.7 },
          { kind: 'ruin', x0: 0.0, z0: 0.7, x1: 0.45, z1: 1.0 },
        ],
      },
      {
        walls: [],
        furnish: [{ kind: 'ruin', x0: 0.0, z0: 0.0, x1: 1.0, z1: 1.0 }],
      },
    ],
  },
  {
    id: 'E4',
    x: 13.5,
    z: -39,
    w: 14,
    d: 14,
    floors: 3,
    wallKey: 'plaster_pink',
    streetSide: 3,
    secondarySide: 2,
    damage: 0.35,
    balconies: 0.4,
    arches: true,
    doorBays: { 3: 2 },
    roofProps: 4,
  },

  // ------------------------------------------------- background / infill --
  /**
   * The mass BEHIND the gate. Only its top four metres and its roofline are
   * visible — through the sliver of sky over the arch spandrel — but that is the
   * whole point: it is the third plane of depth that stops the terminator
   * reading as a flat cut-out, and it is offset west so a slice of real sky
   * survives on the east side of the gap.
   */
  { id: 'BS3', x: -4, z: -53, w: 9, d: 8, floors: 4, wallKey: 'plaster_sand', streetSide: 2, damage: 0.3, balconies: 0.2, roofProps: 4 },
  { id: 'BW1', x: -30, z: 8, w: 16, d: 22, floors: 3, wallKey: 'plaster_sand', streetSide: 1, damage: 0.15, skipSides: [1], roofProps: 3 },
  { id: 'BW2', x: -31, z: -18, w: 18, d: 24, floors: 2, wallKey: 'plaster_cream', streetSide: 1, damage: 0.2, skipSides: [1], roofProps: 2 },
  { id: 'BE1', x: 31, z: 18, w: 18, d: 20, floors: 3, wallKey: 'plaster_pink', streetSide: 3, damage: 0.15, skipSides: [3], roofProps: 3 },
  { id: 'BE2', x: 32, z: -8, w: 18, d: 20, floors: 2, wallKey: 'plaster_blue', streetSide: 3, damage: 0.2, skipSides: [3], roofProps: 2 },
  { id: 'BE3', x: 30, z: -34, w: 16, d: 18, floors: 3, wallKey: 'plaster_cream', streetSide: 3, damage: 0.25, skipSides: [3], roofProps: 2 },
  // BS1/BS2 pulled apart to make room for BS3 in the middle of the far skyline.
  { id: 'BS1', x: -19, z: -58, w: 20, d: 14, floors: 3, wallKey: 'plaster_sand', streetSide: 2, damage: 0.2, roofProps: 2 },
  { id: 'BS2', x: 14, z: -60, w: 24, d: 16, floors: 2, wallKey: 'plaster_blue', streetSide: 2, damage: 0.2, roofProps: 2 },
  { id: 'BN1', x: -16, z: 50, w: 20, d: 14, floors: 2, wallKey: 'plaster_cream', streetSide: 0, damage: 0.15, roofProps: 2 },
  { id: 'BN2', x: 14, z: 52, w: 22, d: 16, floors: 3, wallKey: 'plaster_pink', streetSide: 0, damage: 0.15, roofProps: 2 },
];

/**
 * The street terminator at the south end of the vista.
 *
 * This is the surface the eye lands on in eight of the eleven canonical shots,
 * so it is not one flat crenellated slab: it is a mass of four blocks at four
 * different heights, stepped in Z as well as Y, with a pointed archway through
 * the middle and a genuine sliver of sky over the arch that shows the receding
 * roofline of `BS3` behind it. Three planes of depth (bastion / gatehouse /
 * background block) is what makes the alley read as continuing rather than as
 * ending at a wall.
 *
 *   xL0..xL1  the left (west) gatehouse block, lowest of the four
 *   xR0..xR1  the right (east) block
 *   xT0..xT1  the tower/bastion, tallest and standing PROUD in +Z
 */
export const GATE = {
  z: -42.5,
  depth: 3.2,
  span: 5.6,
  height: 4.9,
  outerW: 17,
  /** Height over the arch spandrel — deliberately the LOWEST part of the mass. */
  bodyH: 6.7,
  /** West block. */
  xL0: -8.6,
  xL1: -2.8,
  hL: 7.9,
  /** East block, standing half a metre proud of the arch. */
  xR0: 2.8,
  xR1: 6.1,
  hR: 9.5,
  eastProud: 0.55,
  /**
   * Tower. Standing 1.5 m proud toward the camera matters for a specific
   * reason: at 16:30 the sun is in the level's -X/-Z quadrant, so the whole
   * north elevation of the terminator is in shade and its WEST returns are in
   * full sun. Pushing the tower forward turns that return into a wide sunlit
   * flank facing the camera — two stops brighter than the shaded face beside it,
   * which is the value break the elevation needs.
   */
  xT0: 6.1,
  xT1: 9.4,
  hT: 12.4,
  towerProud: 1.5,
};

/** Hand-placed set pieces. Dressing adds the hundreds of small props around these. */
export const SET_PIECES = {
  /** Market stalls: [x, z, ry, width] */
  stalls: [
    [-3.2, 6.4, 0.08, 2.4],
    [-3.0, 2.2, -0.05, 2.2],
    [3.1, 9.5, 3.2, 2.4],
    [3.4, 4.0, 3.05, 2.6],
    [-0.4, 2.6, 1.62, 2.3],
    [3.0, -9.0, 3.25, 2.2],
    [-3.3, -14.5, 0.12, 2.4],
    [2.9, -20.0, 3.0, 2.3],
  ],
  /** Jersey barriers: [x, z, ry] */
  jerseys: [
    [-2.6, 17.5, 0.12],
    [-0.4, 16.2, 1.5],
    [2.9, 12.0, -0.1],
    [1.6, -2.5, 1.62],
    [-2.4, -6.0, 0.05],
    [3.2, -16.0, 0.1],
    [-1.0, -24.0, 1.55],
    [1.2, -30.0, 0.2],
    [-3.0, -34.0, 0.0],
  ],
  /** Sandbag emplacements: [x, z, ry, length] */
  sandbagWalls: [
    [-3.6, 11.0, 0.0, 3.0],
    [3.6, -2.0, 0.0, 2.6],
    [-1.6, -18.5, 1.57, 2.4],
    [3.4, -27.0, 0.0, 3.2],
  ],
  /** Burnt-out vehicles: [x, z, ry, rollDeg] */
  wrecks: [
    [2.5, 0.5, 0.42, 0],
    [-2.8, -28.5, -2.6, 4],
    [4.9, 24.0, 1.5, 0],
  ],
  /** Palm trees: [x, z, scale] */
  palms: [
    [-5.4, 20.0, 1.0],
    [5.5, 6.5, 1.1],
    [-5.5, -4.5, 0.92],
    [5.6, -20.5, 1.05],
    [-5.5, -32.0, 1.0],
    [8.5, 5.0, 0.85],
    [-9.0, -10.2, 0.9],
  ],
  /** Street lamps: [x, z, ry] — ry points the arm across the street. */
  lamps: [
    [-5.9, 15.0, -Math.PI / 2],
    [5.9, 3.0, Math.PI / 2],
    [-5.9, -11.0, -Math.PI / 2],
    [5.9, -24.0, Math.PI / 2],
    [-5.9, -36.0, -Math.PI / 2],
  ],
  /** Overhead cable spans: [x0, y0, z0, x1, y1, z1, sag] */
  cables: [
    [-6.4, 7.2, 10.0, 6.4, 6.6, 12.5, 1.1],
    [-6.4, 8.4, -2.0, 6.4, 7.9, -0.5, 1.4],
    [-6.4, 6.2, -16.0, 6.4, 6.6, -14.5, 1.0],
    [-6.4, 7.6, -30.0, 6.4, 7.2, -28.0, 1.2],
    [-6.4, 5.4, 19.0, -6.4, 5.6, 24.5, 0.6],
    [6.4, 5.6, 2.0, 6.4, 5.4, 8.0, 0.7],
  ],
  /** Laundry lines with hanging cloth: [x0, y0, z0, x1, y1, z1] */
  laundry: [
    // Kept off the main sightline and up at balcony height: lines that cross the
    // street at eye level clutter the vista and read as floating cards.
    [6.35, 3.6, 9.0, 6.35, 3.75, 14.2],
    [-6.35, 3.7, 1.0, -6.35, 3.6, 5.4],
    [-6.35, 6.6, -20.5, -6.35, 6.4, -15.5],
    [6.35, 6.5, -6.0, 6.35, 6.7, -1.0],
    [-6.35, 3.65, -27.0, -6.35, 3.8, -22.0],
    [6.4, 3.7, 21.0, 6.4, 3.6, 25.5],
  ],
  /** Hanging rugs / cloth on facades: [x, y, z, ry, w, h] */
  hangings: [
    [-6.45, 2.6, 8.5, Math.PI / 2, 1.5, 2.1],
    [-6.45, 2.4, 4.5, Math.PI / 2, 1.2, 1.7],
    [6.45, 2.7, 6.0, -Math.PI / 2, 1.6, 2.2],
    [6.45, 2.5, -8.5, -Math.PI / 2, 1.3, 1.9],
    [-6.45, 2.5, -16.0, Math.PI / 2, 1.4, 2.0],
  ],
  /** Rubble piles: [x, z, radius, count] */
  rubble: [
    [-4.2, -20.5, 2.4, 34],
    [5.0, -14.5, 2.8, 40],
    [-1.5, -40.0, 2.0, 26],
    [7.6, -30.5, 2.2, 28],
    [-5.0, 26.0, 1.6, 18],
  ],
  /** Tyre stacks: [x, z, n] */
  tyres: [
    [-5.2, 12.5, 4],
    [5.3, -6.0, 3],
    [6.2, 3.0, 5],
    [-5.4, -28.0, 3],
  ],
};

/**
 * The layout bundle handed to `setLayout()` when this level is selected.
 * Keep the key set identical across levels — `ground.js` and `dressing.js`
 * read these through the live bindings in `src/world/layout.js`.
 */
export const MARKET_LAYOUT = { STREET, ALLEYS, BUILDINGS, GATE, SET_PIECES };
