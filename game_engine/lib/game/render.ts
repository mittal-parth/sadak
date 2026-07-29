/**
 * Cinematic render pipeline.
 *
 * RenderPass -> bloom -> colour grade (+ depth haze, grain, CA) -> SMAA -> Output.
 *
 * Order matters: OutputPass must be LAST because it performs the tonemap and
 * colour-space conversion. Putting it earlier double-converts and everything
 * goes milky, which is the classic three.js post-processing bug.
 *
 * The grade pass needs scene depth for haze, so we render depth into a target
 * alongside the colour pass rather than guessing distance from luminance.
 */

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GradeShader } from "./fx/gradeShader";
import { RENDER_PRESETS, type QualityTier, type RenderPreset } from "./fx/presets";

export type RenderPipeline = {
  render(dt: number): void;
  resize(w: number, h: number): void;
  setPreset(districtId: string): void;
  setQuality(tier: QualityTier): void;
  /** Follows the player so shadows stay resolved wherever they walk. */
  focusShadows(target: THREE.Vector3): void;
  dispose(): void;
};

export function createRenderPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  sun: THREE.DirectionalLight,
  districtId: string,
  tier: QualityTier = "high"
): RenderPipeline {
  const size = new THREE.Vector2();
  renderer.getSize(size);

  /* ---------------- depth target for haze ---------------- */

  // Half resolution: this target is only ever read through the haze term,
  // which is a low-frequency ramp over hundreds of pixels. At full res it cost
  // a second complete scene render every frame at DPR 2 for no visible gain.
  const DEPTH_SCALE = 0.5;
  const dw = () => Math.max(1, Math.floor(size.x * DEPTH_SCALE));
  const dh = () => Math.max(1, Math.floor(size.y * DEPTH_SCALE));

  const depthTarget = new THREE.WebGLRenderTarget(dw(), dh());
  depthTarget.depthTexture = new THREE.DepthTexture(dw(), dh());
  depthTarget.depthTexture.type = THREE.UnsignedShortType;

  /* ---------------- passes ---------------- */

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.5, 0.85);
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  grade.uniforms.tDepth.value = depthTarget.depthTexture;
  grade.uniforms.cameraNear.value = camera.near;
  grade.uniforms.cameraFar.value = camera.far;
  composer.addPass(grade);

  let smaa: SMAAPass | null = null;
  const output = new OutputPass();

  function rebuildAA(t: QualityTier) {
    if (smaa) {
      composer.removePass(smaa);
      smaa.dispose?.();
      smaa = null;
    }
    composer.removePass(output);
    // SMAA is the first thing to go on weaker machines; it costs a full-screen
    // pass for an edge-quality win nobody notices at 30fps.
    if (t === "high") {
      smaa = new SMAAPass(size.x, size.y);
      composer.addPass(smaa);
    }
    composer.addPass(output);
  }
  rebuildAA(tier);

  /* ---------------- preset application ---------------- */

  // Every shipped district must have a preset. The fallback exists so a typo
  // can't black-screen the game, but silently inheriting another district's
  // grade is how six districts ended up rendering through Delhi's haze.
  if (!RENDER_PRESETS[districtId] && process.env.NODE_ENV !== "production") {
    console.warn(
      `[render] No grade preset for district "${districtId}" — falling back. Add one to fx/presets.ts.`
    );
  }
  let current: RenderPreset = RENDER_PRESETS[districtId] ?? Object.values(RENDER_PRESETS)[0];

  function apply(p: RenderPreset) {
    current = p;
    bloom.strength = p.bloom.strength;
    bloom.radius = p.bloom.radius;
    bloom.threshold = p.bloom.threshold;

    const u = grade.uniforms;
    u.uLift.value = p.grade.lift;
    u.uGamma.value = p.grade.gamma;
    u.uGain.value = p.grade.gain;
    u.uSaturation.value = p.grade.saturation;
    u.uTemperature.value = p.grade.temperature;
    u.uVignetteStrength.value = p.grade.vignette.strength;
    u.uVignetteRadius.value = p.grade.vignette.radius;
    u.uHazeColor.value = p.haze.color;
    u.uHazeDensity.value = p.haze.density;
    u.uHazeHorizonBoost.value = p.haze.horizonBoost;
    u.uGrain.value = p.grain;
    u.uChromaticAberration.value = p.chromaticAberration;
  }
  apply(current);

  /* ---------------- shadows ---------------- */

  // A tight frustum around the player is what buys shadow resolution. A single
  // huge frustum covering the whole city gives soft mush everywhere.
  const SHADOW_EXTENT = 55;
  sun.castShadow = true;
  sun.shadow.mapSize.set(tier === "low" ? 1024 : 2048, tier === "low" ? 1024 : 2048);
  // Without normalBias the large flat ground self-shadows into solid black.
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0004;
  {
    const c = sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -SHADOW_EXTENT;
    c.right = SHADOW_EXTENT;
    c.top = SHADOW_EXTENT;
    c.bottom = -SHADOW_EXTENT;
    c.near = 1;
    c.far = 400;
    c.updateProjectionMatrix();
  }

  const sunOffset = sun.position.clone();
  let time = 0;

  return {
    render(dt) {
      time += dt;
      grade.uniforms.uTime.value = time;

      // Depth prepass feeds the haze term.
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(depthTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prevTarget);

      composer.render(dt);
    },

    resize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
      size.set(w, h);
      depthTarget.setSize(dw(), dh());
      grade.uniforms.cameraNear.value = camera.near;
      grade.uniforms.cameraFar.value = camera.far;
    },

    setPreset(id) {
      const p = RENDER_PRESETS[id];
      if (p) apply(p);
    },

    setQuality(t) {
      rebuildAA(t);
      const s = t === "low" ? 1024 : 2048;
      sun.shadow.mapSize.set(s, s);
      sun.shadow.map?.dispose();
      sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
      if (t !== "high") {
        bloom.strength = current.bloom.strength * 0.75;
      } else {
        bloom.strength = current.bloom.strength;
      }
    },

    focusShadows(target) {
      sun.position.copy(target).add(sunOffset);
      sun.target.position.copy(target);
      sun.target.updateMatrixWorld();
      sun.shadow.camera.updateProjectionMatrix();
    },

    dispose() {
      depthTarget.dispose();
      composer.dispose();
    },
  };
}

export { RENDER_PRESETS };
export type { QualityTier, RenderPreset };
