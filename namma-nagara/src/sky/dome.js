import * as THREE from 'three';
import {
  ATMOSPHERE_GLSL,
  TRANSMITTANCE_LOOKUP_GLSL,
} from './atmosphere.js';
import { SKYVIEW_LOOKUP_GLSL } from './luts.js';
import { NOISE_GLSL } from './noise.js';
import { STARS_GLSL } from './stars.js';
import { CLOUDS_GLSL } from './clouds.js';
import { fullScreenGeometry, SKY_VERT } from './fullscreen.js';

/**
 * The visible sky.
 *
 * Drawn as a full-screen triangle at renderOrder -10000 with depth test and
 * depth write off, exactly the way `scene.background` works internally — so it
 * fills the frame before any geometry and costs one primitive. The ray
 * direction is rebuilt from `camera.projectionMatrixInverse` inside
 * `onBeforeRender`, which means it picks up the renderer's TAA jitter and the
 * sun disc gets properly resolved sub-pixel antialiasing instead of stair steps.
 *
 * `userData.owNoPrepass` keeps it out of the depth/normal/velocity prepass and
 * out of the shadow cascades, per the render contract.
 *
 * Contents, in the order they are layered:
 *   sky-view LUT  -> Rayleigh + Mie + ozone + multiple scattering
 *   aureoles      -> the Mie forward peak the LUT resolution destroys
 *   sun disc      -> limb darkened, extinguished by the view-path transmittance
 *   moon disc     -> procedural albedo, real terminator from the sun direction
 *   night sky     -> Milky Way, three star layers, airglow, attenuated by the
 *                    cloud alpha computed below it — stars do not shine through
 *                    an overcast, and that ordering is the only way to say so
 *   clouds        -> cirrus then cumulus, lit by the same irradiances
 *   ground        -> first-bounce albedo below the horizon (matters for IBL)
 */

const SKY_BODY = /* glsl */ `
${ATMOSPHERE_GLSL}
${TRANSMITTANCE_LOOKUP_GLSL}
${SKYVIEW_LOOKUP_GLSL}
${NOISE_GLSL}
${STARS_GLSL}
${CLOUDS_GLSL}

uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunIrradiance;      // scene light units, at the ground
uniform vec3 uMoonIrradiance;
uniform vec3 uSunDiscRadiance;    // radiance of the disc before extinction
uniform vec3 uMoonDiscRadiance;
uniform vec4 uDisc;               // x sun ang. radius, y moon ang. radius,
                                  // z sun draw scale, w moon draw scale
uniform vec3 uGroundAlbedo;
uniform float uHorizonMurk;       // city haze piled up at eye level
uniform vec2 uSkyRolloff;         // x knee (scene radiance), y overshoot room

float owSkLum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

/** 2x1: texel 0 = cosine-weighted sky average, texel 1 = horizon band average. */
uniform sampler2D uSkyAmbientLut;

vec3 skAmbientSky() { return texture( uSkyAmbientLut, vec2( 0.25, 0.5 ) ).rgb; }
vec3 skAmbientHorizon() { return texture( uSkyAmbientLut, vec2( 0.75, 0.5 ) ).rgb; }

/**
 * Radiance of the solar disc, limb darkened. The exponents are the per-channel
 * Hosek-Wilkie limb coefficients: blue falls off fastest, which is why the rim
 * of a low sun is orange while the centre stays white.
 */
vec3 skSunDisc( vec3 rayDir, float theta ) {
  float R = uDisc.x * uDisc.z;
  float aa = max( 1.0e-6, fwidth( theta ) );
  float cover = smoothstep( R + aa, R - aa, theta );
  if ( cover <= 0.0 ) return vec3( 0.0 );
  float r = clamp( theta / R, 0.0, 1.0 );
  float mu = sqrt( max( 0.0, 1.0 - r * r ) );
  vec3 limb = pow( vec3( mu ), vec3( 0.32, 0.44, 0.58 ) );
  // Enlarging the disc for readability must not add energy, so divide by the
  // area factor; bloom then behaves the same as it would at true angular size.
  return uSunDiscRadiance * limb * cover * skTransmittance( uViewPos, uSunDir )
         / ( uDisc.z * uDisc.z );
}

/**
 * Circumsolar aureole — the bright white halo that surrounds a real sun out to
 * ten or fifteen degrees.
 *
 * The sky-view LUT is 384x192, so one texel spans about a degree of azimuth.
 * The Mie phase function at g = 0.8 puts most of its energy inside five
 * degrees, and bilinear interpolation of a one-degree grid destroys exactly
 * that peak — which is why a LUT-based Hillaire sky renders a sun as a hard
 * white dot pasted on flat blue. This adds the missing energy back
 * analytically: the aerosol optical depth along the view ray times the *excess*
 * of the Mie phase over its value at the cutoff angle, so the term is
 * continuous at the edge, vanishes when turbidity goes to zero, and reddens
 * with the sun because it is driven by the same transmittance as everything
 * else. It is a scattering integral, not a lens flare.
 */
vec3 skAureole( vec3 rayDir, vec3 lightDir, vec3 irradiance, float cosTheta ) {
  const float CUT = 0.9135; // cos(24 degrees)
  if ( cosTheta <= CUT ) return vec3( 0.0 );
  // Aerosol column along the ray: sigma_s * H / cos(zenith), floored so a ray
  // at the horizon does not blow up. The floor is small because the aureole of a
  // *low* sun is the whole point: that is the ramp from the amber core out to
  // eight or ten degrees that makes a sunset read as a sunset.
  float mieOd = SK_MIE_S * uMieScale * 0.0012 / max( 0.055, rayDir.y + 0.055 );
  float excess = max( 0.0, skMiePhase( cosTheta ) - skMiePhase( CUT ) );
  // 4.2: the LUT holds a bilinear smear of this peak across a one-degree grid,
  // and this restores what that interpolation threw away. The coefficient is the
  // one number in the sky that is chosen by eye rather than derived, because what
  // it is correcting is a sampling error, not a physical quantity — it is set so
  // the aureole is about a stop over the sky it sits in at eight degrees out,
  // which is what a photograph of a low sun shows. It carries the sun's own
  // reddened spectrum through skTransmittance, so the ramp is amber at 19h and
  // white at noon without a single hand-picked colour anywhere.
  return irradiance * skTransmittance( uViewPos, rayDir ) * ( excess * mieOd * 4.2 );
}

/**
 * Highlight roll-off for the sky, and only for the sky.
 *
 * At four degrees of solar elevation the aerosol forward peak puts the western
 * horizon three to four stops over the street it is lighting. The street is what
 * the meter is set for, so the whole sky above it lands on the flat top of the
 * tone curve: one achromatic plateau, no Rayleigh column, no transition band, no
 * gradient at all — which is exactly what the 19:20 frame was.
 *
 * This is the sky's own shoulder, applied before the discs. A Reinhard knee on
 * LUMINANCE with the chromaticity carried through unchanged, so what comes back
 * is compressed in level but identical in hue: the peach-to-crimson ramp
 * survives instead of desaturating to white the way a per-channel clamp would.
 * The knee is published as a fraction of the beam's own luminance (see
 * SkySystem._updateCelestial), which makes it exposure-invariant — autoexposure
 * follows the beam, so a knee that follows the beam lands at the same code value
 * at every time of day, and a daylight sky, which never reaches it, is untouched.
 *
 *   uSkyRolloff.x  knee, in scene radiance units
 *   uSkyRolloff.y  compression exponent above the knee (1 = none, 0.38 = ~2.6:1)
 */
vec3 skRolloff( vec3 col ) {
  float knee = uSkyRolloff.x;
  if ( knee <= 0.0 ) return col;
  float l = max( owSkLum( col ), 1.0e-6 );
  if ( l <= knee ) return col;
  // POWER compressor, not a Reinhard knee. The Reinhard form asymptotes at
  // knee * (1 + room), which is a hard ceiling: everything from eight degrees
  // off the sun out to the far horizon piles onto the same value and the sunset
  // sky comes back as one cream plateau — the very artefact the roll-off exists
  // to prevent. x^p has no ceiling, so a 40:1 overshoot still comes out as a
  // 4:1 gradient and the peach-to-crimson ramp survives all the way in to the
  // aureole, while the disc (four decades over) still clips and blooms.
  float p = uSkyRolloff.y;
  return col * ( pow( l / knee, p ) * knee / l );
}

vec3 skMoonDisc( vec3 rayDir, float theta, int oct ) {
  float R = uDisc.y * uDisc.w;
  if ( theta > R * 1.6 ) return vec3( 0.0 );

  vec3 ref = abs( uMoonDir.y ) > 0.97 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 0.0, 1.0, 0.0 );
  vec3 mr = normalize( cross( ref, uMoonDir ) );
  vec3 mu3 = cross( uMoonDir, mr );

  // Gnomonic projection is exact enough over a quarter of a degree.
  vec2 p = vec2( dot( rayDir, mr ), dot( rayDir, mu3 ) ) / R;
  float r2 = dot( p, p );
  // Two pixels of edge, not one: the disc is six stops over the tonemap knee,
  // so a one-pixel edge leaves a dotted rim once TAA and the sharpen filter
  // have had a go at it.
  float aa = max( 1.0e-4, 1.9 * fwidth( r2 ) );
  float cover = smoothstep( 1.0 + aa, 1.0 - aa, r2 );
  if ( cover <= 0.0 ) return vec3( 0.0 );

  vec3 n = normalize( mr * p.x + mu3 * p.y - uMoonDir * sqrt( max( 0.0, 1.0 - min( r2, 1.0 ) ) ) );

  // Maria are basalt floods over anorthositic highlands: albedo 0.06 vs 0.14.
  float highlands = skFbm3( n * 6.5, oct );
  float maria = smoothstep( 0.44, 0.63, skFbm3( n * 2.1 + 5.0, max( 2, oct - 1 ) ) );
  float albedo = mix( 0.105, 0.155, highlands ) * mix( 1.0, 0.52, maria );

  float NdL = max( 0.0, dot( n, uSunDir ) );
  // Lunar regolith backscatters hard: the disc is nearly flat right up to the
  // terminator, which a Lambert cosine gets badly wrong.
  float shade = pow( NdL, 0.42 );
  float earthshine = 0.014;

  return uMoonDiscRadiance * ( albedo / 0.13 ) * ( shade + earthshine ) * cover;
}

/**
 * @param rayDir  normalised world direction
 * @param quality 1 = screen, 0 = environment map (fewer octaves, no star points)
 */
vec3 skSample( vec3 rayDir, int quality ) {
  vec3 ambSky = skAmbientSky();
  vec3 ambHor = skAmbientHorizon();

  vec3 col = skSkyView( rayDir, uSunDir );

  float cosS = dot( rayDir, uSunDir );
  float cosM = dot( rayDir, uMoonDir );
  float thetaS = skSafeAcos( cosS );
  float thetaM = skSafeAcos( cosM );

  // Aureoles go in before the discs so the discs sit *inside* their own glow.
  // Both are driven by the same irradiances that light the scattering, so the
  // lunar halo ends up the same *fraction* of the moonlit sky as the solar
  // aureole is of the daylit sky — it scales with the night's exposure for free.
  col += skAureole( rayDir, uSunDir, uSunIrradiance, cosS );
  col += skAureole( rayDir, uMoonDir, uMoonIrradiance, cosM );

  // ---- clouds -------------------------------------------------------------
  // The two decks sit at very different altitudes, so they see very different
  // solar spectra: the cumulus at 1.5 km looks through nearly the whole aerosol
  // column while the cirrus at 7.8 km is above most of it. Sampling the
  // transmittance LUT at each deck's own altitude is what makes a sunset read
  // as pink cirrus over orange-grey cumulus instead of one flat orange wash.
  vec3 pLow  = vec3( 0.0, SK_GROUND_R + 0.0015, 0.0 );
  vec3 pHigh = vec3( 0.0, SK_GROUND_R + 0.0078, 0.0 );
  vec3 sunLow   = uSunIrradiance  * skTransmittance( pLow,  uSunDir );
  vec3 sunHigh  = uSunIrradiance  * skTransmittance( pHigh, uSunDir );
  vec3 moonLow  = uMoonIrradiance * skTransmittance( pLow,  uMoonDir );
  vec3 moonHigh = uMoonIrradiance * skTransmittance( pHigh, uMoonDir );
  vec4 cl = skClouds( rayDir, uSunDir, sunLow, sunHigh,
                      uMoonDir, moonLow, moonHigh, ambSky, quality );

  // ---- night sky, BEHIND the decks ---------------------------------------
  // Stars have to be occluded by cloud. A star seen *through* an opaque cumulus
  // is the single most obvious tell in a night frame, and it was visible here
  // because the starfield was added to the sky before the decks were composited
  // over it — an 0.6-alpha cloud still let 40% of the field through, and the
  // deck's own radiance at night is so low that 40% of a star is still a star.
  // The multiplier is above one because a deck that is optically thick enough to
  // hide its own texture is thick enough to hide a point source completely.
  vec3 night = skNightSky( rayDir, quality > 0 ? 5 : 3, quality > 0 );
  col += night * ( 1.0 - clamp( cl.a * 1.9, 0.0, 1.0 ) );

  if ( cl.a > 1.0e-4 ) {
    // Aerial perspective on the decks themselves. A cloud twenty kilometres out
    // is seen through twenty kilometres of air, so it loses contrast toward the
    // radiance of the sky in front of it. Keyed off view elevation, which is
    // what sets the path length to a deck of fixed altitude. skClouds has
    // already faded its own alpha with distance; this fades the *colour*, which
    // is what stops a low cloud bank reading as a cut-out.
    float bleed = 1.0 - smoothstep( 0.0, 0.22, rayDir.y );
    col = mix( col, mix( cl.rgb, col, bleed * 0.82 ), cl.a );
  }

  // ---- ground / below the horizon ----------------------------------------
  if ( rayDir.y < 0.0 ) {
    // First bounce off the street: this is what fills the lower hemisphere of
    // the IBL and gives upward-facing surfaces their warm fill.
    vec3 ground = uGroundAlbedo *
      ( ambHor + uSunIrradiance * max( 0.0, uSunDir.y ) / SK_PI
                + uMoonIrradiance * max( 0.0, uMoonDir.y ) / SK_PI );
    col = mix( col, ground, smoothstep( 0.0, -0.22, rayDir.y ) );
  }

  // A real city horizon is never clean: dust and exhaust pile up in the first
  // few degrees. Scaled by the sky's own brightness so it can never glow.
  float murk = uHorizonMurk * exp( -abs( rayDir.y ) * 26.0 );
  col = mix( col, ambHor * 1.15, clamp( murk, 0.0, 0.85 ) );

  // ---- horizon roll-off ---------------------------------------------------
  col = skRolloff( col );

  // The discs go in AFTER the roll-off: they are supposed to clip and bloom,
  // and they are the only thing in the sky that is.
  if ( quality > 0 ) col += skSunDisc( rayDir, thetaS );
  col += skMoonDisc( rayDir, thetaM, quality > 0 ? 4 : 2 );

  return max( col, vec3( 0.0 ) );
}
`;

const DOME_VERT = /* glsl */ `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
out vec3 vRay;
void main() {
  vec2 ndc = position.xy;
  vec4 h = uInvProj * vec4( ndc, 1.0, 1.0 );
  vec3 vd = h.xyz / h.w;
  // Normalise onto the z = -1 plane: that quantity is linear in screen space,
  // so interpolating it and normalising in the fragment shader is exact.
  vd /= max( 1.0e-6, -vd.z );
  vRay = mat3( uCamWorld ) * vd;
  gl_Position = vec4( ndc, 1.0, 1.0 );
}
`;

const DOME_FRAG = /* glsl */ `
precision highp float;
${SKY_BODY}
in vec3 vRay;
layout(location = 0) out vec4 fragColor;
void main() {
  fragColor = vec4( skSample( normalize( vRay ), 1 ), 1.0 );
}
`;

/** Equirectangular bake for PMREM. Matches three's `equirectUv` exactly. */
const ENV_FRAG = /* glsl */ `
precision highp float;
${SKY_BODY}
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
void main() {
  float az = ( vUv.x - 0.5 ) * 2.0 * SK_PI;
  float lat = ( vUv.y - 0.5 ) * SK_PI;
  float cl = cos( lat );
  vec3 dir = vec3( cl * cos( az ), sin( lat ), cl * sin( az ) );
  fragColor = vec4( skSample( normalize( dir ), 0 ), 1.0 );
}
`;

export class SkyDome {
  /**
   * @param {object} uniforms shared uniform objects, owned by SkySystem
   */
  constructor(uniforms) {
    this.uniforms = {
      ...uniforms,
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
    };

    this.material = new THREE.ShaderMaterial({
      name: 'sky-dome',
      uniforms: this.uniforms,
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      glslVersion: THREE.GLSL3,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      fog: false,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(fullScreenGeometry(), this.material);
    this.mesh.name = 'sky-dome';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10000;
    this.mesh.matrixAutoUpdate = false;
    // Render contract: stay out of the prepass, the cascades and contact shadows.
    this.mesh.userData.owNoPrepass = true;
    this.mesh.userData.owNoShadow = true;

    const u = this.uniforms;
    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      // projectionMatrixInverse is kept in sync with the TAA jitter by the
      // renderer, so the sky is jittered with the rest of the frame.
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uCamWorld.value.copy(camera.matrixWorld);
    };

    // Environment bake shares every uniform object with the visible sky, so the
    // IBL can never drift out of agreement with what the camera sees.
    this.envMaterial = new THREE.ShaderMaterial({
      name: 'sky-env',
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: ENV_FRAG,
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
  }

  dispose() {
    this.material.dispose();
    this.envMaterial.dispose();
  }
}
