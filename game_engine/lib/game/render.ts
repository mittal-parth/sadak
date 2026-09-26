/**
 * Cel render pipeline.
 *
 *   scene -> rtScene (linear half-float colour + depth texture)
 *         -> cel pass  : ink lines, haze, tone, grade, linear->sRGB
 *         -> fxaa pass : cleans up the line work, straight to the canvas
 *
 * One scene render per frame. The old pipeline rendered the scene twice (a
 * depth prepass for haze plus the colour pass) and then ran bloom and SMAA;
 * the depth texture attached to rtScene now feeds both the ink and the haze,
 * and anti-aliasing comes from supersampling plus FXAA.
 *
 * Supersampling matters more than it sounds: ink lines are one or two pixels
 * wide, and at 1x they stair-step badly. On low-DPI screens the frame renders
 * at 1.5x and the browser downsamples the canvas, capped by a pixel budget so
 * a 4K monitor does not render 30M pixels.
 */

import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { CelShader, FxaaShader } from "./fx/celShader";
import { presetFor, type QualityTier, type RenderPreset } from "./fx/presets";

export type RenderPipeline = {
  render(dt: number): void;
  /** Sizes the canvas as well as the targets; the pipeline owns pixel ratio. */
  resize(w: number, h: number): void;
  setPreset(districtId: string): void;
  setQuality(tier: QualityTier): void;
  /** Follows the player so shadows stay resolved wherever they walk. */
  focusShadows(target: THREE.Vector3): void;
  /** The preset currently applied, for materials that key off it. */
  readonly preset: RenderPreset;
  dispose(): void;
};

const TIERS: Record<QualityTier, { budget: number; maxScale: number; shadow: number }> = {
  high: { budget: 4.6e6, maxScale: 2, shadow: 2048 },
  medium: { budget: 2.8e6, maxScale: 1.5, shadow: 2048 },
  low: { budget: 1.6e6, maxScale: 1.25, shadow: 1024 },
};

/** Half-extent of the shadow frustum around the player. Tight is what buys
 *  resolution; one frustum over the whole city gives soft mush everywhere. */
const SHADOW_EXTENT = 55;

function makeQuad(def: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(def.uniforms),
    vertexShader: def.vertexShader,
    fragmentShader: def.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  return { quad: new FullScreenQuad(mat), mat };
}

export function createRenderPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  sun: THREE.DirectionalLight,
  districtId: string,
  tier: QualityTier = "high"
): RenderPipeline {
  // Exposure and the highlight shoulder live in the cel pass; the scene is
  // rendered linear into a float target, so renderer tone mapping must be off
  // or it double-compresses.
  renderer.toneMapping = THREE.NoToneMapping;

  const rtScene = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  });
  rtScene.depthTexture = new THREE.DepthTexture(2, 2);
  rtScene.depthTexture.format = THREE.DepthFormat;
  rtScene.depthTexture.type = THREE.UnsignedIntType;
  rtScene.depthTexture.minFilter = THREE.NearestFilter;
  rtScene.depthTexture.magFilter = THREE.NearestFilter;

  // sRGB-encoded bytes written by the cel pass, read back raw by FXAA.
  const rtGraded = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });

  const cel = makeQuad(CelShader);
  const fxaa = makeQuad(FxaaShader);
  cel.mat.uniforms.tDiffuse.value = rtScene.texture;
  cel.mat.uniforms.tDepth.value = rtScene.depthTexture;
  fxaa.mat.uniforms.tDiffuse.value = rtGraded.texture;

  let quality = TIERS[tier];
  let current = presetFor(districtId);
  const css = new THREE.Vector2(1, 1);

  function apply(p: RenderPreset) {
    current = p;
    const u = cel.mat.uniforms;
    u.uInkColor.value.fromArray(p.ink.color);
    u.uInkStrength.value = p.ink.strength;
    u.uInkFadeStart.value = p.ink.fadeStart;
    u.uInkFadeEnd.value = p.ink.fadeEnd;

    u.uExposure.value = p.tone.exposure;
    u.uSplitShadow.value.fromArray(p.tone.splitShadow);
    u.uSplitLight.value.fromArray(p.tone.splitLight);
    u.uShadowLift.value = p.tone.shadowLift;

    u.uLift.value.fromArray(p.grade.lift);
    u.uGamma.value.fromArray(p.grade.gamma);
    u.uGain.value.fromArray(p.grade.gain);
    u.uSaturation.value = p.grade.saturation;
    u.uTemperature.value = p.grade.temperature;
    u.uVignetteStrength.value = p.grade.vignette.strength;
    u.uVignetteRadius.value = p.grade.vignette.radius;

    u.uHazeColor.value.fromArray(p.haze.color);
    u.uHazeDensity.value = p.haze.density;
    u.uHazeHorizonBoost.value = p.haze.horizonBoost;
  }
  apply(current);

  function resize(w: number, h: number) {
    css.set(Math.max(1, w), Math.max(1, h));
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    let scale = Math.min(dpr < 1.5 ? 1.5 : dpr, quality.maxScale);
    const px = css.x * css.y;
    if (px * scale * scale > quality.budget) scale = Math.max(1, Math.sqrt(quality.budget / px));

    renderer.setPixelRatio(scale);
    renderer.setSize(css.x, css.y, false);

    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    rtScene.setSize(buf.x, buf.y);
    rtGraded.setSize(buf.x, buf.y);

    const u = cel.mat.uniforms;
    u.uTexel.value.set(1 / buf.x, 1 / buf.y);
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    // Keep the line near two device pixels whatever the supersample factor.
    u.uInkThickness.value = 1.05 + 0.55 * scale;
    fxaa.mat.uniforms.uTexel.value.set(1 / buf.x, 1 / buf.y);
  }

  /* ---------------- shadows ---------------- */

  sun.castShadow = true;
  // Hard PCF, not PCFSoft: cel shadows want a crisp edge, the softness comes
  // from the tinted fill light, not from blur.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  // Without normalBias the large flat ground self-shadows into solid black.
  sun.shadow.normalBias = 0.05;
  sun.shadow.bias = -0.0004;
  {
    const c = sun.shadow.camera;
    c.left = -SHADOW_EXTENT;
    c.right = SHADOW_EXTENT;
    c.top = SHADOW_EXTENT;
    c.bottom = -SHADOW_EXTENT;
    c.near = 1;
    c.far = 400;
    c.updateProjectionMatrix();
  }

  const sunOffset = sun.position.clone().sub(sun.target.position);
  // Light-space basis, fixed because the sun does not move. Snapping the
  // shadow centre to whole texels along these axes stops shadow edges
  // crawling as the player walks.
  const lightDir = sunOffset.clone().normalize();
  const lightRight = new THREE.Vector3(0, 1, 0).cross(lightDir).normalize();
  const lightUp = lightDir.clone().cross(lightRight).normalize();
  const snapped = new THREE.Vector3();

  function focusShadows(target: THREE.Vector3) {
    const texel = (SHADOW_EXTENT * 2) / sun.shadow.mapSize.x;
    const r = Math.round(target.dot(lightRight) / texel) * texel;
    const u = Math.round(target.dot(lightUp) / texel) * texel;
    const d = target.dot(lightDir);
    snapped
      .copy(lightRight)
      .multiplyScalar(r)
      .addScaledVector(lightUp, u)
      .addScaledVector(lightDir, d);
    sun.position.copy(snapped).add(sunOffset);
    sun.target.position.copy(snapped);
    sun.target.updateMatrixWorld();
  }

  return {
    get preset() {
      return current;
    },

    render() {
      renderer.setRenderTarget(rtScene);
      renderer.clear();
      renderer.render(scene, camera);

      renderer.setRenderTarget(rtGraded);
      cel.quad.render(renderer);

      renderer.setRenderTarget(null);
      fxaa.quad.render(renderer);
    },

    resize,

    setPreset(id) {
      apply(presetFor(id));
    },

    setQuality(t) {
      quality = TIERS[t];
      sun.shadow.mapSize.set(quality.shadow, quality.shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      resize(css.x, css.y);
    },

    focusShadows,

    dispose() {
      rtScene.depthTexture?.dispose();
      rtScene.dispose();
      rtGraded.dispose();
      cel.quad.dispose();
      cel.mat.dispose();
      fxaa.quad.dispose();
      fxaa.mat.dispose();
    },
  };
}

export type { QualityTier, RenderPreset };
