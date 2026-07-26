/**
 * Shader pre-warm.
 *
 * WHY THIS EXISTS — measured, not guessed. Profiling actual gameplay at Retina
 * DPR showed 86 WebGL programs compiling lazily *during play*, with up to 30
 * landing on a single frame. Each of those frames took 3.1-3.9 SECONDS. That is
 * the "freezing" players report: not a low frame rate, but multi-second stalls
 * whenever geometry with an uncompiled material/light/shadow permutation first
 * enters the frame.
 *
 * Three.js compiles a program the first time a given (material, lights, shadow,
 * skinning, fog, ...) permutation is actually drawn. The fix is to force every
 * permutation to compile up front, while a loading state is on screen, so the
 * steady-state frame loop never compiles anything.
 *
 * This must not change a single rendered pixel. It only moves *when* compilation
 * happens, so it touches no material parameters, no camera, no lighting state.
 * The pixel-diff gate (tools/imagediff.mjs) enforces that.
 *
 * Two mechanisms, because neither alone is sufficient:
 *
 *  1. renderer.compileAsync() — uses KHR_parallel_shader_compile where available,
 *     so it compiles off the main thread and does not block. Covers the forward
 *     lit pass for everything currently in a scene graph.
 *  2. Real frames from representative poses — compileAsync does NOT cover the
 *     depth/shadow-map variant of a material, nor the post-processing chain,
 *     nor permutations that only exist once a subsystem has spawned its transient
 *     objects (particles, decals, ragdolls, muzzle flash). Actually drawing a
 *     handful of frames is the only way to reach those.
 */

/** Poses chosen to span the level's lighting and material variety, so the
 *  cascades, interiors and exteriors all get their permutations compiled. */
const WARM_POSES = [
  { pos: [12, 1.75, 18], look: [-4, 2.2, -6] }, // main street, long cascades
  { pos: [-8.5, 1.7, 3.2], look: [2, 1.6, -2] }, // interior, short cascades
  { pos: [3.2, 1.35, 5.0], look: [1.4, 1.1, 2.2] }, // close material detail
  { pos: [4, 1.7, 12], look: [-6, 1.7, -4] }, // combat staging
];

/**
 * Force every shader permutation to compile before gameplay starts.
 * Resolves once warm. Never throws — a failed pre-warm must not block boot,
 * it just means the old stutter comes back.
 */
/**
 * @param opts.transients  Stage each subsystem's spawned objects (enemies, impact
 *   bursts, muzzle flash) so their programs compile too. MEASURED TO BE UNSAFE and
 *   therefore off by default: the pixel-diff gate showed up-to-254/255 channel
 *   deltas afterwards, because decals live in a persistent ring buffer and spawned
 *   actors are not despawned by any hook reachable from here. Reaching the
 *   remaining permutations safely needs a `prewarmMaterials()` on each subsystem
 *   that builds and compiles its materials WITHOUT spawning gameplay objects —
 *   which is owned by those subsystems, not by core.
 */
import * as THREE from 'three';

/**
 * Subsystems whose `prewarmMaterials()` must NOT be driven from here.
 *
 * `fx` self-schedules its own pre-warm on the second rendered frame, and that is
 * not a workaround it can drop: the program cache key carries the number of
 * VISIBLE lights, and the visible set is only settled inside the renderer's
 * first frame (`render._cullLights`) plus `world._stabiliseLightCount`, both of
 * which run after this function has returned. Calling fx from here would compile
 * a permutation the frame loop never asks for AND latch fx's `_warmed` flag, so
 * the real programs would go back to compiling on the first shot fired. Measured
 * by src/fx: that is 12 programs / 142-159 ms on the frame the trigger is pulled.
 */
const SELF_WARMING = new Set(['fx']);

/**
 * Whether to let `render.prewarmMaterials()` run its CSM-depth + MRT-prepass step.
 *
 * OFF, and it is the one thing in this file that was MEASURED not to be
 * pixel-neutral. Unlike every other step here, that one does not compile — it
 * actually *runs* the two depth passes, writing the shadow array and the gbuffer.
 * `render` reports it as clean when invoked standalone at frame 0; driven from
 * here (after every subsystem has init'd, with the camera restored to the real
 * spawn pose) it is not. Bisected against shots/perf-base with everything else in
 * place, one variable at a time:
 *
 *   render-only tree, no hooks .................. identical, 0 px
 *   + ragdoll sleep skip ........................ identical, 0 px
 *   + all hooks, shadow:false ................... identical, 0 px
 *   + all hooks, shadow:true .... detail/impacts/muzzle/night/weapon changed,
 *                                 0.005-0.017% of pixels, maxDelta 1
 *
 * Run-to-run noise was verified at exactly zero first (two captures of the same
 * tree were bit-identical), so those deltas are the change, not the harness.
 *
 * Little is lost: the override-material variants are reached anyway, without
 * drawing, by `world.prewarmMaterials()` (which compiles the level under
 * `csm.depthMaterial` and `gbuffer.material` via `scene.overrideMaterial`) and by
 * `ai.prewarmMaterials()` (which borrows render's depth override for the
 * characters). The gate outranks the last few programs.
 */
const RENDER_SHADOW_WARM = false;

export async function prewarm(engine, { onProgress = () => {}, transients = false, drawFrames = false } = {}) {
  const t0 = performance.now();
  const render = engine.ctx.peek('render');
  const renderer = render?.renderer;
  if (!renderer) return { ok: false, reason: 'no renderer' };

  const programsBefore = renderer.info.programs?.length ?? 0;
  const cam = engine.camera;
  const saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov };

  // Pre-warm has to be *simulation-transparent*, not just visually transparent.
  // It steps the engine, which advances the clock and the RNG stream; if that
  // residue survived, every downstream capture would drift and the pixel-diff
  // gate would report phantom regressions. Snapshot and restore both.
  const t = engine.time;
  const savedTime = { elapsed: t.elapsed, raw: t.raw, dt: t.dt, alpha: t.alpha, frame: t.frame };
  const r = engine.rng;
  const savedRng = { s0: r.s0, s1: r.s1, s2: r.s2, s3: r.s3, spare: r._spare };
  const savedAccum = engine._accum;

  // Subsystems whose materials only exist once they have spawned something.
  // These are the public debug hooks ARCHITECTURE.md already defines for the
  // capture harness; using them here costs nothing and reaches the transient
  // material permutations (particles, decals, ragdolls, flash, HUD layers).
  // Only kinds the subsystems actually implement — verified by reading their
  // sources, not guessed. fx.debugBurst understands 'explosion' | 'muzzle' |
  // 'combat' and a default wall burst; anything else falls through to the same
  // default, so enumerating surface names buys nothing. weapons.debugPose
  // understands 'idle' | 'ads' | 'fire'.
  const transientStages = [
    () => engine.ctx.peek('ai')?.debugStage?.('firefight'),
    () => engine.ctx.peek('fx')?.debugBurst?.('wall'),
    () => engine.ctx.peek('fx')?.debugBurst?.('explosion'),
    () => engine.ctx.peek('fx')?.debugBurst?.('muzzle'),
    () => engine.ctx.peek('fx')?.debugBurst?.('combat'),
    () => engine.ctx.peek('weapons')?.debugPose?.('fire'),
    () => engine.ctx.peek('weapons')?.debugPose?.('ads'),
    () => engine.ctx.peek('ui')?.debugState?.('combat'),
  ];

  // A RENDER TARGET MUST BE BOUND WHILE COMPILING. three folds `outputColorSpace`
  // and `toneMapping` into the program cache key and reads BOTH off the currently
  // bound target. With the canvas bound (the default here) every program compiled
  // is the `srgb` + tone-mapped variant — but the world and the viewmodel are both
  // drawn into HDR targets, which need `srgb-linear` + NoToneMapping. Measured by
  // src/materials and src/fx independently: 25 of 47 pre-warmed programs were the
  // unused canvas variant, and the real ones still compiled during the first
  // frames of play. A 1x1 target is enough to get the right key; nothing is ever
  // rendered into it. Restored in the caller's `finally`.
  const scratchRt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
  const prevRt = renderer.getRenderTarget();
  const prevFace = renderer.getActiveCubeFace?.() ?? 0;
  const prevMip = renderer.getActiveMipmapLevel?.() ?? 0;

  const compile = async () => {
    // compileAsync is non-blocking where KHR_parallel_shader_compile exists.
    renderer.setRenderTarget(scratchRt);
    try {
      await renderer.compileAsync(engine.scene, engine.camera);
      await renderer.compileAsync(engine.viewScene, engine.viewCamera);
    } catch {
      // Older three or a driver without the extension — fall back to sync.
      try {
        renderer.compile(engine.scene, engine.camera);
        renderer.compile(engine.viewScene, engine.viewCamera);
      } catch { /* nothing more we can do; boot must still proceed */ }
    } finally {
      renderer.setRenderTarget(prevRt, prevFace, prevMip);
    }
  };

  const yieldFrame = () => new Promise((r) => requestAnimationFrame(r));

  try {
    let step = 0;
    const totalSteps = WARM_POSES.length * 2 + (transients ? transientStages.length : 0) + 1;
    const tick = () => onProgress(Math.min(1, ++step / totalSteps));

    // Pass 1: compile the static world from each pose, with the depth/shadow
    // variants reached by drawing a real frame at that pose.
    for (const p of WARM_POSES) {
      cam.position.set(...p.pos);
      cam.lookAt(...p.look);
      cam.updateMatrixWorld(true);
      await compile();
      tick();
      // Drawing real frames here would reach the depth/shadow and post-processing
      // variants too, but engine.step() advances every subsystem's internal state
      // (AI transforms, exposure adaptation, particle cursors) and NONE of that is
      // restorable from core. The pixel gate measured up-to-180/255 deltas from it.
      // So this is opt-in and off: compileAsync only, which mutates nothing.
      if (drawFrames) {
        engine.step();
        await yieldFrame();
        engine.step();
        await yieldFrame();
      }
      tick();
    }

    // Pass 1b: THE SUBSYSTEM HOOKS. This is the `prewarmMaterials()` contract the
    // doc comment above says is missing — "a prewarmMaterials() on each subsystem
    // that builds and compiles its materials WITHOUT spawning gameplay objects".
    // It is now implemented by render, world and ai, and it reaches exactly what
    // `compileAsync(scene, camera)` provably cannot:
    //
    //   render  the CSM depth pass, the MRT prepass and the ~13 full-screen post
    //           materials (blitted into a 4x4 scratch). +34-40 programs.
    //   world   the CSM-depth and prepass override variants of the level geometry,
    //           in their plain / instanced / instanced+instanceColor flavours,
    //           compiled at the stabilised light count. +35 programs.
    //   ai      the 26 character materials and their skinned + depth variants,
    //           against a dummy SkinnedMesh on the real skeleton. +7 programs.
    //           (ai also calls this itself at the end of init(); it is idempotent.)
    //
    // None of them draws a gameplay frame, steps the engine, touches the clock or
    // the RNG, so none of the restore machinery above applies to them — which is
    // why this replaces the `drawFrames` option rather than extending it.
    //
    // The camera goes back to its real pose FIRST: render's hook runs the shadow
    // and prepass passes for real (at frame 0, where it is pixel-clean), and there
    // is no reason to fit the cascades to a warm-up pose the game never uses.
    cam.position.copy(saved.pos);
    cam.quaternion.copy(saved.quat);
    cam.fov = saved.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    // render goes first, deliberately: it patches every lit material with the
    // CSM/AO/SSR injection, and a program compiled off an UNPATCHED material is
    // thrown away by the first frame that walks the scene.
    const hooks = [];
    const renderSys = engine.registry.peek?.('render');
    if (renderSys && typeof renderSys.prewarmMaterials === 'function') hooks.push(renderSys);
    for (const sys of engine.registry.ordered ?? []) {
      if (sys === renderSys) continue;
      if (SELF_WARMING.has(sys.constructor?.id)) continue;
      if (typeof sys.prewarmMaterials === 'function') hooks.push(sys);
    }
    const hookResults = {};
    for (const sys of hooks) {
      const id = sys.constructor?.id ?? '?';
      try {
        const arg = sys === renderSys ? { post: true, shadow: RENDER_SHADOW_WARM } : engine.ctx;
        hookResults[id] = (await sys.prewarmMaterials(arg)) ?? { ok: true };
      } catch (err) {
        // An optional hook must never be able to block boot.
        hookResults[id] = { ok: false, reason: String(err?.message ?? err) };
      }
    }
    engine.__prewarmHooks = hookResults;

    // Pass 2: spawn each subsystem's transient objects and compile those too.
    // Gated: see the `transients` option doc — this pass is not pixel-transparent.
    for (const spawn of (transients ? transientStages : [])) {
      try { spawn(); } catch { /* subsystem may not implement the hook */ }
      engine.step();
      await yieldFrame();
      await compile();
      engine.step();
      await yieldFrame();
      tick();
    }
    tick();
  } finally {
    // Restore exactly what we found. Any residue here would be a visual change.
    for (const reset of (transients ? [
      () => engine.ctx.peek('fx')?.debugBurst?.('none'),
      () => engine.ctx.peek('weapons')?.debugPose?.('idle'),
      () => engine.ctx.peek('ui')?.debugState?.('clean'),
      () => engine.ctx.peek('ai')?.debugStage?.('none'),
    ] : [])) {
      try { reset(); } catch { /* optional hook */ }
    }
    cam.position.copy(saved.pos);
    cam.quaternion.copy(saved.quat);
    cam.fov = saved.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    Object.assign(engine.time, savedTime);
    r.s0 = savedRng.s0;
    r.s1 = savedRng.s1;
    r.s2 = savedRng.s2;
    r.s3 = savedRng.s3;
    r._spare = savedRng.spare;
    engine._accum = savedAccum;
    engine._last = performance.now();
    renderer.setRenderTarget(prevRt, prevFace, prevMip);
    scratchRt.dispose();
  }

  const programsAfter = renderer.info.programs?.length ?? 0;
  return {
    ok: true,
    hooks: engine.__prewarmHooks,
    ms: Math.round(performance.now() - t0),
    programsBefore,
    programsAfter,
    compiled: programsAfter - programsBefore,
    parallel: !!renderer.getContext().getExtension('KHR_parallel_shader_compile'),
  };
}
