import * as THREE from 'three';

/**
 * Full-screen triangle plumbing, local to the sky subsystem.
 *
 * `src/render/pass.js` has an equivalent, but ARCHITECTURE.md forbids importing
 * another subsystem's module, so we keep our own tiny copy. One shared
 * geometry / scene / camera, and a mesh whose material we swap — no allocation
 * per frame, no EffectComposer.
 *
 * Everything here is GLSL ES 3.00 (`glslVersion: THREE.GLSL3`) so the
 * volumetric pass can dynamically index the CSM matrix array and sample the
 * `sampler2DArray` cascade atlas without relying on ES 1.00 leniency.
 */

const _geometry = new THREE.BufferGeometry();
_geometry.setAttribute(
  'position',
  new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
);
_geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e8);

const _scene = new THREE.Scene();
_scene.matrixAutoUpdate = false;
const _camera = new THREE.Camera();
const _mesh = new THREE.Mesh(_geometry, null);
_mesh.frustumCulled = false;
_mesh.matrixAutoUpdate = false;
_scene.add(_mesh);

/** The geometry is shared by the sky dome too, so it is never disposed here. */
export function fullScreenGeometry() {
  return _geometry;
}

export const SKY_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

/** Draw `material` over the whole of `target` (null = canvas). */
export function blit(renderer, material, target) {
  _mesh.material = material;
  renderer.setRenderTarget(target);
  renderer.render(_scene, _camera);
}

/** A full-screen shader step. Uniform objects may be shared between passes. */
export class SkyPass {
  constructor(name, fragmentShader, uniforms, defines = {}) {
    this.uniforms = uniforms;
    this.material = new THREE.ShaderMaterial({
      name,
      uniforms,
      defines,
      vertexShader: SKY_VERT,
      fragmentShader,
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
  }
  render(renderer, target) {
    blit(renderer, this.material, target);
  }
  dispose() {
    this.material.dispose();
  }
}

/**
 * Half-float colour target. Sky radiance is HDR and physically scaled — the sun
 * disc alone is four orders of magnitude above the zenith — so nothing in this
 * subsystem is ever allowed to touch an 8-bit buffer.
 */
export function hdrTarget(w, h, opts = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    ...opts,
  });
  rt.texture.name = opts.name ?? 'sky-hdr';
  rt.texture.colorSpace = THREE.NoColorSpace;
  return rt;
}

/** Float32 target — used for the transmittance LUT, where banding shows. */
export function floatTarget(w, h, opts = {}) {
  return hdrTarget(w, h, { type: THREE.FloatType, ...opts });
}
