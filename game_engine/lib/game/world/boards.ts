/**
 * Real shops' own signboards on real buildings (OSM footprints have no
 * procedural shopfront): Mocambo, Trincas and Peter Cat on Park Street. A
 * backing board and the lettered face from the district sign atlas, merged.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SignAtlas } from "../signage";
import type { FacadeBoard } from "./mapData";
import { Parts } from "./vc";

/** Board centre height: over a ground-floor doorway. */
const BOARD_Y = 3.6;

export function buildBoards(
  boards: FacadeBoard[],
  atlas: SignAtlas,
  signMat: THREE.Material,
  backMat: THREE.Material
): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  group.name = "shop-boards";
  const faces: THREE.BufferGeometry[] = [];
  const P = new Parts();
  for (const b of boards) {
    const rect = atlas.named(b.name);
    if (!rect) throw new Error(`sign atlas is missing "${b.name}"`);
    const [u0, v0, u1, v1] = rect;
    const h = Math.min(1.1, b.w / 4);
    const face = new THREE.PlaneGeometry(b.w - 0.1, h - 0.1);
    const uv = face.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    face.rotateY(b.rot).translate(b.x + Math.sin(b.rot) * 0.09, BOARD_Y, b.z + Math.cos(b.rot) * 0.09);
    faces.push(face);
    P.box(b.w, h, 0.12, b.x, BOARD_Y, b.z, 0x2b2d31, b.rot);
  }
  const owned: THREE.BufferGeometry[] = [];
  if (faces.length) {
    const g = BufferGeometryUtils.mergeGeometries(faces, false)!;
    faces.forEach((f) => f.dispose());
    owned.push(g);
    group.add(new THREE.Mesh(g, signMat));
  }
  const back = P.geometry();
  if (back) {
    owned.push(back);
    const m = new THREE.Mesh(back, backMat);
    m.castShadow = true;
    group.add(m);
  }
  return {
    group,
    dispose() {
      owned.forEach((g) => g.dispose());
    },
  };
}
