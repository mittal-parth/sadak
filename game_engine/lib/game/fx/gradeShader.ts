/**
 * A single combined ShaderPass that does everything the per-district look
 * needs in one texture read of the scene, rather than chaining five separate
 * full-screen passes (each of which is a full-resolution texture sample on
 * a laptop GPU we're trying to hold at 60fps):
 *
 *   depth haze -> lift/gamma/gain -> saturation -> temperature -> vignette
 *   -> chromatic aberration -> film grain -> ordered dither
 *
 * The dither is last and deliberately tiny (half an 8-bit step). Haze, bloom
 * and the sky gradient are all near-flat ramps stretched over hundreds of
 * pixels, and those band hard on an 8-bit display however clean the geometry
 * behind them is; an ordered threshold trades that banding for a fine pattern
 * the eye reintegrates. See mat/dither.ts.
 *
 * Chromatic aberration is applied by offsetting the *sampling* UVs per
 * channel (so it has to happen before the single tDiffuse sample is treated
 * as "the" scene colour), everything after that is a per-pixel colour op on
 * the already-composited colour.
 */

import { BAYER_GLSL } from "../mat/dither";

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    uTime: { value: 0 },

    uLift: { value: [0, 0, 0] },
    uGamma: { value: [1, 1, 1] },
    uGain: { value: [1, 1, 1] },
    uSaturation: { value: 1 },
    uTemperature: { value: 0 },
    uVignetteStrength: { value: 0.3 },
    uVignetteRadius: { value: 0.65 },

    uHazeColor: { value: [0.7, 0.7, 0.75] },
    uHazeDensity: { value: 0.02 },
    uHazeHorizonBoost: { value: 0.4 },

    uGrain: { value: 0.03 },
    uChromaticAberration: { value: 0.0015 },
    /** Ordered-dither amplitude, in 8-bit output steps. 1.0 is the point where
     *  banding disappears without the pattern itself becoming visible. */
    uDither: { value: 1.0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float uTime;

    uniform vec3 uLift;
    uniform vec3 uGamma;
    uniform vec3 uGain;
    uniform float uSaturation;
    uniform float uTemperature;
    uniform float uVignetteStrength;
    uniform float uVignetteRadius;

    uniform vec3 uHazeColor;
    uniform float uHazeDensity;
    uniform float uHazeHorizonBoost;

    uniform float uGrain;
    uniform float uChromaticAberration;
    uniform float uDither;

    varying vec2 vUv;

    ${BAYER_GLSL}

    float linearizeDepth(float z) {
      // z is the raw [0,1] perspective depth-buffer value.
      float ndc = z * 2.0 - 1.0;
      return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - ndc * (cameraFar - cameraNear));
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float distFromCenter = length(centered);

      // --- chromatic aberration: sample each channel from a slightly
      // different radius, strongest at the frame edges, invisible dead
      // centre so it never smears the thing the player is looking at.
      vec2 dir = centered * distFromCenter * uChromaticAberration;
      float r = texture2D(tDiffuse, vUv - dir).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + dir).b;
      vec3 color = vec3(r, g, b);

      // --- depth haze: exponential-squared against linear view distance.
      //
      // The horizon term only ever *scales* the distance-derived fog factor,
      // it is never added to it and never tints the haze colour on its own.
      // Adding it independently (as this used to) painted a permanent milky
      // band across the middle of every frame regardless of what the camera
      // was actually looking at, which read as smog even at zero density.
      float rawDepth = texture2D(tDepth, vUv).x;
      float viewDist = linearizeDepth(rawDepth);
      float fogFactor = 1.0 - exp(-uHazeDensity * uHazeDensity * viewDist * viewDist);

      // Background pixels: the sky dome writes no depth, so these sit at the
      // far plane and used to come back fully hazed — the sky gradient was
      // being painted over with haze colour on every frame. Nothing was drawn
      // there, so there is no depth to cue; leave the sky alone.
      fogFactor *= step(rawDepth, 0.9999);

      // Horizon band: screen space, roughly where sky meets ground in this
      // over-the-shoulder camera (slightly above vertical centre). Purely a
      // multiplier, so near geometry sitting on that scanline stays clear.
      float horizonDist = abs(vUv.y - 0.42);
      float horizon = uHazeHorizonBoost * exp(-horizonDist * horizonDist * 18.0);
      float mixAmount = clamp(fogFactor * (1.0 + horizon), 0.0, 0.65);
      color = mix(color, uHazeColor, mixAmount);

      // --- lift / gamma / gain
      color = color + uLift * (1.0 - color);
      color = color * uGain;
      color = pow(max(color, vec3(0.0)), 1.0 / uGamma);

      // --- saturation
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);

      // --- white balance / temperature push
      color.r += uTemperature * 0.06;
      color.b -= uTemperature * 0.06;

      // --- vignette
      float vig = smoothstep(uVignetteRadius, uVignetteRadius - 0.55, distFromCenter);
      color *= mix(1.0 - uVignetteStrength, 1.0, vig);

      // --- film grain, subtle and animated so it doesn't read as a static
      // dirty-lens texture.
      float grain = (hash(vUv * vec2(1920.0, 1080.0) + uTime) - 0.5) * uGrain;
      color += grain;

      // --- ordered dither, in pixel space so the pattern stays pinned to the
      // display grid instead of swimming with the camera.
      color += (bayer8(gl_FragCoord.xy) - 0.5) * (uDither / 255.0);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};
