/**
 * Vertex-coloured geometry kit for the world builders: every part is baked
 * with its colour and transform, then merged, so a whole monument is one or
 * two draw calls. (The same approach buildings.ts and transit.ts use.)
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

const _c = new THREE.Color();

export function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  _c.setHex(hex);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) _c.toArray(cols, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

/** Collects coloured parts and merges them into one mesh. */
export class Parts {
  readonly list: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, hex: number): this {
    this.list.push(paint(geo, hex));
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number, rotY = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotY) g.rotateY(rotY);
    return this.add(g.translate(x, y, z), hex);
  }

  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, hex: number, seg = 10): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg).translate(x, y, z), hex);
  }

  cone(r: number, h: number, x: number, y: number, z: number, hex: number, seg = 8): this {
    return this.add(new THREE.ConeGeometry(r, h, seg).translate(x, y, z), hex);
  }

  /** A dome sitting on y: an onion (`bulge` > 1, Mughal: swelling past its
   *  drum, drawn in to a point) or a raised hemisphere. About 1.25–1.55 r
   *  tall either way. */
  dome(r: number, x: number, y: number, z: number, hex: number, bulge = 1.15): this {
    const pts: THREE.Vector2[] = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let f: number;
      let h: number;
      if (bulge > 1.02) {
        const swell = 0.8 + 0.2 * Math.min(1, (bulge - 1) / 0.15);
        f = t < 0.38 ? swell + (1 - swell) * Math.sin((t / 0.38) * (Math.PI / 2)) : Math.pow(Math.cos(((t - 0.38) / 0.62) * (Math.PI / 2)), 1.25);
        h = 1.5;
      } else {
        // A hemisphere lifted to a soft point.
        f = Math.pow(Math.cos(t * (Math.PI / 2)), 0.9);
        h = 1.25;
      }
      pts.push(new THREE.Vector2(Math.max(0.001, r * f), t * r * h));
    }
    return this.add(new THREE.LatheGeometry(pts, 14).translate(x, y, z), hex);
  }

  /** A flight of steps rising toward local -z from y=0 to `rise`, centred
   *  at (x, z) = the foot of the flight's middle. */
  steps(w: number, rise: number, x: number, z: number, hex: number, rotY = 0): { run: number } {
    const n = Math.max(2, Math.round(rise / 0.17));
    const tread = 0.32;
    const r = rise / n;
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(w, r * (i + 1), tread);
      g.translate(0, (r * (i + 1)) / 2, -tread * (i + 0.5));
      if (rotY) g.rotateY(rotY);
      this.add(g.translate(x, 0, z), hex);
    }
    return { run: n * tread };
  }

  /** Merge everything added so far into one geometry, and reset. */
  geometry(): THREE.BufferGeometry | null {
    if (!this.list.length) return null;
    const g = BufferGeometryUtils.mergeGeometries(this.list, false)!;
    this.list.forEach((p) => p.dispose());
    this.list.length = 0;
    return g;
  }

  mesh(material: THREE.Material): THREE.Mesh | null {
    const g = this.geometry();
    if (!g) return null;
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

/** A semicircular-arched opening `w` wide, springing at `spring`, cut
 *  through a slab `d` thick from y=0 to `top`: the slab above and beside the
 *  arch, as one extruded shape (local x across, z through). */
export function archedSlab(w: number, spring: number, top: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, spring);
  s.absarc(0, spring, w / 2, Math.PI, 0, true);
  s.lineTo(w / 2, spring);
  s.lineTo(w / 2, top);
  s.lineTo(-w / 2, top);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -d / 2);
}

/**
 * A Mughal onion dome of radius `r` sitting on y: swelling past its drum,
 * drawn in to a point. Several colours stripe it in wedges round the axis
 * (the Jama Masjid's white marble with black bands).
 */
export function onion(P: Parts, r: number, x: number, y: number, z: number, colours: number[], wedges = 32): void {
  const pts: THREE.Vector2[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const f = t < 0.38 ? 0.8 + 0.2 * Math.sin((t / 0.38) * (Math.PI / 2)) : Math.pow(Math.cos(((t - 0.38) / 0.62) * (Math.PI / 2)), 1.25);
    pts.push(new THREE.Vector2(Math.max(0.001, r * f), t * r * 1.55));
  }
  if (colours.length === 1) {
    P.add(new THREE.LatheGeometry(pts, 16).translate(x, y, z), colours[0]);
    return;
  }
  for (let i = 0; i < wedges; i++) {
    const g = new THREE.LatheGeometry(pts, 1, (i / wedges) * Math.PI * 2, (Math.PI * 2) / wedges);
    P.add(g.translate(x, y, z), colours[i % colours.length]);
  }
}

/** A tapering shaft striped in vertical wedges of `a` and `b`. */
export function stripedShaft(P: Parts, rTop: number, rBot: number, h: number, x: number, y: number, z: number, a: number, b: number, n = 16): void {
  for (let i = 0; i < n; i++) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, 1, 1, false, (i / n) * Math.PI * 2, (Math.PI * 2) / n);
    P.add(g.translate(x, y + h / 2, z), i % 2 ? b : a);
  }
}
