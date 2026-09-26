/**
 * Painted sky, flat cel clouds and a hazy skyline beyond the playable grid.
 *
 * The sky is a gradient dome driven by the district's five sky stops, with a
 * faint quantisation so it reads as airbrushed background art rather than a
 * physical sky. Clouds are two stacked cards per cloud (a shade layer offset
 * below a light layer), which gives them a two-tone cel read for two quads.
 * The skyline is a ring of unlit silhouettes standing past the last road, so
 * the end of every street closes on "more city" instead of empty ground.
 *
 * Cloud and dome approach adapted from sakura-crossing
 * (https://github.com/Kenton-GMI/sakura-crossing), MIT License,
 * Copyright (c) 2026 Kenton Wang.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../props";

export type SkyRig = {
  /** Dome + clouds; recentre on the camera every frame. */
  sky: THREE.Group;
  /** World-anchored silhouettes past the grid edge. */
  skyline: THREE.Mesh;
  follow(camera: THREE.Camera): void;
};

function colour(hex: string | number): THREE.Color {
  return new THREE.Color(hex);
}

function makeDome(stops: readonly string[], radius: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uStops: { value: stops.map((s) => colour(s)) },
      uBands: { value: 28 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uStops[5];
      uniform float uBands;
      varying vec3 vDir;

      void main() {
        // Elevation 0 at the horizon, 1 at the zenith.
        float e = clamp( normalize( vDir ).y, 0.0, 1.0 );
        // Soft quantisation: mostly smooth with a faint painted step.
        float q = floor( e * uBands ) / uBands;
        e = mix( e, q, 0.3 );

        // Stops are zenith -> horizon; the lower ones crowd toward the
        // horizon so the warm glow band is a band, not half the sky.
        vec3 c = uStops[4];
        c = mix( c, uStops[3], smoothstep( 0.0, 0.07, e ) );
        c = mix( c, uStops[2], smoothstep( 0.05, 0.2, e ) );
        c = mix( c, uStops[1], smoothstep( 0.16, 0.5, e ) );
        c = mix( c, uStops[0], smoothstep( 0.42, 0.95, e ) );
        gl_FragColor = vec4( c, 1.0 );
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  return dome;
}

let cloudTexture: THREE.CanvasTexture | null = null;

/**
 * A cumulus mask: overlapping discs piled on a flat base, hard-edged so it
 * reads as a painted shape. White on transparent; colour comes from the
 * material so one texture serves every district.
 */
function getCloudTexture(): THREE.CanvasTexture {
  if (cloudTexture) return cloudTexture;
  const W = 512;
  const H = 192;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(8812);
  const base = H * 0.78;

  ctx.fillStyle = "#fff";
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const x = W * (0.1 + t * 0.8) + (rand() - 0.5) * 30;
    // Tallest in the middle, low at the ends: the classic cumulus profile.
    const hump = Math.sin(t * Math.PI);
    const r = 22 + hump * 52 + rand() * 18;
    const y = base - r * (0.35 + hump * 0.35);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Flat bottom.
  ctx.clearRect(0, base, W, H - base);
  ctx.fillRect(W * 0.12, base - 10, W * 0.76, 10);

  cloudTexture = new THREE.CanvasTexture(canvas);
  cloudTexture.colorSpace = THREE.SRGBColorSpace;
  return cloudTexture;
}

function makeClouds(stops: readonly string[], radius: number): THREE.Group {
  const tex = getCloudTexture();
  const light = colour(stops[4]).lerp(colour(0xffffff), 0.7);
  // Shade side: the upper sky colour, lifted and pulled toward violet, so
  // cloud shadow matches the cool cel shadows on the street below.
  const shade = colour(stops[1]).lerp(colour(0xffffff), 0.45).lerp(colour(0x9a90c8), 0.25);

  const matLight = new THREE.MeshBasicMaterial({
    color: light,
    map: tex,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    fog: false,
  });
  const matShade = new THREE.MeshBasicMaterial({
    color: shade,
    map: tex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  });

  const group = new THREE.Group();
  const rand = mulberry32(7781);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + (rand() - 0.5) * 0.25;
    const r = radius * (0.72 + rand() * 0.18);
    const w = 70 + rand() * 110;
    const h = w * (0.32 + rand() * 0.1);
    // Elevation 6-26 degrees: clouds sit over the rooftops, not overhead.
    const y = Math.tan(THREE.MathUtils.degToRad(6 + rand() * 20)) * r;

    const g = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matShade);
    back.position.set(0, -h * 0.08, -1.5);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.9), matLight);
    front.position.set(-w * 0.02, h * 0.04, 0);
    g.add(back, front);
    g.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    g.lookAt(0, y * 0.5, 0);
    g.renderOrder = -9;
    group.add(g);
  }
  return group;
}

/**
 * Unlit silhouettes in two rings past the grid. Colours are the district's
 * building palette pulled most of the way into the horizon haze, the far
 * ring more so, so they read as painted background flats that recede.
 */
function makeSkyline(
  stops: readonly string[],
  palette: number[],
  inner: number,
  seed: number
): THREE.Mesh {
  const rand = mulberry32(seed);
  const haze = colour(stops[3]).lerp(colour(stops[4]), 0.5);
  const parts: THREE.BufferGeometry[] = [];

  const rings = [
    { at: inner + 12, depth: 26, pull: 0.62, hMin: 7, hMax: 24 },
    { at: inner + 60, depth: 40, pull: 0.78, hMin: 12, hMax: 42 },
  ];

  for (const ring of rings) {
    const side = ring.at * 2;
    // Walk each of the four sides of a square ring.
    for (let s = 0; s < 4; s++) {
      let t = -side / 2;
      while (t < side / 2) {
        const w = 6 + rand() * 14;
        const h = ring.hMin + rand() * (ring.hMax - ring.hMin);
        const d = 6 + rand() * 10;
        const off = ring.at + rand() * ring.depth;
        const along = t + w / 2;
        const geo = new THREE.BoxGeometry(w, h, d);
        // Occasional stepped tower, so the roofline is not a bar chart.
        const extra: THREE.BufferGeometry[] = [];
        if (rand() > 0.72) {
          const th = 4 + rand() * 10;
          extra.push(new THREE.BoxGeometry(w * 0.5, th, d * 0.5).translate(0, h / 2 + th / 2, 0));
        }
        if (rand() > 0.5) {
          extra.push(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8).translate(w * 0.2, h / 2 + 0.8, 0));
        }
        const merged = extra.length
          ? BufferGeometryUtils.mergeGeometries(
              [geo.toNonIndexed(), ...extra.map((e) => e.toNonIndexed())],
              false
            )!
          : geo.toNonIndexed();
        merged.translate(0, h / 2, 0);

        const c = colour(palette[Math.floor(rand() * palette.length)])
          .lerp(haze, ring.pull + (rand() - 0.5) * 0.06);
        const n = merged.attributes.position.count;
        const cols = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) c.toArray(cols, i * 3);
        merged.setAttribute("color", new THREE.BufferAttribute(cols, 3));
        merged.deleteAttribute("uv");
        merged.deleteAttribute("normal");

        const x = s === 0 ? along : s === 1 ? off : s === 2 ? -along : -off;
        const z = s === 0 ? off : s === 1 ? -along : s === 2 ? -off : along;
        merged.rotateY((s * Math.PI) / 2);
        merged.translate(x, 0, z);
        parts.push(merged);
        t += w + rand() * 3;
      }
    }
  }

  const geo = BufferGeometryUtils.mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })
  );
  mesh.renderOrder = -8;
  return mesh;
}

export function createSky(
  stops: readonly string[],
  palette: number[],
  opts: { radius: number; skylineInner: number; seed?: number }
): SkyRig {
  const sky = new THREE.Group();
  sky.add(makeDome(stops, opts.radius));
  sky.add(makeClouds(stops, opts.radius));
  const skyline = makeSkyline(stops, palette, opts.skylineInner, opts.seed ?? 4242);

  return {
    sky,
    skyline,
    follow(camera) {
      sky.position.set(camera.position.x, 0, camera.position.z);
    },
  };
}
