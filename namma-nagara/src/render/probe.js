import * as THREE from 'three';

/**
 * Renderer validation scene.
 *
 * This exists ONLY so the render subsystem can be developed and screenshotted
 * before the world subsystem lands. It is added on the first frame if the
 * world scene contains no meshes at all, and it deletes itself the moment any
 * other subsystem puts geometry in the scene. Nothing here is shipped content.
 */

function fbm(x, y, perm) {
  const hash = (i, j) => perm[(perm[i & 255] + (j & 255)) & 255] / 255;
  const smooth = (t) => t * t * (3 - 2 * t);
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < 5; o++) {
    const fx = x * freq;
    const fy = y * freq;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    const v = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    sum += v * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

function makeSurface(rng, size, opts) {
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = rng.int(0, 255);

  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);

  const scale = opts.scale ?? 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * scale;
      const v = (y / size) * scale;
      let h = fbm(u, v, perm);
      const fine = fbm(u * 7.3, v * 7.3, perm);
      h = h * 0.75 + fine * 0.25;
      if (opts.cracks) {
        const c = Math.abs(fbm(u * 1.7 + 5.5, v * 1.7 - 2.2, perm) - 0.5) * 2;
        h -= Math.pow(1 - Math.min(1, c * 3.2), 6) * 0.55;
      }
      height[y * size + x] = h;
    }
  }

  const base = opts.base;
  const varyC = opts.variation ?? 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const h = height[i];
      const grime = Math.pow(1 - h, 2.2);
      const tint = 1 - varyC * 0.5 + h * varyC;
      const r = base[0] * tint * (1 - grime * 0.35);
      const g = base[1] * tint * (1 - grime * 0.38);
      const b = base[2] * tint * (1 - grime * 0.42);
      albedo[i * 4] = Math.min(255, r * 255);
      albedo[i * 4 + 1] = Math.min(255, g * 255);
      albedo[i * 4 + 2] = Math.min(255, b * 255);
      albedo[i * 4 + 3] = 255;

      const rv = (opts.rough ?? 0.75) + (h - 0.5) * (opts.roughVar ?? 0.3);
      rough[i * 4] = 255;
      rough[i * 4 + 1] = Math.max(0, Math.min(255, rv * 255)); // roughness in G
      rough[i * 4 + 2] = 0; // metalness in B
      rough[i * 4 + 3] = 255;

      const xp = height[y * size + ((x + 1) % size)];
      const xm = height[y * size + ((x - 1 + size) % size)];
      const yp = height[((y + 1) % size) * size + x];
      const ym = height[((y - 1 + size) % size) * size + x];
      const st = (opts.bump ?? 2.4) * size * 0.004;
      const nx = (xm - xp) * st;
      const ny = (ym - yp) * st;
      const len = Math.hypot(nx, ny, 1);
      normal[i * 4] = ((nx / len) * 0.5 + 0.5) * 255;
      normal[i * 4 + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      normal[i * 4 + 2] = (1 / len) * 0.5 * 255 + 127;
      normal[i * 4 + 3] = 255;
    }
  }

  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(albedo, true), normalMap: mk(normal, false), ormMap: mk(rough, false) };
}

/**
 * XZ positions the blockout must never enclose: the named camera setups in
 * src/dev/shots.js. Without this the random street can spawn a block or a crate
 * exactly where a shot camera stands, and the capture comes back as a
 * featureless wall filling the frame — which reads as a broken renderer.
 */
const SHOT_KEEPOUT = [
  [12, 18], // hero / night / hud
  [-8.5, 3.2], // interior
  [3.2, 5.0], // detail
  [16, 22], // sunset
  [6, 10], // weapon / ads / muzzle
  [4, 12], // combat
  [2.5, 6], // impacts
];

/** True when the axis-aligned footprint (centre + half extents) is clear. */
function footprintClear(px, pz, hx, hz, margin) {
  const ex = hx + margin;
  const ez = hz + margin;
  for (let i = 0; i < SHOT_KEEPOUT.length; i++) {
    const k = SHOT_KEEPOUT[i];
    if (Math.abs(k[0] - px) < ex && Math.abs(k[1] - pz) < ez) return false;
  }
  return true;
}

export class RenderProbeScene {
  constructor(rng) {
    this.rng = rng;
    this.group = new THREE.Group();
    this.group.name = 'ow-render-probe';
    this.group.userData.owProbe = true;
    this.disposables = [];
    this.built = false;
  }

  build() {
    if (this.built) return this.group;
    this.built = true;
    const rng = this.rng;

    const concrete = makeSurface(rng, 256, {
      base: [0.42, 0.41, 0.39],
      rough: 0.82,
      roughVar: 0.3,
      cracks: true,
      bump: 2.0,
      scale: 5,
    });
    const asphalt = makeSurface(rng, 256, {
      base: [0.16, 0.16, 0.17],
      rough: 0.62,
      roughVar: 0.42,
      bump: 3.0,
      scale: 9,
    });
    const rustMetal = makeSurface(rng, 256, {
      base: [0.36, 0.24, 0.16],
      rough: 0.5,
      roughVar: 0.45,
      bump: 2.2,
      scale: 4,
    });
    this.disposables.push(
      ...Object.values(concrete),
      ...Object.values(asphalt),
      ...Object.values(rustMetal)
    );

    const mat = (s, o = {}) => {
      const m = new THREE.MeshStandardMaterial({
        map: s.map,
        normalMap: s.normalMap,
        roughnessMap: s.ormMap,
        metalnessMap: s.ormMap,
        roughness: 1,
        metalness: o.metalness ?? 0,
        normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
        envMapIntensity: 1,
      });
      this.disposables.push(m);
      return m;
    };

    // ---- ground -----------------------------------------------------------
    const groundMat = mat(asphalt);
    groundMat.map.repeat.set(18, 18);
    groundMat.normalMap.repeat.set(18, 18);
    groundMat.roughnessMap.repeat.set(18, 18);
    const groundGeo = new THREE.PlaneGeometry(120, 120, 1, 1);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    this.disposables.push(groundGeo);
    this.group.add(ground);

    // ---- a street of blocks ----------------------------------------------
    const wallMat = mat(concrete, { normalScale: 1.2 });
    wallMat.map.repeat.set(3, 3);
    wallMat.normalMap.repeat.set(3, 3);
    wallMat.roughnessMap.repeat.set(3, 3);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.disposables.push(boxGeo);

    for (let i = 0; i < 14; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const w = rng.range(4, 8);
      const h = rng.range(4, 11);
      const d = rng.range(5, 9);
      const z = -22 + i * 3.4 + rng.range(-1, 1);
      // Push the block outward until it no longer swallows a shot camera; the
      // street is wide enough that 4 tries always resolves.
      let x = side * rng.range(9, 13);
      for (let t = 0; t < 4 && !footprintClear(x, z, w / 2, d / 2, 1.5); t++) {
        x += side * 2.5;
      }
      if (!footprintClear(x, z, w / 2, d / 2, 1.5)) continue;
      const b = new THREE.Mesh(boxGeo, wallMat);
      b.scale.set(w, h, d);
      b.position.set(x, h / 2, z);
      b.rotation.y = rng.range(-0.05, 0.05);
      b.castShadow = true;
      b.receiveShadow = true;
      this.group.add(b);
    }

    // ---- clutter that shows contact shadows and AO ------------------------
    const crateMat = mat(rustMetal, { metalness: 0.0, normalScale: 1.4 });
    for (let i = 0; i < 22; i++) {
      const s = rng.range(0.4, 1.1);
      const sy = s * rng.range(0.7, 1.2);
      const cx = rng.range(-8, 8);
      const cz = rng.range(-14, 14);
      const r = rng.range(0, Math.PI * 2);
      // A crate spawned on top of the camera fills the whole frame.
      if (!footprintClear(cx, cz, s * 0.71, s * 0.71, 0.9)) continue;
      const c = new THREE.Mesh(boxGeo, crateMat);
      c.scale.set(s, sy, s);
      c.position.set(cx, sy / 2, cz);
      c.rotation.y = r;
      c.castShadow = true;
      c.receiveShadow = true;
      this.group.add(c);
    }

    // ---- chrome + rough metal spheres for SSR / IBL -----------------------
    const sphereGeo = new THREE.SphereGeometry(0.55, 48, 32);
    this.disposables.push(sphereGeo);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.08, 0.05, 0.62),
        metalness: 1,
        roughness: 0.06 + i * 0.14,
        envMapIntensity: 1,
      });
      this.disposables.push(m);
      const s = new THREE.Mesh(sphereGeo, m);
      s.position.set(-3 + i * 2.0, 0.55, 3.0);
      s.castShadow = true;
      s.receiveShadow = true;
      this.group.add(s);
    }

    // ---- a bright emissive so bloom has something honest to work with -----
    const lampGeo = new THREE.SphereGeometry(0.12, 16, 12);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: new THREE.Color(1.0, 0.72, 0.42),
      emissiveIntensity: 40,
      roughness: 1,
    });
    this.disposables.push(lampGeo, lampMat);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(lampGeo, lampMat);
      l.position.set(-9.5, 4.2, -10 + i * 9);
      this.group.add(l);
      const pl = new THREE.PointLight(0xffb070, 12, 18, 2);
      pl.position.copy(l.position);
      this.group.add(pl);
    }

    return this.group;
  }

  dispose() {
    for (const d of this.disposables) d.dispose?.();
    this.disposables.length = 0;
    this.group.clear();
  }
}
