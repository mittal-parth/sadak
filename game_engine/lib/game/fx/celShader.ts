/**
 * The 3D-to-illustration pass.
 *
 * One full-screen shader reads the scene colour once plus five depth taps and
 * does everything the district look needs:
 *
 *   ink lines -> depth haze -> exposure + soft shoulder -> split tone
 *   -> lift/gamma/gain -> saturation -> temperature -> vignette
 *   -> linear->sRGB -> ordered dither
 *
 * Ink comes from a second difference of *reciprocal* depth. 1/z is affine
 * across any plane in screen space, so its second difference is exactly zero
 * on a flat wall or a road at a grazing angle, however oblique, and only
 * fires on real silhouettes and creases. Convex edges (the near side of a
 * silhouette, the corner of a box) ink strongly; concave ones (inside corners,
 * where a wall meets the pavement) ink faintly, which mimics the lighter
 * contact lines an animator draws. Lines fade out with distance so the
 * background dissolves into haze instead of turning into scribble.
 *
 * The scene is rendered linear and untonemapped into a half-float target, so
 * exposure and the highlight shoulder live here rather than in the renderer.
 *
 * The ink and split-tone approach is adapted from sakura-crossing
 * (https://github.com/Kenton-GMI/sakura-crossing), MIT License,
 * Copyright (c) 2026 Kenton Wang.
 */

import * as THREE from "three";
import { BAYER_GLSL } from "../mat/dither";

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4( position.xy, 0.0, 1.0 );
  }
`;

export const CelShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    uTexel: { value: new THREE.Vector2(1, 1) },

    uInkColor: { value: new THREE.Vector3(0.05, 0.04, 0.07) },
    uInkThickness: { value: 1.5 },
    uInkSens: { value: 0.004 },
    uInkConcave: { value: 0.03 },
    uInkConcaveAmount: { value: 0.4 },
    uInkFadeStart: { value: 40 },
    uInkFadeEnd: { value: 110 },
    uInkStrength: { value: 1 },

    uHazeColor: { value: new THREE.Vector3(0.8, 0.85, 0.9) },
    uHazeDensity: { value: 0.002 },
    uHazeHorizonBoost: { value: 0.15 },

    uExposure: { value: 1 },
    uKnee: { value: 0.78 },
    uSplitShadow: { value: new THREE.Vector3(0.8, 0.78, 0.92) },
    uSplitLight: { value: new THREE.Vector3(1, 0.98, 0.94) },
    uShadowLift: { value: 0.02 },

    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uGamma: { value: new THREE.Vector3(1, 1, 1) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSaturation: { value: 1 },
    uTemperature: { value: 0 },
    uVignetteStrength: { value: 0.12 },
    uVignetteRadius: { value: 0.8 },
    /** Ordered-dither amplitude, in 8-bit output steps. See mat/dither.ts. */
    uDither: { value: 1 },
  },

  vertexShader: FULLSCREEN_VERT,

  fragmentShader: /* glsl */ `
    precision highp float;
    #include <packing>

    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec2 uTexel;

    uniform vec3 uInkColor;
    uniform float uInkThickness, uInkSens, uInkConcave, uInkConcaveAmount;
    uniform float uInkFadeStart, uInkFadeEnd, uInkStrength;

    uniform vec3 uHazeColor;
    uniform float uHazeDensity, uHazeHorizonBoost;

    uniform float uExposure, uKnee, uShadowLift;
    uniform vec3 uSplitShadow, uSplitLight;

    uniform vec3 uLift, uGamma, uGain;
    uniform float uSaturation, uTemperature;
    uniform float uVignetteStrength, uVignetteRadius;
    uniform float uDither;

    varying vec2 vUv;

    ${BAYER_GLSL}

    float viewDepth( vec2 uv ) {
      return -perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, cameraNear, cameraFar );
    }

    vec3 linearToSRGB( vec3 c ) {
      return mix( c * 12.92, 1.055 * pow( max( c, vec3( 0.0031308 ) ), vec3( 1.0 / 2.4 ) ) - 0.055,
                  step( 0.0031308, c ) );
    }

    void main() {
      vec3 col = texture2D( tDiffuse, vUv ).rgb;
      float raw = texture2D( tDepth, vUv ).x;
      // The sky dome writes no depth, so anything at the far plane is sky:
      // no ink and no haze there, the painted gradient stays as painted.
      bool sky = raw >= 0.9999;
      float dc = viewDepth( vUv );

      if ( !sky ) {
        // --- ink
        vec2 t = uTexel * uInkThickness;
        float wc = 1.0 / dc;
        float wl = 1.0 / viewDepth( vUv - vec2( t.x, 0.0 ) );
        float wr = 1.0 / viewDepth( vUv + vec2( t.x, 0.0 ) );
        float wu = 1.0 / viewDepth( vUv + vec2( 0.0, t.y ) );
        float wd = 1.0 / viewDepth( vUv - vec2( 0.0, t.y ) );

        // Positive where the neighbours are farther than the centre: the
        // near side of a silhouette, or an outside corner.
        float sx = ( 2.0 * wc - wl - wr ) / wc;
        float sy = ( 2.0 * wc - wu - wd ) / wc;
        float convex = max( 0.0, sx ) + max( 0.0, sy );
        float concave = max( 0.0, -sx ) + max( 0.0, -sy );

        float edge = smoothstep( uInkSens * 0.32, uInkSens, convex );
        edge = max( edge, smoothstep( uInkConcave, uInkConcave * 3.4, concave ) * uInkConcaveAmount );
        edge *= 1.0 - smoothstep( uInkFadeStart, uInkFadeEnd, dc );
        edge *= uInkStrength;

        // The line keeps a whisper of the surface hue so it never looks pasted on.
        vec3 line = mix( uInkColor, col * 0.4, 0.22 );
        col = mix( col, line, clamp( edge, 0.0, 1.0 ) );

        // --- depth haze: exponential-squared against view distance. The
        // horizon band only ever scales the distance term, never adds to it,
        // so near geometry on that scanline stays clear.
        float fog = 1.0 - exp( -uHazeDensity * uHazeDensity * dc * dc );
        float hd = abs( vUv.y - 0.42 );
        float horizon = uHazeHorizonBoost * exp( -hd * hd * 18.0 );
        col = mix( col, uHazeColor, clamp( fog * ( 1.0 + horizon ), 0.0, 0.65 ) );
      }

      // --- exposure, then a soft shoulder above the knee so a hot sun band
      // rolls off instead of clipping to flat white.
      col *= uExposure;
      vec3 over = max( col - uKnee, 0.0 );
      float span = 1.0 - uKnee;
      col = min( col, vec3( uKnee ) ) + span * ( 1.0 - exp( -over / span ) );

      // --- split tone: cool violet in the darks, warm paper in the lights.
      float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      float k = smoothstep( 0.02, 0.55, l );
      col *= mix( uSplitShadow, uSplitLight, k );
      // Shadows stay readable, never crushed to black.
      col += uShadowLift * ( 1.0 - k );

      // --- lift / gamma / gain
      col = col + uLift * ( 1.0 - col );
      col *= uGain;
      col = pow( max( col, vec3( 0.0 ) ), 1.0 / uGamma );

      // --- saturation
      l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      col = mix( vec3( l ), col, uSaturation );

      // --- white balance
      col.r += uTemperature * 0.05;
      col.b -= uTemperature * 0.05;

      // --- vignette
      float r = length( vUv - 0.5 );
      col *= mix( 1.0 - uVignetteStrength, 1.0, smoothstep( uVignetteRadius, uVignetteRadius - 0.55, r ) );

      col = linearToSRGB( clamp( col, 0.0, 1.0 ) );

      // --- ordered dither, pinned to the display grid.
      col += ( bayer8( gl_FragCoord.xy ) - 0.5 ) * ( uDither / 255.0 );

      gl_FragColor = vec4( col, 1.0 );
    }
  `,
};

/** Cheap FXAA over the finished sRGB frame, mostly to clean the ink lines. */
export const FxaaShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: FULLSCREEN_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;

    float luma( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }

    void main() {
      vec3 cM = texture2D( tDiffuse, vUv ).rgb;
      vec3 cNW = texture2D( tDiffuse, vUv + vec2( -uTexel.x, -uTexel.y ) ).rgb;
      vec3 cNE = texture2D( tDiffuse, vUv + vec2(  uTexel.x, -uTexel.y ) ).rgb;
      vec3 cSW = texture2D( tDiffuse, vUv + vec2( -uTexel.x,  uTexel.y ) ).rgb;
      vec3 cSE = texture2D( tDiffuse, vUv + vec2(  uTexel.x,  uTexel.y ) ).rgb;

      float lM = luma( cM ), lNW = luma( cNW ), lNE = luma( cNE ),
            lSW = luma( cSW ), lSE = luma( cSE );
      float lMin = min( lM, min( min( lNW, lNE ), min( lSW, lSE ) ) );
      float lMax = max( lM, max( max( lNW, lNE ), max( lSW, lSE ) ) );

      vec2 dir = vec2(
        -( ( lNW + lNE ) - ( lSW + lSE ) ),
         ( ( lNW + lSW ) - ( lNE + lSE ) )
      );
      float reduce = max( ( lNW + lNE + lSW + lSE ) * 0.25 * 0.18, 1.0 / 128.0 );
      float rcp = 1.0 / ( min( abs( dir.x ), abs( dir.y ) ) + reduce );
      dir = clamp( dir * rcp, vec2( -8.0 ), vec2( 8.0 ) ) * uTexel;

      vec3 rgbA = 0.5 * (
        texture2D( tDiffuse, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb +
        texture2D( tDiffuse, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
        texture2D( tDiffuse, vUv - dir * 0.5 ).rgb +
        texture2D( tDiffuse, vUv + dir * 0.5 ).rgb );

      float lB = luma( rgbB );
      gl_FragColor = vec4( ( lB < lMin || lB > lMax ) ? rgbA : rgbB, 1.0 );
    }
  `,
};
