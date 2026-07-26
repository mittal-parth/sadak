import * as THREE from 'three';
import { el, svg, setText, setStyle, setClass, Pool, ease, clamp, clamp01, metres } from './util.js';

const _v = new THREE.Vector3();

/**
 * Projects a world point into HUD pixels.
 * Returns the shared scratch object — never held past the call site.
 */
const _proj = { x: 0, y: 0, dist: 0, behind: false, offscreen: false, angle: 0 };
function project(pos, camera, w, h, margin) {
  _v.copy(pos);
  const dist = _v.distanceTo(camera.position);
  _v.project(camera);
  const behind = _v.z > 1;
  let x = (_v.x * 0.5 + 0.5) * w;
  let y = (-_v.y * 0.5 + 0.5) * h;
  if (behind) {
    // mirror through the centre so the edge arrow points the correct way
    x = w - x;
    y = h - y;
  }
  const cx = w * 0.5;
  const cy = h * 0.5;
  let dx = x - cx;
  let dy = y - cy;
  const mx = w * 0.5 - margin;
  const my = h * 0.5 - margin;
  let off = behind;
  if (Math.abs(dx) > mx || Math.abs(dy) > my) {
    off = true;
    const s = Math.min(mx / (Math.abs(dx) || 1e-4), my / (Math.abs(dy) || 1e-4));
    dx *= s;
    dy *= s;
  }
  _proj.x = cx + dx;
  _proj.y = cy + dy;
  _proj.dist = dist;
  _proj.behind = behind;
  _proj.offscreen = off;
  _proj.angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  return _proj;
}

function diamond(parent) {
  const s = svg('svg', { viewBox: '0 0 16 16' }, parent);
  svg(
    'rect',
    {
      x: 3.2,
      y: 3.2,
      width: 9.6,
      height: 9.6,
      transform: 'rotate(45 8 8)',
      fill: 'rgba(121,210,255,.9)',
      stroke: 'rgba(6,20,28,.75)',
      'stroke-width': 1,
    },
    s
  );
  return s;
}

function chevron(parent) {
  const s = svg('svg', { viewBox: '0 0 16 16' }, parent);
  svg('path', { d: 'M8 1.5 14.4 13H1.6z', fill: 'rgba(121,210,255,.95)', stroke: 'rgba(6,20,28,.7)', 'stroke-width': 1 }, s);
  return s;
}

function nadeGlyph(parent) {
  const s = svg('svg', { viewBox: '0 0 16 16' }, parent);
  svg('circle', { cx: 8, cy: 8, r: 5.4, fill: 'rgba(255,63,49,.95)', stroke: 'rgba(0,0,0,.5)', 'stroke-width': 1 }, s);
  svg('rect', { x: 7.2, y: 0.8, width: 1.6, height: 3.2, fill: 'rgba(255,63,49,.95)' }, s);
  return s;
}

/**
 * Everything anchored to a world position: objective markers with distance,
 * grenade danger indicators, and floating damage numbers.
 *
 * Off-screen targets are clamped to a rectangular ring inside the safe area and
 * their glyph swaps to a chevron pointing at the target — the same behaviour as
 * a CoD objective you have turned away from.
 */
export class WorldMarkers {
  constructor(parent, rng) {
    this.rng = rng;
    this.objRoot = el('div', 'ow-layer', parent);
    this.objPool = new Pool(
      6,
      () => {
        const node = el('div', 'ow-mk');
        const gl = el('div', 'ow-mk-glyph', node);
        const dia = diamond(gl);
        const chev = chevron(gl);
        chev.style.display = 'none';
        const letter = el('div', 'ow-mk-letter', gl, 'A');
        const dist = el('div', 'ow-mk-dist', node, '0M');
        const name = el('div', 'ow-mk-name', node, '');
        node._dia = dia;
        node._chev = chev;
        node._letter = letter;
        node._dist = dist;
        node._name = name;
        return node;
      },
      this.objRoot
    );

    this.nadePool = new Pool(
      4,
      () => {
        const node = el('div', 'ow-nade');
        const ring = el('div', 'ow-nade-ring', node);
        const core = el('div', 'ow-nade-core', node);
        nadeGlyph(core);
        const label = el('div', 'ow-nade-label', node, 'GRENADE');
        node._ring = ring;
        node._label = label;
        node._pos = new THREE.Vector3();
        return node;
      },
      this.objRoot
    );

    this.dnPool = new Pool(
      16,
      () => {
        const node = el('div', 'ow-dn');
        node._pos = new THREE.Vector3();
        return node;
      },
      this.objRoot
    );
  }

  /** @param {Array} list [{ position:Vector3, label:'A', name:'CAPTURE', color }] */
  updateObjectives(list, camera, w, h, k) {
    const items = this.objPool.items;
    let n = 0;
    const margin = 74 * k;
    if (list) {
      for (let i = 0; i < list.length && n < items.length; i++) {
        const o = list[i];
        if (!o?.position) continue;
        const p = project(o.position, camera, w, h, margin);
        const it = items[n++];
        if (!it.alive) {
          it.alive = true;
          setStyle(it.node, 'display', '');
        }
        const node = it.node;
        setStyle(node, 'transform', `translate(${(p.x - 20 * k).toFixed(1)}px,${(p.y - 12 * k).toFixed(1)}px)`);
        setStyle(node, 'width', `${(40 * k).toFixed(1)}px`);
        setText(node._letter, o.label ?? '');
        setText(node._dist, metres(p.dist));
        setText(node._name, o.name ?? '');
        const edge = p.offscreen;
        setStyle(node._dia, 'display', edge ? 'none' : '');
        setStyle(node._chev, 'display', edge ? '' : 'none');
        setStyle(node._letter, 'opacity', edge ? '0' : '1');
        if (edge) setStyle(node._chev, 'transform', `rotate(${p.angle.toFixed(1)}deg)`);
        // distant markers dim so a busy map doesn't turn into a wall of icons
        const fade = clamp01(1.15 - p.dist / 260) * (edge ? 0.72 : 1);
        setStyle(node, 'opacity', fade.toFixed(3));
      }
    }
    for (let i = n; i < items.length; i++) {
      if (items[i].alive) {
        items[i].alive = false;
        setStyle(items[i].node, 'display', 'none');
      }
    }
  }

  /** @param {number} fuse seconds until detonation */
  spawnGrenade(position, fuse = 2.4) {
    const it = this.nadePool.acquire();
    it.life = fuse;
    it.node._pos.copy(position);
    return it;
  }

  updateGrenades(dt, camera, w, h, k) {
    const items = this.nadePool.items;
    const margin = 56 * k;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.alive) continue;
      it.t += dt;
      if (it.t >= it.life) {
        this.nadePool.release(it);
        continue;
      }
      const node = it.node;
      const p = project(node._pos, camera, w, h, margin);
      setStyle(node, 'transform', `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`);
      const close = p.dist < 9;
      setText(node._label, close ? 'DANGER CLOSE' : 'GRENADE');
      // pulse rate ramps as the fuse burns down
      const remain = 1 - it.t / it.life;
      const rate = 2.2 + (1 - remain) * 5;
      const ph = (it.t * rate) % 1;
      const rs = 0.7 + 0.9 * ease.outCubic(ph);
      setStyle(node._ring, 'transform', `scale(${rs.toFixed(3)})`);
      setStyle(node._ring, 'opacity', (0.9 * (1 - ph)).toFixed(3));
      setStyle(node, 'opacity', clamp01(remain * 4).toFixed(3));
    }
  }

  /** @param {'hit'|'hs'|'kill'|'armour'} kind */
  spawnDamage(position, amount, kind = 'hit') {
    const it = this.dnPool.acquire();
    it.life = kind === 'kill' ? 1.25 : 0.95;
    it.node._pos.copy(position);
    it.a = this.rng.signed() * 16; // lateral drift
    it.b = 0.9 + this.rng.float() * 0.25;
    setText(it.node, Math.round(amount));
    setClass(it.node, 'hs', kind === 'hs');
    setClass(it.node, 'kill', kind === 'kill');
    setClass(it.node, 'armour', kind === 'armour');
    return it;
  }

  updateDamage(dt, camera, w, h, k) {
    const items = this.dnPool.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.alive) continue;
      it.t += dt;
      const u = it.t / it.life;
      if (u >= 1) {
        this.dnPool.release(it);
        continue;
      }
      const node = it.node;
      const p = project(node._pos, camera, w, h, 0);
      if (p.behind) {
        setStyle(node, 'opacity', '0');
        continue;
      }
      const rise = ease.outCubic(clamp01(u * 1.15)) * 42 * k * it.b;
      const drift = it.a * k * ease.outQuad(u);
      const pop = 1 + 0.35 * (1 - ease.outQuint(clamp01(u / 0.12)));
      setStyle(
        node,
        'transform',
        `translate(${(p.x + drift).toFixed(1)}px,${(p.y - rise).toFixed(1)}px) translate(-50%,-50%) scale(${pop.toFixed(3)})`
      );
      const a = u < 0.55 ? 1 : 1 - ease.inQuad((u - 0.55) / 0.45);
      setStyle(node, 'opacity', (a * clamp01(2.6 - p.dist / 90)).toFixed(3));
    }
  }

  clear() {
    this.nadePool.releaseAll();
    this.dnPool.releaseAll();
  }

  dispose() {
    this.objRoot.remove();
  }
}
