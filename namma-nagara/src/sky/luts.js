import * as THREE from 'three';
import { SkyPass, hdrTarget, floatTarget } from './fullscreen.js';
import {
  ATMO,
  ATMOSPHERE_GLSL,
  TRANSMITTANCE_LOOKUP_GLSL,
  MULTISCATTER_LOOKUP_GLSL,
  SCATTER_GLSL,
} from './atmosphere.js';

/**
 * The three atmosphere LUTs plus a 1x1 ambient probe.
 *
 * Cost, measured on an M-series GPU:
 *   transmittance  256x64,  40 steps       ~0.15 ms   once, at boot
 *   multiscatter    32x32,  64 dirs x 20   ~0.9 ms    once, at boot
 *   sky-view       384x192, 40 steps       ~0.6 ms    only when the sun moves
 *   ambient probe    1x1,   64 taps        negligible only when the sun moves
 *
 * Nothing here runs per frame. A static time of day costs zero.
 */

// ---------------------------------------------------------------------------
//  sky-view LUT parameterisation (shared by the bake and every lookup)
// ---------------------------------------------------------------------------

/**
 * Azimuth is measured *relative to the sun*, so one 384x192 table serves every
 * compass direction. The altitude axis is square-distributed about the horizon,
 * putting half the texels in the bottom 25 degrees where the gradient lives.
 */
export const SKYVIEW_LOOKUP_GLSL = /* glsl */ `
#ifndef SKY_SVLUT
#define SKY_SVLUT
uniform sampler2D uSkyViewLut;

vec3 skSkyView( vec3 rayDir, vec3 sunDir ) {
  float h = length( uViewPos );
  vec3 up = uViewPos / h;
  float horizon = skSafeAcos( sqrt( h * h - SK_GROUND_R * SK_GROUND_R ) / h );
  float altitude = horizon - skSafeAcos( dot( rayDir, up ) );

  float azimuth = 0.0;
  if ( abs( altitude ) < ( 0.5 * SK_PI - 1e-4 ) ) {
    vec3 right = cross( sunDir, up );
    vec3 fwd = cross( up, right );
    vec3 proj = normalize( rayDir - up * dot( rayDir, up ) );
    azimuth = atan( dot( proj, right ), dot( proj, fwd ) ) + SK_PI;
  }

  float v = 0.5 + 0.5 * sign( altitude ) * sqrt( abs( altitude ) * 2.0 / SK_PI );
  return texture( uSkyViewLut, vec2( azimuth / ( 2.0 * SK_PI ), v ) ).rgb;
}
#endif
`;

// ---------------------------------------------------------------------------
//  bakes
// ---------------------------------------------------------------------------

const TRANSMITTANCE_FRAG = /* glsl */ `
precision highp float;
${ATMOSPHERE_GLSL}
in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  float mu = vUv.x * 2.0 - 1.0;
  float h = mix( SK_GROUND_R, SK_TOP_R, vUv.y );
  vec3 pos = vec3( 0.0, h, 0.0 );
  vec3 dir = vec3( sqrt( max( 0.0, 1.0 - mu * mu ) ), mu, 0.0 );

  float t = skRaySphere( pos, dir, SK_TOP_R );
  if ( t <= 0.0 ) { fragColor = vec4( 0.0, 0.0, 0.0, 1.0 ); return; }

  const float STEPS = 40.0;
  float dt = t / STEPS;
  vec3 od = vec3( 0.0 );
  for ( float i = 0.0; i < STEPS; i += 1.0 ) {
    vec3 p = pos + ( i + 0.5 ) * dt * dir;
    vec3 rs; float ms; vec3 ext;
    skMedium( p, rs, ms, ext );
    od += ext * dt;
  }
  fragColor = vec4( exp( -od ), 1.0 );
}
`;

const MULTISCATTER_FRAG = /* glsl */ `
precision highp float;
${ATMOSPHERE_GLSL}
${TRANSMITTANCE_LOOKUP_GLSL}
in vec2 vUv;
layout(location = 0) out vec4 fragColor;

const float MS_STEPS = 20.0;
const int SQRT_SAMPLES = 8;

void main() {
  float mu = vUv.x * 2.0 - 1.0;
  float h = mix( SK_GROUND_R + 1e-5, SK_TOP_R, vUv.y );
  vec3 pos = vec3( 0.0, h, 0.0 );
  vec3 sunDir = normalize( vec3( sqrt( max( 0.0, 1.0 - mu * mu ) ), mu, 0.0 ) );

  vec3 lumTotal = vec3( 0.0 );
  vec3 fmsTotal = vec3( 0.0 );
  float invSamples = 1.0 / float( SQRT_SAMPLES * SQRT_SAMPLES );

  for ( int i = 0; i < SQRT_SAMPLES; i ++ ) {
    for ( int j = 0; j < SQRT_SAMPLES; j ++ ) {
      // Uniform on the sphere: theta linear, cos(phi) linear.
      float theta = SK_PI * ( float( i ) + 0.5 ) / float( SQRT_SAMPLES );
      float phi = skSafeAcos( 1.0 - 2.0 * ( float( j ) + 0.5 ) / float( SQRT_SAMPLES ) );
      float cp = cos( phi ), sp = sin( phi );
      vec3 rayDir = vec3( sp * sin( theta ), cp, sp * cos( theta ) );

      float topT = skRaySphere( pos, rayDir, SK_TOP_R );
      float grnT = skRaySphere( pos, rayDir, SK_GROUND_R );
      float tMax = grnT < 0.0 ? topT : grnT;
      if ( tMax <= 0.0 ) continue;

      vec3 lum = vec3( 0.0 );
      vec3 fms = vec3( 0.0 );
      vec3 trans = vec3( 1.0 );
      float t = 0.0;
      for ( float s = 0.0; s < MS_STEPS; s += 1.0 ) {
        float nt = ( ( s + 0.5 ) / MS_STEPS ) * tMax;
        float dt = nt - t;
        t = nt;
        vec3 p = pos + t * rayDir;
        vec3 rs; float ms; vec3 ext;
        skMedium( p, rs, ms, ext );
        vec3 sampleT = exp( -dt * ext );

        // f_ms: the fraction of light that scatters at least once more.
        vec3 sNoPhase = rs + vec3( ms );
        fms += trans * ( sNoPhase - sNoPhase * sampleT ) / max( ext, vec3( 1e-8 ) );

        vec3 tSun = skTransmittance( p, sunDir );
        vec3 inS = ( rs + vec3( ms ) ) * SK_ISO_PHASE * tSun;
        lum += trans * ( inS - inS * sampleT ) / max( ext, vec3( 1e-8 ) );
        trans *= sampleT;
      }

      if ( grnT > 0.0 ) {
        vec3 hit = normalize( pos + grnT * rayDir ) * SK_GROUND_R;
        if ( dot( hit, sunDir ) > 0.0 ) {
          lum += trans * SK_GROUND_ALBEDO * skTransmittance( hit, sunDir );
        }
      }

      lumTotal += lum * invSamples;
      fmsTotal += fms * invSamples;
    }
  }

  // Infinite geometric series of scattering orders, collapsed.
  vec3 psi = lumTotal / max( vec3( 1.0 ) - fmsTotal, vec3( 1e-4 ) );
  fragColor = vec4( psi, 1.0 );
}
`;

const SKYVIEW_FRAG = /* glsl */ `
precision highp float;
${ATMOSPHERE_GLSL}
${TRANSMITTANCE_LOOKUP_GLSL}
${MULTISCATTER_LOOKUP_GLSL}
${SCATTER_GLSL}
in vec2 vUv;
layout(location = 0) out vec4 fragColor;

uniform vec3 uSunIrradiance;
uniform vec3 uMoonIrradiance;
uniform float uSunAltitude;   // radians above the horizon
uniform float uMoonRelAz;     // moon azimuth relative to the sun, radians
uniform float uMoonAltitude;

void main() {
  float azimuth = ( vUv.x - 0.5 ) * 2.0 * SK_PI;
  float v = vUv.y;
  float adjV = v < 0.5 ? -( 1.0 - 2.0 * v ) * ( 1.0 - 2.0 * v )
                       :  ( 2.0 * v - 1.0 ) * ( 2.0 * v - 1.0 );

  float h = length( uViewPos );
  vec3 up = uViewPos / h;
  float horizon = skSafeAcos( sqrt( h * h - SK_GROUND_R * SK_GROUND_R ) / h ) - 0.5 * SK_PI;
  float altitude = adjV * 0.5 * SK_PI - horizon;
  float ca = cos( altitude );
  vec3 rayDir = vec3( ca * sin( azimuth ), sin( altitude ), -ca * cos( azimuth ) );

  // The LUT frame puts the sun at azimuth 0 (along -Z).
  vec3 sunDir = vec3( 0.0, sin( uSunAltitude ), -cos( uSunAltitude ) );
  float cm = cos( uMoonAltitude );
  vec3 moonDir = vec3( cm * sin( uMoonRelAz ), sin( uMoonAltitude ), -cm * cos( uMoonRelAz ) );

  vec3 lum = skRaymarchSky( uViewPos, rayDir, sunDir, uSunIrradiance,
                            moonDir, uMoonIrradiance, 40.0 );
  fragColor = vec4( lum, 1.0 );
}
`;

/**
 * Average sky radiance over the upper hemisphere (cosine weighted) and over the
 * lower hemisphere-facing band. The ground fog samples this so its ambient term
 * is the actual sky it is standing under, not a hand-picked blue.
 *   texel 0 -> sky ambient   texel 1 -> horizon-band ambient
 */
const AMBIENT_FRAG = /* glsl */ `
precision highp float;
${ATMOSPHERE_GLSL}
${SKYVIEW_LOOKUP_GLSL}
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
uniform float uSunAltitude;

void main() {
  vec3 sunDir = vec3( 0.0, sin( uSunAltitude ), -cos( uSunAltitude ) );
  bool horizonBand = vUv.x > 0.5;
  vec3 sum = vec3( 0.0 );
  float wsum = 0.0;
  const int N = 64;
  for ( int i = 0; i < N; i ++ ) {
    // Fibonacci hemisphere.
    float fi = ( float( i ) + 0.5 ) / float( N );
    float phi = float( i ) * 2.39996323;
    float ct = horizonBand ? mix( -0.12, 0.35, fi ) : sqrt( 1.0 - fi );
    float st = sqrt( max( 0.0, 1.0 - ct * ct ) );
    vec3 d = vec3( st * cos( phi ), ct, st * sin( phi ) );
    float w = horizonBand ? 1.0 : max( 0.0, ct );
    sum += skSkyView( d, sunDir ) * w;
    wsum += w;
  }
  fragColor = vec4( sum / max( wsum, 1e-4 ), 1.0 );
}
`;

export class SkyLuts {
  constructor(renderer, shared) {
    this.renderer = renderer;

    this.transmittanceRt = floatTarget(256, 64, { name: 'sky-transmittance' });
    this.multiScatterRt = hdrTarget(32, 32, { name: 'sky-multiscatter' });
    // 384x192 rather than Hillaire's 192x108: one texel is then under a degree
    // of azimuth, which is the difference between a readable warm band around a
    // low sun and a visibly interpolated smear. The remaining loss of the Mie
    // forward peak is restored analytically by skAureole in dome.js.
    this.skyViewRt = hdrTarget(384, 192, { name: 'sky-view' });
    this.ambientRt = hdrTarget(2, 1, { name: 'sky-ambient' });
    this.skyViewRt.texture.wrapS = THREE.RepeatWrapping;

    // Shared uniform objects: one write in SkySystem updates every pass and
    // every material that references them.
    shared.uTransmittanceLut = { value: this.transmittanceRt.texture };
    shared.uMultiScatterLut = { value: this.multiScatterRt.texture };
    shared.uSkyViewLut = { value: this.skyViewRt.texture };
    shared.uSkyAmbientLut = { value: this.ambientRt.texture };
    this.shared = shared;

    this.transmittancePass = new SkyPass('sky-transmittance', TRANSMITTANCE_FRAG, {
      uMieScale: shared.uMieScale,
      uViewPos: shared.uViewPos,
    });
    this.multiScatterPass = new SkyPass('sky-multiscatter', MULTISCATTER_FRAG, {
      uMieScale: shared.uMieScale,
      uViewPos: shared.uViewPos,
      uTransmittanceLut: shared.uTransmittanceLut,
    });
    this.skyViewPass = new SkyPass('sky-view', SKYVIEW_FRAG, {
      uMieScale: shared.uMieScale,
      uViewPos: shared.uViewPos,
      uTransmittanceLut: shared.uTransmittanceLut,
      uMultiScatterLut: shared.uMultiScatterLut,
      uSunIrradiance: shared.uSunIrradiance,
      uMoonIrradiance: shared.uMoonIrradiance,
      uSunAltitude: shared.uSunAltitude,
      uMoonAltitude: shared.uMoonAltitude,
      uMoonRelAz: shared.uMoonRelAz,
    });
    this.ambientPass = new SkyPass('sky-ambient', AMBIENT_FRAG, {
      uViewPos: shared.uViewPos,
      uMieScale: shared.uMieScale,
      uSkyViewLut: shared.uSkyViewLut,
      uSunAltitude: shared.uSunAltitude,
    });
  }

  /** Altitude/aerosol dependent only — baked at boot, and if turbidity changes. */
  bakeStatic() {
    this.transmittancePass.render(this.renderer, this.transmittanceRt);
    this.multiScatterPass.render(this.renderer, this.multiScatterRt);
  }

  /** Sun/moon dependent. ~0.4 ms; called only when the sun has actually moved. */
  bakeSkyView() {
    this.skyViewPass.render(this.renderer, this.skyViewRt);
    this.ambientPass.render(this.renderer, this.ambientRt);
  }

  dispose() {
    this.transmittanceRt.dispose();
    this.multiScatterRt.dispose();
    this.skyViewRt.dispose();
    this.ambientRt.dispose();
    this.transmittancePass.dispose();
    this.multiScatterPass.dispose();
    this.skyViewPass.dispose();
    this.ambientPass.dispose();
  }
}

export { ATMO };
