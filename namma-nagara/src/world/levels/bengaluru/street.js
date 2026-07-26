import * as THREE from 'three';
import { STREET } from '../../layout.js';
import { chamferBox, paintMasks, fillMasks } from '../../util.js';

/**
 * WORLD — Bengaluru street furniture, laid over the shared ground.
 *
 * `ground.js` builds the terrain, road camber, kerbs and pavement slabs and is
 * shared by every level, so nothing here edits it. This module runs afterwards
 * and adds the things that make an Indian road an Indian road:
 *
 *   - SPEED BREAKERS. Unmarked, unwarned, and the single most reliable tell.
 *     A real hump is ~10 cm over ~1.2 m, which is a genuine arc, not a kerb.
 *   - BLACK-AND-YELLOW KERBS. Painted by the corporation, repainted over the
 *     dirt, and the highest-contrast thing at street level.
 *   - STORM DRAIN SLABS. The footpath is a lid over a drain. Some slabs are
 *     missing, which is both true and a good silhouette break.
 *   - TAR PATCHES. Indian roads are resurfaced in pieces, so the carriageway
 *     is a patchwork of different-age asphalt with raised seams.
 *
 * Everything is merged static geometry — no new draw calls beyond one batch per
 * palette key, all of which are keys this level already uses.
 */

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function mat(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(0, ry, 0);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

/**
 * A speed-breaker hump: an arc `w` wide (across the road), `d` deep (along it)
 * and `h` proud, built as a ribbon so there is no geometry buried under the
 * road. Origin at road level, centred.
 */
function humpGeometry(w, d, h, seg = 12) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  const halfW = w / 2;
  const halfD = d / 2;

  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const z = -halfD + t * d;
    // A cosine arc reaches the road tangentially at both feet, so the hump
    // blends into the surface instead of showing a lip you can see from 30 m.
    const y = h * 0.5 * (1 + Math.cos((t * 2 - 1) * Math.PI));
    // dy/dz of the arc, for the normal
    const dy = -h * 0.5 * Math.PI * (2 / d) * Math.sin((t * 2 - 1) * Math.PI);
    const len = Math.hypot(1, dy);
    for (let j = 0; j <= 1; j++) {
      pos.push(j === 0 ? -halfW : halfW, y, z);
      nrm.push(0, 1 / len, -dy / len);
      uv.push(j, t * d);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // Worn on the crown where every tyre hits it, dirty at the feet.
  fillMasks(g, 0.2, 0, 0);
  paintMasks(g, (x, y, z, nx, ny, nz, out) => {
    const crown = Math.min(1, y / Math.max(h, 1e-4));
    out[0] = Math.min(1, out[0] + crown * 0.85);
    out[1] = Math.min(1, out[1] + (1 - crown) * 0.5);
  });
  return g;
}

/** A flat quad lying on the road at height `y`, for paint and patches. */
function decalQuad(w, d) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  fillMasks(g, 0.35, 0.25, 0);
  return g;
}

export function bengaluruStreet(A, rng) {
  const halfW = STREET.halfWidth;
  const kerb = STREET.kerb;
  const walkH = STREET.walkH;

  // ----------------------------------------------------------- speed humps --
  // Placed where a real one would be: approaching a junction or a stretch of
  // shops, never on the open road.
  const HUMPS = [18.5, 2.0, -16.0, -33.0];
  for (const z of HUMPS) {
    const w = halfW * 2 + 0.5;
    const d = 1.15 + rng.range(-0.1, 0.15);
    const h = 0.095 + rng.range(-0.012, 0.02);
    const g = humpGeometry(w, d, h);
    A.addOnce('road_hump', g, mat(0, 0.012, z));

    // The warning stripes: white bars across the crown, worn through in the
    // wheel tracks. Painted once and never repainted, so they are patchy.
    const bars = 7;
    for (let i = 0; i < bars; i++) {
      const x = -w / 2 + ((i + 0.5) / bars) * w;
      // Wheel tracks sit about a metre either side of centre — the paint is
      // gone there. This is the detail that makes the stripes read as worn
      // rather than as a decal.
      const inTrack = Math.min(Math.abs(Math.abs(x) - 1.05), 1) / 1;
      if (rng.float() > 0.25 + inTrack * 0.6) continue;
      // The stripe has to follow the arc — a flat quad at crown height floats
      // clear of the road at both feet. Same generator, 4 mm proud.
      const bw = w / bars - 0.1;
      A.addOnce('paint_white', humpGeometry(bw, d * 0.8, h, 10), mat(x, 0.016, z));
    }

    // Collision: a low box. The BVH never needs the arc.
    A.box('concrete', 0, 0.012 + h * 0.5, z, w, h, d);
  }

  // ------------------------------------------------------- painted kerbs ---
  // Alternating black and yellow, 0.5 m bands, on the vertical kerb face on
  // both sides of the carriageway for the length of the street.
  const BAND = 0.5;
  const zFrom = STREET.zMin + 2;
  const zTo = STREET.zMax - 2;
  const bands = Math.floor((zTo - zFrom) / BAND);
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < bands; i++) {
      const z = zFrom + (i + 0.5) * BAND;
      // Repainting stops and starts; gaps where it has flaked off entirely.
      if (rng.float() < 0.10) continue;
      const key = i % 2 === 0 ? 'paint_yellow' : 'paint_black';
      const g = A.cache(`kerbband:${key}`, () => {
        const q = new THREE.PlaneGeometry(BAND - 0.02, walkH * 0.82);
        fillMasks(q, 0.5, 0.3, 0);
        return q;
      });
      // Face the CARRIAGEWAY. A PlaneGeometry's normal is +Z, so the kerb on
      // the +X side has to turn -90° about Y to look back at the road; turning
      // +90° points it into the building and it backface-culls to nothing.
      A.add(key, g, mat(side * (halfW + 0.02), walkH * 0.5, z, (-side * Math.PI) / 2));
    }
  }

  // -------------------------------------------------------- drain slabs ----
  // The footpath is the lid of the storm drain. Slabs run just inside the kerb;
  // roughly one in nine is missing, which is both accurate and a useful break
  // in an otherwise dead-straight line.
  const SLAB = 0.85;
  const slabs = Math.floor((zTo - zFrom) / SLAB);
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < slabs; i++) {
      const z = zFrom + (i + 0.5) * SLAB;
      const missing = rng.float() < 0.11;
      const x = side * (halfW + 0.55);
      if (missing) {
        // The open trench: a dark recess, not a hole in the mesh.
        const g = A.cache('drainvoid', () => {
          const b = chamferBox(0.62, 0.5, SLAB - 0.04, 0.006);
          fillMasks(b, 0, 0.9, 0.8);
          return b;
        });
        A.add('drain_void', g, mat(x, walkH - 0.26, z));
        continue;
      }
      const g = A.cache('drainslab', () => {
        const b = chamferBox(0.62, 0.09, SLAB - 0.05, 0.008);
        fillMasks(b, 0.4, 0.35, 0);
        return b;
      });
      // Slabs sit unevenly — they are lifted and dropped back constantly.
      A.add(
        'drain_slab',
        g,
        mat(x, walkH - 0.035 + rng.range(-0.012, 0.018), z, rng.range(-0.012, 0.012))
      );
    }
  }

  // ---------------------------------------------------------- tar patches --
  // Resurfacing done in pieces. Each patch is a slightly different value and
  // stands a few millimetres proud with a visible seam.
  for (let i = 0; i < 10; i++) {
    const z = rng.range(STREET.zMin + 3, STREET.zMax - 3);
    const x = rng.range(-halfW + 0.6, halfW - 0.6);
    const w = rng.range(0.9, 2.6);
    const d = rng.range(1.1, 3.4);
    const g = decalQuad(w, d);
    A.addOnce('road_patch', g, mat(x, 0.016 + rng.range(0, 0.004), z, rng.range(-0.25, 0.25)));
  }

  // ------------------------------------------------------ zebra crossing ---
  // One crossing, badly faded, near the north junction.
  const zebraZ = 21.5;
  for (let i = 0; i < 9; i++) {
    const x = -halfW + 0.35 + (i / 9) * (halfW * 2 - 0.4);
    if (rng.float() < 0.22) continue; // gone entirely
    const g = decalQuad(0.42, 2.6);
    A.addOnce('paint_white', g, mat(x, 0.015, zebraZ));
  }
}
