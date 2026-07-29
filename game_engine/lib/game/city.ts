import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  makeBuilding, makeStall, makeStreetLight, makeTrafficLight, makeTree, mulberry32,
  makeBoat, makeBillboard, makeTram,
} from "./props";
import type { Theme } from "./districts";
import { buildBuildingParts } from "./buildings";
import type { MaterialLibrary } from "./materials";
import { createClutter, type Clutter } from "./clutter";
import { makeCar, TRAFFIC_KINDS, type VehicleMaterials } from "./vehicles";
import { makeBazaarGate, makeHaveliBalcony, makeIndiaGate } from "./assets/delhi";
import { getDistrictKit } from "./assets";

/**
 * Two lanes each way plus a parking strip. The old 9m gully put the facades
 * close enough that the street read as a corridor and every vehicle was
 * touching a kerb; widening it is most of what "spaced out" means here, and it
 * is what makes room for lane markings, parked cars and a signal mast to be
 * legible at once.
 */
export const ROAD_W = 13;
export const BLOCK = 40;         // building block size
export const SPACING = BLOCK + ROAD_W;
export const GRID = 3;           // road lines run from -GRID..GRID
export const WORLD_LIMIT = GRID * SPACING + BLOCK / 2;

/** Half-width of the junction box, where lane markings stop. */
const JUNCTION_HALF = ROAD_W / 2;

/**
 * Centre of the open square. Blocks are centred half a spacing off the road
 * grid, so the chowk is not at the origin, NPC and stall positions are stored
 * as offsets from here rather than as world coordinates.
 */
export const CHOWK = { x: SPACING / 2, z: SPACING / 2 };

/** Axis-aligned collider in the XZ plane. */
export type Box = { x: number; z: number; hw: number; hd: number };

export type City = {
  group: THREE.Group;
  colliders: Box[];
  roadLines: number[];
  /** Street clutter, kept separate so the caller can dispose its instanced
   *  meshes properly rather than relying on a scene walk. */
  clutter: Clutter | null;
  /** Junction signal masts, tagged with the approach axis they govern, so the
   *  engine can cycle them in step with the traffic that obeys them. */
  signals: SignalMast[];
};

/** One signal mast and the axis of travel it shows its aspect to. */
export type SignalMast = { group: THREE.Group; axis: "x" | "z" };

/**
 * Assembles one building from merged geometry parts. Four meshes rather than
 * forty, so a facade with recessed windows, balconies and shopfronts still
 * costs almost nothing in draw calls.
 */
function makeStructure(
  w: number,
  d: number,
  floors: number,
  seed: number,
  theme: Theme,
  mats?: MaterialLibrary
): THREE.Group {
  const g = new THREE.Group();
  const parts = buildBuildingParts(w, d, floors, seed, theme.archStyle);
  const wall = theme.buildings[seed % theme.buildings.length];

  const shellMat = mats
    ? mats.tint(seed % 3 === 0 ? "painted_plaster" : "weathered_plaster", wall)
    : new THREE.MeshLambertMaterial({ color: wall });

  // Glass takes its colour from the district's horizon rather than a fixed
  // navy. There is no environment map in this scene — the old envMapIntensity
  // here was a no-op — so a window can only reflect the sky if we put the sky
  // in it by hand. Without this every window reads as a black hole punched in
  // a brightly lit facade.
  const skyTint = new THREE.Color(theme.sky[2]);
  const glassMat = new THREE.MeshStandardMaterial({
    color: skyTint.clone().multiplyScalar(0.55),
    roughness: 0.12,
    metalness: 0.25,
    emissive: skyTint,
    emissiveIntensity: 0.18,
  });

  const metalMat = mats
    ? mats.tint("corrugated_metal", 0x9aa3aa, 2)
    : new THREE.MeshLambertMaterial({ color: 0x9aa3aa });

  const signMat = mats
    ? mats.tint("painted_wood", theme.canopies[seed % theme.canopies.length])
    : new THREE.MeshLambertMaterial({ color: theme.canopies[0] });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    if (!geo.attributes.position) return;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  add(parts.shell, shellMat);
  add(parts.glass, glassMat);
  add(parts.metal, metalMat);
  add(parts.signage, signMat);
  return g;
}

export function roadLines(): number[] {
  const out: number[] = [];
  for (let i = -GRID; i <= GRID; i++) out.push(i * SPACING);
  return out;
}

/**
 * Every painted mark on the tarmac, merged into two meshes (one per paint
 * colour). There are a few thousand of these quads and they are the single
 * cheapest thing that makes a road look like a road rather than a grey strip —
 * but only if they cost two draw calls instead of two thousand.
 *
 * Layout per carriageway: a solid edge line inboard of each kerb, a dashed
 * centre line, and at every junction a stop line and a ladder crossing on all
 * four approaches. Markings stop short of the junction box so they never cross
 * each other in the middle.
 */
function buildRoadMarkings(lines: number[], theme: Theme): THREE.Mesh[] {
  const span = WORLD_LIMIT * 2;
  const lane: THREE.BufferGeometry[] = [];
  const white: THREE.BufferGeometry[] = [];

  /** A painted quad, `w` across the road and `d` along it, at (x, z). */
  const mark = (into: THREE.BufferGeometry[], w: number, d: number, x: number, z: number) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.045, z);
    into.push(g);
  };

  /** True when this point along a road is inside (or just outside) a junction. */
  const atJunction = (t: number, clearance = 2.5) =>
    lines.some((o) => Math.abs(t - o) < JUNCTION_HALF + clearance);

  const edgeOff = ROAD_W / 2 - 0.55;

  for (const c of lines) {
    // --- edge lines: solid, broken only across the junctions.
    for (let t = -span / 2; t < span / 2; t += 4) {
      if (atJunction(t, 0.5)) continue;
      for (const s of [-1, 1]) {
        mark(white, 0.16, 4, c + s * edgeOff, t); // road running along z
        mark(white, 4, 0.16, t, c + s * edgeOff); // road running along x
      }
    }

    // --- dashed centre line.
    for (let t = -span / 2; t < span / 2; t += 7) {
      if (atJunction(t)) continue;
      mark(lane, 0.22, 3, c, t);
      mark(lane, 3, 0.22, t, c);
    }
  }

  // --- junctions: a stop line and a ladder crossing on each approach.
  for (const cx of lines) {
    for (const cz of lines) {
      for (const side of [-1, 1] as const) {
        const stop = JUNCTION_HALF + 0.6;
        const zebraStart = JUNCTION_HALF + 1.4;

        // Approaches along z (road at x = cx), and along x (road at z = cz).
        mark(white, ROAD_W / 2 - 0.4, 0.4, cx + side * (ROAD_W / 4), cz + side * stop);
        mark(white, 0.4, ROAD_W / 2 - 0.4, cx + side * stop, cz + side * (ROAD_W / 4));

        for (let i = 0; i < 6; i++) {
          const off = zebraStart + i * 0.72;
          mark(white, ROAD_W - 1.4, 0.42, cx, cz + side * off);
          mark(white, 0.42, ROAD_W - 1.4, cx + side * off, cz);
        }
      }
    }
  }

  const build = (parts: THREE.BufferGeometry[], colour: number) => {
    const geo = BufferGeometryUtils.mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    // Paint is worn, not glossy plastic; and it must not self-shadow against
    // the tarmac it is lying 15mm above.
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: colour,
        roughness: 0.85,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    m.receiveShadow = true;
    return m;
  };

  return [build(lane, theme.lane), build(white, 0xd8d5c8)];
}

export function buildCity(
  theme: Theme,
  mats?: MaterialLibrary,
  vehicleMats?: VehicleMaterials
): City {
  const group = new THREE.Group();
  const colliders: Box[] = [];
  const lines = roadLines();
  const rand = mulberry32(20260730);

  /* ---------------- ground + tarmac ---------------- */

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_LIMIT * 2.4, WORLD_LIMIT * 2.4),
    mats ? mats.tint("dry_mud", theme.ground, 48) : new THREE.MeshLambertMaterial({ color: theme.ground })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const tarmac = mats
    ? mats.tint("asphalt", theme.tarmac, 26)
    : new THREE.MeshLambertMaterial({ color: theme.tarmac });
  const span = WORLD_LIMIT * 2;

  for (const c of lines) {
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, span), tarmac);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(c, 0.02, 0);
    rz.receiveShadow = true;
    group.add(rz);

    const rx = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD_W), tarmac);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.02, c);
    rx.receiveShadow = true;
    group.add(rx);
  }

  for (const m of buildRoadMarkings(lines, theme)) group.add(m);

  /* ---------------- pavements ---------------- */

  // Sized to meet the road edge exactly (SPACING/2 - ROAD_W/2 === BLOCK/2), so
  // the kerb line is where the tarmac stops rather than 2.5m out over it.
  // Footpath slabs are metres across; kerb_stone's hazard stripes are for
  // narrow kerb lips only — tiling that texture on a 40 m block reads as noise.
  const paveMat = mats
    ? mats.tint("concrete", theme.pavement, 8)
    : new THREE.MeshLambertMaterial({ color: theme.pavement });

  const kerbCaps: THREE.BufferGeometry[] = [];
  for (let i = -GRID; i < GRID; i++) {
    for (let j = -GRID; j < GRID; j++) {
      const cx = i * SPACING + SPACING / 2;
      const cz = j * SPACING + SPACING / 2;

      const pave = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.26, BLOCK), paveMat);
      pave.position.set(cx, 0.13, cz);
      pave.receiveShadow = true;
      group.add(pave);

      // Kerbstone lip around each block: a paler band at the pavement edge is
      // what draws the line between footpath and carriageway from a distance.
      const half = BLOCK / 2;
      for (const [w, d, ox, oz] of [
        [BLOCK, 0.5, 0, half - 0.25],
        [BLOCK, 0.5, 0, -half + 0.25],
        [0.5, BLOCK, half - 0.25, 0],
        [0.5, BLOCK, -half + 0.25, 0],
      ] as const) {
        kerbCaps.push(new THREE.BoxGeometry(w, 0.34, d).translate(cx + ox, 0.17, cz + oz));
      }
    }
  }
  {
    const geo = BufferGeometryUtils.mergeGeometries(kerbCaps, false)!;
    kerbCaps.forEach((k) => k.dispose());
    const capMat = mats
      ? mats.tint("kerb_stone", 0xe8e4dc, 3)
      : new THREE.MeshLambertMaterial({ color: 0xcfc9bb });
    const caps = new THREE.Mesh(geo, capMat);
    caps.receiveShadow = true;
    caps.castShadow = true;
    group.add(caps);
  }

  /* ---------------- buildings ---------------- */

  /**
   * Buildings form a CONTINUOUS TERRACE along each street edge rather than
   * sitting as free-standing blocks in the middle of a plot. This is the single
   * biggest thing that makes a street feel like a street: real cities are a
   * canyon of shared party walls with an unbroken shopfront line at the base.
   * Scattered boxes with gaps between them read as a level, not a place.
   */
  for (let i = -GRID; i < GRID; i++) {
    for (let j = -GRID; j < GRID; j++) {
      const cx = i * SPACING + SPACING / 2;
      const cz = j * SPACING + SPACING / 2;

      // The chowk is left open, it is where the NPCs stand.
      if (cx === CHOWK.x && cz === CHOWK.z) {
        addChowk(group, colliders, theme, rand, mats);
        continue;
      }

      // Each of the four block edges gets a terrace facing the road.
      const edges: Array<{ along: "x" | "z"; sign: 1 | -1 }> = [
        { along: "x", sign: 1 },
        { along: "x", sign: -1 },
        { along: "z", sign: 1 },
        { along: "z", sign: -1 },
      ];

      for (const edge of edges) {
        // Plot widths vary so the roofline is ragged, but they ABUT: the
        // running offset never leaves a gap.
        const depth = 11 + rand() * 4;
        const faceOffset = BLOCK / 2 - depth / 2;

        let used = 0;
        const runLength = BLOCK - 2;

        while (used < runLength - 4) {
          const plot = Math.min(6 + rand() * 7, runLength - used);
          const floors = 1 + Math.floor(rand() * 5);

          // Position along the edge, and out to the street face.
          const alongPos = -runLength / 2 + used + plot / 2;
          let bx: number, bz: number, rot: number;

          if (edge.along === "x") {
            bx = cx + alongPos;
            bz = cz + edge.sign * faceOffset;
            rot = edge.sign === 1 ? 0 : Math.PI;
          } else {
            bx = cx + edge.sign * faceOffset;
            bz = cz + alongPos;
            rot = edge.sign === 1 ? -Math.PI / 2 : Math.PI / 2;
          }

          const b = makeStructure(
            plot - 0.15, // hairline gap so party walls read as separate buildings
            depth,
            floors,
            Math.floor(rand() * 1e6),
            theme,
            mats
          );
          b.position.set(bx, 0.22, bz);
          b.rotation.y = rot;
          group.add(b);

          const hw = edge.along === "x" ? plot / 2 : depth / 2;
          const hd = edge.along === "x" ? depth / 2 : plot / 2;
          colliders.push({ x: bx, z: bz, hw, hd });

          used += plot;
        }
      }
    }
  }

  // Snapshot of the building footprints alone, before street furniture starts
  // adding trees, masts and parked cars to the same list.
  const facades = colliders.slice();

  /* ---------------- street furniture ---------------- */

  // Lights alternate sides down each avenue and are spaced a full block apart.
  // Ranking them along both kerbs at 26m read as a car park lot; staggering
  // them is both how it is really done and what opens the street up.
  const LIGHT_STEP = 38;
  const off = ROAD_W / 2 + 1.4;

  for (const c of lines) {
    let n = 0;
    for (let t = -WORLD_LIMIT + 14; t < WORLD_LIMIT - 6; t += LIGHT_STEP) {
      const side = n % 2 === 0 ? 1 : -1;
      n++;
      if (lines.some((o) => Math.abs(t - o) < ROAD_W)) continue;

      // Road running along z: the arm must sweep out over the carriageway,
      // which means facing back across the road, not along it.
      const l1 = makeStreetLight();
      l1.rotation.y = side > 0 ? Math.PI : 0;
      l1.position.set(c + side * off, 0.26, t);
      group.add(l1);

      const l2 = makeStreetLight();
      l2.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      l2.position.set(t, 0.26, c + side * off);
      group.add(l2);
    }
  }

  // Avenue trees, in runs rather than singly — a line of three reads as a
  // planted street, one every 26m reads as scenery scattered by a script.
  for (const c of lines) {
    for (let t = -WORLD_LIMIT + 20; t < WORLD_LIMIT - 20; t += 46) {
      if (rand() > 0.62) continue;
      const side = rand() > 0.5 ? 1 : -1;
      const axis = rand() > 0.5;
      for (let k = 0; k < 3; k++) {
        const along = t + k * 7.5;
        if (lines.some((o) => Math.abs(along - o) < ROAD_W + 3)) continue;
        const x = axis ? c + side * (off + 1.2) : along;
        const z = axis ? along : c + side * (off + 1.2);
        const tr = makeTree(Math.floor(rand() * 1e6), theme.leaf, theme.trunk);
        tr.position.set(x, 0.26, z);
        tr.rotation.y = rand() * Math.PI * 2;
        group.add(tr);
        colliders.push({ x, z, hw: 0.5, hd: 0.5 });
      }
    }
  }

  const signals = addJunctionSignals(group, colliders);
  // Landmarks before parked cars: a gate pier stands in the parking strip,
  // and the parking pass skips any spot that overlaps an existing collider.
  addLandmarks(group, colliders, theme, rand, mats);
  addParkedCars(group, colliders, lines, rand, vehicleMats);

  // Street clutter goes last: it needs the finished collider list so nothing
  // spawns inside a building or a tree.
  const clutter = createClutter(group, theme, mats, {
    colliders,
    facades,
    roadLines: lines,
    roadWidth: ROAD_W,
    blockSize: BLOCK,
    spacing: SPACING,
    chowk: CHOWK,
    worldLimit: WORLD_LIMIT,
    pavementY: 0.26,
    // Half the module's default scatter. At 1.0 the pavement is wall-to-wall
    // props and the street stops reading as walkable; this leaves clear ground
    // between things, which is what makes the ones that are there register as
    // objects rather than texture. Raised from 0.34 — with the brighter grade
    // the street had gone from atmospheric to bare.
    density: 0.5,
  });

  return { group, colliders, roadLines: lines, clutter, signals };
}

/**
 * Signal masts on the four junctions bounding the chowk — the ones the player
 * actually stands at. Signalling all 49 junctions would cost 98 masts for
 * scenery nobody walks to.
 */
function addJunctionSignals(group: THREE.Group, colliders: Box[]): SignalMast[] {
  const junctions = [
    { x: 0, z: 0 },
    { x: SPACING, z: 0 },
    { x: 0, z: SPACING },
    { x: SPACING, z: SPACING },
  ];

  const out: SignalMast[] = [];
  const corner = ROAD_W / 2 + 1.2;

  for (const j of junctions) {
    // Two masts per junction, one per axis of travel, sited on opposite
    // corners with the boom reaching over the approach it governs.
    for (const [sx, sz, rot, axis] of [
      [-1, -1, 0, "z"],
      [1, -1, -Math.PI / 2, "x"],
    ] as const) {
      const x = j.x + sx * corner;
      const z = j.z + sz * corner;
      const m = makeTrafficLight(0);
      m.position.set(x, 0.26, z);
      m.rotation.y = rot;
      group.add(m);
      colliders.push({ x, z, hw: 0.35, hd: 0.35 });
      out.push({ group: m, axis });
    }
  }
  return out;
}

/**
 * Cars parked nose-to-tail against the kerb. These do more for the street than
 * an equivalent number of moving vehicles: they fill the dead strip between
 * kerb and traffic lane, and they never need updating.
 *
 * Deliberately sparse and clustered — a continuous unbroken rank down every
 * kerb is as artificial as an empty one.
 */
function addParkedCars(
  group: THREE.Group,
  colliders: Box[],
  lines: number[],
  rand: () => number,
  vehicleMats?: VehicleMaterials
) {
  if (!vehicleMats) return;

  const lay = ROAD_W / 2 - 1.1; // hard against the kerb, outboard of the edge line

  for (const c of lines) {
    for (let t = -WORLD_LIMIT + 24; t < WORLD_LIMIT - 24; t += 30) {
      if (rand() > 0.42) continue;
      const side = rand() > 0.5 ? 1 : -1;
      const axis = rand() > 0.5 ? "z" : "x";
      const run = 1 + Math.floor(rand() * 3);

      for (let k = 0; k < run; k++) {
        const along = t + k * 5.6;
        // Never park across a junction or its crossing.
        if (lines.some((o) => Math.abs(along - o) < ROAD_W + 4)) continue;

        const x = axis === "z" ? c + side * lay : along;
        const z = axis === "z" ? along : c + side * lay;

        // Never park inside something already standing there — without this,
        // cars spawn embedded in the bazaar gate's piers.
        const chw = axis === "z" ? 1.0 : 2.3;
        const chd = axis === "z" ? 2.3 : 1.0;
        if (colliders.some((b) => Math.abs(x - b.x) < chw + b.hw && Math.abs(z - b.z) < chd + b.hd)) {
          continue;
        }

        const kind = TRAFFIC_KINDS[Math.floor(rand() * TRAFFIC_KINDS.length)];
        const car = makeCar(vehicleMats, { kind, seed: Math.floor(rand() * 1e6) });
        // Parked cars face the direction of travel for their side of the road.
        car.rotation.y =
          axis === "z" ? (side > 0 ? Math.PI : 0) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
        car.position.set(x, 0.02, z);
        car.rotation.y += (rand() - 0.5) * 0.05; // nobody parks perfectly straight
        group.add(car);

        const hw = axis === "z" ? 1.0 : 2.3;
        const hd = axis === "z" ? 2.3 : 1.0;
        colliders.push({ x, z, hw, hd });
      }
    }
  }
}

/**
 * The one thing that makes each city legible at a glance: Delhi gets bazaar
 * arches, Chennai beached boats, Bengaluru lit hoardings, Kolkata trams.
 * Everything is placed within sight of the chowk, where the player starts.
 */
function addLandmarks(
  group: THREE.Group,
  colliders: Box[],
  theme: Theme,
  rand: () => number,
  mats?: MaterialLibrary
) {
  // Delhi was the only district using its real asset kit; the other three were
  // dressed with the plain box-and-cone props while their hero geometry —
  // Gopuram, TechParkSlab, MetroPillar, ColonialFacade, PandalFrame — sat in
  // assets/ built but never instantiated, reachable only from the preview
  // script.
  const kit = getDistrictKit(theme.landmark, mats);
  const place = (
    mesh: THREE.Group,
    x: number,
    z: number,
    rot: number,
    hw: number,
    hd: number,
    scale = 1
  ) => {
    mesh.position.set(x, 0.22, z);
    mesh.rotation.y = rot;
    if (scale !== 1) mesh.scale.setScalar(scale);
    group.add(mesh);
    colliders.push({ x, z, hw, hd });
  };

  /**
   * Where a district's signature monument goes.
   *
   * The player spawns at (CHOWK.x, CHOWK.z - 16) facing north, so this sits
   * dead ahead at about 24m — the first thing they see on entering. Landmarks
   * used to be scattered on the block edges and, for several districts, off to
   * one side behind a terrace, which is why every city opened on the same
   * anonymous row of shopfronts.
   */
  // Far enough back that a ~25m tower fits inside the 55° frame from spawn.
  // Closer than this and the player stands under the monument seeing only
  // piers; the north road starts around z = 46.5, so this is also the last
  // place a hero can sit without straddling traffic.
  const HERO_Z = CHOWK.z + 15;

  /**
   * Modest on purpose. The chase camera sits at y≈4.2 and aims DOWN at the
   * player's chest, so the top of frame at HERO_Z is only about 15m up —
   * scaling a monument past that just fills the view with anonymous stonework
   * and crops the silhouette that identifies it. What made landmarks
   * unrecognisable was never their size; it was that several sat off on a side
   * avenue behind a terrace where the player never saw them at all.
   */
  const TOWER_SCALE = 1.15;

  // Roads bounding the chowk block.
  const west = 0;
  const east = SPACING;
  const south = 0;
  const north = SPACING;

  switch (theme.landmark) {
    case "delhi": {
      // Bazaar gate ARCHES OVER the west avenue: rotation 0 keeps its piers
      // (local x ±5) at the road edges, so traffic in the lanes (±2.9) and the
      // player both pass under the 8m passage. Colliders on the piers only —
      // one blob collider here walls off the entire avenue.
      const gate = makeBazaarGate();
      gate.position.set(west, 0.02, CHOWK.z);
      group.add(gate);
      for (const px of [-5, 5]) {
        colliders.push({ x: west + px, z: CHOWK.z, hw: 1.3, hd: 1.3 });
      }

      // India Gate faces the square as the monument the player walks toward on
      // spawn. Its 5m passage is too narrow to straddle a trafficked road.
      place(makeIndiaGate(), CHOWK.x, HERO_Z, Math.PI, 5.4, 1.6, 1.2);

      // Haveli beside it, close enough that the jharokha and jali screen read.
      place(makeHaveliBalcony(), CHOWK.x - 19, CHOWK.z + 3, Math.PI / 2, 2.2, 3.3);
      break;
    }

    case "chennai": {
      // Gopuram dominating the square. A temple tower that does not clear the
      // surrounding terraces is not a temple tower.
      place(kit.hero[0](), CHOWK.x, HERO_Z, Math.PI, 4.4, 3.2, 1.25);

      // Palms along the southern shore road, between the beached boats.
      for (let i = 0; i < 3; i++) {
        place(kit.hero[1](), CHOWK.x - 26 + i * 26, south - 13, rand() * 6.28, 0.5, 0.5, 1.3);
      }
      for (let i = 0; i < 2; i++) {
        place(makeBoat(), CHOWK.x - 14 + i * 28, south - 11, -0.5 + rand() * 1.0, 1.4, 4);
      }
      break;
    }

    case "bengaluru": {
      // Tech park slab facing the square, metro viaduct pillars marching up
      // the east avenue — the two things that actually define this city.
      place(kit.hero[0](), CHOWK.x, HERO_Z, Math.PI, 6.5, 4.0, 1.15);
      for (let i = 0; i < 3; i++) {
        place(kit.hero[1](), east + 8, CHOWK.z - 30 + i * 30, 0, 1.1, 1.1, 1.4);
      }

      // Hoardings kept on two corners — they were the whole district before.
      place(makeBillboard(Math.floor(rand() * 1e6)), east + 9, south - 9, -0.6, 3.2, 0.4);
      place(makeBillboard(Math.floor(rand() * 1e6)), west - 9, north + 9, 2.4, 3.2, 0.4);
      break;
    }

    case "kolkata": {
      // Colonial facade facing the square; a puja pandal frame beside it.
      place(kit.hero[0](), CHOWK.x, HERO_Z, Math.PI, 4.6, 3.2, 1.2);
      place(kit.hero[1](), CHOWK.x - 18, CHOWK.z + 4, 0.3, 3.4, 3.4, 1.3);

      // Trams running the avenue along the east side of the chowk.
      for (let i = 0; i < 3; i++) {
        place(makeTram(), east - ROAD_W / 4, CHOWK.z - 34 + i * 34, 0, 1.5, 5);
      }
      break;
    }

    case "hyderabad": {
      // The Charminar is a chowk monument — it stands at a crossing with roads
      // running under it — so it belongs in the middle of the square, not off
      // on an avenue where a terrace hides it. Colliders on the four piers
      // only, leaving the arched passages walkable.
      const cm = kit.hero[0]();
      cm.position.set(CHOWK.x, 0.02, HERO_Z);
      cm.scale.setScalar(TOWER_SCALE);
      group.add(cm);
      const pier = 4.2 * TOWER_SCALE;
      for (const px of [-pier, pier]) {
        for (const pz of [-pier, pier]) {
          colliders.push({ x: CHOWK.x + px, z: HERO_Z + pz, hw: 2.0, hd: 2.0 });
        }
      }
      // Bazaar gate arches over the west avenue, as in Delhi.
      const hyGate = kit.hero[1]();
      hyGate.position.set(west, 0.02, CHOWK.z);
      group.add(hyGate);
      for (const px of [-5, 5]) {
        colliders.push({ x: west + px, z: CHOWK.z, hw: 1.3, hd: 1.3 });
      }
      break;
    }

    case "kochi": {
      // Nets only read as Kochi when they are a row all cantilevered the same
      // way, so they go across the top of the square facing the player rather
      // than off on a side road where you would see one at an angle.
      for (let i = 0; i < 3; i++) {
        place(kit.hero[0](), CHOWK.x - 16 + i * 16, HERO_Z + 2, 0, 2.2, 5.5, 1.2);
      }
      for (let i = 0; i < 4; i++) {
        place(kit.hero[1](), CHOWK.x - 24 + i * 16, south - 6, rand() * 6.28, 0.5, 0.5, 1.3);
      }
      break;
    }

    case "mumbai": {
      // Cinema facing the square, its Deco fin above the roofline; metro
      // viaduct marching up the east avenue behind it.
      place(kit.hero[0](), CHOWK.x, HERO_Z, Math.PI, 5.6, 3.8, 1.15);
      for (let i = 0; i < 3; i++) {
        place(kit.hero[1](), east + 8, CHOWK.z - 30 + i * 30, 0, 1.1, 1.1, 1.4);
      }
      break;
    }

    case "ahmedabad": {
      // A pol is a street of these, not one hero object — so a short terrace of
      // them faces the square, close enough that the carved timber balconies
      // and turned balusters actually read.
      for (let i = 0; i < 3; i++) {
        place(kit.hero[0](), CHOWK.x - 13 + i * 13, HERO_Z, Math.PI, 3.6, 2.9, 1.1);
      }
      place(kit.hero[1](), CHOWK.x - 20, CHOWK.z - 6, Math.PI / 2, 2.2, 3.3);
      break;
    }

    case "amritsar": {
      // The gurdwara sits alone in the middle of the square, approached across
      // open ground — that isolation is most of how it reads.
      place(kit.hero[0](), CHOWK.x, HERO_Z, Math.PI, 6.2, 6.2, 1.3);
      const gate = kit.hero[1]();
      gate.position.set(west, 0.02, CHOWK.z);
      group.add(gate);
      for (const px of [-5, 5]) {
        colliders.push({ x: west + px, z: CHOWK.z, hw: 1.3, hd: 1.3 });
      }
      break;
    }

    case "bhubaneswar": {
      // Temple town: the deul towers over the square, smaller shrines around it.
      //
      // Rotation 0, not PI: a real temple puts the assembly hall in front of
      // the tower, but from this low camera the hall then stands directly
      // between the player and the one silhouette that identifies the city. So
      // the spire goes nearest and the hall sits behind it.
      place(kit.hero[0](), CHOWK.x, HERO_Z - 3, 0, 4.4, 7.0, 1.0);
      // Shrines to the sides. The player spawns at (CHOWK.x, CHOWK.z - 16),
      // which is almost exactly `south + JUNCTION_HALF + 3` — anything placed
      // there lands in the player's lap and blocks the whole view.
      for (let i = 0; i < 4; i++) {
        place(
          kit.hero[1](),
          CHOWK.x + (i % 2 ? 17 : -17),
          CHOWK.z - 10 + Math.floor(i / 2) * 16,
          rand() * 6.28,
          1.2,
          1.2
        );
      }
      break;
    }
  }
}

/** The central square: stalls and trees, placed as offsets from the chowk centre. */
function addChowk(
  group: THREE.Group,
  colliders: Box[],
  theme: Theme,
  rand: () => number,
  mats?: MaterialLibrary
) {
  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(BLOCK + 5, 0.24, BLOCK + 5),
    mats ? mats.tint("tile", theme.plaza, 16) : new THREE.MeshLambertMaterial({ color: theme.plaza })
  );
  plaza.position.set(CHOWK.x, 0.12, CHOWK.z);
  plaza.receiveShadow = true;
  group.add(plaza);

  // Offsets from the chowk centre, sited just behind the NPC positions.
  const stalls: [number, number, number][] = [
    [13, -15, 0],
    [-17, 9, Math.PI / 2],
    [16, 16, Math.PI],
  ];
  stalls.forEach(([dx, dz, rot], i) => {
    const x = CHOWK.x + dx;
    const z = CHOWK.z + dz;
    const s = makeStall(theme.canopies[i % theme.canopies.length]);
    s.position.set(x, 0.24, z);
    s.rotation.y = rot;
    group.add(s);
    colliders.push({ x, z, hw: 1.5, hd: 1.0 });
  });

  for (let i = 0; i < 4; i++) {
    const t = makeTree(Math.floor(rand() * 1e6), theme.leaf, theme.trunk);
    const x = CHOWK.x + (rand() - 0.5) * BLOCK * 0.8;
    const z = CHOWK.z + (rand() - 0.5) * BLOCK * 0.8;
    t.position.set(x, 0.24, z);
    group.add(t);
    colliders.push({ x, z, hw: 0.6, hd: 0.6 });
  }
}
