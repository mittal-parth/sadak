import * as THREE from 'three';
import { COMMON } from './glsl.js';
import { Pass, hdrTarget } from './pass.js';

/**
 * Per-object motion blur driven by the velocity buffer.
 *
 * Velocity is dilated over a tile so a fast object bleeds *outside* its own
 * silhouette (a blur that stops at the object's edge is the giveaway of a
 * naive implementation), samples are depth-weighted so the background does
 * not smear over a foreground object, and the shutter is expressed as a real
 * fraction of the frame time so the amount of blur is frame-rate independent.
 */

const TILE_MAX = /* glsl */ `
precision highp float;
uniform sampler2D tVelocity;
uniform vec2 uTexel;      // texel size of the full-res velocity buffer
varying vec2 vUv;
// 8x8 taps spread over the 16x16 source tile centred on this output texel.
void main() {
  vec2 best = vec2( 0.0 );
  float bestLen = 0.0;
  for ( int y = 0; y < 8; y ++ ) {
    for ( int x = 0; x < 8; x ++ ) {
      vec2 o = ( vec2( float( x ), float( y ) ) - 3.5 ) * 2.0 * uTexel;
      vec2 v = texture2D( tVelocity, vUv + o ).rg;
      float l = dot( v, v );
      if ( l > bestLen ) { bestLen = l; best = v; }
    }
  }
  gl_FragColor = vec4( best, 0.0, 1.0 );
}
`;

const BLUR = /* glsl */ `
precision highp float;
${COMMON}
uniform sampler2D tColor;
uniform sampler2D tVelocity;
uniform sampler2D tTile;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform vec4 uParams;   // x shutter, y maxRadiusPx, z frame, w intensity
varying vec2 vUv;

#define OW_MB_TAPS 12

void main() {
  vec4 centre = texture2D( tColor, vUv );
  vec2 tileVel = texture2D( tTile, vUv ).rg;
  vec2 ownVel = texture2D( tVelocity, vUv ).rg;

  vec2 vel = length( tileVel ) > length( ownVel ) ? tileVel : ownVel;
  vel *= uParams.x;

  float pixels = length( vel * uResolution );
  if ( pixels < 1.0 ) { gl_FragColor = centre; return; }

  float maxPx = uParams.y;
  if ( pixels > maxPx ) vel *= maxPx / pixels;

  float centreDepth = texture2D( tDepth, vUv ).r;
  float cov = texture2D( tNormal, vUv ).z;
  if ( cov < 0.5 ) centreDepth = 1e5;

  float jitter = owIGN( gl_FragCoord.xy + uParams.z * 2.717 ) - 0.5;

  vec3 sum = centre.rgb;
  float wsum = 1.0;
  for ( int i = 1; i <= OW_MB_TAPS; i ++ ) {
    float t = ( float( i ) + jitter ) / float( OW_MB_TAPS );
    vec2 o = vel * ( t - 0.5 );
    for ( int s = 0; s < 2; s ++ ) {
      vec2 uv = vUv + ( s == 0 ? o : -o );
      if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) continue;
      float d = texture2D( tDepth, uv ).r;
      float c = texture2D( tNormal, uv ).z;
      if ( c < 0.5 ) d = 1e5;
      // a sample that is much further away than the centre is background
      // leaking in — down-weight it
      float w = 1.0 - smoothstep( 0.0, 1.5, ( d - centreDepth ) / max( 1.0, centreDepth ) );
      w = mix( 0.15, 1.0, clamp( w, 0.0, 1.0 ) ) * ( 1.0 - t * 0.35 );
      sum += texture2D( tColor, uv ).rgb * w;
      wsum += w;
    }
  }

  vec3 blurred = sum / wsum;
  gl_FragColor = vec4( mix( centre.rgb, blurred, uParams.w ), centre.a );
}
`;

export class MotionBlur {
  constructor() {
    this.tilePass = new Pass('ow-mb-tile', TILE_MAX, {
      tVelocity: { value: null },
      uTexel: { value: new THREE.Vector2() },
    });
    this.blurPass = new Pass('ow-mb', BLUR, {
      tColor: { value: null },
      tVelocity: { value: null },
      tTile: { value: null },
      tDepth: { value: null },
      tNormal: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uResolution: { value: new THREE.Vector2() },
      uParams: { value: new THREE.Vector4(0.5, 48, 0, 1) },
    });
    this.tileRt = null;
    this.outRt = null;
  }

  setSize(w, h) {
    this.tileRt?.dispose();
    this.outRt?.dispose();
    const tw = Math.max(1, Math.ceil(w / 16));
    const th = Math.max(1, Math.ceil(h / 16));
    this.tileRt = hdrTarget(tw, th, { format: THREE.RGFormat, name: 'mb-tile' });
    this.outRt = hdrTarget(w, h, { name: 'mb' });
    this.tilePass.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.blurPass.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.blurPass.uniforms.uResolution.value.set(w, h);
  }

  render(renderer, colorTexture, gbuffer, frame, shutter) {
    this.tilePass.uniforms.tVelocity.value = gbuffer.velocityTexture;
    this.tilePass.render(renderer, this.tileRt);

    const u = this.blurPass.uniforms;
    u.tColor.value = colorTexture;
    u.tVelocity.value = gbuffer.velocityTexture;
    u.tTile.value = this.tileRt.texture;
    u.tDepth.value = gbuffer.depthTexture;
    u.tNormal.value = gbuffer.normalTexture;
    u.uParams.value.x = shutter;
    u.uParams.value.z = frame % 64;
    this.blurPass.render(renderer, this.outRt);
    return this.outRt.texture;
  }

  dispose() {
    this.tileRt?.dispose();
    this.outRt?.dispose();
    this.tilePass.dispose();
    this.blurPass.dispose();
  }
}
