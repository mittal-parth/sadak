/**
 * Collision debug view.
 *
 * One LineSegments with per-vertex colour, a fixed vertex budget and a moving
 * draw range — no allocation, no per-frame material churn. Other subsystems
 * flip it on with `ctx.get('physics').setDebugDraw(true)` while they are
 * bringing geometry up, and off again for beauty shots.
 *
 * Colour key
 *   grey    static collision triangles near the camera
 *   cyan    BVH leaf bounds
 *   green   character capsules (red when not grounded)
 *   orange  rigid bodies (dim when asleep)
 *   magenta ragdoll bones
 *   yellow  recent raycasts / sweeps
 *   red     contact normals
 */

import * as THREE from 'three';

const MAX_VERTS = 120000;

const COL = {
  tri: [0.32, 0.34, 0.38],
  node: [0.10, 0.45, 0.55],
  charGrounded: [0.25, 0.95, 0.35],
  charAir: [0.95, 0.35, 0.20],
  body: [1.0, 0.55, 0.12],
  bodySleep: [0.35, 0.24, 0.10],
  ragdoll: [0.95, 0.25, 0.85],
  ray: [0.98, 0.92, 0.25],
  contact: [1.0, 0.12, 0.12],
  proxy: [0.35, 0.75, 1.0],
};

export class PhysicsDebugView {
  constructor(scene) {
    this.scene = scene;
    this.enabled = false;
    this.showTriangles = true;
    this.showNodes = false;
    this.showRays = true;
    this.radius = 14; // metres of collision geometry drawn around the camera

    this.positions = new Float32Array(MAX_VERTS * 3);
    this.colors = new Float32Array(MAX_VERTS * 3);
    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colAttr = new THREE.BufferAttribute(this.colors, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('color', this.colAttr);
    this.geometry.setDrawRange(0, 0);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    this.object = new THREE.LineSegments(this.geometry, this.material);
    this.object.name = 'physics:debug';
    this.object.frustumCulled = false;
    this.object.renderOrder = 9000;
    this.object.visible = false;
    this.object.matrixAutoUpdate = false;
    // Tell `render` this is scaffolding: keep it out of the depth prepass and
    // out of its "has the real level arrived yet?" heuristic.
    this.object.userData.owNoPrepass = true;
    this.object.userData.owProbe = true;
    this.object.userData.noCollision = true;

    this._v = 0;
    this._corners = new Float32Array(24);
    /** Ring of recent query lines: [x0,y0,z0,x1,y1,z1,ttl] */
    this.rays = new Float32Array(256 * 7);
    this.rayHead = 0;
    this.rayCount = 0;
  }

  attach() {
    if (!this.object.parent) this.scene.add(this.object);
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.object.visible = this.enabled;
    if (this.enabled) this.attach();
  }

  /** Record a query for visualisation. Cheap enough to always call. */
  logRay(x0, y0, z0, x1, y1, z1, ttl = 1.5) {
    if (!this.enabled || !this.showRays) return;
    const i = this.rayHead * 7;
    const r = this.rays;
    r[i] = x0; r[i + 1] = y0; r[i + 2] = z0;
    r[i + 3] = x1; r[i + 4] = y1; r[i + 5] = z1;
    r[i + 6] = ttl;
    this.rayHead = (this.rayHead + 1) % 256;
    if (this.rayCount < 256) this.rayCount++;
  }

  begin() {
    this._v = 0;
  }

  line(x0, y0, z0, x1, y1, z1, c = COL.tri) {
    if (this._v + 2 > MAX_VERTS) return;
    const p = this.positions, col = this.colors;
    let o = this._v * 3;
    p[o] = x0; p[o + 1] = y0; p[o + 2] = z0;
    col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2];
    o += 3;
    p[o] = x1; p[o + 1] = y1; p[o + 2] = z1;
    col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2];
    this._v += 2;
  }

  triangle(ax, ay, az, bx, by, bz, cx, cy, cz, c) {
    this.line(ax, ay, az, bx, by, bz, c);
    this.line(bx, by, bz, cx, cy, cz, c);
    this.line(cx, cy, cz, ax, ay, az, c);
  }

  box(minx, miny, minz, maxx, maxy, maxz, c) {
    this.line(minx, miny, minz, maxx, miny, minz, c);
    this.line(maxx, miny, minz, maxx, miny, maxz, c);
    this.line(maxx, miny, maxz, minx, miny, maxz, c);
    this.line(minx, miny, maxz, minx, miny, minz, c);
    this.line(minx, maxy, minz, maxx, maxy, minz, c);
    this.line(maxx, maxy, minz, maxx, maxy, maxz, c);
    this.line(maxx, maxy, maxz, minx, maxy, maxz, c);
    this.line(minx, maxy, maxz, minx, maxy, minz, c);
    this.line(minx, miny, minz, minx, maxy, minz, c);
    this.line(maxx, miny, minz, maxx, maxy, minz, c);
    this.line(maxx, miny, maxz, maxx, maxy, maxz, c);
    this.line(minx, miny, maxz, minx, maxy, maxz, c);
  }

  /** Oriented box from a Matrix4 and half-extents. Allocation-free. */
  obb(m, hx, hy, hz, c = COL.proxy) {
    const e = m.elements;
    const v = this._corners;
    let k = 0;
    for (let i = 0; i < 2; i++) {
      const x = i ? hx : -hx;
      for (let j = 0; j < 2; j++) {
        const y = j ? hy : -hy;
        for (let l = 0; l < 2; l++) {
          const z = l ? hz : -hz;
          v[k++] = e[0] * x + e[4] * y + e[8] * z + e[12];
          v[k++] = e[1] * x + e[5] * y + e[9] * z + e[13];
          v[k++] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
      }
    }
    const E = BOX_EDGES;
    for (let i = 0; i < E.length; i += 2) {
      const a = E[i] * 3, b = E[i + 1] * 3;
      this.line(v[a], v[a + 1], v[a + 2], v[b], v[b + 1], v[b + 2], c);
    }
  }

  /** Capsule as three great rings plus four connecting lines. */
  capsule(ax, ay, az, bx, by, bz, r, c = COL.proxy, segments = 12) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    // orthonormal basis
    let ux = 0, uy = 0, uz = 1;
    if (Math.abs(dz) > 0.9) { ux = 1; uz = 0; }
    let px = uy * dz - uz * dy, py = uz * dx - ux * dz, pz = ux * dy - uy * dx;
    let pl = Math.hypot(px, py, pz) || 1;
    px /= pl; py /= pl; pz /= pl;
    const qx = dy * pz - dz * py, qy = dz * px - dx * pz, qz = dx * py - dy * px;

    // rings around each cap
    for (let e = 0; e < 2; e++) {
      const cxp = e === 0 ? ax : bx, cyp = e === 0 ? ay : by, czp = e === 0 ? az : bz;
      let prx = 0, pry = 0, prz = 0;
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const s = Math.sin(t) * r, co = Math.cos(t) * r;
        const x = cxp + px * co + qx * s;
        const y = cyp + py * co + qy * s;
        const z = czp + pz * co + qz * s;
        if (i > 0) this.line(prx, pry, prz, x, y, z, c);
        prx = x; pry = y; prz = z;
      }
    }
    // side lines
    this.line(ax + px * r, ay + py * r, az + pz * r, bx + px * r, by + py * r, bz + pz * r, c);
    this.line(ax - px * r, ay - py * r, az - pz * r, bx - px * r, by - py * r, bz - pz * r, c);
    this.line(ax + qx * r, ay + qy * r, az + qz * r, bx + qx * r, by + qy * r, bz + qz * r, c);
    this.line(ax - qx * r, ay - qy * r, az - qz * r, bx - qx * r, by - qy * r, bz - qz * r, c);
    // end caps (half rings in the plane of d/p)
    for (let e = 0; e < 2; e++) {
      const s = e === 0 ? -1 : 1;
      const cxp = e === 0 ? ax : bx, cyp = e === 0 ? ay : by, czp = e === 0 ? az : bz;
      let prx = 0, pry = 0, prz = 0;
      for (let i = 0; i <= segments / 2; i++) {
        const t = (i / (segments / 2)) * Math.PI;
        const cc = Math.cos(t) * r, ss = Math.sin(t) * r * s;
        const x = cxp + px * cc + dx * ss;
        const y = cyp + py * cc + dy * ss;
        const z = czp + pz * cc + dz * ss;
        if (i > 0) this.line(prx, pry, prz, x, y, z, c);
        prx = x; pry = y; prz = z;
      }
    }
  }

  /**
   * Rebuild the line buffer. Called once per frame while enabled.
   * `camera` limits how much static geometry is drawn.
   */
  rebuild(phys, camera, dt) {
    if (!this.enabled) return;
    this.begin();
    const w = phys.staticWorld;

    if (this.showTriangles && w.triCount > 0 && camera) {
      const c = camera.position;
      const R = this.radius;
      const n = w.queryAabb(c.x - R, c.y - R, c.z - R, c.x + R, c.y + R, c.z + R, 0xffff);
      const cand = w.candidates;
      const pos = w.pos;
      const limit = Math.min(n, 6000);
      for (let i = 0; i < limit; i++) {
        const p = cand[i] * 9;
        this.triangle(
          pos[p], pos[p + 1], pos[p + 2],
          pos[p + 3], pos[p + 4], pos[p + 5],
          pos[p + 6], pos[p + 7], pos[p + 8],
          COL.tri
        );
      }
    }

    if (this.showNodes && w.nodeCount > 0) {
      const nb = w.nodeBounds;
      const meta = w.nodeMeta;
      const limit = Math.min(w.nodeCount, 2000);
      for (let i = 0; i < limit; i++) {
        if (meta[i * 2 + 1] === 0) continue; // interior
        const o = i * 6;
        this.box(nb[o], nb[o + 1], nb[o + 2], nb[o + 3], nb[o + 4], nb[o + 5], COL.node);
      }
    }

    for (const ch of phys.characters) {
      const c = ch.grounded ? COL.charGrounded : COL.charAir;
      this.capsule(
        ch.position.x, ch.position.y + ch.radius, ch.position.z,
        ch.position.x, ch.position.y + ch.height - ch.radius, ch.position.z,
        ch.radius, c
      );
      if (ch.grounded) {
        this.line(
          ch.position.x, ch.position.y, ch.position.z,
          ch.position.x + ch.groundNormal.x * 0.4,
          ch.position.y + ch.groundNormal.y * 0.4,
          ch.position.z + ch.groundNormal.z * 0.4,
          COL.contact
        );
      }
    }

    for (const b of phys.bodies.bodies) {
      const c = b.sleeping ? COL.bodySleep : COL.body;
      if (b.shape === 'sphere') {
        this.capsule(
          b.position.x, b.position.y - 1e-4, b.position.z,
          b.position.x, b.position.y + 1e-4, b.position.z,
          b.radius, c, 10
        );
      } else if (b.shape === 'capsule') {
        const q = b.quaternion;
        const ax = 2 * (q.x * q.y - q.w * q.z);
        const ay = 1 - 2 * (q.x * q.x + q.z * q.z);
        const az = 2 * (q.y * q.z + q.w * q.x);
        const h = b.halfHeight;
        this.capsule(
          b.position.x - ax * h, b.position.y - ay * h, b.position.z - az * h,
          b.position.x + ax * h, b.position.y + ay * h, b.position.z + az * h,
          b.radius, c, 10
        );
      } else {
        _m.compose(b.position, b.quaternion, _one);
        this.obb(_m, b.hx, b.hy, b.hz, c);
      }
    }

    for (const rd of phys.ragdolls) {
      for (let i = 0; i < rd.boneCount; i++) {
        const a = rd.boneHead[i], t = rd.boneTail[i];
        this.capsule(
          rd.px[a], rd.py[a], rd.pz[a],
          rd.px[t], rd.py[t], rd.pz[t],
          rd.boneRadius[i], COL.ragdoll, 8
        );
      }
    }

    for (const p of phys.colliders) {
      if (!p.enabled) continue;
      if (p.shape === 'box') {
        this.obb(p.matrix, p.hx, p.hy, p.hz, COL.proxy);
      } else {
        this.capsule(p.ax, p.ay, p.az, p.bx, p.by, p.bz, p.radius, COL.proxy, 8);
      }
    }

    if (this.showRays) {
      const r = this.rays;
      for (let i = 0; i < 256; i++) {
        const o = i * 7;
        if (r[o + 6] <= 0) continue;
        r[o + 6] -= dt;
        this.line(r[o], r[o + 1], r[o + 2], r[o + 3], r[o + 4], r[o + 5], COL.ray);
      }
    }

    this.geometry.setDrawRange(0, this._v);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  dispose() {
    this.object.parent?.remove(this.object);
    this.geometry.dispose();
    this.material.dispose();
  }
}

const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const BOX_EDGES = Uint8Array.from([0,1, 0,2, 0,4, 1,3, 1,5, 2,3, 2,6, 3,7, 4,5, 4,6, 5,7, 6,7]);
