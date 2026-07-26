import { el, svg, setText, setStyle, setClass, Pool, ease, clamp01 } from './util.js';

function rifleIcon(parent) {
  const s = svg('svg', { viewBox: '0 0 28 11', fill: 'rgba(240,246,250,.9)' }, parent);
  svg('polygon', { points: '0.5,4.2 6,4.2 6,8 2.2,8' }, s); // stock
  svg('rect', { x: 6, y: 3.6, width: 8.2, height: 3.4 }, s); // receiver
  svg('rect', { x: 14.2, y: 4.2, width: 6.4, height: 2.1 }, s); // handguard
  svg('rect', { x: 20.6, y: 4.6, width: 6.9, height: 1.2 }, s); // barrel
  svg('rect', { x: 23.6, y: 2.6, width: 1.1, height: 2 }, s); // front sight
  svg('polygon', { points: '9,7 12.6,7 11.9,11 9.7,11' }, s); // magazine
  svg('polygon', { points: '13,7 15,7 14.1,10.2 12.5,10.2' }, s); // grip
  return s;
}

function skullIcon(parent) {
  const s = svg('svg', { viewBox: '0 0 11 11', fill: 'rgba(255,194,71,.95)' }, parent);
  svg('path', { d: 'M5.5.8c2.4 0 4.1 1.7 4.1 4 0 1.5-.7 2.4-1.5 3v1.3H3v-1.3c-.9-.6-1.6-1.5-1.6-3 0-2.3 1.7-4 4.1-4z' }, s);
  svg('circle', { cx: 3.9, cy: 4.6, r: 1.15, fill: 'rgba(10,12,14,.9)' }, s);
  svg('circle', { cx: 7.1, cy: 4.6, r: 1.15, fill: 'rgba(10,12,14,.9)' }, s);
  svg('rect', { x: 5.05, y: 6.1, width: 0.9, height: 1.3, fill: 'rgba(10,12,14,.9)' }, s);
  svg('rect', { x: 3.4, y: 9.2, width: 1.4, height: 1.5 }, s);
  svg('rect', { x: 6.2, y: 9.2, width: 1.4, height: 1.5 }, s);
  return s;
}

/**
 * Killfeed, top right. Newest row on top, six visible, 5.6s dwell.
 * Rows the local player is involved in get the amber treatment so your own
 * kills are readable at a glance without reading the names.
 */
export class Killfeed {
  constructor(parent) {
    this.root = el('div', 'ow-killfeed', parent);
    this.pool = new Pool(
      6,
      () => {
        const row = el('div', 'ow-kf-row');
        const a = el('span', 'ow-kf-a', row, 'PLAYER');
        const w = el('span', 'ow-kf-w', row);
        const hs = el('span', 'ow-kf-hs', w);
        skullIcon(hs);
        rifleIcon(w);
        const v = el('span', 'ow-kf-v', row, 'ENEMY');
        row._a = a;
        row._v = v;
        row._hs = hs;
        return row;
      },
      this.root
    );
    this.life = 5.6;
  }

  /** @param {object} e { attacker, victim, headshot, mine, attackerFriendly } */
  push(e) {
    const it = this.pool.acquire();
    it.life = this.life;
    const n = it.node;
    this.root.prepend(n); // newest on top
    setText(n._a, (e.attacker ?? 'UNKNOWN').toUpperCase());
    setText(n._v, (e.victim ?? 'UNKNOWN').toUpperCase());
    setStyle(n._hs, 'display', e.headshot ? '' : 'none');
    setClass(n, 'mine', !!e.mine);
    setStyle(n._a, 'color', e.attackerFriendly === false ? 'var(--enemy)' : '');
    setStyle(n._v, 'color', e.attackerFriendly === false ? 'var(--friend)' : '');
    return it;
  }

  update(dt) {
    const items = this.pool.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.alive) continue;
      it.t += dt;
      if (it.t >= it.life) {
        this.pool.release(it);
        continue;
      }
      const inT = clamp01(it.t / 0.16);
      const outT = clamp01((it.t - (it.life - 0.45)) / 0.45);
      const x = (1 - ease.outQuint(inT)) * 26;
      const a = ease.outQuad(inT) * (1 - ease.inQuad(outT));
      setStyle(it.node, 'transform', `translateX(${x.toFixed(2)}px)`);
      setStyle(it.node, 'opacity', a.toFixed(3));
    }
  }

  clear() {
    this.pool.releaseAll();
  }

  dispose() {
    this.root.remove();
  }
}
