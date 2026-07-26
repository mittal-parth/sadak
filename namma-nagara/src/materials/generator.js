import * as THREE from 'three';
import { NOISE_GLSL } from './glsl/noise.js';
import { RUST_HELPERS } from './glsl/surfaces-metal.js';

/**
 * GPU procedural texture forge.
 *
 * Every surface is one fragment program evaluated four times into four render
 * targets — height (16F, scratch), albedo+height (sRGB8), ORM (linear8) and a
 * tangent-space normal derived from the height field with a Sobel filter.
 * Nothing is read back to the CPU; the render targets *are* the textures, so a
 * full 1K set costs one framebuffer bind and four full-screen draws.
 *
 * Channel packing (this is the contract the material shader relies on):
 *   albedo.rgb = base colour (sRGB encoded by the hardware)
 *   albedo.a   = height 0..1  (or the cutout mask for alpha-tested surfaces)
 *   orm.r      = ambient occlusion / cavity
 *   orm.g      = roughness      (matches three's ORM convention)
 *   orm.b      = metalness
 *   orm.a      = 1
 *   normal.rgb = tangent-space normal, OpenGL convention (+Y up)
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const HEADER = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSeed;
uniform int   uOutput;
uniform vec3  uTintA;
uniform vec3  uTintB;
uniform vec4  uParam;
`;

const FOOTER = /* glsl */ `
void main(){
  vec3 alb = vec3(0.5);
  float h = 0.5, rough = 0.5, metal = 0.0, ao = 1.0;
  owSurface(vUv, alb, h, rough, metal, ao);
  if (uOutput == 0)      gl_FragColor = vec4(h, h, h, 1.0);
  else if (uOutput == 1) gl_FragColor = vec4(alb, h);
  else                   gl_FragColor = vec4(ao, rough, metal, 1.0);
}
`;

const SOBEL = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uHeight;
uniform vec2 uTexel;
uniform float uStrength;

float H(vec2 o){ return texture2D(uHeight, vUv + o * uTexel).r; }

void main(){
  float tl = H(vec2(-1.0,  1.0)), t = H(vec2(0.0,  1.0)), tr = H(vec2(1.0,  1.0));
  float l  = H(vec2(-1.0,  0.0)),                          r = H(vec2(1.0,  0.0));
  float bl = H(vec2(-1.0, -1.0)), b = H(vec2(0.0, -1.0)), br = H(vec2(1.0, -1.0));

  // Sobel over the height field; the 1/8 normalises the kernel weight.
  float dx = ((tr + 2.0 * r + br) - (tl + 2.0 * l + bl)) * 0.125;
  float dy = ((tl + 2.0 * t + tr) - (bl + 2.0 * b + br)) * 0.125;

  // dx/dy are per-texel; convert to a slope over the whole tile.
  float sx = dx / uTexel.x;
  float sy = dy / uTexel.y;

  vec3 n = normalize(vec3(-sx * uStrength, -sy * uStrength, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
`;

/**
 * Micro surface detail — the layer that stops close-ups looking like plastic.
 *
 * NYQUIST. The tile is 1024 px across 0.25 m, so one texel is 0.244 mm. With
 * `p = uv * 8`, a term written at `p * K` puts 8K feature cells across 1024
 * texels, i.e. 128/K texels per cell. Anything past K≈24 is under five texels
 * and bakes as white noise: at mip 0 it is salt-and-pepper dither and one mip
 * down it has averaged to flat grey, which is exactly the "sandpaper close up,
 * featureless at 2 m" failure. Every band here is therefore capped at K = 20
 * (6.4 texels, 1.6 mm) and given real amplitude instead.
 */
const DETAIL_SRC = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed;
  // ~10 mm swell, ~3.5 mm tooth
  float a = owFbm01(p * 3.0, P * 3.0, 4, 0.55);
  float b = owFbm01(p * 9.0, P * 9.0, 4, 0.52);
  // 3.9 mm pits and 1.6 mm grains — both wide enough to survive two mip levels
  vec4 pores = owWorley(p * 8.0, P * 8.0, 1.0);
  vec4 grit  = owWorley(p * 20.0, P * 20.0, 1.0);
  float scr = owScratches(p * 2.5, P * 2.5, 16.0, 1.0, 0.66)
            + owScratches(p * 4.0 + 5.0, P * 4.0, 11.0, -2.0, 0.70) * 0.8;
  // Proud grains: a solid, rounded bump rather than a threshold speck.
  float gritA = smoothstep(0.34, 0.08, pores.x) * step(0.38, pores.z);
  float gritB = smoothstep(0.30, 0.06, grit.x) * step(0.34, grit.z);
  float pit   = smoothstep(0.26, 0.0, pores.x) * step(0.72, pores.w);
  h = 0.5 + (a - 0.5) * 0.34 + (b - 0.5) * 0.26;
  h -= pit * 0.38;
  h += gritA * 0.26 * (0.5 + grit.z) + gritB * 0.20;
  h -= clamp(scr, 0.0, 1.0) * 0.18;
  // Albedo tracks the grain so a proud grain reads light and its trough reads
  // dark; the shader scales this by the per-surface detail albedo amount.
  alb = vec3(0.5 + (a - 0.5) * 0.22 + (b - 0.5) * 0.15
           + gritA * 0.16 + gritB * 0.10 - pit * 0.14);
  rough = 0.5 + (b - 0.5) * 0.5;
  metal = 0.0;
  ao = 1.0 - pit * 0.45 - gritB * 0.10;
  h = clamp(h, 0.0, 1.0);
}
`;

/**
 * Four bands of low-frequency variation used by every material to break up
 * tiling: R = very low fbm, G = warped blotches, B = mid fbm, A = fine fbm.
 */
const MACRO_SRC = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(6.0);
  vec2 p = uv * P + uSeed * 3.0;
  float a = owFbm01(p * 0.5, P * 0.5, 4, 0.62);
  float b = owFbm01(owWarp(p * 1.0, P, 1.1, 3), P, 4, 0.58);
  float c = owFbm01(p * 2.5, P * 2.5, 4, 0.55);
  float d = owFbm01(p * 7.0, P * 7.0, 4, 0.5);
  alb = vec3(a, b, c);
  h = d;
  rough = 0.5; metal = 0.0; ao = 1.0;
}
`;

export class TextureForge {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{anisotropy?:number}} [opts]
   */
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.anisotropy = Math.min(
      opts.anisotropy ?? 8,
      renderer.capabilities.getMaxAnisotropy?.() ?? 8
    );

    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._geo = new THREE.PlaneGeometry(2, 2);
    this._scene = new THREE.Scene();
    this._mesh = new THREE.Mesh(this._geo, null);
    this._mesh.frustumCulled = false;
    this._scene.add(this._mesh);

    this._sobelMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: SOBEL,
      uniforms: {
        uHeight: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uStrength: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });

    /** scratch height targets keyed by size */
    this._heightRTs = new Map();
    this._owned = [];
    this._programs = new Map();
  }

  _heightRT(size) {
    let rt = this._heightRTs.get(size);
    if (!rt) {
      // Half-float keeps the Sobel free of the stair-stepping an 8-bit height
      // field produces. Fall back to 8-bit if the context can't render to it.
      const canHalf =
        this.renderer.extensions.has('EXT_color_buffer_float') ||
        this.renderer.extensions.has('EXT_color_buffer_half_float');
      rt = new THREE.WebGLRenderTarget(size, size, {
        type: canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
        generateMipmaps: false,
        depthBuffer: false,
        stencilBuffer: false,
      });
      this._heightRTs.set(size, rt);
    }
    return rt;
  }

  _target(size, { srgb = false } = {}) {
    const rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      generateMipmaps: true,
      depthBuffer: false,
      stencilBuffer: false,
    });
    rt.texture.anisotropy = this.anisotropy;
    this._owned.push(rt);
    return rt;
  }

  _material(key, glsl) {
    let mat = this._programs.get(key);
    if (!mat) {
      mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: HEADER + NOISE_GLSL + RUST_HELPERS + glsl + FOOTER,
        uniforms: {
          uSeed: { value: 0 },
          uOutput: { value: 0 },
          uTintA: { value: new THREE.Color(1, 1, 1) },
          uTintB: { value: new THREE.Color(1, 1, 1) },
          uParam: { value: new THREE.Vector4() },
        },
        depthTest: false,
        depthWrite: false,
      });
      this._programs.set(key, mat);
    }
    return mat;
  }

  /**
   * Build one texture set.
   * @param {object} def
   * @param {string} def.key      cache key / program key
   * @param {string} def.glsl     surface source implementing owSurface()
   * @param {number} def.size     square resolution
   * @param {number} def.seed
   * @param {number} def.worldSize   metres the tile spans (drives normal slope)
   * @param {number} def.relief      peak-to-trough depth in metres
   * @param {THREE.Color} [def.tintA]
   * @param {THREE.Color} [def.tintB]
   * @param {boolean} [def.orm=true]     allocate + render the ORM output
   * @param {boolean} [def.normal=true]  allocate + render the tangent normal
   *
   * A surface set needs all three outputs, but the two shared maps do not: the
   * material shader only ever samples the detail *albedo* and *normal* and the
   * macro *albedo* (see shader.js — owDetailTex / owDetailNrm / owMacroTex).
   * Baking the outputs nobody reads cost a 1K RGBA8 mip chain (5.6 MB), two
   * 256px ones, and four full-screen evaluations of the noise stack at boot.
   */
  build(def) {
    const r = this.renderer;
    const size = def.size;
    const wantOrm = def.orm !== false;
    const wantNormal = def.normal !== false;
    const prevTarget = r.getRenderTarget();
    const prevAutoClear = r.autoClear;
    r.autoClear = false;

    const mat = this._material(def.key, def.glsl);
    mat.uniforms.uSeed.value = def.seed ?? 0;
    if (def.tintA) mat.uniforms.uTintA.value.copy(def.tintA);
    if (def.tintB) mat.uniforms.uTintB.value.copy(def.tintB);
    if (def.param) mat.uniforms.uParam.value.copy(def.param);
    this._mesh.material = mat;

    const albedoRT = this._target(size, { srgb: def.linearAlbedo !== true });
    const ormRT = wantOrm ? this._target(size) : null;
    const normalRT = wantNormal ? this._target(size) : null;

    // The height pass exists only to feed the Sobel, so it is skipped with it.
    let heightRT = null;
    if (wantNormal) {
      heightRT = this._heightRT(size);
      mat.uniforms.uOutput.value = 0;
      r.setRenderTarget(heightRT);
      r.render(this._scene, this._camera);
    }

    mat.uniforms.uOutput.value = 1;
    r.setRenderTarget(albedoRT);
    r.render(this._scene, this._camera);

    if (ormRT) {
      mat.uniforms.uOutput.value = 2;
      r.setRenderTarget(ormRT);
      r.render(this._scene, this._camera);
    }

    // Height -> normal. Slope is (relief metres / worldSize metres) so the
    // normal map is physically consistent with the mapping scale used later.
    if (normalRT) {
      this._mesh.material = this._sobelMat;
      this._sobelMat.uniforms.uHeight.value = heightRT.texture;
      this._sobelMat.uniforms.uTexel.value.set(1 / size, 1 / size);
      this._sobelMat.uniforms.uStrength.value = (def.relief ?? 0.02) / (def.worldSize ?? 2);
      r.setRenderTarget(normalRT);
      r.render(this._scene, this._camera);
    }

    r.setRenderTarget(prevTarget);
    r.autoClear = prevAutoClear;

    return {
      albedo: albedoRT.texture,
      orm: ormRT?.texture ?? null,
      normal: normalRT?.texture ?? null,
      size,
      worldSize: def.worldSize ?? 2,
      relief: def.relief ?? 0.02,
    };
  }

  /**
   * Free the scratch height targets.
   *
   * They are pure intermediates — the Sobel pass reads one and nothing else
   * ever does — but at 16F RGBA they are the single largest allocation the
   * forge makes (a 1K one is 8 MB, and the 1K/512/256 set is ~10.5 MB) and they
   * were being held for the whole session for the sake of bakes that all happen
   * during boot. `_heightRT()` recreates on demand, so a late bake still works;
   * it just pays for the allocation again.
   */
  releaseScratch() {
    let freed = 0;
    for (const rt of this._heightRTs.values()) {
      rt.dispose();
      freed++;
    }
    this._heightRTs.clear();
    this._sobelMat.uniforms.uHeight.value = null;
    return freed;
  }

  /** Shared micro-detail normal + a matching micro albedo/roughness. */
  buildDetail(size = 1024, seed = 1) {
    return this.build({
      key: '__detail',
      glsl: DETAIL_SRC,
      size,
      seed,
      worldSize: 0.25,
      // 1.6 mm grain standing ~0.4 mm proud: a real tooth, not a bump-map hint
      relief: 0.0034,
      // The detail map is DATA, not colour. Stored sRGB-encoded, a value of
      // 0.5 came back as 0.21 linear, so the shader's `dTex.r - 0.5` term was
      // biased to -0.29 and could only ever darken — half the micro layer was
      // a constant tint rather than a texture.
      linearAlbedo: true,
      // Only the albedo (micro albedo/roughness in rgb, height in a) and the
      // derived normal are sampled; the ORM output was never bound anywhere.
      orm: false,
    });
  }

  /** Shared 4-band low-frequency variation map. */
  buildMacro(size = 256, seed = 2) {
    // Macro is data, not colour — it must be stored and sampled linearly.
    return this.build({
      key: '__macro',
      glsl: MACRO_SRC,
      size,
      seed,
      worldSize: 32,
      relief: 0.5,
      linearAlbedo: true,
      // Four bands packed into the albedo output is the whole map; the macro
      // ORM and macro normal were baked and then never sampled.
      orm: false,
      normal: false,
    });
  }

  dispose() {
    for (const rt of this._heightRTs.values()) rt.dispose();
    for (const rt of this._owned) rt.dispose();
    for (const m of this._programs.values()) m.dispose();
    this._heightRTs.clear();
    this._owned.length = 0;
    this._programs.clear();
    this._sobelMat.dispose();
    this._geo.dispose();
  }
}
