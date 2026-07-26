import * as THREE from 'three';
import { csmShaderChunk } from './csm.js';

/**
 * Every lit material in the game gets four things injected into it:
 *
 *   1. the cascaded sun shadow (contact-hardening PCSS, see csm.js),
 *   2. screen-space contact shadows, multiplied onto the *sun* term only,
 *   3. GTAO applied to the *indirect* terms only — which is the physically
 *      right place for it, and the reason it reads as occlusion rather than
 *      as a dirty grey overlay,
 *   4. screen-space reflections blended into the IBL specular by confidence,
 *      so energy is replaced rather than added on top.
 *
 * Doing it in the base pass rather than as a post-multiply is what separates
 * this from a WebGL demo: AO darkens bounce light and leaves direct sunlight
 * alone, and SSR replaces the cubemap instead of double-counting it.
 *
 * Implementation note: `shader.uniforms` handed to onBeforeCompile *is* the
 * uniform object the renderer uploads from (WebGLRenderer stores it as
 * materialProperties.uniforms), so sharing one uniform object across every
 * patched material means a single write per frame updates all of them.
 */

const PATCH_VERSION = 9;

/** Max coarse interior volumes the indirect gate can hold (see OW_ROOMS). */
export const MAX_ROOMS = 10;

export class MaterialPatcher {
  constructor(csmUniforms, opts) {
    this.cascades = opts.cascades;
    this.quality = opts.quality;
    this.key = `ow-patch-${PATCH_VERSION}-${opts.cascades}-${opts.quality}`;

    this.uniforms = {
      ...csmUniforms,
      owAoTex: { value: null },
      owContactTex: { value: null },
      owSsrTex: { value: null },
      owScreenTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
      // x: ao enable, y: contact enable, z: ssr enable, w: ao power
      owFeat: { value: new THREE.Vector4(0, 0, 0, 1) },
      owAoStrength: { value: new THREE.Vector2(1, 0.6) }, // diffuse, specular occlusion
      // Two-band hemispheric bounce fill. The PMREM sky cubemap is the only
      // indirect light this engine has, and GTAO then eats most of it, so
      // shadowed geometry collapsed to black. These are irradiance values in
      // the same units as a directional light's colour*intensity.
      owSkyFill: { value: new THREE.Vector3(0, 0, 0) },   // cool, upper band
      owGroundFill: { value: new THREE.Vector3(0, 0, 0) }, // warm, lower band
      // x: hemispheric gain, y: warm sun-bounce wrap gain
      owFillGain: { value: new THREE.Vector2(1, 1) },
      // Directional gates for the two bands. The ground band is warm bounce off
      // the street: it may only land on downward and low-angle faces, or it
      // swallows the cool sky band on every vertical wall and the whole frame's
      // shadows come out warmer than its key light.
      // x,y: sky gate smoothstep over dot(N,up); z,w: ground gate over -dot(N,up)
      owFillDir: { value: new THREE.Vector4(-0.95, 0.85, -0.05, 0.7) },
      // x: IBL diffuse budget (the PMREM is the biggest indirect term there is,
      //    and it is what decides the key:fill ratio), y: indirect floor inside
      //    interior volumes, z: live room count, w: unused.
      owIndirect: { value: new THREE.Vector4(1, 1, 0, 0) },
      // World -> level-space 2D transform: (cos, sin, tx, tz).
      owRoomXf: { value: new THREE.Vector4(1, 0, 0, 0) },
      // Coarse interior volumes in level space: (cx, cz, hx, hz) / (y0, y1,,).
      owRooms: { value: makeVec4Array(MAX_ROOMS) },
      owRoomsY: { value: makeVec4Array(MAX_ROOMS) },
    };

    this.chunk = csmShaderChunk(opts.cascades, opts.quality);
    this.rooms = this.uniforms.owRooms.value;
    this.roomsY = this.uniforms.owRoomsY.value;
    this._patched = new WeakSet();
    this.count = 0;
  }

  /** True for materials that run three's lighting pipeline. */
  static isLit(m) {
    return !!(
      m &&
      (m.isMeshStandardMaterial ||
        m.isMeshPhysicalMaterial ||
        m.isMeshPhongMaterial ||
        m.isMeshLambertMaterial ||
        m.isMeshToonMaterial)
    );
  }

  patch(material) {
    if (!material || this._patched.has(material)) return false;
    if (!MaterialPatcher.isLit(material)) return false;
    if (material.userData?.owNoPatch) return false;
    this._patched.add(material);
    this.count++;

    const uniforms = this.uniforms;
    const parsChunk = this.chunk + EXTRA_PARS;
    const prevHook = material.onBeforeCompile;
    const prevKey = material.customProgramCacheKey;
    const key = this.key;

    material.onBeforeCompile = function (shader, renderer) {
      if (typeof prevHook === 'function') prevHook.call(this, shader, renderer);
      for (const k in uniforms) shader.uniforms[k] = uniforms[k];

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_pars_begin>',
        '#include <lights_pars_begin>\n' + parsChunk
      );

      // Inject the sun shadow inside the (unrolled) directional light loop.
      const dirBegin = THREE.ShaderChunk.lights_fragment_begin.replace(
        'getDirectionalLightInfo( directionalLight, directLight );',
        `getDirectionalLightInfo( directionalLight, directLight );
        directLight.color *= receiveShadow ? owSunShadow( directionalLight.direction, geometryPosition, geometryNormal ) * owContactShadow( directionalLight.direction ) : 1.0;
        // Micro-shadowing. AO belongs on indirect light, but a cascade texel is
        // tens of centimetres wide and the contact ray only runs along the sun
        // direction, so the last centimetre of a wall/soffit junction gets no
        // occlusion from EITHER and the frame comes back with razor-sharp
        // junctions and nothing grounded. A small fraction of the AO term on
        // the direct light is what every shipping renderer uses to close that
        // gap; at 0.35 it costs 2-3% on an open surface and a third of the key
        // in a crevice.
        directLight.color *= mix( 1.0, owSampleAO(), owAoStrength.x * 0.35 );`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_begin>',
        dirBegin
      );

      // AO on indirect only, SSR into the IBL specular.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        #if defined( RE_IndirectDiffuse )
        {
          float owAo = owSampleAO();
          if ( owAo < 1.0 ) {
            vec3 owBounce = owMultiBounce( owAo, diffuseColor.rgb );
            irradiance *= owBounce;
            iblIrradiance *= owBounce;
            #if defined( STANDARD ) && defined( RE_IndirectSpecular )
              radiance *= mix( 1.0, owSpecularOcclusion( owAo, material.roughness ), owAoStrength.y );
            #endif
          }

          // --- interior/exterior indirect budget -----------------------------
          // Skylight cannot reach the middle of a closed room, and letting it
          // do so is what makes a doorway read as a hole cut in a card instead
          // of as an aperture two stops over the room it lights. The gate is a
          // coarse room volume test (see RenderSystem._updateRooms) with an AO
          // term folded in, floored so nothing ever goes black.
          vec3 owWP = cameraPosition + ( geometryPosition * mat3( viewMatrix ) );
          float owIndoor = owInteriorGate( owWP, owAo );

          // --- two-band hemispheric bounce fill ------------------------------
          // Cool sky above, warm street below — but *gated by the normal*, not
          // lerped: the sky band belongs to up-facing and vertical geometry and
          // the ground band to soffits, undersides and low-angle faces. Lerping
          // them put a warm street bounce on every wall and made shadows come
          // out warmer than the sun that cast them.
          // Occluded with sqrt(AO), never AO: a fill term that AO can drive to
          // zero is not a fill, it is just another way to make a black hole.
          vec3 owWN = inverseTransformDirection( normal, viewMatrix );
          float owFillAo = sqrt( max( owAo, 0.0 ) );
          float owUp = clamp( owWN.y, -1.0, 1.0 );
          // Cosine-hemisphere visibility of the sky, not a narrow smoothstep:
          // a vertical wall genuinely sees half the sky dome, and clipping it
          // to a third of the band was most of why a shaded facade came back
          // dead neutral — the blue term was small enough for the (achromatic)
          // env map and the warm bounce to bury it.
          float owSkyG = smoothstep( owFillDir.x, owFillDir.y, owUp ) * owIndoor;
          float owGndG = smoothstep( owFillDir.z, owFillDir.w, -owUp );
          irradiance += ( owSkyFill * owSkyG + owGroundFill * owGndG * owIndoor )
            * ( owFillAo * owFillGain.x );

          // The PMREM sky is the dominant indirect term in the frame, so the
          // interior gate and the indirect budget have to bite here or the
          // key:fill ratio is whatever the env map happens to be.
          iblIrradiance *= owIndirect.x * owIndoor;

          // --- warm sun bounce off whatever the sun is actually hitting ------
          // A single wrap term from the anti-sun hemisphere: the wall in shade
          // is lit by the sunlit wall across the street, and that is the light
          // that makes shadowed geometry read as shape instead of silhouette.
          //
          // Gated by owIndoor as well. It was not, and it is scaled off the sun,
          // so the inside of every room was receiving the street's bounce at
          // full strength through a metre of masonry — which is why an interior
          // metered the same as the sunlit exterior framed in its own doorway.
          irradiance += owGroundFill *
            ( owSunBounce( owWN ) * owFillGain.y * owFillAo * owIndoor );
        }
        #endif
        #if defined( STANDARD ) && defined( RE_IndirectSpecular ) && defined( USE_ENVMAP )
        if ( owFeat.z > 0.5 && material.roughness < 0.62 ) {
          vec4 owSsr = texture2D( owSsrTex, gl_FragCoord.xy * owScreenTexel );
          float owW = owSsr.a * smoothstep( 0.62, 0.14, material.roughness );
          radiance = mix( radiance, owSsr.rgb, clamp( owW, 0.0, 1.0 ) );
        }
        #endif
        `
      );
    };

    material.customProgramCacheKey = function () {
      const base = typeof prevKey === 'function' ? prevKey.call(this) : '';
      return key + base;
    };

    material.needsUpdate = true;
    return true;
  }

  setScreenSize(w, h) {
    this.uniforms.owScreenTexel.value.set(1 / w, 1 / h);
  }

  dispose() {
    this._patched = new WeakSet();
  }
}

function makeVec4Array(n) {
  const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = new THREE.Vector4(0, 0, 0, 0);
  return a;
}

const EXTRA_PARS = /* glsl */ `
#define OW_ROOMS ${MAX_ROOMS}
uniform sampler2D owAoTex;
uniform sampler2D owContactTex;
uniform sampler2D owSsrTex;
uniform vec2 owScreenTexel;
uniform vec4 owFeat;
uniform vec2 owAoStrength;
uniform vec3 owSkyFill;
uniform vec3 owGroundFill;
uniform vec2 owFillGain;
uniform vec4 owFillDir;
uniform vec4 owIndirect;
uniform vec4 owRoomXf;
uniform vec4 owRooms[ OW_ROOMS ];
uniform vec4 owRoomsY[ OW_ROOMS ];

/**
 * 1 outdoors, -> owIndirect.y deep inside a coarse interior volume.
 *
 * The volumes are the enterable buildings' footprints, tested in LEVEL space
 * (one yaw, so a 2D rotate is enough) by *depth inside the box* rather than by
 * containment: a facade's outer skin sits exactly on the footprint boundary at
 * depth 0 and its inner skin one wall thickness in, so a 6..30 cm feather
 * separates the two faces of the same wall without needing per-room geometry.
 */
float owInteriorGate( vec3 worldPos, float ao ) {
  float indoor = 0.0;
  if ( owIndirect.z > 0.5 ) {
    float lx = worldPos.x * owRoomXf.x + worldPos.z * owRoomXf.y + owRoomXf.z;
    float lz = -worldPos.x * owRoomXf.y + worldPos.z * owRoomXf.x + owRoomXf.w;
    int n = int( owIndirect.z );
    for ( int i = 0; i < OW_ROOMS; i ++ ) {
      if ( i >= n ) break;
      vec4 r = owRooms[ i ];
      vec4 ry = owRoomsY[ i ];
      float d = min(
        min( r.z - abs( lx - r.x ), r.w - abs( lz - r.y ) ),
        min( worldPos.y - ry.x, ry.y - worldPos.y ) );
      indoor = max( indoor, smoothstep( 0.06, 0.30, d ) );
    }
  }
  // Even outside a tagged volume, a pocket the sky genuinely cannot see should
  // not receive full skylight — that is what the AO buffer knows and the room
  // list does not (arcades, stairwells, under-awning market stalls). Mixed in
  // at 0.6 so it shapes rather than doubling up as a second AO multiply.
  float aoGate = mix( 1.0, smoothstep( 0.45, 0.98, ao ), 0.6 );
  float g = min( 1.0 - indoor, aoGate );
  return mix( owIndirect.y, 1.0, clamp( g, 0.0, 1.0 ) );
}

float owSampleAO() {
  if ( owFeat.x < 0.5 ) return 1.0;
  float ao = texture2D( owAoTex, gl_FragCoord.xy * owScreenTexel ).r;
  // Floor the visibility: real crevices are filled by multiply-scattered light,
  // and an AO term that reaches 0 is a dark halo, not occlusion.
  return mix( 1.0, max( ao, 0.25 ), owAoStrength.x );
}

/**
 * Wrapped diffuse from the anti-sun hemisphere — the reflected street key.
 * The wrap is tight (0.12 rather than 0.35): a face turned away from the sunlit
 * side of the street receives none of its bounce, and a wide wrap is what let
 * this warm term reach every surface in the frame at once.
 */
float owSunBounce( vec3 worldNormal ) {
  vec3 anti = normalize( vec3( -owSunDirWorld.x, 0.28, -owSunDirWorld.z ) + vec3( 1e-4 ) );
  return clamp( ( dot( worldNormal, anti ) + 0.12 ) / 1.12, 0.0, 1.0 );
}

// Jimenez GTAO multi-bounce: dark albedos occlude more than bright ones,
// which stops AO turning white plaster into grey mud.
vec3 owMultiBounce( float ao, vec3 albedo ) {
  vec3 a = 2.0404 * albedo - 0.3324;
  vec3 b = -4.7951 * albedo + 0.6417;
  vec3 c = 2.7552 * albedo + 0.6903;
  return clamp( ao * ( ao * ( ao * a + b ) + c ), vec3( ao ), vec3( 1.0 ) );
}

// Rough surfaces gather from a wide cone, so they see more occlusion.
float owSpecularOcclusion( float ao, float rough ) {
  float r2 = rough * rough;
  return clamp( pow( max( ao, 0.0 ), 1.0 + r2 * 2.0 ), 0.0, 1.0 );
}

float owContactShadow( vec3 lightDirView ) {
  if ( owFeat.y < 0.5 ) return 1.0;
  if ( dot( lightDirView, owSunDirView ) < 0.999 ) return 1.0;
  return texture2D( owContactTex, gl_FragCoord.xy * owScreenTexel ).r;
}

`;
