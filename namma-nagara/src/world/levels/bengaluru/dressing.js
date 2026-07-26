import { STREET } from '../../layout.js';
import { groundY } from '../../dressing.js';

/**
 * WORLD — Bengaluru set dressing.
 *
 * Runs after the shared `dressStreet` / `dressBuildings` passes and adds the
 * Indian layer on top of them. Those two are kept because most of what they
 * place is country-neutral — cables, laundry lines, awnings, street lamps,
 * planters, palms — and the war-specific set pieces (sandbag walls, jersey
 * barriers, wrecks, shelling rubble) are already switched off by the empty
 * arrays in this level's `SET_PIECES`. `scatterDebris` is NOT called at all;
 * see the note in this level's build().
 *
 * PLACEMENT PRINCIPLE. Indian street commerce is not evenly scattered; it
 * CLUSTERS, and between the clusters the street is comparatively empty.
 *
 * This is the correction that mattered most. Spreading vendors evenly down the
 * whole street produced uniform clutter that read as a junkyard rather than as
 * a city — the eye had nowhere to rest and no sense of arriving anywhere. Real
 * commerce concentrates where the footfall is and thins out fast either side of
 * it. So there are exactly two pitches here — the market run around the north
 * junction and a smaller cluster by the auto stand — and long clear stretches
 * between them. Emptiness is doing as much work as the props.
 */

/** Footpath centre-line, just inside the kerb, on the given side. */
function walk(side, inset = 0.9) {
  return side * (STREET.kerb - inset);
}

export function dressBengaluru(A, rng) {
  const H = STREET.walkH;

  // ------------------------------------------------------------- vendors ---
  // Cluster 1: the market run, west footpath, z +9 to +3.
  // Cluster 2: by the auto stand, z -13 to -19.
  // Nothing between them, and nothing south of -20.
  const VENDORS = [
    // [id, side, z, ry offset]
    ['blr_coconut_cart', -1, 9.0, 0.1],
    ['blr_flower_stall', -1, 6.6, 0.0],
    ['blr_veg_cart', -1, 4.0, -0.08],
    ['blr_chai_cart', 1, 7.5, 0.06],
    ['blr_veg_cart', -1, -14.0, 0.0],
    ['blr_chai_cart', -1, -17.5, 0.1],
  ];
  for (const [id, side, z, dry] of VENDORS) {
    const x = walk(side, 0.95);
    // Carts face the road: on the west footpath (side -1) that is +X, i.e. a
    // yaw of +90°; on the east footpath it is the other way.
    const ry = (side < 0 ? Math.PI / 2 : -Math.PI / 2) + dry + rng.range(-0.05, 0.05);
    A.put(id, x, H, z, ry);
  }

  // --------------------------------------------------------------- chairs ---
  // Plastic chairs live outside the chai carts and the shops, in ones and twos,
  // never in a tidy row.
  const CHAIRS = [
    [-1, -18.6],
    [-1, -16.4],
    [1, 8.6],
  ];
  for (const [side, z] of CHAIRS) {
    A.put('blr_chair', walk(side, 0.55), H, z, rng.float() * Math.PI * 2);
  }
  A.put('blr_chair_stack', walk(-1, 0.5), H, 10.4, rng.float() * Math.PI * 2);

  // ----------------------------------------------------------- BESCOM poles --
  // Alternating sides down the street, ~22 m apart, hard against the kerb.
  // These are what the overhead cable spans in SET_PIECES hang between.
  const POLES = [
    [-1, 22.0],
    [1, 6.0],
    [-1, -10.0],
    [1, -26.0],
  ];
  for (const [side, z] of POLES) {
    A.put('blr_pole', side * (STREET.kerb - 0.35), H, z, rng.range(-0.06, 0.06));
    // A pole is a solid obstacle; the visual mesh is far too detailed for the BVH.
    A.box('concrete', side * (STREET.kerb - 0.35), H + 2.0, z, 0.26, 4.0, 0.22);
  }

  // ------------------------------------------------------------ bins/crates --
  for (const [side, z] of [
    [-1, 12.5],
    [1, -11.0],
  ]) {
    A.put('blr_bin', walk(side, 0.5), H, z, rng.float() * Math.PI * 2);
  }
  for (const [side, z] of [
    [-1, 2.0],
    [1, -15.5],
  ]) {
    A.put('blr_crates', walk(side, 0.65), H, z, rng.float() * Math.PI * 2);
  }

  // ------------------------------------------------------------- shrines ----
  // Two, both set against a building line facing the street.
  for (const [side, z] of [
    [-1, -7.0],
    [1, 26.5],
  ]) {
    const ry = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    A.put('blr_shrine', side * (STREET.kerb - 0.12), H, z, ry);
  }

  // ------------------------------------------------------------- sachets ----
  // Hung off the shopfront heads. `blr_sachets` has its origin at the TOP, so
  // the y here is the peg height, not a floor height.
  for (let i = 0; i < 8; i++) {
    const side = rng.float() < 0.5 ? -1 : 1;
    const z = rng.range(STREET.zMin + 6, STREET.zMax - 6);
    const x = side * (STREET.kerb - 0.28);
    // Only where there is actually a building to hang them from.
    if (groundY(x, z) > H + 0.05) continue;
    A.put('blr_sachets', x, 2.35 + rng.range(-0.12, 0.12), z, side < 0 ? Math.PI / 2 : -Math.PI / 2);
  }
}
