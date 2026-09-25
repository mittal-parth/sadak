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

  /** An onion or hemispherical dome sitting on y. `bulge` > 1 is Mughal. */
  dome(r: number, x: number, y: number, z: number, hex: number, bulge = 1.15): this {
    const pts: THREE.Vector2[] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // Swell past the drum, then draw in to a point.
      const rr = r * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (t < 0.5 ? 1 + (bulge - 1) * Math.sin(t * Math.PI) : 1);
      pts.push(new THREE.Vector2(Math.max(0.001, rr), r * 1.25 * t * (bulge > 1 ? 1.2 : 1)));
    }
    const g = new THREE.LatheGeometry(pts, 12);
    return this.add(g.translate(x, y, z), hex);
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
