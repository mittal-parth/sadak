import * as THREE from 'three';
import { BOX, BOX_SOFT, IDENT, LL } from './kit.js';
import { fbm3, patchGeometry, paintMasks } from './util.js';
import { Rng } from '../core/rng.js';
import { STREET, ALLEYS } from './layout.js';

/**
 * WORLD — ground plane, road, kerbs and the stuff wind piles against them.
 *
 * The road is a cambered, subdivided strip so it catches grazing sunlight; the
 * pavements are individual slabs with gaps, broken corners and sand drifts, and
 * the alleys are dirt. Collision is a handful of flat boxes rather than the
 * visual triangles, which keeps the BVH tiny and the character controller smooth.
 */
export function buildGround(A, rng) {
  const { halfWidth: HW, kerb: KB, walkH: WH, zMin, zMax } = STREET;

  // ------------------------------------------------------------- terrain --
  // Sandy ground under everything, gently undulating so the horizon isn't a
  // ruler-straight line where it meets the buildings.
  const S = 168;
  const N = 42;
  const terrain = new THREE.PlaneGeometry(S, S, N, N);
  terrain.rotateX(-Math.PI / 2);
  const pa = terrain.getAttribute('position');
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i);
    const z = pa.getZ(i);
    const inStreet = Math.abs(x) < KB + 1 && z > zMin && z < zMax;
    const h = inStreet ? 0 : (fbm3(x * 0.045, 7.3, z * 0.045, 3) - 0.5) * 1.1 + 0.02;
    pa.setY(i, h - 0.03);
  }
  terrain.computeVertexNormals();
  paintMasks(terrain, (x, y, z, nx, ny, nz, out) => {
    out[1] = 0.25 + fbm3(x * 0.3, 1.1, z * 0.3, 2) * 0.4;
    out[0] = 0.2;
  });
  A.add('sand', terrain, null);
  A.collideGeo('sand', terrain);
  terrain.dispose();

  // ---------------------------------------------------------------- road --
  const roadLen = zMax - zMin;
  const road = new THREE.PlaneGeometry(HW * 2, roadLen, 12, Math.round(roadLen / 2));
  road.rotateX(-Math.PI / 2);
  const rp = road.getAttribute('position');
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i);
    const z = rp.getZ(i);
    const camber = (1 - (x / HW) ** 2) * 0.055;
    const wear = (fbm3(x * 0.55 + 3, 2.2, z * 0.35, 3) - 0.5) * 0.07;
    // shallow ruts where wheels have polished the surface
    const rut = -Math.exp(-((Math.abs(x) - 1.6) ** 2) / 0.5) * 0.022;
    rp.setY(i, camber + wear + rut);
  }
  road.computeVertexNormals();
  paintMasks(road, (x, y, z, nx, ny, nz, out) => {
    const n = fbm3(x * 0.7, 4.4, z * 0.7, 3);
    out[1] = 0.1 + Math.max(0, (Math.abs(x) - 3.4) / 1.5) * 0.35 + n * 0.18;
    out[0] = 0.2 + n * 0.3;
  });
  road.translate(0, 0, (zMin + zMax) / 2);
  A.add('road_dust', road, null);
  road.dispose();
  A.box('dirt', 0, -0.2, (zMin + zMax) / 2, HW * 2, 0.42, roadLen);

  // Old tarmac showing through the dust where wheels have polished it: long
  // patches in the ruts, and a scatter of intact pavement elsewhere.
  for (let i = 0; i < 30; i++) {
    const rut = rng.float() < 0.62;
    const x = rut ? (rng.float() < 0.5 ? -1 : 1) * rng.range(1.2, 2.1) : rng.range(-HW + 0.5, HW - 0.5);
    const z = rng.range(zMin + 2, zMax - 2);
    // sit just above the local camber, and run along Z where camber is constant
    const camber = (1 - (x / HW) ** 2) * 0.055 + 0.042;
    const g = patchGeometry(rng, rng.range(0.45, 1.1), { lobes: 11, wobble: 0.5 });
    A.addOnce(
      'asphalt',
      g,
      LL(IDENT, x, camber, z, rng.float() * 0.4, 1, 1, rut ? rng.range(2.0, 4.5) : rng.range(0.7, 1.4)),
      { masks: [0.35, 0.25, 0.1] }
    );
  }

  // ------------------------------------------------------- pavement slabs --
  for (const side of [-1, 1]) {
    let z = zMin;
    while (z < zMax) {
      const segLen = rng.range(3.2, 6.5);
      const gap = rng.float() < 0.12 ? rng.range(0.6, 1.6) : 0.06;
      // alley mouths cut the pavement — a driveway ramp instead of a kerb
      let mouth = false;
      for (const a of ALLEYS) {
        const [ax0, az0, ax1, az1] = a.rect;
        const inX = side > 0 ? ax0 >= KB - 0.5 : ax1 <= -KB + 0.5;
        if (inX && z + segLen > az0 - 0.2 && z < az1 + 0.2) mouth = true;
      }
      const cz = z + segLen / 2;
      const cx = side * (KB + HW) / 2;
      const wSlab = KB - HW;
      if (!mouth) {
        const h = WH + rng.range(-0.012, 0.012);
        A.add(
          'concrete',
          BOX_SOFT(A),
          LL(IDENT, cx, h / 2, cz, 0, wSlab - 0.05, h, segLen - gap),
          { masks: [0.6, 0.45, 0.2] }
        );
        // kerb stone, a touch taller and more worn
        A.add(
          'concrete',
          BOX_SOFT(A),
          LL(IDENT, side * (HW + 0.11), (h + 0.022) / 2, cz, 0, 0.22, h + 0.022, segLen - gap),
          { masks: [0.95, 0.35, 0.1] }
        );
        A.box('concrete', cx, h / 2, cz, wSlab, h, segLen - gap * 0.5);
        A.box('concrete', side * (HW + 0.11), (h + 0.022) / 2, cz, 0.24, h + 0.022, segLen - gap * 0.5);
        // paving joints: a shallow darker course every metre reads as slabs
        // A grime stain, not a different material: a dark patch in a contrasting
        // key reads as a decal lying on top of the pavement.
        if (rng.float() < 0.5) {
          const g = patchGeometry(rng, rng.range(0.25, 0.7), { lobes: 9, wobble: 0.6 });
          A.addOnce('concrete', g, LL(IDENT, cx + rng.range(-0.5, 0.5), h + 0.006, cz + rng.range(-1, 1), rng.float() * 6.28), {
            masks: [0.1, 1.0, 0.55],
          });
        }
      } else {
        // ramped dirt mouth
        A.add('dirt', BOX(A), LL(IDENT, cx, 0.035, cz, 0, wSlab, 0.07, segLen), {
          masks: [0.2, 0.7, 0.4],
        });
        A.box('dirt', cx, 0.03, cz, wSlab, 0.06, segLen);
      }
      z += segLen + gap;
    }
  }

  // ------------------------------------------------------------- alleys --
  for (const a of ALLEYS) {
    const [x0, z0, x1, z1] = a.rect;
    const w = x1 - x0;
    const d = z1 - z0;
    A.add(a.surface, BOX(A), LL(IDENT, (x0 + x1) / 2, 0.03, (z0 + z1) / 2, 0, w, 0.06, d), {
      masks: [0.2, 0.6, 0.35],
    });
    A.box(A.surfaceOf(a.surface), (x0 + x1) / 2, 0.02, (z0 + z1) / 2, w, 0.05, d);
  }

  // --------------------------------------------------- material seams --
  // Every place two ground materials meet is otherwise a razor-straight polygon
  // edge with a value step across it — the loudest artefact in any low-angle
  // shot. A real join is interlocked: the gravel creeps out over the mud, the
  // mud washes in over the gravel, and loose stones lie across the line. So each
  // boundary gets a scatter of irregular patches of BOTH materials straddling
  // it, at 0.6-1.2 m, plus a line of pebbles.
  // Its own fixed-seed stream: the seam scatter must not shift the draw sequence
  // the rest of the level's placement depends on.
  const sr = new Rng(0x5ea31d);
  const seam = (ax, az, bx, bz, keyA, keyB, y) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(6, Math.round(len / 1.15));
    const tx = (bx - ax) / len;
    const tz = (bz - az) / len;
    // unit normal across the seam
    const nxs = -tz;
    const nzs = tx;
    for (let i = 0; i < n; i++) {
      const t = ((i + sr.range(0.15, 0.85)) / n) * len;
      const px = ax + tx * t;
      const pz = az + tz * t;
      for (const [key, side] of [
        [keyA, -1],
        [keyB, 1],
      ]) {
        if (sr.float() < 0.22) continue;
        const off = side * sr.range(-0.12, 0.62);
        const g = patchGeometry(sr, sr.range(0.3, 0.62), { lobes: 10, wobble: 0.6 });
        A.addOnce(
          key,
          g,
          LL(
            IDENT,
            px + nxs * off,
            y + 0.006 + sr.range(0, 0.004),
            pz + nzs * off,
            sr.float() * 6.28,
            1,
            1,
            sr.range(0.55, 1.0)
          ),
          { masks: [0.15, sr.range(0.3, 0.8), sr.range(0.2, 0.5)] }
        );
      }
      // loose stones lying across the join
      if (A.has('rock_b')) {
        for (let k = 0; k < sr.int(1, 3); k++) {
          const off = sr.range(-0.55, 0.55);
          A.put(
            sr.float() < 0.68 ? 'rock_b' : 'rock_a',
            px + nxs * off + sr.range(-0.2, 0.2),
            y + 0.01,
            pz + nzs * off + sr.range(-0.2, 0.2),
            sr.float() * 6.28,
            sr.range(0.45, 1.0),
            [1, sr.range(1.0, 1.5), 1]
          );
        }
      }
    }
  };
  // The gutter: wind-blown sand and grit piles against the kerb on the road side,
  // which is what actually hides the value step where the road surface meets the
  // pavement in a low camera. This is the seam the eye lands on first in any
  // street-level frame.
  seam(-HW + 0.08, zMin + 2, -HW + 0.08, zMax - 2, 'sand', 'road_dust', 0.012);
  seam(HW - 0.08, zMin + 2, HW - 0.08, zMax - 2, 'sand', 'road_dust', 0.012);
  // the pavement / open-ground line down both sides of the street, and the
  // perimeter of every alley and courtyard where its floor meets the sand
  seam(-KB, zMin + 2, -KB, zMax - 2, 'concrete', 'sand', WH + 0.004);
  seam(KB, zMin + 2, KB, zMax - 2, 'concrete', 'sand', WH + 0.004);
  for (const a of ALLEYS) {
    const [ax0, az0, ax1, az1] = a.rect;
    const ay = 0.062;
    seam(ax0, az0, ax1, az0, a.surface, 'sand', ay);
    seam(ax0, az1, ax1, az1, a.surface, 'sand', ay);
    seam(ax0, az0, ax0, az1, a.surface, 'sand', ay);
    seam(ax1, az0, ax1, az1, a.surface, 'sand', ay);
  }

  // ------------------------------------------- drifts, stains and covers --
  // Sand blown against the kerbs and building lines: the single cheapest thing
  // that stops a street reading as a clean box of geometry.
  for (let i = 0; i < 130; i++) {
    const side = rng.float() < 0.5 ? -1 : 1;
    const againstWall = rng.float() < 0.55;
    const x = againstWall
      ? side * (STREET.kerb - rng.range(0.05, 0.9))
      : side * (HW + rng.range(-0.35, 0.5));
    const z = rng.range(zMin + 2, zMax - 2);
    // On the road the surface is cambered and rutted, so a flat drift has to sit
    // above the local crown or it disappears into the tarmac.
    const y = againstWall
      ? WH + 0.012
      : Math.abs(x) < HW
        ? (1 - (x / HW) ** 2) * 0.055 + 0.05
        : WH + 0.01;
    const g = patchGeometry(rng, rng.range(0.35, 1.5), { lobes: 9, wobble: 0.5 });
    A.addOnce('sand', g, LL(IDENT, x, y, z, rng.float() * 6.28, 1, 1, rng.range(0.5, 1.0)), {
      masks: [0.15, 0.5, 0.3],
    });
  }
  for (let i = 0; i < 26; i++) {
    const g = patchGeometry(rng, rng.range(0.5, 1.8), { lobes: 10, wobble: 0.6 });
    const px = rng.range(-HW + 0.4, HW - 0.4);
    A.addOnce(
      'dirt',
      g,
      LL(IDENT, px, (1 - (px / HW) ** 2) * 0.055 + 0.048, rng.range(zMin + 3, zMax - 3), rng.float() * 6.28, 1, 1, rng.range(0.4, 0.9)),
      { masks: [0.1, 0.85, 0.5] }
    );
  }
  // manholes and gully gratings
  for (let i = 0; i < 7; i++) {
    const z = rng.range(zMin + 6, zMax - 6);
    const x = rng.range(-2.5, 2.5);
    const ring = A.cache('manhole', () => {
      const g = new THREE.CylinderGeometry(0.36, 0.36, 0.04, 18, 1);
      paintMasks(g, (px, py, pz, nx, ny, nz, out) => {
        out[0] = ny > 0.5 ? 0.95 : 0.4;
        out[1] = 0.55;
      });
      return g;
    });
    A.add('metal_dark', ring, LL(IDENT, x, 0.035 + (1 - (x / HW) ** 2) * 0.05, z, rng.float() * 6.28, 1, 1, 1));
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = rng.range(zMin + 8, zMax - 8);
      A.add(
        'metal_dark',
        BOX(A),
        LL(IDENT, side * (HW - 0.22), WH - 0.03, z, 0, 0.42, 0.05, 0.62),
        { masks: [0.7, 0.8, 0.6] }
      );
    }
  }
}
