import * as THREE from 'three';
import { COMMON } from './glsl.js';
import { Pass, hdrTarget } from './pass.js';

/**
 * Ground-Truth Ambient Occlusion (Jimenez et al. 2016) — the visibility-arc
 * integral, not a hemisphere-sample SSAO approximation.
 *
 * Two slices x eight steps per frame, with the slice angle rotated by
 * interleaved-gradient noise and advanced every frame; a velocity-reprojected
 * temporal accumulator turns that into the equivalent of ~16 slices without
 * the cost. A depth-aware separable bilateral removes what is left.
 *
 * The result is consumed inside the material (see materialpatch.js), where it
 * multiplies indirect light only.
 */

const AO_CORE = /* glsl */ `
precision highp float;
${COMMON}

uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform mat4 uProjInv;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform float uP11;
uniform vec4 uParams;   // x radius(m)  y intensity  z frame  w thickness
varying vec2 vUv;

#define OW_SLICES 3
#define OW_STEPS 8

float owArc( float h, float n, float cosN, float sinN ) {
  return 0.25 * ( -cos( 2.0 * h - n ) + cosN + 2.0 * h * sinN );
}

void main() {
  vec4 nrm = texture2D( tNormal, vUv );
  if ( nrm.z < 0.5 ) { gl_FragColor = vec4( 1.0, 1e4, 0.0, 1.0 ); return; }

  float depth = texture2D( tDepth, vUv ).r;
  vec3 P = owViewPos( vUv, depth, uProjInv );
  vec3 N = owDecodeNormal( nrm.xy );
  vec3 V = normalize( -P );

  float radius = uParams.x;
  // world radius -> pixels
  float radiusPx = radius * uP11 * 0.5 * uResolution.y / max( 0.2, depth );
  radiusPx = clamp( radiusPx, 6.0, 128.0 );

  float noise = owIGN( gl_FragCoord.xy + uParams.z * 5.588238 );
  float noise2 = owHash12( gl_FragCoord.xy * 0.371 + uParams.z );

  float invR2 = 1.0 / ( radius * radius );
  float visibility = 0.0;

  for ( int s = 0; s < OW_SLICES; s ++ ) {
    float phi = ( float( s ) + noise ) * ( OW_PI / float( OW_SLICES ) );
    vec2 dir2 = vec2( cos( phi ), sin( phi ) );
    vec3 sliceDir = vec3( dir2, 0.0 );

    vec3 axis = normalize( cross( sliceDir, V ) );
    vec3 projN = N - axis * dot( N, axis );
    float projLen = length( projN );
    if ( projLen < 1e-4 ) continue;
    vec3 projNn = projN / projLen;

    vec3 orthoDir = normalize( sliceDir - V * dot( sliceDir, V ) );
    float cosN = clamp( dot( projNn, V ), -1.0, 1.0 );
    float n = sign( dot( orthoDir, projNn ) ) * acos( cosN );
    float sinN = sin( n );

    // Horizons are signed relative to orthoDir: the +dir2 side carries the
    // POSITIVE angle. Getting this the wrong way round collapses the
    // visibility arc on every grazing surface.
    float cosHPos = -1.0;
    float cosHNeg = -1.0;

    for ( int t = 0; t < OW_STEPS; t ++ ) {
      // QUADRATIC step distribution, not linear.
      //
      // A 1.35 m radius on a wall three metres away is 316 px, clamped to 128,
      // which with eight linear steps put the FIRST sample sixteen pixels out.
      // Everything inside that — the wall/soffit junction, the foot of a
      // column, the gap under a crate, i.e. every contact in the frame — was
      // simply never sampled, and the buffer came back at 0.92 visibility
      // almost everywhere with nothing but a wide soft gradient in it. Weighting
      // the steps toward the origin puts the first three inside six pixels while
      // still reaching the full radius, at the same eight taps.
      //
      // +1 px minimum: a sample that lands back on the centre texel produces a
      // garbage horizon direction that closes the visibility arc completely.
      float ft = ( float( t ) + noise2 ) / float( OW_STEPS );
      float off = radiusPx * ft * ft + 1.0;
      vec2 duv = dir2 * off * uTexel;

      // +dir
      vec2 uv1 = vUv + duv;
      if ( uv1.x > 0.0 && uv1.x < 1.0 && uv1.y > 0.0 && uv1.y < 1.0 ) {
        float d1 = texture2D( tDepth, uv1 ).r;
        float cov1 = texture2D( tNormal, uv1 ).z;
        if ( cov1 > 0.5 ) {
          vec3 ds = owViewPos( uv1, d1, uProjInv ) - P;
          float len2 = dot( ds, ds );
          if ( len2 > 2e-5 ) {
            float inv = inversesqrt( len2 );
            float c = dot( ds, V ) * inv;
            float fall = clamp( len2 * invR2, 0.0, 1.0 );
            fall *= fall;
            cosHPos = max( cosHPos, mix( c, cosHPos, fall ) );
          }
        }
      }

      // -dir
      vec2 uv2 = vUv - duv;
      if ( uv2.x > 0.0 && uv2.x < 1.0 && uv2.y > 0.0 && uv2.y < 1.0 ) {
        float d2 = texture2D( tDepth, uv2 ).r;
        float cov2 = texture2D( tNormal, uv2 ).z;
        if ( cov2 > 0.5 ) {
          vec3 ds = owViewPos( uv2, d2, uProjInv ) - P;
          float len2 = dot( ds, ds );
          if ( len2 > 2e-5 ) {
            float inv = inversesqrt( len2 );
            float c = dot( ds, V ) * inv;
            float fall = clamp( len2 * invR2, 0.0, 1.0 );
            fall *= fall;
            cosHNeg = max( cosHNeg, mix( c, cosHNeg, fall ) );
          }
        }
      }
    }

    float h1 = -acos( clamp( cosHNeg, -1.0, 1.0 ) );
    float h2 = acos( clamp( cosHPos, -1.0, 1.0 ) );
    h1 = n + max( h1 - n, -OW_HALF_PI );
    h2 = n + min( h2 - n, OW_HALF_PI );

    // A single slice legitimately integrates to more than 1 on tilted
    // surfaces; the excess is what compensates the slices whose projected
    // normal is short. Clamping per slice (or per frame) biases the whole
    // buffer dark, which is the classic "my SSAO looks like dirt" bug.
    visibility += projLen * ( owArc( h1, n, cosN, sinN ) + owArc( h2, n, cosN, sinN ) );
  }

  visibility = clamp( visibility / float( OW_SLICES ), 0.0, 4.0 );

  gl_FragColor = vec4( visibility, depth, 0.0, 1.0 );
}
`;

const AO_TEMPORAL = /* glsl */ `
precision highp float;
${COMMON}
uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform sampler2D tVelocity;
uniform sampler2D tNormal;
uniform vec2 uTexel;
uniform float uFeedback;
varying vec2 vUv;

void main() {
  vec2 cur = texture2D( tCurrent, vUv ).rg;
  vec2 vel = texture2D( tVelocity, vUv ).rg;
  vec2 huv = vUv - vel;

  float w = uFeedback;
  if ( huv.x < 0.0 || huv.x > 1.0 || huv.y < 0.0 || huv.y > 1.0 ) w = 0.0;

  vec2 hist = texture2D( tHistory, huv ).rg;
  // reject on depth discontinuity (disocclusion)
  float rel = abs( hist.y - cur.y ) / max( 0.05, cur.y );
  w *= exp( -rel * 30.0 );

  // A wide neighbourhood window only: the per-frame signal is 3 slices of a
  // stochastic integral, so a tight clamp would just re-inject its variance.
  float mn = cur.x, mx = cur.x;
  for ( int i = 0; i < 4; i ++ ) {
    vec2 o = vec2( i == 0 ? 1.0 : i == 1 ? -1.0 : 0.0, i == 2 ? 1.0 : i == 3 ? -1.0 : 0.0 );
    float s = texture2D( tCurrent, vUv + o * uTexel * 2.0 ).r;
    mn = min( mn, s ); mx = max( mx, s );
  }
  float h = clamp( hist.x, mn - 0.45, mx + 0.45 );

  gl_FragColor = vec4( mix( cur.x, h, w ), cur.y, 0.0, 1.0 );
}
`;

const AO_BLUR = /* glsl */ `
precision highp float;
uniform sampler2D tAo;
uniform vec2 uDirection;
uniform vec2 uParams;   // x: apply the intensity curve on this pass
varying vec2 vUv;

void main() {
  vec2 c = texture2D( tAo, vUv ).rg;
  float sum = c.r * 0.4;
  float wsum = 0.4;
  for ( int i = 1; i <= 3; i ++ ) {
    float w0 = 0.4 / float( i + 1 );
    vec2 o = uDirection * float( i );
    vec2 a = texture2D( tAo, vUv + o ).rg;
    vec2 b = texture2D( tAo, vUv - o ).rg;
    float wa = w0 * exp( -abs( a.g - c.g ) * 22.0 / max( 0.1, c.g ) );
    float wb = w0 * exp( -abs( b.g - c.g ) * 22.0 / max( 0.1, c.g ) );
    sum += a.r * wa + b.r * wb;
    wsum += wa + wb;
  }
  float ao = sum / wsum;
  if ( uParams.x > 0.5 ) ao = pow( clamp( ao, 0.0, 1.0 ), uParams.y );
  gl_FragColor = vec4( ao, c.g, 0.0, 1.0 );
}
`;

export class Gtao {
  constructor() {
    this.core = new Pass('ow-gtao', AO_CORE, {
      tDepth: { value: null },
      tNormal: { value: null },
      uProjInv: { value: new THREE.Matrix4() },
      uTexel: { value: new THREE.Vector2() },
      uResolution: { value: new THREE.Vector2() },
      uP11: { value: 1 },
      uParams: { value: new THREE.Vector4(0.9, 1.35, 0, 0.4) },
    });
    this.temporal = new Pass('ow-gtao-temporal', AO_TEMPORAL, {
      tCurrent: { value: null },
      tHistory: { value: null },
      tVelocity: { value: null },
      tNormal: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uFeedback: { value: 0.92 },
    });
    this.blur = new Pass('ow-gtao-blur', AO_BLUR, {
      tAo: { value: null },
      uDirection: { value: new THREE.Vector2() },
      uParams: { value: new THREE.Vector2(0, 1.25) },
    });

    this.rtRaw = null;
    this.rtBlur = null;
    this.rtFinal = null;
    this.history = [null, null];
    this._flip = 0;
    this.texture = null;
  }

  setSize(w, h) {
    this.dispose(true);
    const o = { type: THREE.HalfFloatType, format: THREE.RGFormat, name: 'gtao' };
    this.rtRaw = hdrTarget(w, h, o);
    this.rtBlur = hdrTarget(w, h, o);
    this.rtFinal = hdrTarget(w, h, o);
    this.history[0] = hdrTarget(w, h, o);
    this.history[1] = hdrTarget(w, h, o);
    this.core.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.core.uniforms.uResolution.value.set(w, h);
    this.temporal.uniforms.uTexel.value.set(1 / w, 1 / h);
    this._texel = new THREE.Vector2(1 / w, 1 / h);
  }

  render(renderer, gbuffer, camera, frame, temporalOn) {
    const cu = this.core.uniforms;
    cu.tDepth.value = gbuffer.depthTexture;
    cu.tNormal.value = gbuffer.normalTexture;
    cu.uProjInv.value.copy(camera.projectionMatrixInverse);
    cu.uP11.value = camera.projectionMatrix.elements[5];
    cu.uParams.value.z = temporalOn ? frame % 64 : 0;
    this.core.render(renderer, this.rtRaw);

    let src = this.rtRaw;
    if (temporalOn) {
      const prev = this.history[this._flip];
      const next = this.history[this._flip ^ 1];
      const tu = this.temporal.uniforms;
      tu.tCurrent.value = this.rtRaw.texture;
      tu.tHistory.value = prev.texture;
      tu.tVelocity.value = gbuffer.velocityTexture;
      this.temporal.render(renderer, next);
      this._flip ^= 1;
      src = next;
    }

    // Blur into a dedicated target: the history must stay un-blurred or the
    // accumulator smears more every frame.
    const bu = this.blur.uniforms;
    bu.tAo.value = src.texture;
    bu.uDirection.value.set(this._texel.x, 0);
    bu.uParams.value.x = 0;
    this.blur.render(renderer, this.rtBlur);
    bu.tAo.value = this.rtBlur.texture;
    bu.uDirection.value.set(0, this._texel.y);
    bu.uParams.value.x = 1; // clamp + intensity curve on the last stage only
    this.blur.render(renderer, this.rtFinal);

    this.texture = this.rtFinal.texture;
    return this.texture;
  }

  setRadius(r) {
    this.core.uniforms.uParams.value.x = r;
  }
  setIntensity(i) {
    this.blur.uniforms.uParams.value.y = i;
  }

  dispose(keepPasses = false) {
    this.rtRaw?.dispose();
    this.rtBlur?.dispose();
    this.rtFinal?.dispose();
    this.history[0]?.dispose();
    this.history[1]?.dispose();
    this.rtRaw = this.rtBlur = this.rtFinal = null;
    this.history[0] = this.history[1] = null;
    if (!keepPasses) {
      this.core.dispose();
      this.temporal.dispose();
      this.blur.dispose();
    }
  }
}
