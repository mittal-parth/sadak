/**
 * Night sky: a real starfield and a Milky Way band, both procedural.
 *
 * "White dots on black" is the tell of a WebGL demo, so:
 *   - stars are drawn from three density layers with a magnitude power law, so
 *     a handful are conspicuous and thousands are barely there;
 *   - each star gets a blackbody colour temperature (2600 K red giants through
 *     22000 K B-type blue) with the *luminance normalised out*, so temperature
 *     and magnitude are independent, exactly as in a real catalogue;
 *   - brightness is attenuated by Kasten-Young airmass, so the sky loses stars
 *     toward the horizon instead of ending in a hard line;
 *   - scintillation is airmass-weighted: stars twinkle low down and sit still
 *     overhead, which is the single most convincing detail;
 *   - the Milky Way is a warm bulge and a cool disc separated by fbm dust
 *     lanes, with extra unresolved star density inside the band.
 *
 * Radiance is in the same scene units as everything else, so on a bright
 * afternoon the stars are simply four orders of magnitude below the sky and
 * vanish on their own — there is no "hide the stars in daytime" switch.
 */
export const STARS_GLSL = /* glsl */ `
#ifndef SKY_STARS
#define SKY_STARS

uniform vec4 uStarParams;   // x brightness, y twinkle amount, z time, w milkyway gain
uniform mat3 uCelestial;    // equatorial -> world; rotates the sky with the day

/**
 * How much of the blackbody hue survives.
 *
 * A star is a point source a couple of pixels wide, and a saturated point is not
 * read as "a red giant", it is read as a stuck pixel or a dead sub-pixel on the
 * monitor — which is exactly what the red-orange dots in the night frame were.
 * Real naked-eye stars are close to white: even Betelgeuse is only a few percent
 * off neutral once the eye has adapted. 0.11 holds the worst case (2600 K, whose
 * normalised primaries are roughly 1.6 / 0.7 / 0.25) under 0.15 HSV saturation,
 * which still tints a field of a thousand stars visibly without any of them
 * reading as a coloured defect.
 */
const float SK_STAR_TINT = 0.11;

/** Tanner Helland's blackbody fit, moved to linear light and normalised. */
vec3 skBlackbody( float kelvin ) {
  float t = clamp( kelvin, 1200.0, 40000.0 ) / 100.0;
  float r, g, b;
  if ( t <= 66.0 ) r = 1.0;
  else r = clamp( 1.29293619 * pow( t - 60.0, -0.13320476 ), 0.0, 1.0 );
  if ( t <= 66.0 ) g = clamp( 0.39008158 * log( t ) - 0.63184144, 0.0, 1.0 );
  else g = clamp( 1.12989086 * pow( t - 60.0, -0.07551485 ), 0.0, 1.0 );
  if ( t >= 66.0 ) b = 1.0;
  else if ( t <= 19.0 ) b = 0.0;
  else b = clamp( 0.54320679 * log( t - 10.0 ) - 1.19625409, 0.0, 1.0 );
  vec3 c = pow( vec3( r, g, b ), vec3( 2.2 ) );
  return c / max( 1e-4, dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) );
}

/** Kasten-Young relative airmass. 1 overhead, ~38 at the horizon. */
float skAirmass( float cosZenith ) {
  float z = degrees( acos( clamp( cosZenith, -1.0, 1.0 ) ) );
  return 1.0 / ( max( cosZenith, 0.0 ) + 0.50572 * pow( max( 0.0, 96.07995 - z ), -1.6364 ) );
}

/**
 * One star per grid cell of a 3D lattice sampled on the unit sphere. Because
 * |dir * N| == N exactly, only one radial shell of cells is ever visited, so a
 * single hash gives a stable star per direction with no neighbour search.
 */
vec3 skStarLayer( vec3 dir, float N, float keep, float gain, float seed,
                  float sigma, float twinkle, float band ) {
  vec3 cell = floor( dir * N ) + seed;
  vec3 h = skHash33( cell );
  float exist = step( 1.0 - keep, h.x );
  if ( exist < 0.5 ) return vec3( 0.0 );

  vec3 h2 = skHash33( cell + 91.7 );
  vec3 starDir = normalize( floor( dir * N ) + 0.5 + ( h2 - 0.5 ) * 0.94 );

  // sin(separation) — cheaper and better conditioned than acos near zero.
  float d = length( cross( dir, starDir ) );

  // Magnitude power law: most cells hold something you would never notice.
  float mag = pow( h.y, 5.5 );
  float flux = gain * ( mag + 0.0016 ) * ( 1.0 + band * 1.4 );

  // Core plus a faint diffraction skirt; the skirt is what makes the bright
  // ones read as stars rather than as dead pixels once bloom gets to them.
  float core = exp( -( d * d ) / ( sigma * sigma ) );
  float skirt = 0.055 * exp( -d / ( sigma * 3.4 ) );

  float tw = 1.0 + twinkle * ( sin( uStarParams.z * ( 7.0 + 19.0 * h.z ) + h2.x * 43.0 )
                             + 0.6 * sin( uStarParams.z * ( 23.0 + 31.0 * h2.y ) ) );
  float kelvin = mix( 2600.0, 22000.0, pow( h2.z, 1.9 ) );
  // Normalised blackbody, pulled back toward white — see SK_STAR_TINT.
  vec3 tint = mix( vec3( 1.0 ), skBlackbody( kelvin ), SK_STAR_TINT );
  return tint * ( flux * ( core + skirt ) * max( 0.0, tw ) );
}

/** Galactic plane: pole and centre direction, in the equatorial frame. */
const vec3 SK_GAL_POLE = vec3( -0.4288, 0.7146, 0.5522 );
const vec3 SK_GAL_CORE = vec3( 0.7549, -0.2154, -0.6194 );

vec3 skMilkyWay( vec3 eq, float gain, int oct ) {
  float lat = dot( eq, SK_GAL_POLE );
  // Two nested bands: a tight bright spine inside a broad halo.
  float spine = exp( -pow( abs( lat ) / 0.048, 1.55 ) );
  float halo = exp( -pow( abs( lat ) / 0.165, 1.30 ) );
  float band = clamp( 0.78 * spine + 0.48 * halo, 0.0, 1.4 );
  if ( band < 0.002 ) return vec3( 0.0 );

  float toCore = dot( eq, SK_GAL_CORE );
  float bulge = exp( -pow( max( 0.0, 1.0 - toCore ) / 0.22, 1.1 ) );

  vec3 q = eq * 9.0;
  float clumps = skFbm3( q, oct );
  // Dust lanes: a second, sharper field subtracted, biased to the spine.
  float dust = skFbm3( eq * 21.0 + 3.7, max( 2, oct - 1 ) );
  float lane = smoothstep( 0.36, 0.68, dust ) * spine;

  // High clump contrast is what separates a galaxy from a painted stripe: the
  // real band is mostly gaps, with a few very bright knots of unresolved stars.
  float density = band * ( 0.20 + 1.35 * clumps * clumps ) * ( 1.0 - 0.80 * lane );
  density *= 1.0 + 2.6 * bulge;

  // Warm toward the obscured core, cool blue-white in the outer arms.
  vec3 tint = mix( vec3( 0.72, 0.80, 1.06 ), vec3( 1.10, 0.86, 0.62 ), bulge * 0.85 );
  return tint * ( density * gain );
}

/**
 * Full night sky in scene radiance units.
 * dir is a world-space direction; uCelestial takes it to the fixed sky.
 */
vec3 skNightSky( vec3 dir, int mwOctaves, bool points ) {
  vec3 eq = uCelestial * dir;
  float am = skAirmass( dir.y );
  // Extinction ~0.16 mag/airmass in V, plus the horizon murk of a real city.
  float ext = exp( -0.145 * am ) * smoothstep( -0.03, 0.10, dir.y );

  float mw = clamp( dot( eq, SK_GAL_POLE ), -1.0, 1.0 );
  float band = exp( -pow( abs( mw ) / 0.16, 1.4 ) );

  vec3 col = skMilkyWay( eq, uStarParams.w, mwOctaves );

  if ( points ) {
    float tw = uStarParams.y * clamp( ( am - 1.0 ) * 0.16, 0.0, 0.85 );
    // sigma is the Gaussian core radius in radians. At a 75-degree vertical fov
    // over 1080 lines one pixel is 1.2e-3 rad, so anything under that lands
    // inside a single pixel — and a single bright pixel is a stuck pixel, not a
    // star. Every layer is now at least a pixel and a half across, which is also
    // what lets TAA and the bloom prefilter treat it as image content instead of
    // as a firefly to clamp away.
    col += skStarLayer( eq, 21.0, 0.30, 1.00, 0.0, 0.00165, tw, band );
    col += skStarLayer( eq, 43.0, 0.20, 0.34, 13.0, 0.00145, tw, band );
    col += skStarLayer( eq, 87.0, 0.10, 0.11, 47.0, 0.00125, tw * 0.5, band * 2.2 );
  }

  // Airglow: real, faint, and greenish — it keeps the "empty" sky off zero.
  col += vec3( 0.55, 1.0, 0.78 ) * 0.00030;

  return col * ( uStarParams.x * ext );
}

#endif
`;
