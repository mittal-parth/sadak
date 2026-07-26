import * as THREE from 'three';
import { FS_VERT } from './glsl.js';

/**
 * Full-screen triangle infrastructure. One shared geometry, one shared scene,
 * one shared camera — a pass is just a material we swap in. No allocation per
 * frame, no examples/jsm EffectComposer.
 */

const _geometry = new THREE.BufferGeometry();
_geometry.setAttribute(
  'position',
  new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
);
_geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
_geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e8);

const _scene = new THREE.Scene();
_scene.matrixAutoUpdate = false;
const _camera = new THREE.Camera();
const _mesh = new THREE.Mesh(_geometry, null);
_mesh.frustumCulled = false;
_mesh.matrixAutoUpdate = false;
_scene.add(_mesh);

/** Draw `material` over `target` (null = canvas). */
export function blit(renderer, material, target, clear = false, layer = 0) {
  _mesh.material = material;
  renderer.setRenderTarget(target, layer);
  if (clear) renderer.clear(true, false, false);
  renderer.render(_scene, _camera);
}

export function disposeFullScreen() {
  _geometry.dispose();
}

/** A post-processing pass: a ShaderMaterial plus the uniforms it owns. */
export class Pass {
  constructor(name, fragmentShader, uniforms, opts = {}) {
    this.name = name;
    this.uniforms = uniforms;
    this.material = new THREE.ShaderMaterial({
      name,
      uniforms,
      vertexShader: FS_VERT,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: opts.blending ?? THREE.NoBlending,
      defines: opts.defines ?? {},
      glslVersion: opts.glslVersion ?? null,
      transparent: opts.blending !== undefined && opts.blending !== THREE.NoBlending,
    });
  }
  render(renderer, target, clear = false) {
    blit(renderer, this.material, target, clear);
  }
  dispose() {
    this.material.dispose();
  }
}

/** Half-float colour target with sane defaults for HDR post. */
export function hdrTarget(w, h, opts = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
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
  rt.texture.name = opts.name ?? 'hdr';
  return rt;
}
