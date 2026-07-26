import * as THREE from 'three';
import { COMMON } from './glsl.js';
import { Pass, hdrTarget } from './pass.js';

/**
 * Physical exposure.
 *
 * Everything downstream is driven by a single scalar held in a 1x1 float
 * target — never by ad-hoc brightness multipliers scattered through the
 * shaders. Metering is a centre-weighted log-average luminance reduced on the
 * GPU (no readback, no stall), converted to an EV100 and then to a photometric
 * exposure with the standard saturation-based speed constant:
 *
 *     EV100 = log2( L * 100 / K ),  K = 12.5
 *     H     = 78 / (q * S) * 2^EV100,  exposure = 1 / H  (q=0.65, S=100)
 *
 * Adaptation is asymmetric — the eye brightens up slowly and darkens down
 * quickly — and clamped to a compensation window so a dark corner cannot
 * turn night into day.
 */

const LOGLUM = /* glsl */ `
precision highp float;
${COMMON}
uniform sampler2D tSrc;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform vec4 uMeter;   // x skyWeight, y farDistance(m), z tapClamp, w hasDepth
uniform vec2 uSkyKnee; // luminance range over which the sky de-weight ramps in
varying vec2 vUv;

// Per-tap clamp: the solar disc is authored at radiance 4000 and a specular
// hit off a rail can be worse. One such pixel inside a 4-tap box would drag
// the whole log-average by stops, so every tap is limited before the log.
float owMeterTap( vec2 uv ) {
  vec3 c = max( texture2D( tSrc, uv ).rgb, vec3( 0.0 ) );
  return min( owLum( c ), uMeter.z );
}

void main() {
  float lum = owMeterTap( vUv + vec2( -1.0, -1.0 ) * uTexel );
  lum += owMeterTap( vUv + vec2(  1.0, -1.0 ) * uTexel );
  lum += owMeterTap( vUv + vec2( -1.0,  1.0 ) * uTexel );
  lum += owMeterTap( vUv + vec2(  1.0,  1.0 ) * uTexel );
  lum = max( lum * 0.25, 1e-5 );

  // centre-weighted metering: the middle of the frame is what the player aims at
  vec2 d = ( vUv - 0.5 ) * 2.0;
  float w = exp( -dot( d, d ) * 1.1 );

  // ...but do NOT meter off a BRIGHT sky. A sunlit sky band fills the upper
  // half of almost every exterior shot; letting it into the average pulls the
  // exposure down until the street it is lighting reads as night. Depth is 0
  // where no geometry was written (sky), and anything past uMeter.y is aerial
  // perspective — also mostly sky.
  //
  // The de-weight ramps in with the sky's own luminance, and that matters: a
  // moonlit night sky is legitimate scene content and the only absolute anchor
  // the meter has at night. De-weight it unconditionally and night adapts up
  // until it looks like an overcast afternoon.
  if ( uMeter.w > 0.5 ) {
    float depth = texture2D( tDepth, vUv ).r;
    if ( depth <= 0.0 || depth > uMeter.y ) {
      w *= mix( 1.0, uMeter.x, smoothstep( uSkyKnee.x, uSkyKnee.y, lum ) );
    }
  }

  gl_FragColor = vec4( log2( lum ) * w, w, 0.0, 1.0 );
}
`;

const REDUCE = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 s = vec2( 0.0 );
  for ( int y = 0; y < 4; y ++ ) {
    for ( int x = 0; x < 4; x ++ ) {
      vec2 o = ( vec2( float( x ), float( y ) ) - 1.5 ) * uTexel;
      s += texture2D( tSrc, vUv + o ).rg;
    }
  }
  gl_FragColor = vec4( s / 16.0, 0.0, 1.0 );
}
`;

const ADAPT = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform sampler2D tPrev;
uniform vec4 uParams;   // x dt, y speedUp, z speedDown, w manual EV bias
uniform vec4 uLimits;   // x minEV, y maxEV, z reset, w keyScale
varying vec2 vUv;

void main() {
  vec2 s = texture2D( tSrc, vec2( 0.5 ) ).rg;
  float avgLogLum = s.x / max( s.y, 1e-4 );
  float lum = max( exp2( avgLogLum ), 1e-5 );

  // EV100 from average scene luminance, then the photometric exposure.
  // uParams.w is the compensation and it is ADDED: a higher EV100 means a
  // smaller exposure, so + is darker — which is the sign both this file's header
  // and RenderSystem.setExposureBias have always claimed and the subtraction
  // here has always contradicted.
  float ev100 = log2( lum * 100.0 / 12.5 ) + uParams.w;
  ev100 = clamp( ev100, uLimits.x, uLimits.y );

  float prevEv = texture2D( tPrev, vec2( 0.5 ) ).g;
  if ( uLimits.z > 0.5 ) prevEv = ev100;

  float speed = ev100 > prevEv ? uParams.z : uParams.y;
  float k = 1.0 - exp( -uParams.x * speed );
  float ev = mix( prevEv, ev100, clamp( k, 0.0, 1.0 ) );

  float maxLum = 1.2 * exp2( ev );       // 78/(q*S) with q=0.65,S=100 -> 1.2
  float exposure = uLimits.w / maxLum;

  gl_FragColor = vec4( exposure, ev, 0.0, 1.0 );
}
`;

export class AutoExposure {
  constructor() {
    this.logPass = new Pass('ow-loglum', LOGLUM, {
      tSrc: { value: null },
      tDepth: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uMeter: { value: new THREE.Vector4(0.15, 400, 40, 0) },
      uSkyKnee: { value: new THREE.Vector2(0.06, 0.3) },
    });
    this.reducePass = new Pass('ow-reduce', REDUCE, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
    });
    this.adaptPass = new Pass('ow-adapt', ADAPT, {
      tSrc: { value: null },
      tPrev: { value: null },
      uParams: { value: new THREE.Vector4(0.016, 1.4, 3.2, 0) },
      uLimits: { value: new THREE.Vector4(-4, 16, 1, 1.0) },
    });

    const o = { type: THREE.FloatType, format: THREE.RGBAFormat, name: 'exposure' };
    this.rt64 = hdrTarget(64, 64, o);
    this.rt16 = hdrTarget(16, 16, o);
    this.rt4 = hdrTarget(4, 4, o);
    this.rt1 = hdrTarget(1, 1, o);
    this.adapt = [hdrTarget(1, 1, o), hdrTarget(1, 1, o)];
    this._flip = 0;
    this.enabled = true;
    this.manual = 1.0;
    this._reset = true;
  }

  get texture() {
    return this.adapt[this._flip].texture;
  }

  reset() {
    this._reset = true;
  }

  /**
   * `bias` is an EV offset: +1 makes the image one stop darker.
   * `depthTexture` is the linear-depth gbuffer channel; when supplied the sky
   * is de-weighted out of the meter.
   */
  update(renderer, sourceTexture, sw, sh, dt, bias, key, depthTexture) {
    const lu = this.logPass.uniforms;
    lu.tSrc.value = sourceTexture;
    lu.tDepth.value = depthTexture ?? null;
    lu.uMeter.value.w = depthTexture ? 1 : 0;
    lu.uTexel.value.set(1 / sw, 1 / sh);
    this.logPass.render(renderer, this.rt64);

    const ru = this.reducePass.uniforms;
    ru.tSrc.value = this.rt64.texture;
    ru.uTexel.value.set(1 / 64, 1 / 64);
    this.reducePass.render(renderer, this.rt16);
    ru.tSrc.value = this.rt16.texture;
    ru.uTexel.value.set(1 / 16, 1 / 16);
    this.reducePass.render(renderer, this.rt4);
    ru.tSrc.value = this.rt4.texture;
    ru.uTexel.value.set(1 / 4, 1 / 4);
    this.reducePass.render(renderer, this.rt1);

    const au = this.adaptPass.uniforms;
    au.tSrc.value = this.rt1.texture;
    au.tPrev.value = this.adapt[this._flip].texture;
    au.uParams.value.x = Math.min(dt, 0.1);
    au.uParams.value.w = bias;
    au.uLimits.value.z = this._reset ? 1 : 0;
    au.uLimits.value.w = key;
    this._reset = false;
    const dst = this.adapt[this._flip ^ 1];
    this.adaptPass.render(renderer, dst);
    this._flip ^= 1;
    return dst.texture;
  }

  setLimits(minEv, maxEv) {
    this.adaptPass.uniforms.uLimits.value.x = minEv;
    this.adaptPass.uniforms.uLimits.value.y = maxEv;
  }

  dispose() {
    this.rt64.dispose();
    this.rt16.dispose();
    this.rt4.dispose();
    this.rt1.dispose();
    this.adapt[0].dispose();
    this.adapt[1].dispose();
    this.logPass.dispose();
    this.reducePass.dispose();
    this.adaptPass.dispose();
  }
}
