/**
 * Two procedural cloud decks on the sky shell.
 *
 *   cumulus  1.5 km   coverage-eroded fbm with a fake vertical extent produced
 *                     by parallax-shifting the sample along the view ray, so the
 *                     deck has billows and a silhouette instead of reading as a
 *                     printed pattern. Self-shadowed with three taps toward the
 *                     sun, powder-darkened bases, silver rims from a forward
 *                     Henyey-Greenstein lobe.
 *   cirrus   7.8 km   two decorrelated families of ridged fbm, each stretched
 *                     3.5:1 (not 9:1) about its own bearing, each bearing 75
 *                     degrees from the other and wandering +-0.55 rad under a
 *                     field that turns every four to six kilometres, each cut
 *                     into 1.5 km fallstreaks by an along-fibre amplitude
 *                     modulation, each gated by its own kilometre-scale patch
 *                     mask so the layer arrives in fronts with clean blue between
 *                     them. Optically thin, almost all forward scatter — the
 *                     layer that turns a sunset pink. Read skCirrusBand below
 *                     before changing any of those numbers: every one of them is
 *                     load bearing against the starburst.
 *
 * Both are intersected against the planet shell rather than a flat plane, and
 * both fade out with the *distance* to that intersection. That fade is not
 * decoration. A deck seen at a grazing angle is fifty kilometres away, and if
 * you do not bleed it into the aerial haze it collapses into a hard grey wall
 * pasted along the horizon, or — for cirrus, whose streaks are parallel in
 * world space — into a starburst converging on a vanishing point. Both are
 * immediate tells.
 *
 * The low-frequency coverage field skCloudMacro is four analytic waves rather
 * than noise, for one specific reason: it has to be evaluated identically on
 * the CPU (see cloudMacro below) so the sun's cloud-occlusion factor — the
 * slow dimming as a cloud crosses the sun — matches the cloud the shader is
 * actually drawing. Correlated, not faked.
 *
 * Radiance convention: sunLow/sunHigh arrive as *irradiance* in scene light
 * units, so every direct term is divided by pi to become framebuffer radiance.
 * See the long note at the end of skRaymarchSky in atmosphere.js.
 */
export const CLOUDS_GLSL = /* glsl */ `
#ifndef SKY_CLOUDS
#define SKY_CLOUDS

// x coverage, y density, z detail gain, w time (seconds)
uniform vec4 uCloudParams;
// x cirrus coverage, y cirrus opacity, z wind x (km/s), w wind z (km/s)
uniform vec4 uCloudParams2;

const float SK_CUMULUS_KM = 1.5;
const float SK_CIRRUS_KM = 7.8;

/** Weather-scale coverage, in kilometres. Mirrored exactly on the CPU. */
float skCloudMacro( vec2 p ) {
  float a = sin( p.x * 0.412 + 0.7 ) * cos( p.y * 0.331 - 0.4 );
  float b = sin( p.x * 0.173 - p.y * 0.209 + 1.9 );
  float c = cos( p.x * 0.0871 + p.y * 0.1123 - 0.6 );
  return clamp( 0.5 + 0.5 * ( 0.42 * a + 0.36 * b + 0.30 * c ), 0.0, 1.0 );
}

/**
 * Ridged noise with a *parabolic* crest instead of an absolute-value one.
 *
 * skRidge2 in noise.js builds its ridge as 1 - |2v-1|, which has a crease at the
 * crest: the derivative flips sign discontinuously, so any threshold applied to
 * it produces a hairline. On the cumulus silhouette that crease is what makes the
 * cauliflower edge, and it is right there. On an anisotropic field stretched
 * across the sky it is a pen stroke, and a sky full of pen strokes was the second
 * half of the cirrus problem — the first was where they pointed.
 *
 * 1 - (2v-1)^2 has the same crest lines and the same statistics but is C1 across
 * them, so a fibre has a soft shoulder and a body several pixels wide. Two
 * octaves only: the third would land near the pixel footprint again.
 */
float skSmoothRidge2( vec2 p, int oct ) {
  float a = 0.62, s = 0.0, n = 0.0;
  for ( int i = 0; i < oct; i ++ ) {
    float v = skVal2( p ) * 2.0 - 1.0;
    s += a * ( 1.0 - v * v );
    n += a;
    p = SK_ROT * p * 2.17 + 3.71;
    a *= 0.45;
  }
  return s / max( n, 1e-4 );
}

/**
 * One family of cirrus, p in kilometres on the deck.
 *
 * WHY THIS IS SHAPED THE WAY IT IS — the starburst, and its two successors.
 *
 * The deck is sampled where the view ray meets a shell 7.8 km up, so the map from
 * screen space to p is a projection whose derivative grows without bound as the
 * ray flattens toward that shell. Three separate artefacts came out of that, and
 * each one had to be answered by a different part of this function:
 *
 *  1  STARBURST. A field with a locally constant direction is a family of
 *     parallel lines, and parallel lines on a plane converge on a vanishing
 *     point. With one rotation field at one turn per 80 km the direction was
 *     effectively constant across a 90-degree frame, so every fibre pointed at
 *     the same spot just above the top of the hero framing.
 *  2  FINGERPRINT. Rotating the anisotropy frame by a full +-1.45 rad instead
 *     removes the vanishing point and replaces it with something worse: the
 *     direction field winds all the way round its own critical points, so the
 *     fibres close into concentric whorls and the sky reads as wood grain.
 *  3  BRUSH STROKES. Even a bounded wander leaves the *silhouette* of the layer
 *     defined by a level set of a ridged field, and a level set is a continuous
 *     curve that runs through as many cells as it likes. That is why raising the
 *     noise frequency only ever made the strokes thinner, never shorter.
 *
 * The answer to all three is to stop letting the anisotropic field decide *where
 * there is cloud*. What survives here is:
 *
 *   silhouette   an isotropic warped fbm, thresholded — the same construction as
 *                the cumulus deck, so it reads as cloud and cannot smear, streak
 *                or whorl no matter how the projection stretches it;
 *   fibre        an anisotropic smooth-ridge field that only *modulates* that
 *                silhouette between 0.35 and 1.2 of its density. Cirrus texture
 *                is a brightness variation inside the patch, which is what it is
 *                in a photograph too;
 *   bearing      per family, +-0.55 rad of wander, and the two families in
 *                skClouds sit 75 degrees apart so no single direction owns the
 *                frame;
 *   fronts       a patch mask at ~8 km, so the layer arrives in bands with clean
 *                blue between them rather than as an even glaze.
 */
float skCirrusBand( vec2 p, float cov, float seed, float base,
                    float rotKmInv, float lenKM, float aniso, int oct ) {
  // ---- silhouette: isotropic, so it can never streak --------------------
  vec2 w = vec2( skVal2( p * 0.30 + seed ), skVal2( p * 0.30 + seed + 11.7 ) ) - 0.5;
  float n = skFbm2( p * 0.78 + w * 1.3, oct + 1 );
  float d = smoothstep( 1.0 - cov * 1.65, 1.0 - cov * 0.60, n );
  if ( d <= 0.001 ) return 0.0;

  // ---- fronts ------------------------------------------------------------
  d *= smoothstep( 0.36, 0.66, skVal2( p * 0.12 + seed * 0.5 ) );
  if ( d <= 0.001 ) return 0.0;

  // ---- fibre texture inside the patch ------------------------------------
  float ang = base + ( skVal2( p * rotKmInv + seed ) - 0.5 ) * 1.1;
  float ca = cos( ang ), sa = sin( ang );
  vec2 pr = vec2( p.x * ca - p.y * sa, p.x * sa + p.y * ca );
  float fa = 1.0 / max( 0.4, lenKM );
  vec2 q = vec2( pr.x * fa, pr.y * fa * aniso );
  float f = skSmoothRidge2( q + vec2( seed ), oct );
  // Never zeroes the patch and never doubles it: the fibres are a texture on the
  // cloud, not the cloud. The mean is close to 1 so coverage stays where the
  // threshold above put it.
  return d * ( 0.35 + 1.05 * f );
}

/** Cumulus optical thickness at a point on the deck, p in kilometres. */
float skCumulusDensity( vec2 p, int oct ) {
  float macro = skCloudMacro( p * 0.22 );
  float cov = clamp( uCloudParams.x * ( 0.34 + 1.30 * macro ), 0.0, 1.0 );

  // Domain warp before the shape fbm. Straight fbm gives evenly sized blobs;
  // warping it stretches some and pinches others, which is what makes a cloud
  // field read as weather rather than as noise.
  vec2 w = vec2( skVal2( p * 0.42 ), skVal2( p * 0.42 + 19.7 ) ) - 0.5;
  float n = skFbm2( p * 1.25 + w * 1.6, oct );

  // Erode from below: coverage sets the threshold, the remainder is thickness.
  float d = smoothstep( 1.0 - cov, 1.0 - cov * 0.34 + 0.05, n );

  // Cauliflower the edges with a higher-frequency ridge, so the silhouette is
  // not just a smooth level set of the base noise.
  if ( d > 0.0 && d < 0.94 && oct > 3 ) {
    float e = skRidge2( p * 5.3 + w * 2.0, 3 );
    d = clamp( d - ( 1.0 - d ) * ( 0.50 - 0.50 * e ), 0.0, 1.0 );
  }
  return d;
}

/**
 * Fraction of sunlight reaching a point on the cumulus deck. Marched along the
 * sun's horizontal projection; the low-sun path through the slab is longer,
 * which is why sunset clouds go dark grey underneath and blaze at the top.
 */
float skCumulusLight( vec2 p, vec3 lightDir, int oct ) {
  vec2 step2 = normalize( lightDir.xz + vec2( 1e-4 ) ) * ( 0.20 / max( 0.12, abs( lightDir.y ) ) );
  float tau = 0.0;
  tau += skCumulusDensity( p + step2 * 1.0, oct ) * 1.0;
  tau += skCumulusDensity( p + step2 * 2.4, oct ) * 0.7;
  tau += skCumulusDensity( p + step2 * 4.6, oct ) * 0.4;
  return exp( -tau * uCloudParams.y * 2.1 );
}

/**
 * Composite both decks for a view ray.
 * Returns rgb = radiance, a = coverage (0 lets the sky through untouched).
 *
 * sunLow/sunHigh are the solar irradiance already extinguished down to each
 * deck's own altitude, so the two layers are lit by genuinely different spectra.
 */
vec4 skClouds( vec3 rayDir,
               vec3 sunDir, vec3 sunLow, vec3 sunHigh,
               vec3 moonDir, vec3 moonLow, vec3 moonHigh,
               vec3 ambient, int quality ) {

  if ( rayDir.y < -0.008 ) return vec4( 0.0 );

  int octD = quality > 0 ? 6 : 3;
  int octL = quality > 0 ? 4 : 2;
  // Cirrus gets two octaves where the cumulus gets six, and that is not a
  // performance decision. This deck is twenty kilometres away, where one screen
  // pixel covers thirty metres of it; an octave finer than that is pure aliasing,
  // and aliasing on an anisotropic field is precisely what a hairline smear is.
  int octC = 2;
  float t = uCloudParams.w;
  vec2 wind = vec2( uCloudParams2.z, uCloudParams2.w ) * t;

  float cosSun = dot( rayDir, sunDir );
  float cosMoon = dot( rayDir, moonDir );

  // ---- cirrus, 7.8 km ----------------------------------------------------
  float tc = skRaySphere( uViewPos, rayDir, SK_GROUND_R + SK_CIRRUS_KM * 0.001 );
  vec4 cirrus = vec4( 0.0 );
  if ( tc > 0.0 ) {
    float distKM = tc * 1000.0;

    // Distance fade, and it is doing antialiasing as much as atmospherics.
    // Below ~15 degrees of elevation this shell is 30 km away or more, and the
    // derivative d(distance)/d(elevation) there is over 400 m per screen pixel —
    // several times the width of a fibre. Nothing sampled per-pixel can survive
    // that: the field aliases into hairline radial striations that all point at
    // the same place on screen, which is one half of what read as a starburst
    // (the other half was the field's own constant direction). Ending the layer
    // at 90 km rather than 260 km removes the entire undersampled band, and a
    // real cirrus deck does fade into the horizon haze at exactly that range.
    float fade = 1.0 - smoothstep( 22.0, 90.0, distKM );

    // Above ~35 degrees of elevation the same derivative blows up the other way:
    // a kilometre on the deck covers a large and rapidly changing solid angle, so
    // whatever the field does it smears radially through the zenith. Keep the
    // layer to a third of its opacity up there — high cirrus overhead is thin
    // anyway, and those smears were the loudest thing in the night frame.
    fade *= 1.0 - 0.66 * smoothstep( 0.55, 0.85, rayDir.y );

    if ( fade > 0.004 ) {
      vec2 p = ( uViewPos + rayDir * tc ).xz * 1000.0 + wind * 2.4;
      float cov = clamp( uCloudParams2.x, 0.0, 1.0 );

      // Two decorrelated families: different seeds, different patch masks,
      // different bearings (0.24 and 1.56 rad — 75 degrees apart), different
      // rotation frequencies (one turn per 7.4 km and per 10.2 km) and different
      // fibre scales. Each square of sky is dominated by one of them, which is how
      // a real cirrus front looks, but the *frame* always contains both — and two
      // families 75 degrees apart cannot share a vanishing point.
      float d1 = skCirrusBand( p, cov, 0.0, 0.24, 0.135, 1.5, 4.0, octC );
      float d2 = skCirrusBand( p + 137.4, cov * 0.92, 4.7, 1.56, 0.098, 2.0, 3.4, octC );
      float d = 1.0 - ( 1.0 - d1 ) * ( 1.0 - d2 * 0.85 );

      // Optically thin: even a solid-looking cirrus front only takes about two
      // thirds of the sky behind it.
      float a = clamp( d * uCloudParams2.y * fade, 0.0, 0.70 );

      // Optically thin: mostly forward scatter plus whatever the sky gives back.
      // Cirrus sit above most of the aerosol, so they keep far more blue than
      // the cumulus below them — which is exactly why a sunset goes pink up high
      // and orange-grey lower down.
      float fwd = skHG( cosSun, 0.74 ) * 3.2 + 0.60;
      vec3 col = ( sunHigh * fwd + moonHigh * ( skHG( cosMoon, 0.68 ) * 2.8 + 0.55 ) )
                 / SK_PI + ambient * 0.85;
      cirrus = vec4( col, a );
    }
  }

  // ---- cumulus, 1.5 km ---------------------------------------------------
  float tk = skRaySphere( uViewPos, rayDir, SK_GROUND_R + SK_CUMULUS_KM * 0.001 );
  vec4 cumulus = vec4( 0.0 );
  if ( tk > 0.0 ) {
    float distKM = tk * 1000.0;
    float fade = 1.0 - smoothstep( 14.0, 130.0, distKM );
    if ( fade > 0.004 ) {
      vec2 p0 = ( uViewPos + rayDir * tk ).xz * 1000.0 + wind;

      // Fake vertical extent. A cumulus is several hundred metres tall;
      // sampling a flat deck once gives a decal. So: probe the base, shift the
      // sample along the view ray by the height the cloud would have there, and
      // probe again. The result parallaxes — tops lean away from the camera,
      // bases toward it — which is what gives the silhouette any depth at all.
      float dBase = skCumulusDensity( p0, octD );
      vec2 shear = rayDir.xz * ( 0.85 * dBase / max( 0.10, rayDir.y ) );
      float d = max( skCumulusDensity( p0 + shear, octD ), dBase * 0.55 );

      if ( d > 0.003 ) {
        vec2 p = p0 + shear;
        float lit = skCumulusLight( p, sunDir, octL );
        float litM = skCumulusLight( p, moonDir, octL );

        // Grazing rays travel further through a deck — but only up to a point,
        // past which the deck is simply far away and the haze wins.
        float graze = clamp( 0.09 / ( abs( rayDir.y ) + 0.09 ), 0.0, 1.0 );
        float thick = d * uCloudParams.y * mix( 1.0, 1.7, graze );
        float a = clamp( 1.0 - exp( -thick * 3.4 ), 0.0, 1.0 ) * fade;

        // Powder (dark-edge) term. Note what it does and does not do: it is
        // small where the slab is optically thin, so it darkens the *thin lit
        // edge* relative to the deep lit core, which is the multiple-scattering
        // deficit a real cloud shows against the sun. It is NOT what darkens
        // bases — that is skCumulusLight above, whose sun path through the slab
        // is what puts the underside in shadow. At density 1.9 the top-to-base
        // spread inside a cloud body measures ~3.5 stops (it was the same spread
        // at 1.4, but on a deck so continuous that almost nothing in frame was a
        // lit top, which is why the shots read flat).
        float powder = 1.0 - exp( -thick * 5.5 );
        float rim = pow( clamp( 1.0 - d, 0.0, 1.0 ), 2.0 );

        float fwdS = skHG( cosSun, 0.62 ) * 4.0 + 0.62;
        float fwdM = skHG( cosMoon, 0.60 ) * 3.4 + 0.55;

        vec3 direct = sunLow * ( lit * ( 0.55 + 0.45 * powder ) * fwdS + rim * lit * 0.9 );
        direct += moonLow * ( litM * ( 0.55 + 0.45 * powder ) * fwdM + rim * litM * 0.9 );
        // Sky fills the shaded sides; the deck's own base steals some of it.
        vec3 fill = ambient * mix( 0.50, 1.5, clamp( d * 1.6, 0.0, 1.0 ) )
                            * ( 0.32 + 0.68 * lit );
        cumulus = vec4( direct / SK_PI + fill, a );
      }
    }
  }

  // Cumulus is below cirrus, so it goes on top from the ground's point of view.
  float outA = cirrus.a + cumulus.a * ( 1.0 - cirrus.a );
  vec3 outC = cirrus.rgb * cirrus.a + cumulus.rgb * cumulus.a * ( 1.0 - cirrus.a );
  if ( outA > 1e-5 ) outC /= outA;
  return vec4( outC, outA );
}

/**
 * Sunlight reaching the ground through the cumulus deck, for a world XZ point.
 * The volumetric fog uses this so shafts carry the cloud pattern; the sun's
 * DirectionalLight uses the CPU twin of skCloudMacro for the same reason.
 */
float skCloudShadow( vec2 worldXZ, vec3 sunDir ) {
  // Walk from the ground point up to the deck along the sun direction. sunDir
  // is unit, so the horizontal offset is just sunDir.xz scaled by the slope.
  vec2 p = worldXZ * 0.001 + sunDir.xz * ( SK_CUMULUS_KM / max( 0.10, sunDir.y ) )
           + vec2( uCloudParams2.z, uCloudParams2.w ) * uCloudParams.w;
  float d = skCumulusDensity( p, 4 );
  return exp( -d * uCloudParams.y * 2.4 );
}

#endif
`;

/**
 * CPU twin of skCloudMacro. Identical expression, so the sun-occlusion factor
 * the DirectionalLight uses is the same field the shader draws. float32 vs
 * float64 differ in the last few bits; nothing here is sensitive to that.
 */
export function cloudMacro(x, y) {
  const a = Math.sin(x * 0.412 + 0.7) * Math.cos(y * 0.331 - 0.4);
  const b = Math.sin(x * 0.173 - y * 0.209 + 1.9);
  const c = Math.cos(x * 0.0871 + y * 0.1123 - 0.6);
  return Math.min(1, Math.max(0, 0.5 + 0.5 * (0.42 * a + 0.36 * b + 0.3 * c)));
}

/**
 * Approximate fraction of direct sunlight surviving the cumulus deck above a
 * world point. Uses the macro field only: the fbm detail modulates *within* a
 * cloud, but whether the sun is behind a cloud at all is a weather-scale
 * question, which is exactly what the macro field answers.
 */
export function cloudSunOcclusion(worldX, worldZ, sunDir, params) {
  const h = 1.5;
  const k = h / Math.max(0.1, sunDir.y);
  const px = worldX * 0.001 + sunDir.x * k + params.windX * params.time;
  const pz = worldZ * 0.001 + sunDir.z * k + params.windZ * params.time;
  const macro = cloudMacro(px * 0.22, pz * 0.22);
  const cov = Math.min(1, Math.max(0, params.coverage * (0.34 + 1.3 * macro)));
  // Expected density for a coverage threshold applied to a [0,1] fbm.
  const d = Math.min(1, Math.max(0, (cov - 0.42) / 0.62));
  return Math.exp(-d * params.density * 1.55);
}
