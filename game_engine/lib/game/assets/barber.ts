/**
 * Barber shop exterior (world landmark) and interior (overlay scene).
 * Procedural geometry only — no image assets.
 */

import * as THREE from "three";
import { buildBarberPoleGeo } from "../clutter";
import {
  bakedBox,
  bakedCyl,
  box,
  cyl,
  mergeByMaterial,
  stdMat,
  type AssetMaterialLib,
  type Part,
} from "./shared";

const WALL = 0xd4c4a8;
const WALL_DK = 0x9a8568;
const AWNING = 0x2f6f9f;
const SIGN = 0xd94f4f;
const DOOR = 0x4a3020;
const FLOOR_LIGHT = 0xe8e0d0;
const FLOOR_DARK = 0x6b5a48;
const CHAIR_LEATHER = 0x8b1a1a;
const CHROME = 0xc0c8d0;
const MIRROR = 0xa8d4e8;

function poleMesh(mats?: AssetMaterialLib): THREE.Mesh {
  const geo = buildBarberPoleGeo();
  const mat = stdMat(0xffffff, { roughness: 0.7 }, mats);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Exterior shopfront placed in the open world. */
export function makeBarberShop(mats?: AssetMaterialLib): THREE.Group {
  const wall = stdMat(WALL, { roughness: 0.9 }, mats);
  const wallDk = stdMat(WALL_DK, { roughness: 0.92 }, mats);
  const awning = stdMat(AWNING, { roughness: 0.85 }, mats);
  const sign = stdMat(SIGN, { roughness: 0.75 }, mats);
  const door = stdMat(DOOR, { roughness: 0.88 }, mats);
  const trim = stdMat(0xf5f0dc, { roughness: 0.8 }, mats);

  const parts: Part[] = [
    { geo: bakedBox(3.2, 2.6, 2.4, 0, 1.3, 0), mat: wall },
    { geo: bakedBox(3.4, 0.18, 2.6, 0, 2.7, 0), mat: trim },
    { geo: bakedBox(3.6, 0.35, 2.8, 0, 2.95, 0.1), mat: awning },
    { geo: bakedBox(0.9, 1.6, 0.08, 0, 0.85, 1.22), mat: door },
    { geo: bakedBox(0.06, 1.6, 0.12, 0.35, 0.85, 1.24), mat: stdMat(0xd9c090, { metalness: 0.4, roughness: 0.5 }, mats) },
    { geo: bakedBox(1.8, 0.55, 0.1, 0, 2.15, 1.25), mat: sign },
    { geo: bakedBox(1.9, 0.08, 0.12, 0, 2.48, 1.26), mat: trim },
    { geo: bakedBox(0.5, 0.08, 1.6, -1.2, 0.04, 0.3), mat: wallDk },
    { geo: bakedBox(0.5, 0.08, 1.6, 1.2, 0.04, 0.3), mat: wallDk },
  ];

  const g = mergeByMaterial(parts);

  const pole = poleMesh(mats);
  pole.scale.set(1.1, 1.1, 1.1);
  pole.position.set(1.85, 0, 0.6);
  g.add(pole);

  const signLabel = box(1.5, 0.12, 0.02, stdMat(0xf5f0dc, { roughness: 0.9 }, mats));
  signLabel.position.set(0, 2.15, 1.31);
  g.add(signLabel);

  return g;
}

function checkeredFloor(width: number, depth: number, mats?: AssetMaterialLib): THREE.Group {
  const light = stdMat(FLOOR_LIGHT, { roughness: 0.75 }, mats);
  const dark = stdMat(FLOOR_DARK, { roughness: 0.75 }, mats);
  const tile = 0.5;
  const g = new THREE.Group();
  const cols = Math.ceil(width / tile);
  const rows = Math.ceil(depth / tile);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mat = (r + c) % 2 === 0 ? light : dark;
      const t = box(tile * 0.98, 0.06, tile * 0.98, mat);
      t.position.set(
        -width / 2 + tile / 2 + c * tile,
        0.03,
        -depth / 2 + tile / 2 + r * tile
      );
      t.receiveShadow = true;
      g.add(t);
    }
  }
  return g;
}

/** Interior room for the overlay — fixed 3/4 camera view. */
export function makeBarberInterior(mats?: AssetMaterialLib): THREE.Group {
  const wall = stdMat(WALL, { roughness: 0.92 }, mats);
  const trim = stdMat(0xf5f0dc, { roughness: 0.8 }, mats);
  const counter = stdMat(WALL_DK, { roughness: 0.88 }, mats);
  const chrome = stdMat(CHROME, { metalness: 0.6, roughness: 0.35 }, mats);
  const leather = stdMat(CHAIR_LEATHER, { roughness: 0.7 }, mats);
  const mirrorMat = stdMat(MIRROR, { metalness: 0.85, roughness: 0.15 }, mats);

  const room = new THREE.Group();

  room.add(checkeredFloor(4, 4, mats));

  const backWall = box(4.2, 2.8, 0.12, wall);
  backWall.position.set(0, 1.4, -2);
  backWall.receiveShadow = true;
  room.add(backWall);

  const leftWall = box(0.12, 2.8, 4.2, wall);
  leftWall.position.set(-2.1, 1.4, 0);
  leftWall.receiveShadow = true;
  room.add(leftWall);

  const rightWall = box(0.12, 2.8, 4.2, wall);
  rightWall.position.set(2.1, 1.4, 0);
  rightWall.receiveShadow = true;
  room.add(rightWall);

  const mirrorFrame = box(1.4, 1.8, 0.08, trim);
  mirrorFrame.position.set(0, 1.5, -1.92);
  room.add(mirrorFrame);

  const mirror = box(1.2, 1.6, 0.04, mirrorMat);
  mirror.position.set(0, 1.5, -1.88);
  room.add(mirror);

  const counterTop = box(2.2, 0.08, 0.7, counter);
  counterTop.position.set(0.8, 0.95, -1.2);
  room.add(counterTop);

  const counterBase = box(2.2, 0.9, 0.65, counter);
  counterBase.position.set(0.8, 0.45, -1.2);
  room.add(counterBase);

  const chairBase = cyl(0.35, 0.12, chrome, undefined);
  chairBase.position.set(-0.6, 0.06, 0.2);
  room.add(chairBase);

  const chairStem = cyl(0.08, 0.5, chrome);
  chairStem.position.set(-0.6, 0.35, 0.2);
  room.add(chairStem);

  const seat = box(0.7, 0.12, 0.75, leather);
  seat.position.set(-0.6, 0.65, 0.2);
  room.add(seat);

  const back = box(0.7, 0.9, 0.1, leather);
  back.position.set(-0.6, 1.15, -0.15);
  room.add(back);

  [-0.35, 0.35].forEach((x) => {
    const arm = box(0.12, 0.08, 0.5, chrome);
    arm.position.set(-0.6 + x, 0.85, 0.2);
    room.add(arm);
  });

  const pole = poleMesh(mats);
  pole.scale.set(1.4, 1.4, 1.4);
  pole.position.set(1.5, 0, 1.2);
  room.add(pole);

  const shelf = box(0.8, 0.06, 0.25, trim);
  shelf.position.set(-1.5, 1.2, -1.85);
  room.add(shelf);

  for (let i = 0; i < 3; i++) {
    const bottle = cyl(0.04, 0.22, stdMat(0x2f8f5a + i * 0x111111, { roughness: 0.6 }, mats));
    bottle.position.set(-1.5 + (i - 1) * 0.18, 1.35, -1.85);
    room.add(bottle);
  }

  return room;
}

/** Warm interior lighting for the overlay renderer. */
export function addBarberInteriorLights(scene: THREE.Scene): THREE.Light[] {
  const ambient = new THREE.AmbientLight(0xfff0e0, 0.45);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffe8c8, 0.85);
  key.position.set(2, 4, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  scene.add(key);

  const fill = new THREE.PointLight(0xffd090, 0.5, 8);
  fill.position.set(-1.5, 2, 1);
  scene.add(fill);

  const mirrorGlow = new THREE.PointLight(0xa8d4ff, 0.25, 4);
  mirrorGlow.position.set(0, 1.5, -1.5);
  scene.add(mirrorGlow);

  return [ambient, key, fill, mirrorGlow];
}
