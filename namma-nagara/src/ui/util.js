/**
 * UI primitives: DOM construction, easing curves, pooling, formatting.
 *
 * Rules obeyed here:
 *  - No per-frame allocation. Pools hand back existing elements/records.
 *  - No Math.random(). Anything random comes from an Rng fork passed in.
 *  - No CSS keyframe animation on gameplay feedback: every animated value is
 *    driven from update() so capture frames are deterministic.
 */

/**
 * Condensed system stacks — no webfonts, crisp at any size.
 *
 * Verified against the capture browser with `node src/ui/preview.mjs --fonts`:
 * "Avenir Next Condensed" (four weights) carries the body text, "DIN Condensed"
 * (very narrow, bold only) carries display numerals, and both degrade through
 * Arial Narrow / Helvetica Neue on machines without them.
 */
export const FONT_STACK =
  '"Avenir Next Condensed","DIN Alternate","Roboto Condensed","Arial Narrow",' +
  '"Helvetica Neue",Inter,system-ui,-apple-system,sans-serif';

/** Display face: the ammo count, banners, the menu title. */
export const FONT_DISPLAY =
  '"DIN Condensed","Avenir Next Condensed","Oswald","Arial Narrow",' +
  '"Helvetica Neue",Impact,system-ui,sans-serif';

export const FONT_MONO = '"SF Mono",ui-monospace,"Roboto Mono",Menlo,monospace';

/* ------------------------------------------------------------------ dom --- */

export function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

export function svg(tag, attrs, parent) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

/** Write textContent only when it actually changed — avoids layout thrash. */
export function setText(node, value) {
  const s = String(value);
  if (node._owText !== s) {
    node._owText = s;
    node.textContent = s;
  }
}

/** Write any style property only on change. */
export function setStyle(node, prop, value) {
  const key = '_ows_' + prop;
  if (node[key] !== value) {
    node[key] = value;
    node.style.setProperty(prop, value);
  }
}

export function setClass(node, cls, on) {
  const key = '_owc_' + cls;
  if (node[key] !== on) {
    node[key] = on;
    node.classList.toggle(cls, on);
  }
}

/** Opacity + transform in one shot; both cached. */
export function place(node, transform, opacity) {
  setStyle(node, 'transform', transform);
  if (opacity !== undefined) setStyle(node, 'opacity', opacity < 0.001 ? '0' : opacity.toFixed(3));
}

/* --------------------------------------------------------------- easing --- */

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuint: (t) => 1 - (1 - t) ** 5,
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  /** Overshoot then settle — hitmarker / banner punch. */
  outBack: (t) => {
    const c = 1.9;
    const u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
  },
  /** Damped oscillation, k = number of bounces. */
  outElastic: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - 2 ** (-9 * t) * Math.cos(t * 22);
  },
  /** Fast attack, slow release — good for anything that must feel "snappy". */
  punch: (t) => (t < 0.18 ? ease.outQuint(t / 0.18) : 1 - ease.inOutSine((t - 0.18) / 0.82)),
};

/* ----------------------------------------------------------------- math --- */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp01((v - a) / (b - a || 1));
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Framerate-independent exponential approach. `rate` = 1/e per second. */
export function damp(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-rate * dt);
}

/** Critically-damped spring step, in place on {v} holder. Returns new value. */
export function spring(current, target, holder, stiffness, damping, dt) {
  const a = (target - current) * stiffness - holder.v * damping;
  holder.v += a * dt;
  return current + holder.v * dt;
}

export const TAU = Math.PI * 2;

/** Shortest signed angular difference, radians. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/* ------------------------------------------------------------- format --- */

export function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/** 1834 -> "1.8k", 240 -> "240" */
export function shortNum(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n | 0);
}

/** Distance readout: <10m one decimal, else integer. */
export function metres(d) {
  return d < 10 ? d.toFixed(1) + 'M' : (d | 0) + 'M';
}

export function mmss(seconds) {
  const s = Math.max(0, seconds | 0);
  return `${(s / 60) | 0}:${pad2(s % 60)}`;
}

const CARDINAL = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function cardinal(deg) {
  return CARDINAL[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/* ------------------------------------------------------------------ pool --- */

/**
 * Fixed-size element pool. `make()` builds one element; records carry their own
 * animation state. Nothing is allocated after construction.
 */
export class Pool {
  constructor(count, make, parent) {
    this.items = new Array(count);
    for (let i = 0; i < count; i++) {
      const node = make(i);
      if (parent) parent.appendChild(node);
      node.style.display = 'none';
      this.items[i] = { node, alive: false, t: 0, life: 1, i, a: 0, b: 0, c: 0, d: 0, s: '' };
    }
    this.count = count;
    this._next = 0;
  }

  /** Oldest-first reuse so a burst never starves. */
  acquire() {
    let best = null;
    let bestT = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const it = this.items[(this._next + i) % this.count];
      if (!it.alive) {
        this._next = (it.i + 1) % this.count;
        it.alive = true;
        it.t = 0;
        it.node.style.display = '';
        return it;
      }
      const age = it.t / (it.life || 1);
      if (age > bestT) {
        bestT = age;
        best = it;
      }
    }
    best.alive = true;
    best.t = 0;
    best.node.style.display = '';
    return best;
  }

  release(it) {
    if (!it.alive) return;
    it.alive = false;
    it.node.style.display = 'none';
  }

  releaseAll() {
    for (let i = 0; i < this.count; i++) this.release(this.items[i]);
  }
}
