import * as THREE from "three";
import {
  makeBuilding, makeStall, makeStreetLight, makeTree, mulberry32,
  makeBoat, makeBillboard, makeTram, makeArch,
} from "./props";
import type { Theme } from "./districts";
import { buildBuildingParts } from "./buildings";
import type { MaterialLibrary } from "./materials";

export const ROAD_W = 9;         // gully width; 14 read as an arterial road
export const BLOCK = 40;         // building block size
export const SPACING = BLOCK + ROAD_W;
export const GRID = 3;           // road lines run from -GRID..GRID
export const WORLD_LIMIT = GRID * SPACING + BLOCK / 2;

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
};

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
  const parts = buildBuildingParts(w, d, floors, seed);
  const wall = theme.buildings[seed % theme.buildings.length];

  const shellMat = mats
    ? mats.tint(seed % 3 === 0 ? "painted_plaster" : "weathered_plaster", wall)
    : new THREE.MeshLambertMaterial({ color: wall });

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x2b3d4a,
    roughness: 0.15,
    metalness: 0.1,
    envMapIntensity: 1.2,
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

export function buildCity(theme: Theme, mats?: MaterialLibrary): City {
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

  // Dashed centre lines, skipped near junctions so they don't cross.
  const dashMat = new THREE.MeshBasicMaterial({ color: theme.lane });
  const dashGeo = new THREE.PlaneGeometry(0.35, 2.6);
  for (const c of lines) {
    for (let t = -span / 2; t < span / 2; t += 6) {
      if (lines.some((o) => Math.abs(t - o) < ROAD_W)) continue;

      const a = new THREE.Mesh(dashGeo, dashMat);
      a.rotation.x = -Math.PI / 2;
      a.position.set(c, 0.04, t);
      group.add(a);

      const b = new THREE.Mesh(dashGeo, dashMat);
      b.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      b.position.set(t, 0.04, c);
      group.add(b);
    }
  }

  /* ---------------- pavements ---------------- */

  const kerbMat = mats
    ? mats.tint("kerb_stone", theme.pavement, 14)
    : new THREE.MeshLambertMaterial({ color: theme.pavement });
  for (let i = -GRID; i < GRID; i++) {
    for (let j = -GRID; j < GRID; j++) {
      const cx = i * SPACING + SPACING / 2;
      const cz = j * SPACING + SPACING / 2;

      const pave = new THREE.Mesh(new THREE.BoxGeometry(BLOCK + 5, 0.22, BLOCK + 5), kerbMat);
      pave.position.set(cx, 0.11, cz);
      pave.receiveShadow = true;
      group.add(pave);
    }
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

  /* ---------------- street furniture ---------------- */

  for (const c of lines) {
    for (let t = -WORLD_LIMIT + 10; t < WORLD_LIMIT; t += 26) {
      const off = ROAD_W / 2 + 1.6;

      const l1 = makeStreetLight();
      l1.position.set(c + off, 0.22, t);
      group.add(l1);

      const l2 = makeStreetLight();
      l2.rotation.y = Math.PI / 2;
      l2.position.set(t, 0.22, c - off);
      group.add(l2);

      if (rand() > 0.55) {
        const tr = makeTree(Math.floor(rand() * 1e6), theme.leaf, theme.trunk);
        tr.position.set(c - off - 1.5, 0.22, t + 6);
        group.add(tr);
        colliders.push({ x: c - off - 1.5, z: t + 6, hw: 0.5, hd: 0.5 });
      }
    }
  }

  addLandmarks(group, colliders, theme, rand);

  return { group, colliders, roadLines: lines };
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
  rand: () => number
) {
  const place = (mesh: THREE.Group, x: number, z: number, rot: number, hw: number, hd: number) => {
    mesh.position.set(x, 0.22, z);
    mesh.rotation.y = rot;
    group.add(mesh);
    colliders.push({ x, z, hw, hd });
  };

  // Roads bounding the chowk block.
  const west = 0;
  const east = SPACING;
  const south = 0;
  const north = SPACING;

  switch (theme.landmark) {
    case "delhi":
      // Arches straddling the two avenues either side of the chowk.
      place(makeArch(), west, CHOWK.z, Math.PI / 2, 1.6, 5);
      place(makeArch(), CHOWK.x, north, 0, 5, 1.6);
      break;

    case "chennai":
      // Boats hauled up on the sand beside the southern shore road.
      for (let i = 0; i < 3; i++) {
        place(
          makeBoat(),
          CHOWK.x - 22 + i * 24,
          south - 11,
          -0.5 + rand() * 1.0,
          1.4,
          4
        );
      }
      break;

    case "bengaluru":
      // Hoardings on the junction corners around the chowk.
      place(makeBillboard(Math.floor(rand() * 1e6)), east + 9, south - 9, -0.6, 3.2, 0.4);
      place(makeBillboard(Math.floor(rand() * 1e6)), west - 9, north + 9, 2.4, 3.2, 0.4);
      place(makeBillboard(Math.floor(rand() * 1e6)), east + 9, north + 9, 3.6, 3.2, 0.4);
      break;

    case "kolkata":
      // Trams running the avenue along the east side of the chowk.
      for (let i = 0; i < 3; i++) {
        place(makeTram(), east - ROAD_W / 4, CHOWK.z - 34 + i * 34, 0, 1.5, 5);
      }
      break;
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
