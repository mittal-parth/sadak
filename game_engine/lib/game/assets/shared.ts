import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../props";

export { mulberry32 };

/**
 * Optional material library another workstream may wire in later. Shape is a
 * guess at what a shared PBR material factory would look like: give it a
 * base colour and standard-material params, get a (possibly shared/cached)
 * MeshStandardMaterial back. If it isn't passed we fall back to our own
 * cache so nothing here ever touches Basic/Lambert materials.
 */
export type AssetMaterialLib = {
  standard?: (
    color: number,
    opts?: THREE.MeshStandardMaterialParameters
  ) => THREE.MeshStandardMaterial;
};

/* ------------------------------------------------------------------ *
 * Material cache — every prop factory asks for materials through here so
 * instances sharing a colour/roughness/metalness combo share one
 * MeshStandardMaterial object instead of allocating a new one each time.
 * ------------------------------------------------------------------ */

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function stdMat(
  color: number,
  opts: THREE.MeshStandardMaterialParameters = {},
  materials?: AssetMaterialLib
): THREE.MeshStandardMaterial {
  if (materials?.standard) return materials.standard(color, opts);

  const roughness = opts.roughness ?? 0.85;
  const metalness = opts.metalness ?? 0.05;
  const key = [
    color,
    roughness,
    metalness,
    opts.transparent ? 1 : 0,
    opts.opacity ?? 1,
    opts.side ?? THREE.FrontSide,
    opts.emissive ? (opts.emissive as THREE.ColorRepresentation).toString() : "-",
    opts.emissiveIntensity ?? 0,
  ].join("|");

  const hit = matCache.get(key);
  if (hit) return hit;

  const m = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    ...opts,
  });
  matCache.set(key, m);
  return m;
}

/* ------------------------------------------------------------------ *
 * Shared unit geometries — built ONCE at module scope. Every prop below
 * reuses these buffers and gets its own silhouette purely from per-mesh
 * scale/position/rotation, so the whole asset kit adds a handful of
 * geometries to the scene, not hundreds.
 * ------------------------------------------------------------------ */

export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cylTaper8: new THREE.CylinderGeometry(0.32, 0.5, 1, 8),
  cone8: new THREE.ConeGeometry(0.5, 1, 8),
  cone6: new THREE.ConeGeometry(0.5, 1, 6),
  sphere8: new THREE.SphereGeometry(0.5, 8, 6),
  hemi8: new THREE.SphereGeometry(0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  plane: new THREE.PlaneGeometry(1, 1),
  torus: new THREE.TorusGeometry(0.5, 0.15, 6, 12),
} as const;

function finish<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export const box = (w: number, h: number, d: number, mat: THREE.Material) =>
  finish(applyScale(new THREE.Mesh(G.box, mat), w, h, d));

export const cyl = (
  r: number,
  h: number,
  mat: THREE.Material,
  geo: THREE.BufferGeometry = G.cyl8
) => finish(applyScale(new THREE.Mesh(geo, mat), r * 2, h, r * 2));

export const cone = (
  r: number,
  h: number,
  mat: THREE.Material,
  geo: THREE.BufferGeometry = G.cone8
) => finish(applyScale(new THREE.Mesh(geo, mat), r * 2, h, r * 2));

export const sphere = (r: number, mat: THREE.Material, geo: THREE.BufferGeometry = G.sphere8) =>
  finish(applyScale(new THREE.Mesh(geo, mat), r * 2, r * 2, r * 2));

export const ico = (r: number, mat: THREE.Material) =>
  finish(applyScale(new THREE.Mesh(G.ico, mat), r * 2, r * 2, r * 2));

export const plane = (w: number, h: number, mat: THREE.Material) => {
  const m = new THREE.Mesh(G.plane, mat);
  m.scale.set(w, h, 1);
  m.receiveShadow = true;
  return m;
};

function applyScale(m: THREE.Mesh, w: number, h: number, d: number) {
  m.scale.set(w, h, d);
  return m;
}

export function jitter(rand: () => number, amt: number) {
  return (rand() - 0.5) * amt;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  return g;
}

/* ------------------------------------------------------------------ *
 * Baked-transform primitives + material-grouped merge.
 *
 * Every landmark/vehicle/prop in this kit is built as a flat list of small
 * primitive geometries, each with its transform baked in via .translate /
 * .rotateX etc, tagged with the THREE.Material it should render with. This
 * mirrors the pattern in buildings.ts (`slab`): it lets a prop have 20-40
 * conceptual parts (legs, ribs, panels, domes...) while only costing 2-4
 * draw calls once merged, one per distinct material.
 * ------------------------------------------------------------------ */

export type Part = { geo: THREE.BufferGeometry; mat: THREE.Material };

export function bakedBox(
  w: number,
  h: number,
  d: number,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

export function bakedCyl(
  rTop: number,
  rBottom: number,
  h: number,
  radial = 8,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  rz = 0
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, radial);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

export function bakedCone(
  r: number,
  h: number,
  radial = 8,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  rz = 0,
  sx = 1,
  sz = 1
): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, radial);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

export function bakedSphere(
  r: number,
  x = 0,
  y = 0,
  z = 0,
  opts: {
    wSeg?: number;
    hSeg?: number;
    phiStart?: number;
    phiLength?: number;
    thetaStart?: number;
    thetaLength?: number;
    sy?: number;
    sx?: number;
    sz?: number;
  } = {}
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(
    r,
    opts.wSeg ?? 8,
    opts.hSeg ?? 6,
    opts.phiStart ?? 0,
    opts.phiLength ?? Math.PI * 2,
    opts.thetaStart ?? 0,
    opts.thetaLength ?? Math.PI
  );
  if (opts.sx || opts.sy || opts.sz) g.scale(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1);
  g.translate(x, y, z);
  return g;
}

export function bakedTorus(
  r: number,
  tube: number,
  x = 0,
  y = 0,
  z = 0,
  rx = 0
): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r, tube, 6, 14);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

/**
 * Group a flat parts list into one Mesh per distinct material. This is the
 * "copy the buildings.ts merge pattern" step the brief asks for, generalised
 * so every prop factory below can build a long, readable list of small
 * shapes and end up with 2-4 draw calls.
 */
export function mergeByMaterial(parts: Part[]): THREE.Group {
  const g = new THREE.Group();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of parts) {
    if (!p.geo || !p.geo.attributes.position) continue;
    const list = byMat.get(p.mat) ?? [];
    list.push(p.geo);
    byMat.set(p.mat, list);
  }
  for (const [mat, geos] of byMat) {
    const merged =
      geos.length > 1 ? BufferGeometryUtils.mergeGeometries(geos, false) : geos[0];
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

/** Triangle count of a built group, for the perf report. */
export function countTriangles(obj: THREE.Object3D): number {
  let tris = 0;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    const count = geo.index ? geo.index.count : geo.attributes.position.count;
    tris += count / 3;
  });
  return Math.round(tris);
}

/* ------------------------------------------------------------------ *
 * Shared pedestrian rig — a fully-formed low-poly person (8-9 parts:
 * two legs, torso, two arms, head, hair/headgear, plus an optional
 * accessory) whose clothing, headgear and accessory are parameterised so
 * each district can dress it distinctly without duplicating the rig.
 * ------------------------------------------------------------------ */

export type PersonOpts = {
  skin?: number;
  shirt?: number;
  lower?: number;
  hair?: number;
  lowerStyle?: "pants" | "dhoti" | "saree";
  headgear?: "none" | "turban" | "cap" | "bun";
  accessory?: "none" | "basket" | "bag" | "umbrella" | "stick";
  materials?: AssetMaterialLib;
};

export function makePerson(o: PersonOpts = {}): THREE.Group {
  const g = new THREE.Group();
  const materials = o.materials;
  const skin = stdMat(o.skin ?? 0x8d5524, { roughness: 0.7 }, materials);
  const shirtMat = stdMat(o.shirt ?? 0x2e86c1, { roughness: 0.9 }, materials);
  const lowerMat = stdMat(o.lower ?? 0x2c3e50, { roughness: 0.92 }, materials);
  const hairMat = stdMat(o.hair ?? 0x14100c, { roughness: 0.55 }, materials);

  const lowerStyle = o.lowerStyle ?? "pants";
  let torsoY = 1.25;
  if (lowerStyle === "saree") {
    const skirt = cone(0.4, 1.05, lowerMat);
    skirt.position.y = 0.52;
    g.add(skirt);
    torsoY = 1.18;
  } else if (lowerStyle === "dhoti") {
    const skirt = cone(0.34, 0.72, lowerMat);
    skirt.position.y = 0.4;
    g.add(skirt);
    torsoY = 1.15;
  } else {
    [-0.13, 0.13].forEach((x) => {
      const leg = box(0.18, 0.85, 0.2, lowerMat);
      leg.position.set(x, 0.43, 0);
      g.add(leg);
    });
  }

  const torso = box(0.55, 0.78, 0.34, shirtMat);
  torso.position.y = torsoY;
  g.add(torso);

  [-0.37, 0.37].forEach((x) => {
    const arm = box(0.15, 0.64, 0.17, skin);
    arm.position.set(x, torsoY, 0);
    g.add(arm);
  });

  const headY = torsoY + 0.6;
  const head = box(0.36, 0.4, 0.36, skin);
  head.position.y = headY;
  g.add(head);

  switch (o.headgear) {
    case "turban": {
      const t = sphere(0.25, hairMat);
      t.scale.y = 0.75;
      t.position.y = headY + 0.2;
      g.add(t);
      break;
    }
    case "cap": {
      const c = cyl(0.2, 0.16, hairMat, G.cyl6);
      c.position.y = headY + 0.24;
      g.add(c);
      break;
    }
    case "bun": {
      const hair = box(0.38, 0.1, 0.38, hairMat);
      hair.position.y = headY + 0.23;
      g.add(hair);
      const bun = ico(0.1, hairMat);
      bun.position.set(0, headY + 0.32, -0.18);
      g.add(bun);
      break;
    }
    default: {
      const hair = box(0.38, 0.12, 0.38, hairMat);
      hair.position.y = headY + 0.24;
      g.add(hair);
    }
  }

  switch (o.accessory) {
    case "basket": {
      const b = cyl(0.22, 0.26, stdMat(0xc9a26a, { roughness: 0.95 }, materials), G.cyl6);
      b.position.y = headY + 0.42;
      g.add(b);
      break;
    }
    case "bag": {
      const bag = box(0.28, 0.34, 0.14, stdMat(0x4a4f57, { roughness: 0.9 }, materials));
      bag.position.set(0.38, torsoY - 0.05, -0.16);
      g.add(bag);
      break;
    }
    case "umbrella": {
      const pole = cyl(0.02, 1.0, stdMat(0x333333, { roughness: 0.6, metalness: 0.3 }, materials));
      pole.position.set(0.4, 1.75, 0);
      g.add(pole);
      const canopy = cone(0.48, 0.32, stdMat(0x1f6feb, { roughness: 0.8 }, materials));
      canopy.position.set(0.4, 2.1, 0);
      g.add(canopy);
      break;
    }
    case "stick": {
      const s = cyl(0.02, 0.95, stdMat(0x5b4632, { roughness: 0.9 }, materials));
      s.rotation.z = 0.15;
      s.position.set(0.42, 0.55, 0);
      g.add(s);
      break;
    }
  }

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return g;
}
