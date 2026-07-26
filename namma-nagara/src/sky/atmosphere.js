/**
 * Physical atmosphere model.
 *
 * This is Bruneton's scattering integral evaluated the way Hillaire 2020
 * ("A Scalable and Production Ready Sky and Atmosphere Rendering Technique")
 * does it: three small LUTs instead of a per-pixel double raymarch.
 *
 *   transmittance   256 x 64   T(altitude, cos zenith)      baked once
 *   multiscatter     32 x 32   psi_ms(altitude, cos zenith) baked once
 *   sky-view        384 x 192  L(azimuth, altitude)         rebaked when the sun moves
 *
 * Media, in Hillaire's units (lengths in megametres, coefficients in Mm^-1):
 *   Rayleigh   exponential, scale height 8 km,   sigma_s = (5.802, 13.558, 33.1)
 *   Mie        exponential, scale height 1.2 km, sigma_s = 3.996, sigma_a = 4.40
 *   Ozone      tent centred at 25 km,            sigma_a = (0.650, 1.881, 0.085)
 *
 * The ozone layer is not a nicety: it is what removes the green from the deep
 * zenith blue and what turns the twilight band violet instead of brown.
 *
 * ---------------------------------------------------------------------------
 * PHOTOMETRIC SCALE — read this before changing a number anywhere in src/sky/
 * ---------------------------------------------------------------------------
 * The renderer's fallback sun is intensity 4.3 and its fallback sky env peaks
 * around 0.34, so the engine's working unit is roughly "25 klx". We adopt that
 * exactly, because every other subsystem has been tuned against it:
 *
 *     1 light intensity unit      =  SCENE_LUX (25000) lux
 *     1 framebuffer radiance unit =  SCENE_LUX cd/m^2
 *
 * Derive the second from the first and do not guess at it, because a factor of
 * pi here is 1.65 stops of sky. three's Lambert BRDF carries the 1/pi: a white
 * surface facing a light of intensity I writes b = I/pi into the buffer, while
 * its physical radiance is L = (I * SCENE_LUX) / pi cd/m^2. Therefore
 * L = b * SCENE_LUX, and a scattering integral that already evaluates a
 * *radiance* — which sigma_s * P(theta) * E is, once E is expressed in scene
 * light units — is written to the buffer as-is. It must NOT be multiplied by pi
 * on the way out.
 *
 * That multiplication used to be here, and it is exactly why every daylight
 * shot read as milk: the sky came out 1.65 stops hotter than the surfaces it was
 * lighting, so a sunlit stucco wall was *darker* than the sky behind it, the
 * cumulus deck was darker than the gap between the clouds, and the AgX shoulder
 * dumped what was left of the hue. The cloud decks and the ground bounce divide
 * their irradiance by pi to reach the same convention.
 *
 * Consequences, all of which fall out of the model rather than being dialled in:
 *   extraterrestrial solar illuminance 128 klx -> 5.12 units
 *   noon sun after atmospheric extinction      -> ~3.9 units   (matches 4.3)
 *   clear zenith sky ~1500 cd/m^2              -> ~0.06 radiance units
 *   sunlit stucco (albedo 0.4, 45 deg)         -> ~0.32 radiance units
 *   whole-sky diffuse illuminance              -> ~15% of the sun
 */

export const SCENE_LUX = 25000;

/** Extraterrestrial solar illuminance, in scene light units. */
export const SUN_ILLUMINANCE_TOP = 128000 / SCENE_LUX; // 5.12

/**
 * Moonlight, in scene light units. A real full moon is 0.27 lux — 1e-5 units —
 * which is four stops below anything a display can show alongside a muzzle
 * flash. Every shipped game renders "day for night" instead; this is that
 * decision, made once, in one place, rather than smeared across the shaders.
 * 0.30, not 0.115. The street this lights has twenty-two sodium lamps in it at
 * intensity 14, and at 0.115 the moon delivered 0.037 — so every surface in the
 * night frame took its colour from the practicals and the frame came out warm
 * from edge to edge with a deep blue sky over it and no cool content anywhere
 * in the world below. Night reads as night when the AMBIENT is cool and the
 * lamps are warm POOLS inside it; that is a ratio, and this is the side of the
 * ratio the sky owns.
 * Ratios *within* the night (moon disc : moonlit sky : moonlit ground) stay
 * physical, so the frame still behaves like a photograph of a moonlit street.
 */
export const MOON_ILLUMINANCE_NIGHT = 0.30;

export const ATMO = {
  groundRadiusMM: 6.36,
  atmosphereRadiusMM: 6.46,
  /** Viewer altitude. 200 m puts us above the thickest aerosol, like a city. */
  viewAltitudeMM: 0.0002,
  rayleigh: [5.802, 13.558, 33.1],
  rayleighScaleHeightKM: 8.0,
  mieScattering: 3.996,
  mieAbsorption: 4.4,
  mieScaleHeightKM: 1.2,
  ozone: [0.65, 1.881, 0.085],
  ozoneCentreKM: 25.0,
  ozoneWidthKM: 15.0,
  groundAlbedo: 0.24,
};

// ---------------------------------------------------------------------------
//  GLSL
// ---------------------------------------------------------------------------

/**
 * Format a JS number as a GLSL float *literal*.
 *
 * `${8.0}` stringifies to "8", which GLSL ES 3.00 types as an int — and
 * `float / int` is a compile error, not an implicit conversion. Every number
 * interpolated into a shader in this subsystem goes through here.
 */
export const f = (n) => (Number.isInteger(n) ? Number(n).toFixed(1) : String(Number(n)));

/** Constants, media sampling, sphere intersection, phase functions. */
export const ATMOSPHERE_GLSL = /* glsl */ `
#ifndef SKY_ATMOSPHERE
#define SKY_ATMOSPHERE

const float SK_PI = 3.141592653589793;
const float SK_GROUND_R = ${f(ATMO.groundRadiusMM)};
const float SK_TOP_R = ${f(ATMO.atmosphereRadiusMM)};
const vec3  SK_RAYLEIGH = vec3( ${f(ATMO.rayleigh[0])}, ${f(ATMO.rayleigh[1])}, ${f(ATMO.rayleigh[2])} );
const float SK_MIE_S = ${f(ATMO.mieScattering)};
const float SK_MIE_A = ${f(ATMO.mieAbsorption)};
const vec3  SK_OZONE = vec3( ${f(ATMO.ozone[0])}, ${f(ATMO.ozone[1])}, ${f(ATMO.ozone[2])} );
const float SK_GROUND_ALBEDO = ${f(ATMO.groundAlbedo)};
const float SK_ISO_PHASE = 0.07957747154594767; // 1/(4pi)

/** Aerosol multiplier — clear day 1.0, hazy 3+. Baked into every LUT. */
uniform float uMieScale;
/** vec3( 0, groundRadius + viewAltitude, 0 ) */
uniform vec3 uViewPos;

float skSafeAcos( float x ) { return acos( clamp( x, -1.0, 1.0 ) ); }

/** Nearest positive hit of a ray against a sphere centred on the origin. */
float skRaySphere( vec3 ro, vec3 rd, float rad ) {
  float b = dot( ro, rd );
  float c = dot( ro, ro ) - rad * rad;
  if ( c > 0.0 && b > 0.0 ) return -1.0;
  float d = b * b - c;
  if ( d < 0.0 ) return -1.0;
  if ( d > b * b ) return ( -b + sqrt( d ) );
  return -b - sqrt( d );
}

void skMedium( vec3 pos, out vec3 rayleighS, out float mieS, out vec3 extinction ) {
  float altKM = ( length( pos ) - SK_GROUND_R ) * 1000.0;
  float rDen = exp( -altKM / ${f(ATMO.rayleighScaleHeightKM)} );
  float mDen = exp( -altKM / ${f(ATMO.mieScaleHeightKM)} );
  rayleighS = SK_RAYLEIGH * rDen;
  mieS = SK_MIE_S * uMieScale * mDen;
  float mieA = SK_MIE_A * uMieScale * mDen;
  vec3 ozone = SK_OZONE * max( 0.0,
    1.0 - abs( altKM - ${f(ATMO.ozoneCentreKM)} ) / ${f(ATMO.ozoneWidthKM)} );
  extinction = rayleighS + vec3( mieS + mieA ) + ozone;
}

/** Cornette-Shanks, the well-behaved cousin of Henyey-Greenstein. */
float skMiePhase( float cosTheta ) {
  const float g = 0.8;
  const float k = 3.0 / ( 8.0 * SK_PI ) * ( 1.0 - g * g ) / ( 2.0 + g * g );
  return k * ( 1.0 + cosTheta * cosTheta ) / pow( 1.0 + g * g - 2.0 * g * cosTheta, 1.5 );
}

float skRayleighPhase( float cosTheta ) {
  return 3.0 / ( 16.0 * SK_PI ) * ( 1.0 + cosTheta * cosTheta );
}

/** Henyey-Greenstein — used by the ground fog, exposed here so both agree. */
float skHG( float cosTheta, float g ) {
  float g2 = g * g;
  float d = max( 1e-4, 1.0 + g2 - 2.0 * g * cosTheta );
  return ( 1.0 - g2 ) / ( 4.0 * SK_PI * d * sqrt( d ) );
}

#endif
`;

/** Transmittance LUT lookup. Shared parameterisation with the bake. */
export const TRANSMITTANCE_LOOKUP_GLSL = /* glsl */ `
#ifndef SKY_TLUT
#define SKY_TLUT
uniform sampler2D uTransmittanceLut;

vec2 skLutUv( vec3 pos, vec3 dir ) {
  float h = length( pos );
  float mu = dot( dir, pos / h );
  return vec2(
    clamp( 0.5 + 0.5 * mu, 0.0, 1.0 ),
    clamp( ( h - SK_GROUND_R ) / ( SK_TOP_R - SK_GROUND_R ), 0.0, 1.0 ) );
}

/** Transmittance from pos along dir out to the top of the atmosphere. */
vec3 skTransmittance( vec3 pos, vec3 dir ) {
  return texture( uTransmittanceLut, skLutUv( pos, dir ) ).rgb;
}
#endif
`;

export const MULTISCATTER_LOOKUP_GLSL = /* glsl */ `
#ifndef SKY_MSLUT
#define SKY_MSLUT
uniform sampler2D uMultiScatterLut;
vec3 skMultiScatter( vec3 pos, vec3 lightDir ) {
  return texture( uMultiScatterLut, skLutUv( pos, lightDir ) ).rgb;
}
#endif
`;

/**
 * Single + multiple scattering along a view ray, for two light sources at once
 * (sun and moon). Sharing the loop means the moon costs two LUT taps per step
 * rather than a second raymarch, which is what makes a physically lit night sky
 * affordable at all.
 *
 * Returns radiance in scene units, already multiplied by the light irradiances.
 * The direct solar/lunar disc is deliberately excluded — the dome adds it with
 * limb darkening at full screen resolution instead of at LUT resolution.
 */
export const SCATTER_GLSL = /* glsl */ `
#ifndef SKY_SCATTER
#define SKY_SCATTER
vec3 skRaymarchSky(
    vec3 pos, vec3 rayDir,
    vec3 sunDir, vec3 sunIrr,
    vec3 moonDir, vec3 moonIrr,
    float steps ) {

  float topT = skRaySphere( pos, rayDir, SK_TOP_R );
  float groundT = skRaySphere( pos, rayDir, SK_GROUND_R );
  float tMax = groundT < 0.0 ? topT : groundT;
  if ( tMax <= 0.0 ) return vec3( 0.0 );

  float cS = dot( rayDir, sunDir );
  float cM = dot( rayDir, moonDir );
  float mieS = skMiePhase( cS ), rayS = skRayleighPhase( cS );
  float mieM = skMiePhase( cM ), rayM = skRayleighPhase( cM );

  vec3 lum = vec3( 0.0 );
  vec3 trans = vec3( 1.0 );
  float t = 0.0;

  for ( float i = 0.0; i < steps; i += 1.0 ) {
    // 0.3 rather than 0.5 biases samples toward the dense lower atmosphere,
    // which is where all the interesting colour is.
    float nt = ( ( i + 0.3 ) / steps ) * tMax;
    float dt = nt - t;
    t = nt;
    vec3 p = pos + t * rayDir;

    vec3 rs; float ms; vec3 ext;
    skMedium( p, rs, ms, ext );
    vec3 sampleT = exp( -dt * ext );

    vec3 tSun = skTransmittance( p, sunDir );
    vec3 psiSun = skMultiScatter( p, sunDir );
    vec3 inScatter = ( rs * ( rayS * tSun + psiSun ) + ms * ( mieS * tSun + psiSun ) ) * sunIrr;

    vec3 tMoon = skTransmittance( p, moonDir );
    vec3 psiMoon = skMultiScatter( p, moonDir );
    inScatter += ( rs * ( rayM * tMoon + psiMoon ) + ms * ( mieM * tMoon + psiMoon ) ) * moonIrr;

    // Analytic integration of the segment (Hillaire eq. 8): exact for constant
    // media over dt, and unlike a midpoint sum it never overshoots when the
    // optical depth of a step is large.
    lum += trans * ( inScatter - inScatter * sampleT ) / max( ext, vec3( 1e-8 ) );
    trans *= sampleT;
  }
  // No pi here. The integral above is sigma_s * P(theta) * E with E in scene
  // light units, which *is* a radiance in the buffer's own convention (see the
  // photometric note at the top of this file). Multiplying by pi puts the sky
  // 1.65 stops above the surfaces it lights, which is what made every exterior
  // read as white milk with clouds darker than the sky behind them.
  return lum;
}
#endif
`;

// ---------------------------------------------------------------------------
//  CPU side — the same model, for the sun/moon DirectionalLight colours
// ---------------------------------------------------------------------------

function mediumJs(altKM, mieScale, out) {
  const rDen = Math.exp(-altKM / ATMO.rayleighScaleHeightKM);
  const mDen = Math.exp(-altKM / ATMO.mieScaleHeightKM);
  const mie = (ATMO.mieScattering + ATMO.mieAbsorption) * mieScale * mDen;
  const oz = Math.max(0, 1 - Math.abs(altKM - ATMO.ozoneCentreKM) / ATMO.ozoneWidthKM);
  out[0] = ATMO.rayleigh[0] * rDen + mie + ATMO.ozone[0] * oz;
  out[1] = ATMO.rayleigh[1] * rDen + mie + ATMO.ozone[1] * oz;
  out[2] = ATMO.rayleigh[2] * rDen + mie + ATMO.ozone[2] * oz;
  return out;
}

const _ext = [0, 0, 0];

/**
 * Per-channel transmittance from the viewer to space along a direction whose
 * cosine with the local zenith is `mu`. Same integral as the GPU LUT bake, so
 * the sun's DirectionalLight colour and the sky it hangs in cannot disagree.
 * Runs ~48 steps; called only when the sun actually moves.
 */
export function transmittanceToSpace(mu, mieScale = 1, out = [0, 0, 0]) {
  const R = ATMO.groundRadiusMM + ATMO.viewAltitudeMM;
  const top = ATMO.atmosphereRadiusMM;
  // Ray from (0,R,0) with vertical component mu. Path length to the top shell.
  const disc = R * R * mu * mu - R * R + top * top;
  if (disc <= 0) {
    out[0] = out[1] = out[2] = 0;
    return out;
  }
  const tTop = -R * mu + Math.sqrt(disc);
  // Below the horizon the ground blocks us entirely.
  const gDisc = R * R * mu * mu - R * R + ATMO.groundRadiusMM * ATMO.groundRadiusMM;
  if (mu < 0 && gDisc > 0) {
    out[0] = out[1] = out[2] = 0;
    return out;
  }
  const N = 48;
  const dt = tTop / N;
  let od0 = 0;
  let od1 = 0;
  let od2 = 0;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * dt;
    // |(0,R,0) + t*dir| with dir.y = mu
    const h = Math.sqrt(R * R + t * t + 2 * R * t * mu);
    const altKM = (h - ATMO.groundRadiusMM) * 1000;
    mediumJs(Math.max(0, altKM), mieScale, _ext);
    od0 += _ext[0] * dt;
    od1 += _ext[1] * dt;
    od2 += _ext[2] * dt;
  }
  out[0] = Math.exp(-od0);
  out[1] = Math.exp(-od1);
  out[2] = Math.exp(-od2);
  return out;
}

/** Rec.709 luminance — used to split transmittance into colour + intensity. */
export function luminance(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
