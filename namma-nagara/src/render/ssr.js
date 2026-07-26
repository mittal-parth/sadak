import * as THREE from 'three';
import { COMMON } from './glsl.js';
import { Pass, hdrTarget } from './pass.js';

/**
 * Screen-space reflections.
 *
 * Rays are marched in view space against the linear depth buffer with a
 * geometric step, then binary-refined. The hit is reprojected into the
 * *previous* resolved frame using the velocity buffer, so the reflected colour
 * is already tone-stable and antialiased (the TAA history is the source), and
 * there is no lag from camera motion — only from lighting changes.
 *
 * The result is blended into the IBL specular term inside the material rather
 * than added on top of the frame, so a mirror floor replaces its cubemap
 * reflection instead of doubling it.
 */

const SSR = /* glsl */ `
precision highp float;
${COMMON}

uniform sampler2D tColor;      // previous resolved frame (HDR)
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform sampler2D tVelocity;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform vec2 uTexel;
uniform vec4 uParams;   // x maxDistance  y thickness  z frame  w intensity
varying vec2 vUv;

#define OW_SSR_STEPS 28
#define OW_SSR_REFINE 5

void main() {
  vec4 nrm = texture2D( tNormal, vUv );
  if ( nrm.z < 0.5 ) { gl_FragColor = vec4( 0.0 ); return; }

  float depth = texture2D( tDepth, vUv ).r;
  vec3 P = owViewPos( vUv, depth, uProjInv );
  vec3 N = owDecodeNormal( nrm.xy );
  vec3 V = normalize( P );
  vec3 R = reflect( V, N );

  // Rays coming back at the camera cannot be resolved on screen.
  float facing = clamp( dot( -V, R ), 0.0, 1.0 );
  if ( facing > 0.94 ) { gl_FragColor = vec4( 0.0 ); return; }

  float maxDist = uParams.x;
  float jitter = owIGN( gl_FragCoord.xy + uParams.z * 7.331 );

  vec3 start = P + N * ( 0.02 + depth * 0.002 );
  float t = 0.06 + jitter * 0.06;
  float prevT = t;
  float stepScale = pow( maxDist / 0.06, 1.0 / float( OW_SSR_STEPS ) );

  bool hit = false;
  vec2 hitUv = vec2( 0.0 );
  float hitDiff = 0.0;

  for ( int i = 0; i < OW_SSR_STEPS; i ++ ) {
    vec3 sp = start + R * t;
    if ( sp.z > -0.05 ) break;
    vec4 clip = uProj * vec4( sp, 1.0 );
    vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
    if ( suv.x <= 0.0 || suv.x >= 1.0 || suv.y <= 0.0 || suv.y >= 1.0 ) break;

    float sceneDepth = texture2D( tDepth, suv ).r;
    float cov = texture2D( tNormal, suv ).z;
    float diff = -sp.z - sceneDepth;

    if ( cov > 0.5 && diff > 0.0 && diff < uParams.y + t * 0.06 ) {
      // binary refine between prevT and t
      float lo = prevT, hi = t;
      for ( int k = 0; k < OW_SSR_REFINE; k ++ ) {
        float mid = ( lo + hi ) * 0.5;
        vec3 mp = start + R * mid;
        vec4 mc = uProj * vec4( mp, 1.0 );
        vec2 muv = mc.xy / mc.w * 0.5 + 0.5;
        float md = texture2D( tDepth, muv ).r;
        if ( -mp.z - md > 0.0 ) hi = mid; else lo = mid;
      }
      vec3 fp = start + R * hi;
      vec4 fc = uProj * vec4( fp, 1.0 );
      hitUv = fc.xy / fc.w * 0.5 + 0.5;
      hitDiff = diff;
      hit = true;
      break;
    }
    prevT = t;
    t *= stepScale;
    if ( t > maxDist ) break;
  }

  if ( !hit ) { gl_FragColor = vec4( 0.0 ); return; }

  // Reproject the hit into the previous frame so the colour lines up.
  vec2 vel = texture2D( tVelocity, hitUv ).rg;
  vec2 srcUv = clamp( hitUv - vel, vec2( 0.001 ), vec2( 0.999 ) );
  vec3 color = texture2D( tColor, srcUv ).rgb;

  // Confidence: fade at screen borders, at grazing back-facing rays, and with
  // how far the ray had to travel.
  vec2 edge = smoothstep( vec2( 0.0 ), vec2( 0.12 ), hitUv ) *
              smoothstep( vec2( 0.0 ), vec2( 0.12 ), 1.0 - hitUv );
  float conf = edge.x * edge.y;
  conf *= 1.0 - smoothstep( 0.7, 0.94, facing );
  conf *= 1.0 - smoothstep( maxDist * 0.55, maxDist, t );
  conf *= 1.0 - smoothstep( uParams.y * 0.5, uParams.y, hitDiff );

  gl_FragColor = vec4( max( color, vec3( 0.0 ) ), clamp( conf, 0.0, 1.0 ) * uParams.w );
}
`;

const SSR_BLUR = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uDirection;
varying vec2 vUv;
void main() {
  vec4 sum = texture2D( tSrc, vUv ) * 0.4;
  float w = 0.4;
  for ( int i = 1; i <= 2; i ++ ) {
    float wi = 0.3 / float( i );
    sum += texture2D( tSrc, vUv + uDirection * float( i ) ) * wi;
    sum += texture2D( tSrc, vUv - uDirection * float( i ) ) * wi;
    w += wi * 2.0;
  }
  gl_FragColor = sum / w;
}
`;

export class Ssr {
  constructor() {
    this.pass = new Pass('ow-ssr', SSR, {
      tColor: { value: null },
      tDepth: { value: null },
      tNormal: { value: null },
      tVelocity: { value: null },
      uProj: { value: new THREE.Matrix4() },
      uProjInv: { value: new THREE.Matrix4() },
      uTexel: { value: new THREE.Vector2() },
      uParams: { value: new THREE.Vector4(24, 0.6, 0, 1) },
    });
    this.blur = new Pass('ow-ssr-blur', SSR_BLUR, {
      tSrc: { value: null },
      uDirection: { value: new THREE.Vector2() },
    });
    this.rtA = null;
    this.rtB = null;
    this.texture = null;
  }

  setSize(w, h) {
    this.rtA?.dispose();
    this.rtB?.dispose();
    // half resolution: reflections are low frequency and this is the single
    // most expensive ray-marching pass in the frame
    const hw = Math.max(1, w >> 1);
    const hh = Math.max(1, h >> 1);
    this.rtA = hdrTarget(hw, hh, { name: 'ssr' });
    this.rtB = hdrTarget(hw, hh, { name: 'ssr-blur' });
    this.pass.uniforms.uTexel.value.set(1 / hw, 1 / hh);
    this._texel = new THREE.Vector2(1 / hw, 1 / hh);
  }

  render(renderer, gbuffer, colorTexture, camera, frame) {
    const u = this.pass.uniforms;
    u.tColor.value = colorTexture;
    u.tDepth.value = gbuffer.depthTexture;
    u.tNormal.value = gbuffer.normalTexture;
    u.tVelocity.value = gbuffer.velocityTexture;
    u.uProj.value.copy(camera.projectionMatrix);
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
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
