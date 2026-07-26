import * as THREE from 'three';
import { PARTICLE_VERT, ParticleLayer, resetSpawn, SP } from './particles.js';
import { P } from './atlas.js';

/**
 * Screen-space refraction for hot gas, shockwaves and heat shimmer.
 *
 * Distortion sprites are drawn into a half-resolution RG buffer as *screen-space
 * offsets* (additive, so overlapping sources compound), depth-tested against
 * the scene so haze behind a wall does not bleed through it. A registered post
 * pass then warps the resolved HDR colour by that offset — before bloom, so a
 * hot highlight smears the way it does through real air.
 *
 * The pass disables itself when nothing is live, so the common case costs zero.
 */

const DISTORT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSprite;
uniform sampler2D uDepth;
uniform vec2 uRes;
uniform vec2 uSoftEnable;
varying vec2 vUv;
varying vec4 vCol;
varying float vViewZ;
varying float vSoft;
varying vec2 vQ;
varying float vAge;
layout(location = 0) out vec4 outColor;

void main() {
  if ( vCol.a <= 0.0 ) discard;
  vec4 tex = texture2D( uSprite, vUv );
  float a = tex.a * vCol.a;
  if ( a < 0.004 ) discard;
  if ( uSoftEnable.x > 0.5 ) {
    float sceneZ = texture2D( uDepth, gl_FragCoord.xy / uRes ).r;
    sceneZ = sceneZ > 0.001 ? sceneZ : 1.0e6;
    if ( sceneZ < vViewZ ) discard;                      // occluded
    a *= clamp( ( sceneZ - vViewZ ) / vSoft, 0.0, 1.0 );
  }
  // Radial refraction: (tex.r - 0.5) makes noise sprites wobble both ways,
  // while the flat-white RING tile pushes purely outward — a shockwave.
  float ql = length( vQ );
  vec2 dir = ql > 1e-4 ? vQ / ql : vec2( 0.0 );
  float signedField = ( tex.r - 0.42 ) * 2.0;
  vec2 off = dir * signedField * a * vCol.r;
  outColor = vec4( off, 0.0, 1.0 );
}
`;

const WARP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDistort;
uniform vec2 uStrength;
varying vec2 vUvw;
layout(location = 0) out vec4 outColor;
void main() {
  vec2 d = texture2D( tDistort, vUvw ).xy * uStrength.x;
  d = clamp( d, vec2( -0.03 ), vec2( 0.03 ) );
  // Chromatic split across the refraction so the smear reads as air, not blur.
  float r = texture2D( tColor, vUvw + d * 1.08 ).r;
  vec4 c = texture2D( tColor, vUvw + d );
  float b = texture2D( tColor, vUvw + d * 0.92 ).b;
  outColor = vec4( r, c.g, b, c.a );
}
`;

const WARP_VERT = /* glsl */ `
precision highp float;
varying vec2 vUvw;
void main() {
  vUvw = uv;
  gl_Position = vec4( position.xy * 2.0, 0.0, 1.0 );
}
`;

export class HazeSystem {
  constructor(o) {
    this.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.matrixAutoUpdate = false;

    this.layer = new ParticleLayer({
      capacity: o.capacity,
      mode: 'additive',
      atlas: o.atlas,
      cols: o.cols,
      soft: true,
    });
    // swap in the offset-writing fragment shader
    const mat = this.layer.material;
    mat.fragmentShader = DISTORT_FRAG;
    mat.vertexShader = PARTICLE_VERT;
    mat.defines = { SOFT: '' };
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneFactor;
    mat.blendEquation = THREE.AddEquation;
    mat.depthTest = false;
    mat.needsUpdate = true;
    mat.name = 'fx-distort';
    this.scene.add(this.layer.mesh);
    this.layer.mesh.visible = true; // visibility is driven by instanceCount

    this.rt = null;
    this.size = new THREE.Vector2(1, 1);

    const geo = new THREE.PlaneGeometry(1, 1);
    this._quadGeo = geo;
    this.warp = new THREE.ShaderMaterial({
      name: 'fx-haze-warp',
      glslVersion: THREE.GLSL3,
      uniforms: {
        tColor: { value: null },
        tDistort: { value: null },
        // Callers pass strength in 0..1; this maps it to screen UV offset.
        uStrength: { value: new THREE.Vector2(0.013, 0) },
      },
      vertexShader: WARP_VERT,
      fragmentShader: WARP_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this._quad = new THREE.Mesh(geo, this.warp);
    this._quad.frustumCulled = false;
    this._quadScene = new THREE.Scene();
    this._quadScene.add(this._quad);
    this._quadCam = new THREE.Camera();

    /** Post pass handed to render.registerPass(). */
    const self = this;
    this.pass = {
      order: 14,
      enabled: false,
      resize(w, h) {
        self.resize(w, h);
      },
      render(renderer, input, output, r) {
        self.render(renderer, input, output, r);
      },
    };
  }

  /**
   * Compile the two programs this system owns (the offset-writing sprite shader
   * and the warp pass) without rendering anything. Both live in private scenes
   * that no outside scene-graph walk can reach, so they would otherwise compile
   * on the frame the first shot goes off. The caller has a render target bound,
   * which is what puts the right colour space in the cache key — see
   * FxSystem.prewarmMaterials().
   */
  prewarm(renderer) {
    const cam = this._warmCam ?? (this._warmCam = new THREE.PerspectiveCamera());
    try {
      renderer.compile(this.scene, cam);
      renderer.compile(this._quadScene, this._quadCam);
    } catch (err) {
      console.warn('[fx] haze prewarm failed', err);
    }
  }

  resize(w, h) {
    const rw = Math.max(1, Math.floor(w * 0.5));
    const rh = Math.max(1, Math.floor(h * 0.5));
    if (this.rt && this.size.x === rw && this.size.y === rh) return;
    this.size.set(rw, rh);
    if (this.rt) this.rt.dispose();
    this.rt = new THREE.WebGLRenderTarget(rw, rh, {
      type: THREE.HalfFloatType,
      format: THREE.RGFormat,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.rt.texture.name = 'fx-distort';
    this.layer.uniforms.uRes.value.set(rw, rh);
  }

  /** Add one distortion sprite. `strength` is a screen-space offset in UV. */
  emit(now, x, y, z, radius, grow, life, strength, tile = P.SMOKE_A, seed = 0) {
    const s = resetSpawn();
    s.x = x;
    s.y = y;
    s.z = z;
    s.size0 = radius;
    s.size1 = radius * grow;
    s.sizeCurve = 0.5;
    s.life = life;
    s.drag = 2;
    s.tile = tile;
    s.soft = 0.6;
    s.alpha = 1;
    s.alphaCurve = 1.2;
    s.r0 = strength;
    s.g0 = strength;
    s.b0 = strength;
    s.i0 = 1;
    s.r1 = strength;
    s.g1 = strength;
    s.b1 = strength;
    s.i1 = 1;
    s.seed = seed;
    this.layer.emit(s, now);
    return SP;
  }

  update(now, depthTexture, camera) {
    this.layer.uniforms.uDepth.value = depthTexture;
    this.layer.uniforms.uSoftEnable.value.x = depthTexture ? 1 : 0;
    this.layer.flush(now);
    const live = this.layer.mesh.visible;
    this.layer.mesh.visible = true; // culling is by instanceCount, not visibility
    this._camera = camera;
    this.pass.enabled = this.enabled && live && !!this.rt;
  }

  render(renderer, input, output, r) {
    const cam = this._camera;
    if (!cam || !this.rt) return;
    const prevClear = renderer.getClearColor(_col);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.render(this.scene, cam);
    renderer.setClearColor(prevClear, prevAlpha);

    this.warp.uniforms.tColor.value = input;
    this.warp.uniforms.tDistort.value = this.rt.texture;
    renderer.setRenderTarget(output);
    renderer.render(this._quadScene, this._quadCam);
  }

  dispose() {
    this.layer.dispose();
    this.rt?.dispose();
    this._quadGeo.dispose();
    this.warp.dispose();
  }
}

const _col = new THREE.Color();
