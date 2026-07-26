import { el, svg, setStyle, Pool, ease, clamp01 } from './util.js';

const SEG = 7;
const SEG_STEP = 8.2; // degrees between segment centres
const SEG_ARC = 8.9; // degrees each segment covers (slight overlap = solid arc)
const BELL = [0.1, 0.28, 0.62, 1, 0.62, 0.28, 0.1];
const R_MAIN = 112;
const R_THIN = 124;

function pt(deg, r) {
  const a = (deg * Math.PI) / 180;
  return `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
}

function arcPath(cDeg, r) {
  const a0 = cDeg - SEG_ARC / 2;
  const a1 = cDeg + SEG_ARC / 2;
  return `M ${pt(a0, r)} A ${r} ${r} 0 0 1 ${pt(a1, r)}`;
}

/**
 * Directional damage indicators.
 *
 * A fading arc segment at ~112px radius pointing at the shooter. The fall-off
 * across the arc is built from seven discrete segments on a bell curve rather
 * than an SVG gradient — it reads sharper, matches CoD's stepped look, and
 * costs one path each.
 *
 * The world direction is stored per indicator and the arc is re-oriented every
 * frame, so turning toward the shooter sweeps the arc to the centre.
 */
export class DamageArcs {
  constructor(parent) {
    this.pool = new Pool(
      6,
      () => {
        const node = el('div', 'ow-dmg');
        const s = svg('svg', { viewBox: '-170 -170 340 340' }, node);
        const back = svg('g', { fill: 'none', stroke: 'rgba(0,0,0,.5)', 'stroke-width': 9.5 }, s);
        const main = svg('g', { fill: 'none', stroke: '#ff3f31', 'stroke-width': 5.6 }, s);
        const thin = svg('g', { fill: 'none', stroke: '#ff6a52', 'stroke-width': 1.5 }, s);
        for (let i = 0; i < SEG; i++) {
          const c = (i - (SEG - 1) / 2) * SEG_STEP;
          svg('path', { d: arcPath(c, R_MAIN), opacity: (BELL[i] * 0.9).toFixed(2) }, back);
          svg('path', { d: arcPath(c, R_MAIN), opacity: BELL[i].toFixed(2) }, main);
          svg('path', { d: arcPath(c, R_THIN), opacity: (BELL[i] * 0.4).toFixed(2) }, thin);
        }
        return node;
      },
      parent
    );
    this.life = 2.0;
  }

  /**
   * @param {number} dx world X of the direction player -> source (need not be unit)
   * @param {number} dz world Z of that direction
   * @param {number} intensity 0..1, scales opacity and the spawn punch
   */
  spawn(dx, dz, intensity = 1) {
    const len = Math.hypot(dx, dz) || 1;
    const it = this.pool.acquire();
    it.life = this.life;
    it.a = dx / len;
    it.b = dz / len;
    it.c = clamp01(intensity);
    return it;
  }

  /** Basis vectors are the camera's right/forward projected to XZ. */
  update(dt, rx, rz, fx, fz) {
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
      const deg = (Math.atan2(it.a * rx + it.b * rz, it.a * fx + it.b * fz) * 180) / Math.PI;
      // punch in fast, hold, then a long tail — 2s total
      const inT = clamp01(it.t / 0.09);
      const scale = 0.92 + 0.08 * ease.outQuint(inT);
      const hold = clamp01((u - 0.18) / 0.82);
      const alpha = (0.35 + 0.65 * it.c) * (1 - ease.inQuad(hold)) * ease.outQuad(inT);
      setStyle(it.node, 'transform', `rotate(${deg.toFixed(2)}deg) scale(${scale.toFixed(3)})`);
      setStyle(it.node, 'opacity', alpha.toFixed(3));
    }
  }

  clear() {
    this.pool.releaseAll();
  }

  dispose() {
    for (const it of this.pool.items) it.node.remove();
  }
}
