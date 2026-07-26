import * as THREE from 'three';
import { mergeSimple } from '../../kit.js';
import { chamferBox, fillMasks } from '../../util.js';

/**
 * WORLD — part builder for Bengaluru assets.
 *
 * The same accumulator pattern as the private `PB` in `src/world/props.js`: a
 * prop is a small assembly of chamfered boxes and tubes merged into ONE
 * geometry, then registered as an InstancedMesh prototype.
 *
 * It lives here rather than being exported from `props.js` for one reason: this
 * level must not disturb the shared prop library. Geometry construction draws
 * from a shared seeded RNG stream, and the market level's baseline depends on
 * its order, so nothing in `src/world/*.js` gets edited to serve this level.
 *
 * Mask convention as everywhere: r = edge wear, g = grime, b = extra AO.
 * Prop origin convention as everywhere: at the FOOT, so `A.put(id, x, 0, z)`
 * stands it on the ground.
 */

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

export function mat(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

export class PB {
  constructor() {
    this.list = [];
  }

  _push(g, wear, grime, ao) {
    if (!g.getAttribute('color')) fillMasks(g, 0.2, 0, 0);
    if (wear !== 1 || grime > 0 || ao > 0) {
      const c = g.getAttribute('color');
      for (let i = 0; i < c.count; i++) {
        c.setXYZ(
          i,
          Math.min(1, c.getX(i) * wear),
          Math.min(1, Math.max(c.getY(i), grime)),
          Math.min(1, Math.max(c.getZ(i), ao))
        );
      }
    }
    this.list.push(g);
    return g;
  }

  box(sx, sy, sz, x = 0, y = 0, z = 0, o = {}) {
    const g = chamferBox(sx, sy, sz, o.bevel ?? 0.01);
    g.applyMatrix4(mat(x, y, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0));
    return this._push(g, o.wear ?? 1, o.grime ?? 0, o.ao ?? 0);
  }

  cyl(r, h, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.CylinderGeometry(
      (o.taper ?? 1) * r,
      r,
      h,
      o.radial ?? 12,
      o.seg ?? 1,
      o.open ?? false
    );
    g.applyMatrix4(mat(x, y, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0));
    return this._push(g, o.wear ?? 1, o.grime ?? 0, o.ao ?? 0);
  }

  /** A sphere — fruit, coconuts, pots, finials. */
  ball(r, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.SphereGeometry(r, o.seg ?? 9, o.rings ?? 6);
    g.applyMatrix4(
      mat(x, y, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)
    );
    return this._push(g, o.wear ?? 1, o.grime ?? 0, o.ao ?? 0);
  }

  geo(g, x = 0, y = 0, z = 0, o = {}) {
    g.applyMatrix4(
      mat(x, y, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)
    );
    return this._push(g, o.wear ?? 1, o.grime ?? 0, o.ao ?? 0);
  }

  build() {
    const g = mergeSimple(this.list);
    for (const p of this.list) p.dispose();
    this.list.length = 0;
    return g;
  }
}
