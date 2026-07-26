import * as THREE from 'three';
import { COMMON } from './glsl.js';
import { Pass, hdrTarget } from './pass.js';

/**
 * Screen-space contact shadows.
 *
 * A cascaded shadow map, however well filtered, always loses the last few
 * centimetres: the texel is bigger than the gap between a crate and the floor.
 * This marches a short ray through the depth buffer toward the sun and puts
 * that contact back, which is what stops props looking like stickers.
 *
 * Consumed inside the material, multiplied onto the sun term only.
 */

const CONTACT = /* glsl */ `
precision highp float;
${COMMON}

uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform vec3 uSunDirView;
uniform vec4 uParams;   // x length(m)  y thickness(m)  z frame  w strength
varying vec2 vUv;

#define OW_CS_STEPS 14

void main() {
  vec4 nrm = texture2D( tNormal, vUv );
  if ( nrm.z < 0.5 ) { gl_FragColor = vec4( 1.0, 1e4, 0.0, 1.0 ); return; }

  float depth = texture2D( tDepth, vUv ).r;
  vec3 P = owViewPos( vUv, depth, uProjInv );
  vec3 N = owDecodeNormal( nrm.xy );
  vec3 L = uSunDirView;

  float NdL = dot( N, L );
  if ( NdL <= 0.02 ) { gl_FragColor = vec4( 1.0, depth, 0.0, 1.0 ); return; }

  float len = uParams.x * clamp( depth * 0.08 + 0.75, 0.75, 2.5 );
  float jitter = owIGN( gl_FragCoord.xy + uParams.z * 3.1717 );

  vec3 origin = P + N * ( 0.012 + depth * 0.0015 );
  vec3 stepV = L * ( len / float( OW_CS_STEPS ) );

  float occ = 0.0;
  for ( int i = 0; i < OW_CS_STEPS; i ++ ) {
    vec3 sp = origin + stepV * ( float( i ) + jitter );
    vec4 clip = uProj * vec4( sp, 1.0 );
    vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
    if ( suv.x <= 0.0 || suv.x >= 1.0 || suv.y <= 0.0 || suv.y >= 1.0 ) break;

    float sceneDepth = texture2D( tDepth, suv ).r;
    float cov = texture2D( tNormal, suv ).z;
    if ( cov < 0.5 ) continue;

    float diff = -sp.z - sceneDepth;
    float bias = 0.004 + sceneDepth * 0.0025;
    if ( diff > bias && diff < uParams.y ) {
      // fade with distance travelled so the shadow dissolves rather than ends
      float t = ( float( i ) + jitter ) / float( OW_CS_STEPS );
      occ = max( occ, 1.0 - t * t );
      break;
    }
  }

  float shadow = 1.0 - occ * uParams.w;
  gl_FragColor = vec4( shadow, depth, 0.0, 1.0 );
}
`;

const BILATERAL = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uDirection;
varying vec2 vUv;
void main() {
  vec2 c = texture2D( tSrc, vUv ).rg;
  float sum = c.r * 0.5;
  float wsum = 0.5;
  for ( int i = 1; i <= 2; i ++ ) {
    vec2 o = uDirection * float( i );
    vec2 a = texture2D( tSrc, vUv + o ).rg;
    vec2 b = texture2D( tSrc, vUv - o ).rg;
    float w = 0.3 / float( i );
    float wa = w * exp( -abs( a.g - c.g ) * 40.0 / max( 0.1, c.g ) );
    float wb = w * exp( -abs( b.g - c.g ) * 40.0 / max( 0.1, c.g ) );
    sum += a.r * wa + b.r * wb;
    wsum += wa + wb;
  }
  gl_FragColor = vec4( sum / wsum, c.g, 0.0, 1.0 );
}
`;

export class ContactShadows {
  constructor() {
    this.pass = new Pass('ow-contact', CONTACT, {
      tDepth: { value: null },
      tNormal: { value: null },
      uProj: { value: new THREE.Matrix4() },
      uProjInv: { value: new THREE.Matrix4() },
      uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
      // x ray length (m) at 1x, y thickness (m), z frame, w strength.
      // 0.40 m with the distance ramp below spans roughly 0.30..1.0 m of world
      // travel, which is what puts the last few centimetres of occlusion back:
      // a cascade texel at 40 m is wider than the gap between a crate and the
      // ground, so without this every prop is a sticker on the floor.
      uParams: { value: new THREE.Vector4(0.4, 0.42, 0, 1.0) },
    });
    this.blur = new Pass('ow-contact-blur', BILATERAL, {
      tSrc: { value: null },
      uDirection: { value: new THREE.Vector2() },
    });
    this.rtA = null;
    this.rtB = null;
    this.texture = null;
  }

  /** @param m world-space ray length in metres at 1x distance scaling. */
  setLength(m) {
    this.pass.uniforms.uParams.value.x = m;
  }

  /** @param s 0..1 how much of the sun term a full contact hit removes. */
  setStrength(s) {
    this.pass.uniforms.uParams.value.w = s;
  }

  setSize(w, h) {
    this.rtA?.dispose();
    this.rtB?.dispose();
    const o = { type: THREE.HalfFloatType, format: THREE.RGFormat, name: 'contact' };
    this.rtA = hdrTarget(w, h, o);
    this.rtB = hdrTarget(w, h, o);
    this._texel = new THREE.Vector2(1 / w, 1 / h);
  }

  render(renderer, gbuffer, camera, sunDirView, frame) {
    const u = this.pass.uniforms;
    u.tDepth.value = gbuffer.depthTexture;
    u.tNormal.value = gbuffer.normalTexture;
    u.uProj.value.copy(camera.projectionMatrix);
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uSunDirView.value.copy(sunDirView);
    u.uParams.value.z = frame % 64;
    this.pass.render(renderer, this.rtA);

    const b = this.blur.uniforms;
    b.tSrc.value = this.rtA.texture;
    b.uDirection.value.set(this._texel.x, 0);
    this.blur.render(renderer, this.rtB);
    b.tSrc.value = this.rtB.texture;
    b.uDirection.value.set(0, this._texel.y);
    this.blur.render(renderer, this.rtA);

    this.texture = this.rtA.texture;
    return this.texture;
  }

  dispose() {
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.pass.dispose();
    this.blur.dispose();
  }
}
