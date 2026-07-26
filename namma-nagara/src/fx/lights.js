import * as THREE from 'three';

/**
 * Pooled flash lights.
 *
 * Forward rendering recompiles every material when the number of visible lights
 * changes, so the pool is allocated once, added to the scene once, and never
 * removed — idle lights simply sit at zero intensity. That keeps the shader
 * permutation count constant no matter how much is exploding.
 *
 * Intensity follows a physical-ish curve: an instantaneous rise, then an
 * exponential decay whose time constant is the effect's own, so a muzzle flash
 * lights the wall for two or three frames and a fireball for a third of a
 * second.
 */
export class LightPool {
  constructor(scene, count = 4) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 2);
      l.castShadow = false;
      l.visible = true;
      l.userData.owProbe = true;
      scene.add(l);
      this.lights.push({
        light: l,
        peak: 0,
        age: 1e9,
        duration: 1,
        rise: 0.008,
        decay: 3,
        priority: 0,
      });
    }
  }

  /** Register with the renderer so it can budget/cull them. */
  register(render) {
    for (const e of this.lights) {
      // A generous range keeps the renderer's distance fade at 1 for anything
      // in front of the player, so we control intensity ourselves.
      render.addLight?.(e.light, { range: 90, priority: 3 });
    }
  }

  /**
   * @param {number} x @param {number} y @param {number} z
   * @param {number} r @param {number} g @param {number} b   linear colour
   * @param {number} peak      candela at t=0
   * @param {number} duration  seconds until it is free again
   * @param {number} decay     exponential decay rate, 1/s
   * @param {number} distance  falloff cutoff, metres
   * @param {number} priority  higher wins when the pool is full
   */
  flash(x, y, z, r, g, b, peak, duration, decay, distance, priority = 1) {
    let best = null;
    let bestScore = -Infinity;
    for (const e of this.lights) {
      // free lights first, then whichever is furthest through its life
      const score = e.age >= e.duration ? 1e6 : e.age / e.duration - e.priority * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (!best) return null;
    if (bestScore < 1e5 && best.priority > priority) return null;
    best.light.position.set(x, y, z);
    best.light.color.setRGB(r, g, b);
    best.light.distance = distance;
    best.peak = peak;
    best.age = 0;
    best.duration = duration;
    best.decay = decay;
    best.priority = priority;
    best.light.intensity = peak;
    return best;
  }

  update(dt) {
    for (const e of this.lights) {
      if (e.age >= e.duration) {
        if (e.light.intensity !== 0) e.light.intensity = 0;
        continue;
      }
      e.age += dt;
      const t = e.age;
      // rise over the first millisecond, then exponential falloff with a
      // hard tail-off so it lands exactly on zero at `duration`
      const rise = Math.min(1, t / 0.004);
      const tail = 1 - Math.min(1, t / e.duration) ** 2;
      e.light.intensity = e.peak * rise * Math.exp(-e.decay * t) * tail;
      if (e.age >= e.duration) e.light.intensity = 0;
    }
  }

  dispose() {
    for (const e of this.lights) {
      e.light.parent?.remove(e.light);
      e.light.dispose?.();
    }
    this.lights.length = 0;
  }
}
