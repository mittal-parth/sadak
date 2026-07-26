import { Engine } from './core/engine.js';
import { createConfig } from './core/config.js';

import { RenderSystem } from './render/index.js';
import { MaterialSystem } from './materials/index.js';
import { SkySystem } from './sky/index.js';
import { WorldSystem } from './world/index.js';
import { PhysicsSystem } from './physics/index.js';
import { PlayerSystem } from './player/index.js';
import { WeaponSystem } from './weapons/index.js';
import { FxSystem } from './fx/index.js';
import { AiSystem } from './ai/index.js';
import { UiSystem } from './ui/index.js';
import { AudioSystem } from './audio/index.js';

import { installShotApi } from './dev/shots.js';
import { prewarm } from './core/prewarm.js';

const params = new URLSearchParams(location.search);
const capture = params.get('capture') === '1';
// Deterministic shutter for the pixel gate: the engine does not schedule its own
// frames, the driver advances exactly N of them through window.__PUMP__. Opt-in,
// because tools that measure real frame pacing (tools/perf.mjs) need the loop to
// free-run. See the long comment in src/dev/shots.js.
const lockstep = capture && params.get('lockstep') === '1';

const config = createConfig({
  quality: params.get('q') ?? 'ultra',
  // ?level=bengaluru — see src/world/levels/index.js. Defaults to the market
  // street, which is what the pixel gate is calibrated against.
  level: params.get('level') ?? 'market',
  deterministic: capture,
});

const canvas = document.getElementById('game');

const engine = new Engine({ canvas, config });

/**
 * COMBAT SYSTEMS ARE OPT-OUT PER LEVEL.
 *
 * The Bengaluru level is a city, not a battlefield: no weapon in the player's
 * hands and no armed garrison in the street. Both are simply not registered
 * rather than disabled from inside, which is safe because nothing declares
 * `static deps` on either and every consumer reaches them through optional
 * chaining (`ctx.peek('weapons')?.…` in ui, fx, render and prewarm). Skipping
 * them also drops the viewmodel pass and the AI animation/pathfinding cost.
 *
 * REGISTRATION ORDER IS NOT IRRELEVANT, whatever the old comment here said.
 * Topo-sort only constrains systems that declare a dependency; independent
 * systems keep their insertion order, and each one takes `ctx.rng.fork()`
 * during init. Move a system in this list and every system after it forks a
 * DIFFERENT stream — measured: hoisting weapons/ai to the end moved 14% to 97%
 * of the pixels on all eleven market shots. So the conditional adds happen in
 * place, and `market` reproduces the original sequence exactly.
 */
const combat = config.level !== 'bengaluru';

engine.add(RenderSystem).add(MaterialSystem).add(SkySystem).add(WorldSystem);
engine.add(PhysicsSystem).add(PlayerSystem);
if (combat) engine.add(WeaponSystem);
engine.add(FxSystem);
if (combat) engine.add(AiSystem);
engine.add(UiSystem).add(AudioSystem);

try {
  await engine.init();
} catch (err) {
  console.error('[boot] init failed', err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<pre style="position:fixed;inset:0;padding:2rem;color:#f66;background:#000;
       font:12px/1.5 ui-monospace,monospace;overflow:auto;z-index:9999;white-space:pre-wrap">
BOOT FAILURE\n\n${err.stack ?? err.message}</pre>`
  );
  throw err;
}

const shotApi = installShotApi(engine, { capture, lockstep });

// Compile every shader permutation before the frame loop starts. Measured: without
// this, 86 programs compile lazily during play, up to 30 on one frame, producing
// 3.1-3.9 SECOND stalls. See src/core/prewarm.js.
//
// ON BY DEFAULT since the capture path was made frame-deterministic; opt out with
// `?prewarm=0`. It is now PROVEN pixel-neutral: `tools/baseline.mjs` with
// `--query=prewarm=0` vs `--query=prewarm=1` reports identical:true on all 11
// shots (0 changed pixels, maxDelta 0). The two things that previously made the
// ~1.4 s pre-warm spend look like a visual change were both boot-duration
// couplings OUTSIDE the subsystems: (1) the shutter frame index was latency-bound
// because the engine kept stepping through the driver's round trips — fixed by
// lockstep in src/dev/shots.js; (2) `will-change: transform` on the compass strip
// cached a composited-layer raster taken at a wall-clock-dependent moment — fixed
// in src/ui/style.js.
const warmup = params.get('prewarm') === '0' ? { ok: false, reason: 'disabled by ?prewarm=0' } : await prewarm(engine);
console.info('[boot] prewarm', warmup);
window.__PREWARM__ = warmup;

engine.start();

// Capture harness handshake: only flag ready once a frame has actually landed.
//
// BOOT_FRAMES is deliberately a frame COUNT, not a rAF race. In lockstep mode the
// engine has no loop of its own, so we hand-pump exactly this many frames and only
// then raise __READY__; the shot is therefore always applied at engine frame 3, no
// matter how long boot (or pre-warm) took in wall-clock terms.
const BOOT_FRAMES = 3;
if (lockstep) {
  await shotApi.pump(BOOT_FRAMES);
  window.__READY__ = true;
} else {
  let warm = 0;
  const readyProbe = () => {
    if (++warm >= BOOT_FRAMES) {
      window.__READY__ = true;
      return;
    }
    requestAnimationFrame(readyProbe);
  };
  requestAnimationFrame(readyProbe);
}

window.__ENGINE__ = engine;

if (import.meta.hot) {
  import.meta.hot.dispose(() => engine.dispose());
}
