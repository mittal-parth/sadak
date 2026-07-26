/**
 * Procedural noise shared by the stars, the clouds and the fog.
 *
 * Kept in one chunk with an include guard so the dome (which needs all of it),
 * the environment bake and the volumetric pass can each pull in whatever they
 * reference without duplicating a single line of GLSL — and, more importantly,
 * without the clouds in the sky disagreeing with the cloud shadows in the fog.
 */
export const NOISE_GLSL = /* glsl */ `
#ifndef SKY_NOISE
#define SKY_NOISE

float skHash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

float skHash13( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.yzx + 33.33 );
  return fract( ( p.x + p.y ) * p.z );
}

vec3 skHash33( vec3 p ) {
  p = fract( p * vec3( 0.1031, 0.11369, 0.13787 ) );
  p += dot( p, p.yxz + 19.19 );
  return fract( vec3( ( p.x + p.y ) * p.z, ( p.x + p.z ) * p.y, ( p.y + p.z ) * p.x ) );
}

/** Interleaved gradient noise (Jimenez) — the right dither for a raymarch. */
float skIGN( vec2 p ) {
  return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
}

float skVal2( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( skHash12( i ), skHash12( i + vec2( 1, 0 ) ), f.x ),
              mix( skHash12( i + vec2( 0, 1 ) ), skHash12( i + vec2( 1, 1 ) ), f.x ), f.y );
}

float skVal3( vec3 p ) {
  vec3 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( skHash13( i + vec3( 0, 0, 0 ) ), skHash13( i + vec3( 1, 0, 0 ) ), f.x ),
         mix( skHash13( i + vec3( 0, 1, 0 ) ), skHash13( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( skHash13( i + vec3( 0, 0, 1 ) ), skHash13( i + vec3( 1, 0, 1 ) ), f.x ),
         mix( skHash13( i + vec3( 0, 1, 1 ) ), skHash13( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}

const mat2 SK_ROT = mat2( 0.8, 0.6, -0.6, 0.8 );

float skFbm2( vec2 p, int oct ) {
  float a = 0.5, s = 0.0, n = 0.0;
  for ( int i = 0; i < oct; i ++ ) {
    s += a * skVal2( p );
    n += a;
    p = SK_ROT * p * 2.04 + 7.13;
    a *= 0.5;
  }
  return s / max( n, 1e-4 );
}

/** Ridged variant — fibrous cirrus streaks and wind-torn fog wisps. */
float skRidge2( vec2 p, int oct ) {
  float a = 0.5, s = 0.0, n = 0.0;
  for ( int i = 0; i < oct; i ++ ) {
    s += a * ( 1.0 - abs( skVal2( p ) * 2.0 - 1.0 ) );
    n += a;
    p = SK_ROT * p * 2.11 + 3.71;
    a *= 0.52;
  }
  return s / max( n, 1e-4 );
}

float skFbm3( vec3 p, int oct ) {
  float a = 0.5, s = 0.0, n = 0.0;
  for ( int i = 0; i < oct; i ++ ) {
    s += a * skVal3( p );
    n += a;
    p = p * 2.07 + vec3( 11.3, 5.1, 7.7 );
    a *= 0.5;
  }
  return s / max( n, 1e-4 );
}

#endif
`;
