import * as THREE from 'three';
import { COMMON } from './glsl.js';
import { Pass, hdrTarget } from './pass.js';

/**
 * Physically-motivated bloom: the progressive dual-filter pyramid from
 * "Next Generation Post Processing in Call of Duty: Advanced Warfare"
 * (Jimenez 2014). Not UnrealBloomPass.
 *
 *  - A SOFT-KNEE threshold on the first level only, in exposure-scaled linear
 *    light. Veiling glare over the whole image is physically real but it is
 *    also indistinguishable from fog once you turn it up far enough to see a
 *    specular event, so the prefilter keeps the pyramid for things that are
 *    genuinely above display white (the sun disc, glints, the muzzle flash) and
 *    the result is ADDED rather than mixed in. Everything below the knee is
 *    still admitted, quadratically, so there is no hard edge to the effect.
 *  - 13-tap downsample with a Karis luminance average on the first level, so
 *    a single hot pixel cannot pump a whole mip.
 *  - 9-tap tent upsample, blended 50/50 back up the chain (NOT summed), so the
 *    pyramid is energy preserving and the final mix() is a true veiling-glare
 *    percentage instead of a milky haze over the whole frame.
 */

const DOWNSAMPLE = /* glsl */ `
precision highp float;
${COMMON}
uniform sampler2D tSrc;
uniform sampler2D tExposure;
uniform vec2 uTexel;      // texel size of the SOURCE
uniform vec4 uParams;     // x karis, y threshold, z knee
varying vec2 vUv;

vec3 fetch( vec2 uv ) { return max( texture2D( tSrc, uv ).rgb, vec3( 0.0 ) ); }
float karisWeight( vec3 c ) { return 1.0 / ( 1.0 + owLum( c ) ); }

// Soft-knee highlight prefilter (Unreal/COD style). Max-channel driven so a
// saturated light — a red tracer, an orange muzzle flash — blooms as readily as
// a white one instead of being judged on its luminance alone.
vec3 owBloomPrefilter( vec3 c, float thr, float knee ) {
  float l = max( max( c.r, c.g ), c.b );
  float soft = clamp( l - thr + knee, 0.0, 2.0 * knee );
  soft = soft * soft / ( 4.0 * knee + 1e-5 );
  return c * ( max( soft, l - thr ) / max( l, 1e-4 ) );
}

void main() {
  vec2 t = uTexel;
  vec3 a = fetch( vUv + vec2( -2.0 * t.x,  2.0 * t.y ) );
  vec3 b = fetch( vUv + vec2(  0.0,        2.0 * t.y ) );
  vec3 c = fetch( vUv + vec2(  2.0 * t.x,  2.0 * t.y ) );
  vec3 d = fetch( vUv + vec2( -2.0 * t.x,  0.0 ) );
  vec3 e = fetch( vUv );
  vec3 f = fetch( vUv + vec2(  2.0 * t.x,  0.0 ) );
  vec3 g = fetch( vUv + vec2( -2.0 * t.x, -2.0 * t.y ) );
  vec3 h = fetch( vUv + vec2(  0.0,       -2.0 * t.y ) );
  vec3 i = fetch( vUv + vec2(  2.0 * t.x, -2.0 * t.y ) );
  vec3 j = fetch( vUv + vec2( -t.x,  t.y ) );
  vec3 k = fetch( vUv + vec2(  t.x,  t.y ) );
  vec3 l = fetch( vUv + vec2( -t.x, -t.y ) );
  vec3 m = fetch( vUv + vec2(  t.x, -t.y ) );

  vec3 result;
  if ( uParams.x > 0.5 ) {
    // exposure first so the firefly clamp AND the threshold are both in
    // display-referred terms — a fixed linear threshold on unscaled radiance
    // would mean something different at every time of day.
    float ex = texture2D( tExposure, vec2( 0.5 ) ).r;
    a *= ex; b *= ex; c *= ex; d *= ex; e *= ex; f *= ex; g *= ex;
    h *= ex; i *= ex; j *= ex; k *= ex; l *= ex; m *= ex;
    float thr = uParams.y;
    float knee = max( uParams.z, 1e-4 );
    a = owBloomPrefilter( a, thr, knee ); b = owBloomPrefilter( b, thr, knee );
    c = owBloomPrefilter( c, thr, knee ); d = owBloomPrefilter( d, thr, knee );
    e = owBloomPrefilter( e, thr, knee ); f = owBloomPrefilter( f, thr, knee );
    g = owBloomPrefilter( g, thr, knee ); h = owBloomPrefilter( h, thr, knee );
    i = owBloomPrefilter( i, thr, knee ); j = owBloomPrefilter( j, thr, knee );
    k = owBloomPrefilter( k, thr, knee ); l = owBloomPrefilter( l, thr, knee );
    m = owBloomPrefilter( m, thr, knee );
    vec3 g0 = ( a + b + d + e ) * 0.25;
    vec3 g1 = ( b + c + e + f ) * 0.25;
    vec3 g2 = ( d + e + g + h ) * 0.25;
    vec3 g3 = ( e + f + h + i ) * 0.25;
    vec3 g4 = ( j + k + l + m ) * 0.25;
    float w0 = karisWeight( g0 ) * 0.125;
    float w1 = karisWeight( g1 ) * 0.125;
    float w2 = karisWeight( g2 ) * 0.125;
    float w3 = karisWeight( g3 ) * 0.125;
    float w4 = karisWeight( g4 ) * 0.5;
    result = ( g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4 ) /
             max( w0 + w1 + w2 + w3 + w4, 1e-5 );
    result = min( result, vec3( 24.0 ) );
  } else {
    result = e * 0.125;
    result += ( a + c + g + i ) * 0.03125;
    result += ( b + d + f + h ) * 0.0625;
    result += ( j + k + l + m ) * 0.125;
  }
  gl_FragColor = vec4( result, 1.0 );
}
`;

const UPSAMPLE = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;   // texel size of the SOURCE (smaller mip)
uniform float uRadius;
uniform float uWeight;
varying vec2 vUv;

void main() {
  vec2 t = uTexel * uRadius;
  vec3 a = texture2D( tSrc, vUv + vec2( -t.x,  t.y ) ).rgb;
  vec3 b = texture2D( tSrc, vUv + vec2(  0.0,  t.y ) ).rgb;
  vec3 c = texture2D( tSrc, vUv + vec2(  t.x,  t.y ) ).rgb;
  vec3 d = texture2D( tSrc, vUv + vec2( -t.x,  0.0 ) ).rgb;
  vec3 e = texture2D( tSrc, vUv ).rgb;
  vec3 f = texture2D( tSrc, vUv + vec2(  t.x,  0.0 ) ).rgb;
  vec3 g = texture2D( tSrc, vUv + vec2( -t.x, -t.y ) ).rgb;
  vec3 h = texture2D( tSrc, vUv + vec2(  0.0, -t.y ) ).rgb;
  vec3 i = texture2D( tSrc, vUv + vec2(  t.x, -t.y ) ).rgb;
  vec3 sum = e * 4.0 + ( b + d + f + h ) * 2.0 + ( a + c + g + i );
  // Alpha 0.5 + normal blending = lerp(dst, src, 0.5), i.e. an energy
  // PRESERVING accumulation. Adding the mips outright (what most WebGL bloom
  // does) multiplies total energy by the mip count and turns the whole frame
  // into haze.
  gl_FragColor = vec4( sum * 0.0625, uWeight );
}
`;

export class Bloom {
  constructor(levels = 6) {
    this.levels = levels;
    this.down = new Pass('ow-bloom-down', DOWNSAMPLE, {
      tSrc: { value: null },
      tExposure: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uParams: { value: new THREE.Vector4(0, 1.0, 0.6, 0) },
    });
    /** Soft-knee threshold in exposure-scaled linear light. */
    this.threshold = 1.0;
    this.knee = 0.6;
    this.up = new Pass('ow-bloom-up', UPSAMPLE, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uRadius: { value: 1.0 },
      uWeight: { value: 0.5 },
    });
    this.up.material.blending = THREE.NormalBlending;
    this.up.material.premultipliedAlpha = false;
    this.up.material.transparent = true;
    this.mips = [];
    this.texture = null;
  }

  setSize(w, h) {
    for (const m of this.mips) m.rt.dispose();
    this.mips.length = 0;
    let mw = w;
    let mh = h;
    for (let i = 0; i < this.levels; i++) {
      mw = Math.max(1, Math.floor(mw / 2));
      mh = Math.max(1, Math.floor(mh / 2));
      this.mips.push({
        rt: hdrTarget(mw, mh, { name: `bloom${i}` }),
        w: mw,
        h: mh,
      });
      if (mw <= 2 || mh <= 2) break;
    }
  }

  render(renderer, sourceTexture, sourceW, sourceH, exposureTexture) {
    const n = this.mips.length;
    if (n === 0) return null;

    const du = this.down.uniforms;
    du.tExposure.value = exposureTexture;
    for (let i = 0; i < n; i++) {
      const src = i === 0 ? sourceTexture : this.mips[i - 1].rt.texture;
      const sw = i === 0 ? sourceW : this.mips[i - 1].w;
      const sh = i === 0 ? sourceH : this.mips[i - 1].h;
      du.tSrc.value = src;
      du.uTexel.value.set(1 / sw, 1 / sh);
      du.uParams.value.set(i === 0 ? 1 : 0, this.threshold, this.knee, 0);
      this.down.render(renderer, this.mips[i].rt);
    }

    const uu = this.up.uniforms;
    for (let i = n - 1; i > 0; i--) {
      uu.tSrc.value = this.mips[i].rt.texture;
      uu.uTexel.value.set(1 / this.mips[i].w, 1 / this.mips[i].h);
      // The coarsest mips are the ones that reach tens of pixels across a
      // silhouette. A tent filter at radius 1 on a 1/64-resolution mip is a
      // 30-pixel halo, and that halo is what dissolves a roofline against a
      // bright sky. Tighten the spread and drop the blend weight on the widest
      // two levels: the wide, low-frequency component of the glare survives,
      // its reach does not.
      const wide = i >= n - 2;
      uu.uRadius.value = wide ? 0.62 : 1.0;
      uu.uWeight.value = wide ? 0.34 : 0.5;
      this.up.render(renderer, this.mips[i - 1].rt);
    }
    uu.uWeight.value = 0.5;

    this.texture = this.mips[0].rt.texture;
    return this.texture;
  }

  dispose() {
    for (const m of this.mips) m.rt.dispose();
    this.mips.length = 0;
    this.down.dispose();
    this.up.dispose();
  }
}
