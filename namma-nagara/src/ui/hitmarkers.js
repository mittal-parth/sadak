import { el, svg, setStyle, Pool, ease, clamp01 } from './util.js';

const R_IN = 13;  // well outside the reticle blades, so the two never merge
const R_OUT = 28.5;
const D = Math.SQRT1_2;

/** kind -> { colour, weight, scale, life, ring } */
const KINDS = {
  hit: { c: '#f6fafc', w: 1.8, s: 1.0, life: 0.26, ring: 0, spin: 0 },
  armour: { c: '#8fdcff', w: 2.0, s: 1.03, life: 0.28, ring: 0.5, spin: 0 },
  head: { c: '#ffc247', w: 2.2, s: 1.08, life: 0.32, ring: 0.3, spin: 0 },
  kill: { c: '#ff4433', w: 2.7, s: 1.18, life: 0.42, ring: 1, spin: 9 },
};

/**
 * Hitmarkers.
 *
 * Timing is the whole point: 0-40ms the X snaps in past its rest size
 * (outBack), 40-120ms it settles, then it holds bright and fades. Anything
 * slower than this feels like a notification instead of a hit.
 */
export class Hitmarkers {
  constructor(parent) {
    this.pool = new Pool(
      10,
      () => {
        const node = el('div', 'ow-hit');
        const s = svg('svg', { viewBox: '-28 -28 56 56' }, node);

        const ring = svg(
          'circle',
          {
            r: 30,
            fill: 'none',
            stroke: '#fff',
            'stroke-width': 1.4,
            opacity: 0,
          },
          s
        );

        // dark backing strokes first so the marker keeps contrast on snow/sky
        const back = svg('g', { stroke: 'rgba(0,0,0,.7)', 'stroke-width': 4.0, fill: 'none' }, s);
        const main = svg('g', { stroke: '#fff', 'stroke-width': 2.2, fill: 'none' }, s);
        for (const g of [back, main]) {
          for (let q = 0; q < 4; q++) {
            const sx = q === 0 || q === 3 ? 1 : -1;
            const sy = q < 2 ? -1 : 1;
            svg(
              'line',
              {
                x1: (R_IN * D * sx).toFixed(2),
                y1: (R_IN * D * sy).toFixed(2),
                x2: (R_OUT * D * sx).toFixed(2),
                y2: (R_OUT * D * sy).toFixed(2),
                'stroke-linecap': 'square',
              },
              g
            );
          }
        }
        node._ring = ring;
        node._main = main;
        return node;
      },
      parent
    );
  }

  /** @param {'hit'|'armour'|'head'|'kill'} kind */
  spawn(kind = 'hit') {
    const k = KINDS[kind] ?? KINDS.hit;
    const it = this.pool.acquire();
    it.life = k.life;
    it.a = k.s;
    it.b = k.ring;
    it.c = k.spin;
    it.node._main.setAttribute('stroke', k.c);
    it.node._main.setAttribute('stroke-width', k.w);
    it.node._ring.setAttribute('stroke', k.c);
    if (k.ring <= 0) setStyle(it.node._ring, 'opacity', '0');
    return it;
  }

  update(dt) {
    const items = this.pool.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.alive) continue;
      it.t += dt;
      const u = it.t / it.life;
      if (u >= 1) {
        this.pool.release(it);
        continue;
      }
      // snap in over the first 34% of life, then hold, then fall off
      const inT = clamp01(u / 0.34);
      const scale = it.a * (0.62 + 0.38 * ease.outBack(inT));
      const alpha = u < 0.55 ? 1 : 1 - ease.inOutSine((u - 0.55) / 0.45);
      const rot = it.c * ease.outCubic(inT);
      setStyle(
        it.node,
        'transform',
        `scale(${scale.toFixed(3)})` + (it.c ? ` rotate(${rot.toFixed(2)}deg)` : '')
      );
      setStyle(it.node, 'opacity', alpha.toFixed(3));

      if (it.b > 0) {
        const rt = clamp01(u / 0.6);
        const rs = 0.55 + 1.15 * ease.outQuint(rt);
        const ro = it.b * (1 - ease.outQuad(rt));
        it.node._ring.setAttribute('transform', `scale(${rs.toFixed(3)})`);
        setStyle(it.node._ring, 'opacity', ro.toFixed(3));
      }
    }
  }

  clear() {
    this.pool.releaseAll();
  }

  dispose() {
    for (const it of this.pool.items) it.node.remove();
  }
}
