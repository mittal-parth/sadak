import * as THREE from 'three';
import { COMMON } from './glsl.js';
import { Pass, hdrTarget } from './pass.js';

/**
 * Temporal antialiasing.
 *
 * The three things that make browser TAA smear, and what is done about them:
 *
 *  1. *Velocity that includes the jitter.* Motion vectors here come from
 *     unjittered matrices (see prepass.js), and the jitter is only ever
 *     applied to the rasterisation matrix.
 *  2. *Bilinear history.* History is resampled with a 5-tap Catmull-Rom
 *     filter, which keeps the high frequencies the accumulation is supposed
 *     to be building up.
 *  3. *Geometry no velocity buffer can describe.* Anything that deforms inside
 *     its own transform — skinned characters, morph targets — has pixels that
 *     move while its matrix difference says zero, and the viewmodel moves in
 *     VIEW space, which camera matrices cannot express at all. The viewmodel is
 *     therefore composited after this pass entirely (see composite.js), and
 *     skinned geometry is tagged with a reduced coverage by the prepass so the
 *     variance clip tightens and the history tail is capped on exactly those
 *     pixels. Both were "the background is visible through the character".
 *  4. *Weak rejection.* The history is variance-clipped against the 3x3
 *     neighbourhood in YCoCg (chroma-aware, so coloured edges reject
 *     properly), the velocity is dilated to the closest-depth neighbour so
 *     silhouettes take their own motion vector, and the feedback drops with
 *     screen-space speed.
 *
 * Blending happens in a tonemapped ("reinhard weighted") space so a single
 * bright sample cannot bleed a firefly across eight frames.
 */

const HALTON = (() => {
  const h = (i, b) => {
    let f = 1;
    let r = 0;
    while (i > 0) {
      f /= b;
      r += f * (i % b);
      i = Math.floor(i / b);
    }
    return r;
  };
  const out = [];
  for (let i = 1; i <= 16; i++) out.push([h(i, 2) - 0.5, h(i, 3) - 0.5]);
  return out;
})();

const RESOLVE = /* glsl */ `
precision highp float;
${COMMON}

uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform sampler2D tVelocity;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform mat4 uInvVP;
uniform mat4 uPrevVP;
uniform vec4 uParams;   // x feedback  y clipGamma  z first-frame  w motionScale
varying vec2 vUv;

vec3 tonemapW( vec3 c ) { return c / ( 1.0 + owLum( c ) ); }
vec3 tonemapWInv( vec3 c ) { return c / max( 1e-4, 1.0 - owLum( c ) ); }

vec3 sampleCatmullRom( sampler2D tex, vec2 uv ) {
  vec2 texSize = uResolution;
  vec2 samplePos = uv * texSize;
  vec2 texPos1 = floor( samplePos - 0.5 ) + 0.5;
  vec2 f = samplePos - texPos1;

  vec2 w0 = f * ( -0.5 + f * ( 1.0 - 0.5 * f ) );
  vec2 w1 = 1.0 + f * f * ( -2.5 + 1.5 * f );
  vec2 w2 = f * ( 0.5 + f * ( 2.0 - 1.5 * f ) );
  vec2 w3 = f * f * ( -0.5 + 0.5 * f );

  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / max( w12, vec2( 1e-5 ) );

  vec2 texPos0 = ( texPos1 - 1.0 ) / texSize;
  vec2 texPos3 = ( texPos1 + 2.0 ) / texSize;
  vec2 texPos12 = ( texPos1 + offset12 ) / texSize;

  vec3 result = vec3( 0.0 );
  float wsum = 0.0;
  float wa = w12.x * w0.y;  result += texture2D( tex, vec2( texPos12.x, texPos0.y ) ).rgb * wa; wsum += wa;
  float wb = w0.x * w12.y;  result += texture2D( tex, vec2( texPos0.x, texPos12.y ) ).rgb * wb; wsum += wb;
  float wc = w12.x * w12.y; result += texture2D( tex, vec2( texPos12.x, texPos12.y ) ).rgb * wc; wsum += wc;
  float wd = w3.x * w12.y;  result += texture2D( tex, vec2( texPos3.x, texPos12.y ) ).rgb * wd; wsum += wd;
  float we = w12.x * w3.y;  result += texture2D( tex, vec2( texPos12.x, texPos3.y ) ).rgb * we; wsum += we;
  return result / max( wsum, 1e-5 );
}

void main() {
  vec3 current = texture2D( tCurrent, vUv ).rgb;

  if ( uParams.z > 0.5 ) { gl_FragColor = vec4( current, 1.0 ); return; }

  // --- velocity, dilated to the closest-depth neighbour ---------------------
  vec2 bestUv = vUv;
  float bestDepth = 1e9;
  for ( int i = 0; i < 9; i ++ ) {
    vec2 o = vec2( float( i % 3 ) - 1.0, float( i / 3 ) - 1.0 ) * uTexel;
    vec2 uv = vUv + o;
    vec4 n = texture2D( tNormal, uv );
    float d = n.z > 0.5 ? texture2D( tDepth, uv ).r : 1e8;
    if ( d < bestDepth ) { bestDepth = d; bestUv = uv; }
  }

  // Geometry that deforms inside its own transform (skinned characters, morphed
  // meshes) is tagged with a reduced coverage by the prepass, because a
  // matrix-difference velocity buffer cannot describe a moving elbow. Those
  // pixels get a much tighter variance clip and a much shorter history tail:
  // slightly noisier, but no background dragged through the silhouette.
  // The step() against 0.5 keeps the sky out of it: uncovered pixels are
  // coverage 0, which is "no surface", not "a deforming surface".
  float ca = texture2D( tNormal, vUv ).z;
  float cb = texture2D( tNormal, bestUv ).z;
  float dynamic = max(
    step( 0.5, ca ) * ( 1.0 - smoothstep( 0.72, 0.92, ca ) ),
    step( 0.5, cb ) * ( 1.0 - smoothstep( 0.72, 0.92, cb ) ) );

  vec2 vel;
  vec4 nrm = texture2D( tNormal, bestUv );
  if ( nrm.z > 0.5 ) {
    vel = texture2D( tVelocity, bestUv ).rg;
  } else {
    // background: reproject the far plane with the previous camera
    vec4 h = uInvVP * vec4( vUv * 2.0 - 1.0, 1.0, 1.0 );
    vec3 wpos = h.xyz / h.w;
    vec4 pc = uPrevVP * vec4( wpos, 1.0 );
    vec2 prevUv = ( pc.xy / pc.w ) * 0.5 + 0.5;
    vel = vUv - prevUv;
  }

  vec2 huv = vUv - vel;

  // --- neighbourhood statistics in YCoCg ------------------------------------
  vec3 m1 = vec3( 0.0 );
  vec3 m2 = vec3( 0.0 );
  vec3 nmin = vec3( 1e9 );
  vec3 nmax = vec3( -1e9 );
  for ( int i = 0; i < 9; i ++ ) {
    vec2 o = vec2( float( i % 3 ) - 1.0, float( i / 3 ) - 1.0 ) * uTexel;
    vec3 c = owRgbToYCoCg( tonemapW( texture2D( tCurrent, vUv + o ).rgb ) );
    m1 += c;
    m2 += c * c;
    nmin = min( nmin, c );
    nmax = max( nmax, c );
  }
  vec3 mean = m1 / 9.0;
  vec3 sigma = sqrt( max( m2 / 9.0 - mean * mean, vec3( 0.0 ) ) );
  float gamma = uParams.y * mix( 1.0, 0.38, dynamic );
  vec3 lo = max( mean - gamma * sigma, nmin );
  vec3 hi = min( mean + gamma * sigma, nmax );

  vec3 historyRgb = sampleCatmullRom( tHistory, huv );
  historyRgb = max( historyRgb, vec3( 0.0 ) );
  vec3 hist = owRgbToYCoCg( tonemapW( historyRgb ) );

  // clip toward the neighbourhood centre rather than clamping per channel:
  // clamping kills sub-pixel detail, clipping keeps it.
  vec3 centre = 0.5 * ( lo + hi );
  vec3 extent = 0.5 * ( hi - lo ) + 1e-5;
  vec3 dir = hist - centre;
  vec3 ts = abs( extent / max( abs( dir ), vec3( 1e-5 ) ) );
  float clipT = clamp( min( ts.x, min( ts.y, ts.z ) ), 0.0, 1.0 );
  vec3 clipped = centre + dir * clipT;

  float feedback = uParams.x;
  if ( huv.x < 0.0 || huv.x > 1.0 || huv.y < 0.0 || huv.y > 1.0 ) feedback = 0.0;

  // fast motion -> trust the history less
  float speed = length( vel * uResolution );
  feedback *= mix( 1.0, 0.72, clamp( speed / 24.0, 0.0, 1.0 ) );
  // heavy clipping means we were rejecting: shorten the tail
  feedback *= mix( 0.82, 1.0, clipT );
  // deforming geometry: cap the tail outright, no velocity describes it
  feedback = min( feedback, mix( 1.0, 0.55, dynamic ) );

  vec3 curY = owRgbToYCoCg( tonemapW( current ) );

  // luminance weighting (Karis) — suppresses the shimmer that a plain lerp
  // leaves on specular highlights
  float wc = 1.0 / ( 1.0 + curY.x );
  float wh = 1.0 / ( 1.0 + clipped.x );
  float sum = mix( wc, wh, feedback );
  vec3 outY = ( curY * wc * ( 1.0 - feedback ) + clipped * wh * feedback ) / max( sum, 1e-5 );

  vec3 result = tonemapWInv( owYCoCgToRgb( outY ) );
  gl_FragColor = vec4( max( result, vec3( 0.0 ) ), 1.0 );
}
`;

export class Taa {
  constructor() {
    this.pass = new Pass('ow-taa', RESOLVE, {
      tCurrent: { value: null },
      tHistory: { value: null },
      tVelocity: { value: null },
      tNormal: { value: null },
      tDepth: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uResolution: { value: new THREE.Vector2() },
      uInvVP: { value: new THREE.Matrix4() },
      uPrevVP: { value: new THREE.Matrix4() },
      uParams: { value: new THREE.Vector4(0.92, 1.25, 1, 1) },
    });
    this.history = [null, null];
    this._flip = 0;
    this.index = 0;
    this.jitter = new THREE.Vector2();
    this.texture = null;
    this._needsReset = true;
  }

  setSize(w, h) {
    this.history[0]?.dispose();
    this.history[1]?.dispose();
    this.history[0] = hdrTarget(w, h, { name: 'taa-a' });
    this.history[1] = hdrTarget(w, h, { name: 'taa-b' });
    this.pass.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.pass.uniforms.uResolution.value.set(w, h);
    this._needsReset = true;
  }

  /** Advance the jitter sequence; returns the sub-pixel offset in pixels. */
  nextJitter() {
    const s = HALTON[this.index % HALTON.length];
    this.index++;
    this.jitter.set(s[0], s[1]);
    return this.jitter;
  }

  reset() {
    this._needsReset = true;
  }

  /** @returns the resolved texture */
  render(renderer, colorTexture, gbuffer, invVP, prevVP) {
    const u = this.pass.uniforms;
    u.tCurrent.value = colorTexture;
    u.tHistory.value = this.history[this._flip].texture;
    u.tVelocity.value = gbuffer.velocityTexture;
    u.tNormal.value = gbuffer.normalTexture;
    u.tDepth.value = gbuffer.depthTexture;
    u.uInvVP.value.copy(invVP);
    u.uPrevVP.value.copy(prevVP);
    u.uParams.value.z = this._needsReset ? 1 : 0;
    this._needsReset = false;

    const dst = this.history[this._flip ^ 1];
    this.pass.render(renderer, dst);
    this._flip ^= 1;
    this.texture = dst.texture;
    return this.texture;
  }

  /** Previous resolved frame — the right source for SSR. */
  get previousTexture() {
    return this.history[this._flip].texture;
  }

  dispose() {
    this.history[0]?.dispose();
    this.history[1]?.dispose();
    this.pass.dispose();
  }
}
