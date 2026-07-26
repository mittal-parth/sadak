import * as THREE from 'three';

/**
 * Projected decals.
 *
 * A decal is a box projector. We pull the static world's triangle soup out of
 * the physics BVH (`queryAabb` -> world-space triangles), reject any triangle
 * whose normal deviates too far from the impact normal, clip what is left
 * against the six planes of the projector box (Sutherland–Hodgman) and fan the
 * resulting polygons into a preallocated vertex ring.
 *
 * That gives what a screen-space decal cannot: the decal wraps around corners
 * and window reveals, and it *cannot* smear across a perpendicular face,
 * because the perpendicular face is discarded before clipping. The box's
 * thickness also depth-clips the projection, so a bullet hole on a wall never
 * appears on the pillar 40 cm behind it.
 *
 * Everything is one draw call, one MeshStandardMaterial (so it inherits the
 * renderer's cascaded shadows, AO and IBL), with its own albedo/normal/ORM
 * atlas so a bullet hole has real relief, and a time-based fade driven entirely
 * on the GPU: the CPU touches a decal exactly once, when it is created.
 */

const MAX_POLY = 24;
// Hoisted so projecting a decal allocates nothing.
const FAN = [0, 0, 0];
const QUAD = new Float32Array(12);

export class DecalSystem {
  /**
   * @param {object} o
   * @param {number} o.capacity      config.q.decalBudget
   * @param {THREE.Texture} o.albedo
   * @param {THREE.Texture} o.normal
   * @param {THREE.Texture} o.orm
   * @param {number} o.cols          atlas columns
   */
  constructor(o) {
    this.capacity = Math.max(8, o.capacity | 0);
    this.cols = o.cols;
    this.vertsPerDecal = 36;
    this.maxVerts = this.capacity * this.vertsPerDecal;
    this.cursor = 0;
    this.highWater = 0;
    this.expireAt = -1;
    this.count = 0;

    this.pos = new Float32Array(this.maxVerts * 3);
    this.nrm = new Float32Array(this.maxVerts * 3);
    this.uvs = new Float32Array(this.maxVerts * 2);
    this.dec = new Float32Array(this.maxVerts * 4);

    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aNrm = new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage);
    this.aUv = new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage);
    this.aDec = new THREE.BufferAttribute(this.dec, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('normal', this.aNrm);
    g.setAttribute('uv', this.aUv);
    g.setAttribute('aDecal', this.aDec);
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.geometry = g;

    this.uNow = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({
      map: o.albedo,
      normalMap: o.normal,
      roughnessMap: o.orm,
      metalnessMap: o.orm,
      aoMap: o.orm,
      roughness: 1,
      metalness: 1,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
      side: THREE.FrontSide,
      envMapIntensity: 0.85,
      normalScale: new THREE.Vector2(1.35, 1.35),
      alphaTest: 0.004,
      dithering: true,
    });
    mat.name = 'fx-decals';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uNow = this.uNow;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec4 aDecal;\nvarying vec4 vDecal;'
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvDecal = aDecal;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uNow;\nvarying vec4 vDecal;'
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  {
    float n = ( uNow - vDecal.x ) * vDecal.y;
    if ( n < 0.0 || n > 1.0 ) discard;
    float f = vDecal.w * ( 1.0 - smoothstep( vDecal.z, 1.0, n ) );
    diffuseColor.a *= f;
    if ( diffuseColor.a < 0.004 ) discard;
  }`
        );
    };
    // Distinct cache key so this variant never shares a program with a plain
    // standard material.
    mat.customProgramCacheKey = () => 'fx-decal-1';
    this.material = mat;

    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'fx-decals';
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.mesh.userData.owProbe = true;
    this.mesh.userData.owNoShadow = true;
    this.mesh.visible = false;

    // scratch (allocated once)
    this._polyA = new Float32Array(MAX_POLY * 3);
    this._polyB = new Float32Array(MAX_POLY * 3);
    this._basis = new Float32Array(9);
    this._dirtyLo = Infinity;
    this._dirtyHi = -Infinity;
    this._wrapped = false;
  }

  /** Clip polygon `src`/`n` against plane axis (0..2) sign (+1/-1) limit. */
  _clip(src, n, dst, axis, sign, limit) {
    let m = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ai = i * 3;
      const bi = j * 3;
      const av = src[ai + axis] * sign;
      const bv = src[bi + axis] * sign;
      const ain = av <= limit;
      const bin = bv <= limit;
      if (ain) {
        if (m < MAX_POLY) {
          dst[m * 3] = src[ai];
          dst[m * 3 + 1] = src[ai + 1];
          dst[m * 3 + 2] = src[ai + 2];
          m++;
        }
      }
      if (ain !== bin) {
        const t = (limit - av) / (bv - av);
        if (m < MAX_POLY) {
          dst[m * 3] = src[ai] + (src[bi] - src[ai]) * t;
          dst[m * 3 + 1] = src[ai + 1] + (src[bi + 1] - src[ai + 1]) * t;
          dst[m * 3 + 2] = src[ai + 2] + (src[bi + 2] - src[ai + 2]) * t;
          m++;
        }
      }
    }
    return m;
  }

  /**
   * Project a decal.
   *
   * @param {object} o
   * @param {THREE.Vector3} o.point   surface point
   * @param {THREE.Vector3} o.normal  surface normal
   * @param {number} o.size           edge length in metres
   * @param {number} o.tile           atlas tile index
   * @param {number} [o.roll]         rotation about the normal, radians
   * @param {number} [o.life]         seconds
   * @param {number} [o.fade]         normalised age at which fading starts
   * @param {number} [o.opacity]
   * @param {number} [o.maxAngle]     reject triangles beyond this deviation
   * @param {number} [o.depth]        projector half-thickness in metres
   * @param {boolean} [o.flip]        mirror the sprite for variety
   * @param {object} o.world          physics StaticWorld
   * @param {number} o.now
   */
  add(o) {
    const world = o.world;
    const size = o.size;
    const hs = size * 0.5;
    const hd = o.depth ?? Math.max(0.045, size * 0.35);
    const p = o.point;
    const nz = o.normal;

    // ---- orthonormal basis around the impact normal ------------------------
    let nx = nz.x;
    let ny = nz.y;
    let nzz = nz.z;
    const nl = Math.hypot(nx, ny, nzz) || 1;
    nx /= nl;
    ny /= nl;
    nzz /= nl;
    // Roll reference: gravity-aligned on walls (so blood runs and gouges read
    // correctly), arbitrary on floors/ceilings.
    let ux = 0;
    let uy = 1;
    let uz = 0;
    if (Math.abs(ny) > 0.94) {
      ux = 1;
      uy = 0;
      uz = 0;
    }
    // tangent = normalize(up - n * dot(n,up)) then rolled about n
    let d = ux * nx + uy * ny + uz * nzz;
    let tx = ux - nx * d;
    let ty = uy - ny * d;
    let tz = uz - nzz * d;
    let tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-4) {
      tx = 1;
      ty = 0;
      tz = 0;
      tl = 1;
    }
    tx /= tl;
    ty /= tl;
    tz /= tl;
    const roll = o.roll ?? 0;
    if (roll !== 0) {
      // Rodrigues rotation of t about n
      const c = Math.cos(roll);
      const s = Math.sin(roll);
      const cx = ny * tz - nzz * ty;
      const cy = nzz * tx - nx * tz;
      const cz = nx * ty - ny * tx;
      const rx = tx * c + cx * s;
      const ry = ty * c + cy * s;
      const rz = tz * c + cz * s;
      tx = rx;
      ty = ry;
      tz = rz;
    }
    // bitangent = n x t
    const bx = ny * tz - nzz * ty;
    const by = nzz * tx - nx * tz;
    const bz = nx * ty - ny * tx;

    const slot = this.cursor;
    this.cursor = slot + 1;
    if (this.cursor >= this.capacity) {
      this.cursor = 0;
      this._wrapped = true;
    }
    let w = slot * this.vertsPerDecal; // write cursor, in vertices
    const limit = w + this.vertsPerDecal;

    const cosLimit = Math.cos(((o.maxAngle ?? 62) * Math.PI) / 180);
    const A = this._polyA;
    const B = this._polyB;

    let wrote = 0;
    if (world && world.triCount > 0) {
      const rad = Math.max(hs, hd) * 1.5;
      const n = world.queryAabb(
        p.x - rad, p.y - rad, p.z - rad,
        p.x + rad, p.y + rad, p.z + rad,
        o.mask ?? 0xffff
      );
      const cand = world.candidates;
      const tpos = world.pos;
      const tnrm = world.nrm;
      for (let ci = 0; ci < n && w + 3 <= limit; ci++) {
        const tri = cand[ci];
        const tn = tri * 3;
        const fnx = tnrm[tn];
        const fny = tnrm[tn + 1];
        const fnz = tnrm[tn + 2];
        if (fnx * nx + fny * ny + fnz * nzz < cosLimit) continue;

        // to decal space
        const tp = tri * 9;
        let m = 3;
        for (let v = 0; v < 3; v++) {
          const dx = tpos[tp + v * 3] - p.x;
          const dy = tpos[tp + v * 3 + 1] - p.y;
          const dz = tpos[tp + v * 3 + 2] - p.z;
          A[v * 3] = dx * tx + dy * ty + dz * tz;
          A[v * 3 + 1] = dx * bx + dy * by + dz * bz;
          A[v * 3 + 2] = dx * nx + dy * ny + dz * nzz;
        }

        m = this._clip(A, m, B, 0, 1, hs);
        if (m < 3) continue;
        m = this._clip(B, m, A, 0, -1, hs);
        if (m < 3) continue;
        m = this._clip(A, m, B, 1, 1, hs);
        if (m < 3) continue;
        m = this._clip(B, m, A, 1, -1, hs);
        if (m < 3) continue;
        m = this._clip(A, m, B, 2, 1, hd);
        if (m < 3) continue;
        m = this._clip(B, m, A, 2, -1, hd);
        if (m < 3) continue;

        // fan, back to world space, lifted off the surface along its own normal
        const lift = 0.0016 + size * 0.004;
        for (let v = 1; v + 1 < m && w + 3 <= limit; v++) {
          FAN[1] = v;
          FAN[2] = v + 1;
          for (let q = 0; q < 3; q++) {
            const s = FAN[q] * 3;
            const lx = A[s];
            const ly = A[s + 1];
            const lz = A[s + 2];
            const wx = p.x + tx * lx + bx * ly + nx * lz + fnx * lift;
            const wy = p.y + ty * lx + by * ly + ny * lz + fny * lift;
            const wz = p.z + tz * lx + bz * ly + nzz * lz + fnz * lift;
            this.pos[w * 3] = wx;
            this.pos[w * 3 + 1] = wy;
            this.pos[w * 3 + 2] = wz;
            this.nrm[w * 3] = fnx;
            this.nrm[w * 3 + 1] = fny;
            this.nrm[w * 3 + 2] = fnz;
            this._writeUv(w, lx, ly, hs, o.tile, o.flip);
            w++;
            wrote++;
          }
        }
      }
    }

    // Fallback: nothing in the BVH here (dynamic body, actor, or a world that
    // has not registered collision yet) — lay a single quad on the plane.
    if (wrote === 0 && w + 6 <= limit) {
      const lift = 0.004 + size * 0.01;
      QUAD[0] = -hs; QUAD[1] = -hs;
      QUAD[2] = hs; QUAD[3] = -hs;
      QUAD[4] = hs; QUAD[5] = hs;
      QUAD[6] = -hs; QUAD[7] = -hs;
      QUAD[8] = hs; QUAD[9] = hs;
      QUAD[10] = -hs; QUAD[11] = hs;
      for (let q = 0; q < 6; q++) {
        const lx = QUAD[q * 2];
        const ly = QUAD[q * 2 + 1];
        this.pos[w * 3] = p.x + tx * lx + bx * ly + nx * lift;
        this.pos[w * 3 + 1] = p.y + ty * lx + by * ly + ny * lift;
        this.pos[w * 3 + 2] = p.z + tz * lx + bz * ly + nzz * lift;
        this.nrm[w * 3] = nx;
        this.nrm[w * 3 + 1] = ny;
        this.nrm[w * 3 + 2] = nzz;
        this._writeUv(w, lx, ly, hs, o.tile, o.flip);
        w++;
        wrote++;
      }
    }

    // Degenerate the rest of the slot so a shorter decal does not leave the
    // previous occupant's triangles behind.
    const life = Math.max(0.2, o.life ?? 30);
    const birth = o.now;
    const fade = o.fade ?? 0.72;
    const opacity = o.opacity ?? 1;
    for (let v = slot * this.vertsPerDecal; v < limit; v++) {
      if (v >= slot * this.vertsPerDecal + wrote) {
        this.pos[v * 3] = 0;
        this.pos[v * 3 + 1] = 0;
        this.pos[v * 3 + 2] = 0;
      }
      this.dec[v * 4] = birth;
      this.dec[v * 4 + 1] = 1 / life;
      this.dec[v * 4 + 2] = fade;
      this.dec[v * 4 + 3] = opacity;
    }

    if (slot < this._dirtyLo) this._dirtyLo = slot;
    if (slot > this._dirtyHi) this._dirtyHi = slot;
    if (slot + 1 > this.highWater) this.highWater = slot + 1;
    if (birth + life > this.expireAt) this.expireAt = birth + life;
    this.count++;
    return wrote > 0;
  }

  _writeUv(w, lx, ly, hs, tile, flip) {
    const cols = this.cols;
    const tx = tile % cols;
    const ty = Math.floor(tile / cols);
    let u = lx / (2 * hs) + 0.5;
    const v = ly / (2 * hs) + 0.5;
    if (flip) u = 1 - u;
    this.uvs[w * 2] = (u + tx) / cols;
    this.uvs[w * 2 + 1] = (v + ty) / cols;
  }

  flush(now) {
    this.uNow.value = now;
    if (this._dirtyHi >= this._dirtyLo) {
      const vpd = this.vertsPerDecal;
      const start = this._dirtyLo * vpd;
      const count = (this._dirtyHi - this._dirtyLo + 1) * vpd;
      this.aPos.addUpdateRange(start * 3, count * 3);
      this.aPos.needsUpdate = true;
      this.aNrm.addUpdateRange(start * 3, count * 3);
      this.aNrm.needsUpdate = true;
      this.aUv.addUpdateRange(start * 2, count * 2);
      this.aUv.needsUpdate = true;
      this.aDec.addUpdateRange(start * 4, count * 4);
      this.aDec.needsUpdate = true;
      this._dirtyLo = Infinity;
      this._dirtyHi = -Infinity;
    }
    const verts = (this._wrapped ? this.capacity : this.highWater) * this.vertsPerDecal;
    this.geometry.setDrawRange(0, verts);
    this.mesh.visible = verts > 0 && now < this.expireAt;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
