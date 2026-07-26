import * as THREE from 'three';

/**
 * WORLD — geometry toolkit.
 *
 * Everything in the level is built here from primitives: chamfered boxes,
 * extruded wall panels with real openings, prisms, cloth grids, tubes and
 * noise-deformed rocks. Nothing is loaded; nothing is a single plane.
 *
 * Two conventions that the rest of src/world/ relies on:
 *
 *  1. Every geometry carries a `color` attribute used as a *mask*, matching the
 *     materials contract: r = edge wear, g = grime, b = extra AO. Builders
 *     author these analytically (chamfer strips get wear, undersides and
 *     reveals get grime + AO) because curvature detection cannot know that the
 *     bottom of a wall is where the wind piles dust.
 *  2. Geometry is authored in local space and merged with a matrix, so the
 *     whole level collapses into a handful of draw calls.
 */

// ---------------------------------------------------------------- scratch --
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

// ------------------------------------------------------------------ noise --
/** Deterministic 3D value hash in [0,1). No Math.random anywhere. */
export function hash3(x, y, z) {
  let h = Math.imul(Math.round(x * 1013) ^ 0x27d4eb2d, 0x85ebca6b);
  h = Math.imul(h ^ Math.round(y * 1619), 0xc2b2ae35);
  h = Math.imul(h ^ Math.round(z * 31337), 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise, period ~1 unit. */
export function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const zf = fade(z - zi);
  let acc = 0;
  for (let dz = 0; dz < 2; dz++) {
    const wz = dz ? zf : 1 - zf;
    for (let dy = 0; dy < 2; dy++) {
      const wy = dy ? yf : 1 - yf;
      for (let dx = 0; dx < 2; dx++) {
        const wx = dx ? xf : 1 - xf;
        acc += hash3(xi + dx, yi + dy, zi + dz) * wx * wy * wz;
      }
    }
  }
  return acc;
}

export function fbm3(x, y, z, octaves = 3) {
  let a = 0.5;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x, y, z) * a;
    norm += a;
    a *= 0.5;
    x *= 2.03;
    y *= 2.01;
    z *= 1.97;
  }
  return sum / norm;
}

// ----------------------------------------------------------------- matrix --
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Compose a matrix without allocating at the call site. */
export function trs(out, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return out.compose(_p, _q, _s);
}

export function newTrs(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  return trs(new THREE.Matrix4(), x, y, z, ry, sx, sy, sz, rx, rz);
}

// ------------------------------------------------------------ accumulator --
/**
 * Merges transformed geometries into one indexed BufferGeometry.
 * Attributes: position, normal, uv, color(masks).
 */
export class Accum {
  constructor(name = 'merged') {
    this.name = name;
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.verts = 0;
    this.tris = 0;
  }

  get empty() {
    return this.tris === 0;
  }

  /**
   * @param {THREE.BufferGeometry} geo
   * @param {THREE.Matrix4|null} matrix
   * @param {object} opts  { masks:[w,g,ao], paint(x,y,z,nx,ny,nz,out), mulMasks }
   */
  add(geo, matrix = null, opts = null) {
    const pa = geo.getAttribute('position');
    if (!pa) return this;
    let na = geo.getAttribute('normal');
    if (!na) {
      geo.computeVertexNormals();
      na = geo.getAttribute('normal');
    }
    const ua = geo.getAttribute('uv');
    const ca = geo.getAttribute('color');
    const index = geo.getIndex();
    const base = this.verts;
    const masks = opts?.masks ?? null;
    const paint = opts?.paint ?? null;
    const out = paint ? [0, 0, 0] : null;

    if (matrix) _nm.getNormalMatrix(matrix);

    for (let i = 0; i < pa.count; i++) {
      _v0.fromBufferAttribute(pa, i);
      if (matrix) _v0.applyMatrix4(matrix);
      _n.fromBufferAttribute(na, i);
      if (matrix) _n.applyMatrix3(_nm).normalize();
      this.pos.push(_v0.x, _v0.y, _v0.z);
      this.nrm.push(_n.x, _n.y, _n.z);
      this.uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);

      let r = ca ? ca.getX(i) : 0;
      let g = ca ? ca.getY(i) : 0;
      let b = ca ? ca.getZ(i) : 0;
      if (masks) {
        r = Math.max(r, masks[0]);
        g = Math.max(g, masks[1]);
        b = Math.max(b, masks[2]);
      }
      if (paint) {
        out[0] = r;
        out[1] = g;
        out[2] = b;
        paint(_v0.x, _v0.y, _v0.z, _n.x, _n.y, _n.z, out);
        r = out[0];
        g = out[1];
        b = out[2];
      }
      this.col.push(r, g, b);
      this.verts++;
    }

    if (index) {
      const a = index.array;
      for (let i = 0; i < a.length; i++) this.idx.push(base + a[i]);
      this.tris += a.length / 3;
    } else {
      for (let i = 0; i < pa.count; i++) this.idx.push(base + i);
      this.tris += pa.count / 3;
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.name = this.name;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(
      this.verts > 65535
        ? new THREE.Uint32BufferAttribute(this.idx, 1)
        : new THREE.Uint16BufferAttribute(this.idx, 1)
    );
    g.computeBoundingSphere();
    g.computeBoundingBox();
    // Free the JS-side scratch: these arrays are megabytes.
    this.pos = this.nrm = this.uv = this.col = this.idx = null;
    return g;
  }
}

// ------------------------------------------------------------ mask helpers --
/** Rewrite a geometry's mask attribute from a callback. Local space. */
export function paintMasks(geo, fn) {
  const pa = geo.getAttribute('position');
  let na = geo.getAttribute('normal');
  if (!na) {
    geo.computeVertexNormals();
    na = geo.getAttribute('normal');
  }
  let ca = geo.getAttribute('color');
  if (!ca) {
    ca = new THREE.Float32BufferAttribute(new Float32Array(pa.count * 3), 3);
    geo.setAttribute('color', ca);
  }
  const out = [0, 0, 0];
  for (let i = 0; i < pa.count; i++) {
    out[0] = ca.getX(i);
    out[1] = ca.getY(i);
    out[2] = ca.getZ(i);
    fn(pa.getX(i), pa.getY(i), pa.getZ(i), na.getX(i), na.getY(i), na.getZ(i), out, i);
    ca.setXYZ(i, out[0], out[1], out[2]);
  }
  ca.needsUpdate = true;
  return geo;
}

/** Uniform mask fill (cheap path for props that don't need spatial variation). */
export function fillMasks(geo, w = 0, g = 0, a = 0) {
  const pa = geo.getAttribute('position');
  const arr = new Float32Array(pa.count * 3);
  for (let i = 0; i < pa.count; i++) {
    arr[i * 3] = w;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = a;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return geo;
}

/**
 * Wear on convex chamfers, grime on undersides, AO+grime toward the base.
 * Applied to nearly every prop so nothing reads as a clean extruded box.
 */
export function weatherProp(geo, opts = {}) {
  const { base = 0, wear = 0.85, grime = 0.5, down = 0.6, height = 1 } = opts;
  const bb = geo.boundingBox ?? (geo.computeBoundingBox(), geo.boundingBox);
  const lo = bb.min.y;
  const h = Math.max(1e-3, height * (bb.max.y - lo));
  return paintMasks(geo, (x, y, z, nx, ny, nz, out) => {
    const up = Math.max(0, ny);
    const dn = Math.max(0, -ny);
    const t = 1 - Math.min(1, (y - lo) / h);
    const n = fbm3(x * 3.1, y * 3.3, z * 3.1, 2);
    out[0] = Math.min(1, out[0] * wear + up * 0.18 * wear * n);
    out[1] = Math.min(1, out[1] + grime * (dn * down + t * t * base) * (0.55 + 0.9 * n));
    out[2] = Math.min(1, out[2] + dn * 0.35 + t * t * base * 0.7);
  });
}

// -------------------------------------------------------------- chamfered --
/**
 * A chamfered box. Real edges catch a specular highlight and give the vertex
 * masks somewhere to put edge wear; a stock BoxGeometry cannot.
 */
export function chamferBox(sx, sy, sz, bevel = 0.012) {
  const h = [sx * 0.5, sy * 0.5, sz * 0.5];
  const b = Math.max(0.0005, Math.min(bevel, Math.min(sx, sy, sz) * 0.4));
  // vertex(cornerIndex, faceAxis) -> position
  const signs = [];
  for (let i = 0; i < 8; i++) signs.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);
  const vert = (ci, axis) => {
    const s = signs[ci];
    const p = [0, 0, 0];
    for (let a = 0; a < 3; a++) p[a] = s[a] * (a === axis ? h[a] : h[a] - b);
    return p;
  };

  const pos = [];
  const nrm = [];
  const uv = [];
  const col = [];

  const addPoly = (pts, wear, grime) => {
    // Orient outward: the box is centred on the origin, so the centroid tells
    // us which way is out.
    _v0.set(pts[0][0], pts[0][1], pts[0][2]);
    _v1.set(pts[1][0], pts[1][1], pts[1][2]);
    _v2.set(pts[2][0], pts[2][1], pts[2][2]);
    _n.copy(_v1).sub(_v0).cross(_v2.clone().sub(_v0));
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const p of pts) {
      cx += p[0];
      cy += p[1];
      cz += p[2];
    }
    cx /= pts.length;
    cy /= pts.length;
    cz /= pts.length;
    if (_n.x * cx + _n.y * cy + _n.z * cz < 0) pts = pts.slice().reverse();
    _v0.set(pts[0][0], pts[0][1], pts[0][2]);
    _v1.set(pts[1][0], pts[1][1], pts[1][2]);
    _v2.set(pts[2][0], pts[2][1], pts[2][2]);
    _n.copy(_v1).sub(_v0).cross(_v2.clone().sub(_v0)).normalize();
    for (let t = 1; t < pts.length - 1; t++) {
      const tri = [pts[0], pts[t], pts[t + 1]];
      for (const p of tri) {
        pos.push(p[0], p[1], p[2]);
        nrm.push(_n.x, _n.y, _n.z);
        // Planar-ish uv off the dominant axis so mesh-uv materials still work.
        const ax = Math.abs(_n.x) > Math.abs(_n.y) ? (Math.abs(_n.x) > Math.abs(_n.z) ? 0 : 2) : Math.abs(_n.y) > Math.abs(_n.z) ? 1 : 2;
        uv.push(ax === 0 ? p[2] : p[0], ax === 1 ? p[2] : p[1]);
        const gr = _n.y < -0.5 ? grime + 0.35 : grime;
        col.push(wear, Math.min(1, gr), _n.y < -0.4 ? 0.35 : 0);
      }
    }
  };

  // 6 faces
  for (let axis = 0; axis < 3; axis++) {
    for (const sa of [-1, 1]) {
      const corners = [];
      for (let ci = 0; ci < 8; ci++) if (signs[ci][axis] === sa) corners.push(ci);
      // order the four corners around the face
      const a1 = (axis + 1) % 3;
      const a2 = (axis + 2) % 3;
      corners.sort((p, q) => {
        const ap = Math.atan2(signs[p][a2], signs[p][a1]);
        const aq = Math.atan2(signs[q][a2], signs[q][a1]);
        return ap - aq;
      });
      addPoly(corners.map((ci) => vert(ci, axis)), 0.06, 0.0);
    }
  }
  // 12 edge strips
  for (let a = 0; a < 3; a++) {
    for (let bx = a + 1; bx < 3; bx++) {
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const cs = [];
          for (let ci = 0; ci < 8; ci++) if (signs[ci][a] === sa && signs[ci][bx] === sb) cs.push(ci);
          addPoly([vert(cs[0], a), vert(cs[0], bx), vert(cs[1], bx), vert(cs[1], a)], 1.0, 0.0);
        }
      }
    }
  }
  // 8 corner triangles
  for (let ci = 0; ci < 8; ci++) addPoly([vert(ci, 0), vert(ci, 1), vert(ci, 2)], 1.0, 0.0);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * A plain unit box: 12 triangles instead of the 44 a chamfered one costs.
 * Used for members thin enough that a 4 mm chamfer is invisible — window frame
 * rails, shutter slats, balusters, grille bars — of which the level has tens of
 * thousands, and which otherwise dominate the triangle budget.
 */
export function plainBox() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const pa = g.getAttribute('position');
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pa.count * 3), 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** A single quad in the XY plane — window glass, thin panels. */
export function quad(w = 1, h = 1) {
  const g = new THREE.PlaneGeometry(w, h, 1, 1);
  const pa = g.getAttribute('position');
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pa.count * 3), 3));
  return g;
}

// ------------------------------------------------------------ wall panels --
/**
 * Rectangular hole spec for wallPanel:
 *   { x, y, w, h, arch?:0..1, sill?:number, ragged?:number }
 * x/y is the hole centre in panel space (panel spans -w/2..w/2, 0..h).
 */
export function holePath(o, rng) {
  const p = new THREE.Path();
  const x0 = o.x - o.w / 2;
  const x1 = o.x + o.w / 2;
  const y0 = o.y - o.h / 2;
  const y1 = o.y + o.h / 2;
  if (o.ragged) {
    // Blown-out opening: irregular polygon around the nominal rect.
    const n = 18;
    const R = o.ragged;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = (y1 - y0) / 2;
      // square-ish superellipse so it still reads as a window hole
      const c = Math.cos(t);
      const s = Math.sin(t);
      const k = 1 / Math.max(Math.abs(c), Math.abs(s)) ** 0.85;
      const j = 1 + (rng ? rng.range(-R, R) : 0);
      pts.push([cx + c * k * rx * j, cy + s * k * ry * j]);
    }
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    return p;
  }
  if (o.arch > 0) {
    const r = (o.w / 2) * o.arch;
    const yA = y1 - r;
    p.moveTo(x0, y0);
    p.lineTo(x1, y0);
    p.lineTo(x1, yA);
    // pointed-ish arch: two quadratics meeting at the apex reads Levantine
    p.quadraticCurveTo(x1, y1, o.x, y1);
    p.quadraticCurveTo(x0, y1, x0, yA);
    p.lineTo(x0, y0);
  } else {
    p.moveTo(x0, y0);
    p.lineTo(x1, y0);
    p.lineTo(x1, y1);
    p.lineTo(x0, y1);
  }
  p.closePath();
  return p;
}

/**
 * A wall panel: a slab of real thickness with real holes, extruded so every
 * opening has depth and a chamfered reveal.
 *
 * @param {number} w   panel width  (x, centred)
 * @param {number} h   panel height (y, from 0 up)
 * @param {number} t   thickness    (z, from 0 to t)
 * @param {Array}  holes
 * @param {object} opts { bevel, top:'flat'|'ragged', raggedAmp, rng, jag }
 */
export function wallPanel(w, h, t, holes = [], opts = {}) {
  const { bevel = 0.02, rng = null, top = 'flat', raggedAmp = 0.5, jag = 0 } = opts;
  const shape = new THREE.Shape();
  const x0 = -w / 2;
  const x1 = w / 2;
  shape.moveTo(x0, 0);
  shape.lineTo(x1, 0);
  if (top === 'ragged') {
    // A partially collapsed wall: stepped, broken masonry silhouette.
    const steps = Math.max(4, Math.round(w / 0.55));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = x1 - (i / steps) * w;
      const f = i / steps;
      const drop = raggedAmp * h * (0.25 + 0.75 * fbm3(x * 0.6 + 11, 3.1, 2.7, 3)) * (0.35 + f);
      pts.push([x, Math.max(0.4, h - drop)]);
    }
    shape.lineTo(x1, pts[0][1]);
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const nx = i < pts.length - 1 ? pts[i + 1][0] : x0;
      shape.lineTo(x, y);
      shape.lineTo(nx, y + (rng ? rng.range(-0.12, 0.12) : 0));
    }
    shape.lineTo(x0, pts[pts.length - 1][1]);
  } else {
    shape.lineTo(x1, h);
    if (jag > 0) {
      const steps = Math.max(3, Math.round(w / 1.2));
      for (let i = steps - 1; i >= 1; i--) {
        const x = x0 + (i / steps) * w;
        shape.lineTo(x, h + (fbm3(x * 1.7, 5.5, 1.3, 2) - 0.5) * jag);
      }
    }
    shape.lineTo(x0, h);
  }
  shape.lineTo(x0, 0);
  for (const o of holes) shape.holes.push(holePath(o, rng));

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, t - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 1,
    curveSegments: opts.curveSegments ?? 6,
    steps: 1,
  });
  if (bevel > 0) geo.translate(0, 0, bevel);
  geo.computeVertexNormals();
  geo.computeBoundingBox();

  // Masks: reveals (normals in the panel plane) get crevice grime + AO, the
  // bottom of the wall gets the dirt splash, chamfers get wear.
  paintMasks(geo, (x, y, z, nx, ny, nz, out) => {
    const face = Math.abs(nz);
    const reveal = 1 - face;
    const n = fbm3(x * 2.3, y * 2.1, z * 2.7, 2);
    out[0] = Math.min(1, reveal * 0.55 * (0.4 + n) + Math.max(0, ny) * 0.3);
    out[1] = Math.min(1, reveal * 0.42 * (0.5 + n) + Math.max(0, -ny) * 0.55);
    out[2] = Math.min(1, reveal * 0.4 + Math.max(0, -ny) * 0.4);
  });
  return geo;
}

/**
 * A rain-runoff stain, as geometry.
 *
 * Every sill, ledge, bracket, balcony slab and AC unit sheds water, and the
 * 0.6-1.8 m dark run below it is one of the loudest signals that a building has
 * stood outside for thirty years. It cannot be done with the facade's own vertex
 * masks: `wallPanel` is an extruded shape, so its front face only has vertices
 * on the outline and the hole rims — there is nowhere to put a mask halfway down
 * a wall.
 *
 * So this is a separate strip merged into the SAME material batch as the wall,
 * sitting a centimetre proud of it, whose vertex GRIME mask fades to zero at
 * every edge. Same texture, same tiling, same lighting — only the grime term
 * differs — so it reads as a stain in the render rather than as a decal stuck on
 * top of it.
 *
 * Authored in XY: x centred on the source, y running DOWN from 0 to -len.
 *
 * @param {object} rng
 * @param {number} width  strip width in metres (typically the sill width)
 * @param {number} len    how far the run carries, 0.6-1.8 m
 * @param {object} opts   { amount, cols, rows, wander }
 */
export function runoffStreak(rng, width, len, opts = {}) {
  const { amount = 0.9, cols = 5, rows = 7, wander = 0.35 } = opts;
  const seed = rng ? rng.float() * 40 : 0;
  const pos = [];
  const nrm = [];
  const uv = [];
  const col = [];
  const idx = [];
  // Runs concentrate toward the middle of a sill and drift as they fall.
  for (let j = 0; j <= rows; j++) {
    const v = j / rows; // 0 at the source, 1 at the tail
    const drift = (fbm3(seed + v * 2.3, 4.1, 1.7, 2) - 0.5) * wander * width * v;
    // the run narrows as it dries out, but never to a point
    const wj = width * (1 - v * 0.42) * (0.85 + 0.3 * fbm3(seed + 9, v * 3.1, 2.2, 2));
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      pos.push((u - 0.5) * wj + drift, -v * len, 0);
      nrm.push(0, 0, 1);
      uv.push(u, v);
      // Feathered on all four edges: a hard-edged strip is a painted stripe.
      const side = Math.sin(Math.PI * u) ** 0.8;
      const head = Math.min(1, v / 0.10);
      const tail = 1 - v * v;
      const broken = 0.55 + 0.75 * fbm3(seed + u * 4.3, v * 5.7, 3.3, 2);
      const g = Math.min(1, amount * side * head * tail * broken);
      col.push(0, g, g * 0.45);
    }
  }
  const row = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * The solid rectangles left once the holes are cut — used for collision, so a
 * doorway is a real gap in the collision hull and not a triangle soup query.
 * Returns [{x, y, w, h}] in panel space.
 */
export function solidSlabs(w, h, holes) {
  // Split into vertical bands at every hole edge, then within each band into
  // horizontal runs between holes that overlap that band.
  const xs = new Set([-w / 2, w / 2]);
  for (const o of holes) {
    xs.add(Math.max(-w / 2, o.x - o.w / 2));
    xs.add(Math.min(w / 2, o.x + o.w / 2));
  }
  const cuts = [...xs].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const bx0 = cuts[i];
    const bx1 = cuts[i + 1];
    if (bx1 - bx0 < 1e-4) continue;
    const mid = (bx0 + bx1) / 2;
    const spans = holes
      .filter((o) => mid > o.x - o.w / 2 && mid < o.x + o.w / 2)
      .map((o) => [Math.max(0, o.y - o.h / 2), Math.min(h, o.y + o.h / 2)])
      .sort((a, b) => a[0] - b[0]);
    let y = 0;
    for (const [s0, s1] of spans) {
      if (s0 > y) out.push({ x: (bx0 + bx1) / 2, y: (y + s0) / 2, w: bx1 - bx0, h: s0 - y });
      y = Math.max(y, s1);
    }
    if (y < h) out.push({ x: (bx0 + bx1) / 2, y: (y + h) / 2, w: bx1 - bx0, h: h - y });
  }
  return out;
}

// -------------------------------------------------------------- primitives --
/** Convex/simple polygon extruded along +Y. pts = [[x,z], ...] CCW. */
export function polyPrism(pts, height, opts = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: !!opts.bevel,
    bevelThickness: opts.bevel ?? 0,
    bevelSize: opts.bevel ?? 0,
    bevelSegments: 1,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

/** Flat irregular patch on the XZ plane — sand drifts, oil stains, render patches. */
export function patchGeometry(rng, radius, opts = {}) {
  const { lobes = 9, wobble = 0.45, sag = 0.0 } = opts;
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  pos.push(0, 0, 0);
  nrm.push(0, 1, 0);
  uv.push(0, 0);
  const rs = [];
  for (let i = 0; i < lobes; i++) rs.push(radius * (1 - wobble + rng.float() * wobble * 2));
  for (let i = 0; i < lobes; i++) {
    const t = (i / lobes) * Math.PI * 2;
    const r = rs[i];
    pos.push(Math.cos(t) * r, -sag, Math.sin(t) * r);
    nrm.push(0, 1, 0);
    uv.push(Math.cos(t), Math.sin(t));
  }
  for (let i = 0; i < lobes; i++) idx.push(0, 1 + i, 1 + ((i + 1) % lobes));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * A drift berm: a ridge of blown sand or swept rubble piled against a wall.
 *
 * Runs along local +X for `len`, `w` deep in Z with the TALL edge at z=0 (put
 * that edge against the wall) feathering to nothing at z=w. The crest wanders and
 * dips along its length and the toe is scalloped, so it never reads as an
 * extruded triangle. This is the single cheapest fix for the hard geometric line
 * where a wall meets the ground — the thing that otherwise looks like a
 * Z-fighting seam in every wide shot.
 */
export function driftBerm(rng, len, w, h, opts = {}) {
  const nx = Math.max(4, Math.round(len / 0.55));
  const nz = opts.nz ?? 4;
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  const seed = rng.float() * 30;
  for (let i = 0; i <= nx; i++) {
    const u = i / nx;
    const x = (u - 0.5) * len;
    // crest height wanders, and the ends taper into the ground
    const taper = Math.min(1, Math.min(u, 1 - u) * 6);
    const wob = 0.45 + fbm3(x * 0.7 + seed, 2.1, seed, 3) * 1.1;
    const ch = h * wob * taper;
    const cw = w * (0.6 + fbm3(x * 0.5 + seed + 7, 5.3, 1.9, 2) * 0.85);
    for (let j = 0; j <= nz; j++) {
      const v = j / nz;
      // cosine section: steep at the wall, long feathered toe out into the road
      const y = ch * Math.cos((v * Math.PI) / 2) ** 1.7;
      const rip = fbm3(x * 2.3 + seed, v * 3.1, 8.4, 2) - 0.5;
      pos.push(x, Math.max(0, y + rip * h * 0.22 * (1 - v)), v * cw);
      nrm.push(0, 1, 0);
      uv.push(x * 0.5, v * cw * 0.5);
    }
  }
  const row = nz + 1;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const a = i * row + j;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Noise-deformed rock / masonry chunk. */
export function rockGeometry(rng, size = 0.3, detail = 1, squash = 0.7) {
  const g = new THREE.IcosahedronGeometry(size * 0.5, detail);
  const pa = g.getAttribute('position');
  const seed = rng.float() * 40;
  for (let i = 0; i < pa.count; i++) {
    _v0.fromBufferAttribute(pa, i);
    const n = fbm3(_v0.x * 7 + seed, _v0.y * 7 + seed, _v0.z * 7 + seed, 2);
    const f = 0.62 + n * 0.72;
    // faceted, not blobby: quantise the radius a little
    _v0.multiplyScalar(f);
    _v0.y *= squash;
    pa.setXYZ(i, _v0.x, _v0.y, _v0.z);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * Hanging / draped cloth.
 *
 * Cloth is NOT a plane. A zero-thickness quad reads as rigid glass the instant
 * you see it edge-on — the edge goes to nothing, the front and the back are the
 * same surface, and no amount of texture rescues it. So this builds a real
 * double shell: a deformed mid-surface, offset ±half-thickness along its own
 * normal, closed by a rim strip that thickens into a rolled hem at the free
 * edges. 2 mm of thickness and a 6 mm hem bead is the whole difference between
 * fabric and a pane of coloured glass.
 *
 * Deformation is catenary sag + wind ripple + sharp triangle-wave creases
 * (a sine reads as jelly; cloth creases), with an optional frayed bottom edge.
 * Crease troughs and the hem get baked AO/grime so the surface is never flat.
 */
export function clothGeometry(w, h, opts = {}) {
  const {
    segX = 10,
    segY = 8,
    sag = 0.12,
    wrinkle = 0.03,
    twist = 0.0,
    rng = null,
    bulge = 0.0,
    /**
     * Cut a spanwise slice [u0,u1] out of the cloth while keeping the parent's
     * catenary, so an awning can be built from alternating colour strips that
     * still share one continuous surface.
     */
    uRange = null,
    seed: seedIn = null,
    /** Cloth gauge in metres: canvas ~2 mm, a rug or tarp ~3 mm. */
    thickness = 0.0022,
    /** Rolled-hem strength at the free edges (0 = raw cut edge). */
    hem = 1,
    /** Ragged / scalloped bottom edge amplitude, in metres. */
    fray = 0.0,
    /**
     * Which way the cloth bellies. Sag and bulge push toward -z by default;
     * `bow: -1` flips them, which is what a rug hung flat on a facade needs so
     * it bows out into the street instead of through the wall behind it.
     */
    bow = 1,
  } = opts;
  const u0 = uRange ? uRange[0] : 0;
  const u1 = uRange ? uRange[1] : 1;
  const sw = w * (u1 - u0); // slice width
  const nx = segX + 1;
  const ny = segY + 1;
  const nv = nx * ny;
  const seed = seedIn ?? (rng ? rng.float() * 30 : 0);

  const P = new Float32Array(nv * 3);
  const N = new Float32Array(nv * 3);
  const UV = new Float32Array(nv * 2);
  const HT = new Float32Array(nv); // half thickness per vertex
  const AO = new Float32Array(nv); // crease occlusion per vertex

  // triangle wave in -1..1: creases have corners, sines do not
  const tri = (t) => {
    const f = ((t % 1) + 1) % 1;
    return f < 0.5 ? f * 4 - 1 : 3 - f * 4;
  };

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const uu = i / segX; // 0..1 across this slice
      const u = u0 + uu * (u1 - u0); // 0..1 across the parent cloth
      const v = j / segY; // 0 = bottom hem, 1 = the line it hangs from
      let x = (u - 0.5) * w;
      let y = (v - 0.5) * h;
      // catenary along the top edge, released as it descends
      const cat = Math.cosh((u - 0.5) * 2.2) - 1;
      let z = -cat * sag * (1 - v * 0.35);
      z += Math.sin(v * 7.1 + u * 3.3 + seed) * wrinkle * (0.4 + u * (1 - u) * 3);
      z += Math.sin(u * 11.3 + seed * 2) * wrinkle * 0.5 * v;
      // folds: sharp, and deepest where the cloth hangs loose at the bottom
      const cr = tri(u * 2.6 + v * 1.15 + seed * 0.37);
      z += cr * wrinkle * 0.85 * (0.4 + 0.6 * (1 - v));
      z -= bulge * Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      z *= bow;
      y -= cat * sag * 0.5;
      x += twist * (v - 0.5) * Math.sin(u * 4 + seed);
      if (j === 0 && fray > 0) {
        // scalloped / frayed hem: the bottom edge is never a ruled line
        y -= fray * (0.3 + 0.7 * Math.abs(Math.sin(u * 8.7 + seed * 1.7)));
        x += fray * 0.35 * Math.sin(u * 15.3 + seed);
      }
      P[k * 3] = x;
      P[k * 3 + 1] = y;
      P[k * 3 + 2] = z;
      UV[k * 2] = uu;
      UV[k * 2 + 1] = v;
      // the hem: a rolled bead at the bottom, a narrower one at the other edges
      const dBottom = v * h;
      const dTop = (1 - v) * h;
      const dSide = Math.min(uu, 1 - uu) * sw;
      const band = Math.max(
        Math.max(0, 1 - dBottom / 0.045),
        0.55 * Math.max(0, 1 - Math.min(dTop, dSide) / 0.03)
      );
      HT[k] = thickness * 0.5 * (1 + hem * 2.8 * band * band);
      AO[k] = Math.max(0, -cr) * 0.4 + band * 0.3;
    }
  }

  // mid-surface normals from grid tangents
  const tu = [0, 0, 0];
  const tv = [0, 0, 0];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const i0 = i > 0 ? i - 1 : i;
      const i1 = i < nx - 1 ? i + 1 : i;
      const j0 = j > 0 ? j - 1 : j;
      const j1 = j < ny - 1 ? j + 1 : j;
      for (let c = 0; c < 3; c++) {
        tu[c] = P[(j * nx + i1) * 3 + c] - P[(j * nx + i0) * 3 + c];
        tv[c] = P[(j1 * nx + i) * 3 + c] - P[(j0 * nx + i) * 3 + c];
      }
      let nxv = tu[1] * tv[2] - tu[2] * tv[1];
      let nyv = tu[2] * tv[0] - tu[0] * tv[2];
      let nzv = tu[0] * tv[1] - tu[1] * tv[0];
      const l = Math.hypot(nxv, nyv, nzv) || 1;
      N[k * 3] = nxv / l;
      N[k * 3 + 1] = nyv / l;
      N[k * 3 + 2] = nzv / l;
    }
  }

  const pos = [];
  const nrm = [];
  const uv = [];
  const col = [];
  const idx = [];
  const push = (px, py, pz, nx2, ny2, nz2, u2, v2, wear, grime, ao) => {
    pos.push(px, py, pz);
    nrm.push(nx2, ny2, nz2);
    uv.push(u2, v2);
    col.push(wear, grime, ao);
    return pos.length / 3 - 1;
  };

  // --- the two shells ---
  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
    const base = pos.length / 3;
    for (let k = 0; k < nv; k++) {
      const o = HT[k] * sign;
      // the back of a hanging cloth is dustier and never gets sun
      const grime = s === 0 ? AO[k] * 0.5 : 0.28 + AO[k] * 0.5;
      push(
        P[k * 3] + N[k * 3] * o,
        P[k * 3 + 1] + N[k * 3 + 1] * o,
        P[k * 3 + 2] + N[k * 3 + 2] * o,
        N[k * 3] * sign,
        N[k * 3 + 1] * sign,
        N[k * 3 + 2] * sign,
        UV[k * 2],
        UV[k * 2 + 1],
        AO[k] * 0.5,
        grime,
        AO[k] * (s === 0 ? 1 : 1.3)
      );
    }
    for (let j = 0; j < segY; j++) {
      for (let i = 0; i < segX; i++) {
        const a = base + j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        if (sign > 0) idx.push(a, b, d, a, d, c);
        else idx.push(a, d, b, a, c, d);
      }
    }
  }

  // --- rim strip: the hem, which is what gives the edge a silhouette ---
  const loop = [];
  for (let i = 0; i < nx - 1; i++) loop.push(i);
  for (let j = 0; j < ny - 1; j++) loop.push(j * nx + (nx - 1));
  for (let i = nx - 1; i > 0; i--) loop.push((ny - 1) * nx + i);
  for (let j = ny - 1; j > 0; j--) loop.push(j * nx);
  for (let e = 0; e < loop.length; e++) {
    const ka = loop[e];
    const kb = loop[(e + 1) % loop.length];
    const ax = P[ka * 3];
    const ay = P[ka * 3 + 1];
    const az = P[ka * 3 + 2];
    const bx = P[kb * 3];
    const by = P[kb * 3 + 1];
    const bz = P[kb * 3 + 2];
    // outward = edge x normal (the rim faces away from the cloth)
    const ex = bx - ax;
    const ey = by - ay;
    const ez = bz - az;
    const mnx = (N[ka * 3] + N[kb * 3]) * 0.5;
    const mny = (N[ka * 3 + 1] + N[kb * 3 + 1]) * 0.5;
    const mnz = (N[ka * 3 + 2] + N[kb * 3 + 2]) * 0.5;
    let ox = ey * mnz - ez * mny;
    let oy = ez * mnx - ex * mnz;
    let oz = ex * mny - ey * mnx;
    const ol = Math.hypot(ox, oy, oz) || 1;
    ox /= ol;
    oy /= ol;
    oz /= ol;
    const q = [];
    for (const [k, sgn] of [
      [ka, 1],
      [ka, -1],
      [kb, -1],
      [kb, 1],
    ]) {
      const o = HT[k] * sgn;
      q.push(
        push(
          P[k * 3] + N[k * 3] * o,
          P[k * 3 + 1] + N[k * 3 + 1] * o,
          P[k * 3 + 2] + N[k * 3 + 2] * o,
          ox,
          oy,
          oz,
          UV[k * 2],
          UV[k * 2 + 1],
          0.45,
          0.3 + AO[k] * 0.4,
          Math.min(1, AO[k] + 0.2)
        )
      );
    }
    idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Sagging cable / rope / wire between two points, as a thin tube. */
export function catenaryTube(from, to, sagAmt, radius, opts = {}) {
  const { seg = 12, radial = 4, jitter = 0 } = opts;
  const pts = [];
  const K = Math.cosh(1.5) - 1;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    // normalised catenary droop: 0 at the ends, 1 at mid-span
    const droop = (Math.cosh(1.5) - Math.cosh((t - 0.5) * 3)) / K;
    pts.push(
      new THREE.Vector3(
        from[0] + (to[0] - from[0]) * t + (jitter ? (fbm3(i * 3.1, 1.2, 4.4, 2) - 0.5) * jitter : 0),
        from[1] + (to[1] - from[1]) * t - sagAmt * droop,
        from[2] + (to[2] - from[2]) * t + (jitter ? (fbm3(i * 2.7, 8.2, 1.4, 2) - 0.5) * jitter : 0)
      )
    );
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, seg, radius, radial, false);
  g.computeBoundingBox();
  return g;
}

/**
 * A sack / sandbag.
 *
 * The failure mode this exists to avoid: a squashed sphere with pinched ends is
 * a lozenge, and a wall of lozenges reads as bread rolls or ravioli, not cover.
 * A filled sandbag is a rounded BOX — flat where it is compressed against its
 * neighbours, square-ish shoulders, ears bulging at the four corners, a sewn
 * seam ridge over the top and a tied, folded neck at one end.
 *
 * So the base shape is an Lp-ball (`box` 2 = sphere, 4 = nearly a brick) rather
 * than an ellipsoid, and each of the three variants has a different silhouette:
 *   0  plump, evenly filled, seam across the crown
 *   1  slumped: one end fat, the middle sagging, top dished
 *   2  half-empty: a flat folded end and a deep crease across the waist
 *
 * w/h/d are the FULL dimensions of the finished bag, in metres — a filled
 * sandbag is about 0.5 x 0.17 x 0.3, and getting that wrong makes every piece
 * of cover in the level read at the wrong scale.
 */
export function sackGeometry(rng, w = 0.5, h = 0.17, d = 0.3, opts = {}) {
  const { variant = 0, box = 3.1, lump = 1 } = opts;
  const g = new THREE.SphereGeometry(0.5, 20, 12);
  const pa = g.getAttribute('position');
  const seed = rng.float() * 50;
  for (let i = 0; i < pa.count; i++) {
    _v0.fromBufferAttribute(pa, i);
    // unit direction -> Lp ball: the boxy silhouette of a filled bag
    let ux = _v0.x * 2;
    let uy = _v0.y * 2;
    let uz = _v0.z * 2;
    const p = box;
    const q =
      Math.abs(ux) ** p + Math.abs(uy) ** p + Math.abs(uz) ** p;
    const f = q > 1e-6 ? 1 / q ** (1 / p) : 1;
    ux *= f;
    uy *= f;
    uz *= f;
    // the top of a bag under load is flatter than the bottom
    const flat = uy > 0 ? 1 - uy * uy * 0.2 : 1;
    const n = fbm3(ux * 3.4 + seed, uy * 3.4 + seed, uz * 3.4 + seed, 3) - 0.5;
    const n2 = fbm3(ux * 9 + seed * 2, uy * 8 + seed, uz * 9 + seed * 3, 2) - 0.5;
    let x = ux * w * 0.5 * (1 + n * 0.09 * lump);
    let z = uz * d * 0.5 * flat * (1 + n * 0.26 * lump + n2 * 0.11 * lump);
    let y = uy * h * 0.5 * (1 + n * 0.24 * lump + n2 * 0.1 * lump);
    const t = x / (w * 0.5); // -1..1 along the bag
    // Tied, folded ends. A bag is gathered and FLATTENED at the seams, not
    // pinched to a point: pinched ends are what make a stack read as ravioli.
    const neck = Math.max(0, Math.abs(t) - 0.7) / 0.3;
    z *= 1 - neck * neck * 0.3;
    y *= 1 - neck * neck * 0.55;
    // the sewn end seam stands out as a small flat lip
    if (neck > 0.55) y += Math.sign(uy) * h * 0.02 * (neck - 0.55) * 2;
    // the sewn seam runs the length of the crown on every bag
    if (uy > 0.15) y += h * 0.05 * Math.exp(-((z / (d * 0.42)) ** 2) * 6) * (1 - neck * 0.8);
    if (variant === 0) {
      z *= 1 + 0.06 * Math.cos(t * 2.6);
    } else if (variant === 1) {
      // slumped: fat at -x, sagging waist, dished top
      x += w * 0.04 * t;
      const fatter = 1 + 0.13 * (0.5 - t);
      z *= fatter;
      y *= fatter * (1 - 0.16 * Math.exp(-((t / 0.32) ** 2)));
      if (uy > 0.3) y -= h * 0.05 * Math.exp(-((t / 0.45) ** 2));
    } else {
      // half-empty: crease across the waist, flat folded end at +x
      const crease = Math.exp(-(((t - 0.1) / 0.16) ** 2));
      z *= 1 - crease * 0.2;
      y *= 1 - crease * 0.26;
      if (t > 0.5) {
        y *= 1 - (t - 0.5) * 0.5;
        z *= 1 + (t - 0.5) * 0.22;
      }
    }
    pa.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

/** Straight tube along +Y, capped. Pipes, poles, rebar, palm trunks. */
export function tubeY(radius, height, opts = {}) {
  const { radial = 8, taper = 1, open = false, seg = 1 } = opts;
  const g = new THREE.CylinderGeometry(radius * taper, radius, height, radial, seg, open);
  g.translate(0, height / 2, 0);
  g.computeBoundingBox();
  return g;
}

export function disposeAll(list) {
  for (const g of list) g?.dispose?.();
}

/** Bend a geometry's vertices around Y so long thin objects aren't perfect. */
export function warpGeometry(geo, amp = 0.02, freq = 1.1, seed = 0) {
  const pa = geo.getAttribute('position');
  for (let i = 0; i < pa.count; i++) {
    _v0.fromBufferAttribute(pa, i);
    const t = fbm3(_v0.x * freq + seed, _v0.y * freq + seed * 1.7, _v0.z * freq + seed * 2.3, 2) - 0.5;
    const t2 = fbm3(_v0.z * freq + seed * 3.1, _v0.y * freq, _v0.x * freq, 2) - 0.5;
    pa.setXYZ(i, _v0.x + t * amp, _v0.y + t2 * amp * 0.5, _v0.z + t2 * amp);
  }
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}
