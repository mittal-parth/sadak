import * as THREE from 'three';
import { SkyPass, hdrTarget } from './fullscreen.js';
import { ATMOSPHERE_GLSL } from './atmosphere.js';
import { NOISE_GLSL } from './noise.js';
import { CLOUDS_GLSL } from './clouds.js';

/**
 * Volumetric fog, light shafts and aerial perspective.
 *
 * Three steps, registered as one pass with the renderer:
 *
 *   1  march     half resolution, 24-56 exponentially distributed steps,
 *                interleaved-gradient dithered start offset, dual-lobe
 *                Henyey-Greenstein phase, shadowed by the renderer's cascade
 *                array *and* by the cumulus deck overhead
 *   2  resolve   temporal accumulation with velocity reprojection and a 3x3
 *                neighbourhood clamp — this is what turns 32 dithered samples
 *                into a clean shaft instead of a noise field
 *   3  composite full resolution: analytic per-channel transmittance from the
 *                closed-form exponential-height integral (so the haze on
 *                distant geometry is crisp and noise-free) plus a depth-aware
 *                bilateral upsample of the inscatter
 *
 * When `config.q.volumetrics` is off, step 1 and 2 are skipped and the
 * composite falls back to a fully analytic single-scattering approximation:
 * no shafts, but the aerial perspective is identical, so a low-end machine
 * still gets the correct distance falloff rather than a different-looking scene.
 *
 * SCATTERING vs EXTINCTION. These are separate uniforms and deliberately not
 * tied by a single-scattering albedo. Extinction is set by the visibility we
 * want down the street (that is what makes the far end desaturate correctly);
 * the inscatter gain is set by how readable the shafts need to be. Every
 * shipping engine's exponential height fog exposes exactly this pair, for
 * exactly this reason — a physically closed system either has invisible shafts
 * outdoors or milk at 200 m, and no single density gives both.
 */

const SHARED = /* glsl */ `
${ATMOSPHERE_GLSL}
${NOISE_GLSL}
${CLOUDS_GLSL}

uniform sampler2D uSkyAmbientLut;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform vec4 uFog;      // x sigmaS, y 1/heightScale, z baseY, w maxDistance
uniform vec4 uFog2;     // x sigmaE, y key boost, z ambient boost, w noise amount
uniform vec3 uFogExt;   // per-channel extinction, for the analytic transmittance
uniform vec4 uPhase;    // x g fwd, y g back, z back weight, w noise scale
uniform vec3 uKeyDir;
uniform vec3 uKeyIrr;
uniform vec3 uFogDrift;

/**
 * Colour of the haze, as a function of the angle to the key.
 *
 * A single ambient colour for the whole frame is what "grey fog at sunset" is:
 * one number cannot be both the amber the air takes on when you look into a low
 * sun and the blue it takes on when you look away from it, so it ends up neither
 * and every facade past 40 m converges on the same neutral value as the sky.
 *
 * The two texels of the ambient LUT are exactly the two ends of that axis — the
 * cosine-weighted whole-sky average (cool, Rayleigh dominated) and the horizon
 * band average (warm, aerosol dominated, and at 19h it *is* the sunset) — so the
 * split costs one extra tap and no new tuning. On top of that the forward lobe
 * carries the key's own transmitted spectrum, because the aerosol that produces
 * it is being lit by the beam, not by the sky. Result: distance separates by hue.
 */
vec3 skFogAmbient( float cosKey ) {
  vec3 cool = texture( uSkyAmbientLut, vec2( 0.25, 0.5 ) ).rgb;
  vec3 hor = texture( uSkyAmbientLut, vec2( 0.75, 0.5 ) ).rgb;
  vec3 keyHue = uKeyIrr / max( 1.0e-4, max( uKeyIrr.x, max( uKeyIrr.y, uKeyIrr.z ) ) );
  // Squared so the warm half is genuinely centred on the sun rather than
  // covering the whole sunward hemisphere.
  float f = 0.5 + 0.5 * clamp( cosKey, -1.0, 1.0 );
  vec3 warm = hor * mix( vec3( 1.0 ), keyHue, 0.55 ) * 1.3;
  return mix( cool, warm, f * f );
}

/** Dual-lobe HG: a forward peak for the shafts, a broad back lobe so the fog
 *  is still visible when the sun is behind you. Real aerosol does both. */
float skFogPhase( float cosTheta ) {
  return mix( skHG( cosTheta, uPhase.x ), skHG( cosTheta, uPhase.y ), uPhase.z );
}

/**
 * The shaft gain (uFog2.y) applied to the *anisotropic excess only*.
 *
 * Multiplying the whole phase function by 2.6 also multiplies its isotropic
 * floor, and that floor covers every pixel in the frame regardless of where the
 * sun is — so the knob that was supposed to make shafts readable was really a
 * 2.6x blue-grey veil over the whole image. Lifting only the part of the phase
 * function that rises above 1/4pi leaves the forward peak (where a shaft
 * actually is) within a percent of what it was, and drops the 90°-off-sun
 * inscatter that produces the veil by the full gain.
 *
 *   iso + ( p - iso ) * g   ==   p + max( 0, p - iso ) * ( g - 1 )
 *
 * written the second way because the first goes *negative* in the side lobes,
 * where this dual-lobe phase dips under 1/4pi.
 */
float skFogInscatterPhase( float cosTheta ) {
  const float iso = 1.0 / ( 4.0 * SK_PI );
  float p = skFogPhase( cosTheta );
  return p + max( 0.0, p - iso ) * ( uFog2.y - 1.0 );
}

/**
 * Near-field scattering ramp. Twelve metres of real air scatters nothing you
 * could measure: with sigmaS at 4.4e-3 the honest contribution of the first
 * 20 m was ~10% of a sunlit surface's radiance, laid flat over the near
 * geometry — a wash on the weapon, the hands and every wall inside arm's reach.
 * It exists because an exponential-height fog tuned for 200 m of street has to
 * start somewhere; ramping it in over the first few metres removes it without
 * touching the distance falloff that the tuning was for.
 */
float skFogNearRamp( float t ) {
  return smoothstep( 0.0, 12.0, t );
}

/** Normalised density: 1 at the fog base, exponential above, wind-torn. */
float skFogDensity( vec3 p ) {
  float h = exp( -( p.y - uFog.z ) * uFog.y );
  if ( uFog2.w <= 0.001 ) return h;
  vec3 q = p * uPhase.w + uFogDrift;
  float n = skVal3( q ) * 0.63 + skVal3( q * 2.71 + 5.1 ) * 0.37;
  return h * mix( 1.0, 0.30 + 1.55 * n, uFog2.w );
}

/**
 * Closed form of integral(0..t) exp(-(y-b)/H) ds along a ray. Exact, so the
 * transmittance applied to geometry is smooth at full resolution — none of the
 * banding you get from reusing a low-resolution marched alpha.
 */
float skHeightIntegral( float y0, float dy, float t ) {
  float d0 = exp( -( y0 - uFog.z ) * uFog.y );
  float x = dy * uFog.y * t;
  if ( abs( x ) < 1.0e-4 ) return d0 * t;
  return d0 * ( 1.0 - exp( -x ) ) / ( dy * uFog.y );
}

/** World ray through a uv, normalised onto the z = -1 plane before rotation. */
void skRayFor( vec2 uv, out vec3 dir, out float rayLen ) {
  vec4 h = uInvProj * vec4( uv * 2.0 - 1.0, 1.0, 1.0 );
  vec3 vd = h.xyz / h.w;
  vd /= max( 1.0e-6, -vd.z );
  vec3 w = mat3( uCamWorld ) * vd;
  rayLen = length( w );
  dir = w / rayLen;
}
`;

const CSM_GLSL = /* glsl */ `
uniform highp sampler2DArray owCsmMaps;
uniform mat4 owCsmMatrix[ OW_CASCADES ];
uniform vec4 owCsmSplit;
uniform vec4 owCsmRange;
uniform vec4 owCsmTexel;
uniform vec4 owCsmParams;
uniform vec2 owCsmMapSize;

vec2 skVogel( int i, int n, float phi ) {
  float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
  float theta = float( i ) * 2.39996323 + phi;
  return vec2( cos( theta ), sin( theta ) ) * r;
}

/**
 * Sun/moon visibility at a world point. Four Vogel taps: a volumetric sample is
 * already averaged along the ray and then temporally accumulated, so paying for
 * a full PCSS lookup per step would buy nothing.
 */
float skSunVisibility( vec3 wPos, float viewDepth, float rot ) {
  if ( owCsmParams.x <= 0.0 ) return 1.0;
  if ( viewDepth >= owCsmSplit[ OW_CASCADES - 1 ] ) return 1.0;

  int c = OW_CASCADES - 1;
  for ( int i = 0; i < OW_CASCADES; i ++ ) {
    if ( viewDepth < owCsmSplit[ i ] ) { c = i; break; }
  }

  vec4 sc = owCsmMatrix[ c ] * vec4( wPos, 1.0 );
  vec3 proj = sc.xyz / sc.w * 0.5 + 0.5;
  if ( proj.z >= 1.0 || proj.z <= 0.0 ) return 1.0;
  vec2 edge = min( proj.xy, 1.0 - proj.xy );
  if ( min( edge.x, edge.y ) <= 0.0 ) return 1.0;

  // No surface normal out here, so the bias is purely depth based; two texels
  // of the cascade's own range is enough to stop shafts self-shadowing.
  float recv = proj.z - ( owCsmTexel[ c ] * 2.2 ) / owCsmRange[ c ];
  float r = owCsmMapSize.y * 1.6;
  float s = 0.0;
  for ( int i = 0; i < 4; i ++ ) {
    vec2 o = skVogel( i, 4, rot * 6.2831853 ) * r;
    s += step( recv, texture( owCsmMaps, vec3( proj.xy + o, float( c ) ) ).r );
  }
  return mix( 1.0, s * 0.25, owCsmParams.x );
}
`;

const MARCH_FRAG = /* glsl */ `
precision highp float;
${SHARED}
${CSM_GLSL}
uniform sampler2D tDepth;
uniform float uFrame;
in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  vec3 dir;
  float rayLen;
  skRayFor( vUv, dir, rayLen );

  float depth = texture( tDepth, vUv ).r;
  bool sky = depth <= 0.0;
  float maxT = sky ? uFog.w : min( depth * rayLen, uFog.w );
  if ( maxT <= 0.02 ) { fragColor = vec4( 0.0, 0.0, 0.0, 1.0 ); return; }

  float dith = skIGN( gl_FragCoord.xy + uFrame * 5.588238 );
  float cosKey = dot( dir, uKeyDir );
  float phase = skFogInscatterPhase( cosKey );
  vec3 ambient = skFogAmbient( cosKey ) * uFog2.z;

  // Cloud shadow, twice per ray rather than once per step. skCloudShadow runs a
  // four-octave fbm plus a three-octave ridge; at 56 steps that was over half
  // the cost of the whole pass, to resolve a field whose features are hundreds
  // of metres across along a ray at most 900 m long. Two taps and a lerp are
  // visually indistinguishable and about 25x cheaper.
  float cloudNear = skCloudShadow( uCamPos.xz, uKeyDir );
  float cloudFar = skCloudShadow( ( uCamPos + dir * maxT ).xz, uKeyDir );

  vec3 L = vec3( 0.0 );
  float T = 1.0;
  float prev = 0.0;

  for ( int i = 0; i < VOL_STEPS; i ++ ) {
    // Exponential distribution: shafts need centimetres near the camera and
    // tens of metres out at the far plane.
    float f = ( float( i ) + dith ) / float( VOL_STEPS );
    float t = maxT * f * f * ( 3.0 - 2.0 * f ) * 0.35 + maxT * f * f * f * 0.65;
    float dt = t - prev;
    prev = t;
    if ( dt <= 1.0e-5 ) continue;

    vec3 wp = uCamPos + dir * t;
    float dens = skFogDensity( wp );
    if ( dens <= 1.0e-4 ) continue;

    float sigmaS = uFog.x * dens * skFogNearRamp( t );
    float sigmaE = max( 1.0e-7, uFog2.x * dens );

    float vis = skSunVisibility( wp, t / rayLen, dith );
    vis *= mix( cloudNear, cloudFar, f );

    // Ambient occlusion proxy: a shadowed sample is either inside a building or
    // behind one, and in both cases it sees far less sky than a lit sample. It
    // is an approximation, but it is the difference between an interior reading
    // as an interior and reading as a foggy field.
    float ambOcc = 0.42 + 0.58 * vis;

    // phase already carries the shaft gain on its anisotropic part only, so
    // this is the forward lobe lifted and nothing else.
    vec3 j = uKeyIrr * ( vis * phase ) + ambient * ambOcc;

    float aT = exp( -sigmaE * dt );
    L += T * j * sigmaS * ( 1.0 - aT ) / sigmaE;
    T *= aT;
    if ( T < 0.004 ) break;
  }

  fragColor = vec4( L, T );
}
`;

const RESOLVE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform sampler2D tVelocity;
uniform vec2 uTexel;
uniform float uBlend;
in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  vec4 cur = texture( tCurrent, vUv );
  vec2 vel = texture( tVelocity, vUv ).rg;
  vec2 huv = vUv - vel;

  vec4 lo = cur, hi = cur;
  for ( int i = 0; i < 9; i ++ ) {
    if ( i == 4 ) continue;
    vec2 o = vec2( float( i % 3 ) - 1.0, float( i / 3 ) - 1.0 ) * uTexel;
    vec4 n = texture( tCurrent, vUv + o );
    lo = min( lo, n );
    hi = max( hi, n );
  }
  // Widen slightly: clamping hard to the 3x3 range throws away the very
  // convergence the accumulation exists to buy.
  vec4 c = 0.5 * ( lo + hi );
  vec4 e = 0.5 * ( hi - lo ) * 1.6 + 1.0e-5;
  vec4 his = clamp( texture( tHistory, huv ), c - e, c + e );

  float w = uBlend;
  if ( huv.x < 0.0 || huv.x > 1.0 || huv.y < 0.0 || huv.y > 1.0 ) w = 0.0;
  fragColor = mix( cur, his, w );
}
`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
${SHARED}
uniform sampler2D tColor;
uniform sampler2D tVolume;
uniform sampler2D tDepth;
uniform vec2 uTexelHalf;
in vec2 vUv;
layout(location = 0) out vec4 fragColor;

#ifndef VOL_ANALYTIC
/** Depth-aware 4-tap upsample: bilinear weights times a depth-similarity
 *  weight, which stops a bright shaft bleeding across a foreground silhouette. */
vec3 skUpsample( vec2 uv, float depth ) {
  vec2 hp = uv / uTexelHalf - 0.5;
  vec2 base = floor( hp );
  vec2 f = hp - base;
  vec3 sum = vec3( 0.0 );
  float wsum = 0.0;
  for ( int i = 0; i < 4; i ++ ) {
    vec2 o = vec2( float( i & 1 ), float( i >> 1 ) );
    vec2 tuv = ( base + o + 0.5 ) * uTexelHalf;
    float bw = ( o.x < 0.5 ? 1.0 - f.x : f.x ) * ( o.y < 0.5 ? 1.0 - f.y : f.y );
    float d = texture( tDepth, tuv ).r;
    float w = bw / ( 0.05 + abs( d - depth ) * 0.35 ) + 1.0e-5;
    sum += texture( tVolume, tuv ).rgb * w;
    wsum += w;
  }
  return sum / wsum;
}
#endif

void main() {
  vec3 color = texture( tColor, vUv ).rgb;
  vec3 dir;
  float rayLen;
  skRayFor( vUv, dir, rayLen );

  float depth = texture( tDepth, vUv ).r;
  bool sky = depth <= 0.0;
  float dist = sky ? uFog.w : min( depth * rayLen, uFog.w );

  // Analytic per-channel transmittance.
  //
  // This IS applied to sky pixels. The dome carries the full Rayleigh/Mie
  // integral out to space, but this layer is the *ground haze* — dust, exhaust,
  // the bottom 40 m of a hot street — and that layer is between the camera and
  // the sky just as much as it is between the camera and a wall. Skipping it
  // while still ADDING the in-scatter of a 900 m column made the fog a pure
  // emitter over every sky pixel: at 2 degrees of elevation the optical depth
  // through an 18 m-scale-height layer is ~1.9, so the horizon sky was being
  // handed roughly its own radiance again in neutral in-scatter and no
  // extinction to pay for it. That is the cream void the sunset sky reads as,
  // and it is why the daylight zenith gradient stops dead a third of the way
  // up the frame.
  float od = skHeightIntegral( uCamPos.y, dir.y, dist );
  vec3 trans = exp( -uFogExt * od );

  #ifdef VOL_ANALYTIC
    // No raymarch available: single scattering with a uniform visibility term.
    // Same phase split and the same near-field ramp as the marched path, so the
    // two quality levels agree instead of grading the scene differently. The
    // ramp is folded in analytically: smoothstep(0,12,t) averages 0.5 over
    // [0,12] and 1 past it, so subtracting half the optical depth of the first
    // twelve metres reproduces the marched integral to within a few percent.
    float odNear = skHeightIntegral( uCamPos.y, dir.y, min( dist, 12.0 ) );
    float odS = max( 0.0, od - odNear * 0.5 );
    float mono = 1.0 - exp( -uFog2.x * odS );
    float cosKey = dot( dir, uKeyDir );
    vec3 inscatter = ( uKeyIrr * ( skFogInscatterPhase( cosKey ) * 0.55 )
                     + skFogAmbient( cosKey ) * uFog2.z )
                     * ( uFog.x / max( 1.0e-6, uFog2.x ) ) * mono;
  #else
    vec3 inscatter = skUpsample( vUv, depth );
  #endif

  fragColor = vec4( color * trans + inscatter, 1.0 );
}
`;

export class Volumetrics {
  constructor(shared, renderSystem, opts = {}) {
    this.order = -70; // before anything fx/ui might register
    this.enabled = true;

    const csm = renderSystem.csm;
    this.marchEnabled = opts.volumetrics !== false && !!csm;
    const steps = opts.steps ?? 40;

    this.shared = shared;
    this.scale = opts.scale ?? 0.5;
    this.width = 1;
    this.height = 1;
    this.rtMarch = null;
    this.rtHistory = [null, null];
    this._flip = 0;
    this._reset = true;

    const base = {
      uMieScale: shared.uMieScale,
      uViewPos: shared.uViewPos,
      uSkyAmbientLut: shared.uSkyAmbientLut,
      uCloudParams: shared.uCloudParams,
      uCloudParams2: shared.uCloudParams2,
      uInvProj: shared.uInvProj,
      uCamWorld: shared.uCamWorld,
      uCamPos: shared.uCamPos,
      uFog: shared.uFog,
      uFog2: shared.uFog2,
      uFogExt: shared.uFogExt,
      uPhase: shared.uPhase,
      uKeyDir: shared.uKeyDir,
      uKeyIrr: shared.uKeyIrr,
      uFogDrift: shared.uFogDrift,
    };

    if (this.marchEnabled) {
      this.marchPass = new SkyPass(
        'sky-vol-march',
        MARCH_FRAG,
        {
          ...base,
          ...csm.uniforms, // shared by reference: always the live cascade fit
          tDepth: { value: null },
          uFrame: { value: 0 },
        },
        { VOL_STEPS: steps, OW_CASCADES: csm.cascades }
      );
      this.resolvePass = new SkyPass('sky-vol-resolve', RESOLVE_FRAG, {
        tCurrent: { value: null },
        tHistory: { value: null },
        tVelocity: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uBlend: { value: 0.9 },
      });
    }

    this.compositePass = new SkyPass(
      'sky-vol-composite',
      COMPOSITE_FRAG,
      {
        ...base,
        tColor: { value: null },
        tVolume: { value: null },
        tDepth: { value: null },
        uTexelHalf: { value: new THREE.Vector2() },
      },
      this.marchEnabled ? {} : { VOL_ANALYTIC: 1 }
    );
  }

  resize(w, h) {
    if (!this.marchEnabled) {
      this.width = w;
      this.height = h;
      return;
    }
    const mw = Math.max(1, Math.round(w * this.scale));
    const mh = Math.max(1, Math.round(h * this.scale));
    if (this.rtMarch && this.width === mw && this.height === mh) return;
    this.width = mw;
    this.height = mh;
    this.rtMarch?.dispose();
    this.rtHistory[0]?.dispose();
    this.rtHistory[1]?.dispose();
    this.rtMarch = hdrTarget(mw, mh, { name: 'sky-vol' });
    this.rtHistory[0] = hdrTarget(mw, mh, { name: 'sky-vol-h0' });
    this.rtHistory[1] = hdrTarget(mw, mh, { name: 'sky-vol-h1' });
    this.resolvePass.uniforms.uTexel.value.set(1 / mw, 1 / mh);
    this.compositePass.uniforms.uTexelHalf.value.set(1 / mw, 1 / mh);
    this._reset = true;
  }

  render(renderer, inTexture, outTarget, r) {
    let volume = null;

    if (this.marchEnabled) {
      if (!this.rtMarch) this.resize(r.screenSize.width, r.screenSize.height);
      const mu = this.marchPass.uniforms;
      mu.tDepth.value = r.depthTexture;
      mu.uFrame.value = r.frame % 64;
      this.marchPass.render(renderer, this.rtMarch);

      const ru = this.resolvePass.uniforms;
      const prev = this.rtHistory[this._flip ^ 1];
      const next = this.rtHistory[this._flip];
      ru.tCurrent.value = this.rtMarch.texture;
      ru.tHistory.value = prev.texture;
      ru.tVelocity.value = r.velocityTexture;
      ru.uBlend.value = this._reset ? 0 : 0.9;
      this.resolvePass.render(renderer, next);
      this._reset = false;
      this._flip ^= 1;
      volume = next.texture;
    }

    const cu = this.compositePass.uniforms;
    cu.tColor.value = inTexture;
    cu.tVolume.value = volume;
    cu.tDepth.value = r.depthTexture;
    this.compositePass.render(renderer, outTarget);
  }

  reset() {
    this._reset = true;
  }

  dispose() {
    this.rtMarch?.dispose();
    this.rtHistory[0]?.dispose();
    this.rtHistory[1]?.dispose();
    this.marchPass?.dispose();
    this.resolvePass?.dispose();
    this.compositePass.dispose();
  }
}
