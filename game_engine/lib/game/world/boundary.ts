/**
 * The edge of the district, shown the way a game shows a wall you can't
 * cross: nothing from afar, then, as you come near, a round shimmer of
 * hexagons blooms on the air at the edge, brightest where you are closest,
 * and ripples when you press against it. Four curtains on the square's
 * sides, one shader; additive and depth-neutral, so the cel pass neither
 * shades nor inks it.
 */

import * as THREE from "three";

/** Where the player is stopped: the edge, less a metre (engine.blocked). */
export const BOUNDARY_INSET = 1;
/** How near the glow starts to show, metres. */
export const BOUNDARY_REACH = 22;

const VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uPlayer;
  uniform float uTime;
  uniform float uPress;
  uniform vec3 uColour;
  uniform float uReach;
  varying vec3 vWorld;
  varying vec2 vUv;

  // Distance from p to the nearest edge of a pointy-top hexagonal grid of
  // unit cells: 0 on an edge, 0.5 at a cell's centre.
  float hexEdge(vec2 p) {
    const vec2 s = vec2(1.0, 1.7320508);
    vec4 c = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(p - c.xy * s, p - (c.zw + 0.5) * s);
    vec2 g = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
    vec2 a = abs(g);
    return 0.5 - max(dot(a, s * 0.5), a.x);
  }

  void main() {
    // A disc on the wall round the point nearest the player; it grows as
    // they come closer (r includes how far they stand from the wall).
    vec3 d = vWorld - uPlayer;
    float r = length(d);
    float bloom = 1.0 - smoothstep(uReach * 0.12, uReach * 0.45, r);
    if (bloom <= 0.001) discard;
    // Along the wall and up it: cells about 0.7m across, drifting up.
    vec2 q = vec2(vWorld.x + vWorld.z, vWorld.y) * 1.4 + vec2(0.0, uTime * 0.25);
    float line = 1.0 - smoothstep(0.0, 0.05, hexEdge(q));
    // Rings running out from the contact point, faster when pressed.
    float ring = smoothstep(0.85, 1.0, sin(r * 2.4 - uTime * (2.5 + uPress * 5.0)));
    float core = 1.0 - smoothstep(0.0, uReach * 0.14, r);
    float a = bloom * (0.03 + 0.32 * line + 0.1 * ring * line) + core * uPress * 0.25;
    // Fade out up the wall so it reads as a field, not a slab.
    a *= 1.0 - smoothstep(2.5, 7.0, vWorld.y - uPlayer.y + 1.5);
    gl_FragColor = vec4(uColour * (0.8 + 0.6 * line + uPress * 0.5), a);
  }
`;

export type Boundary = {
  group: THREE.Group;
  update(t: number, player: THREE.Vector3): void;
  /** How strongly the barrier is glowing, 0..1 (for tests). */
  glow(): number;
  dispose(): void;
};

export function createBoundary(half: number, colour = 0x7fe7ff): Boundary {
  const edge = half - BOUNDARY_INSET;
  const uniforms = {
    uPlayer: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uPress: { value: 0 },
    uColour: { value: new THREE.Color(colour) },
    uReach: { value: BOUNDARY_REACH },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const H = 24;
  const geo = new THREE.PlaneGeometry(edge * 2, H).translate(0, H / 2 - 1, 0);
  const group = new THREE.Group();
  group.name = "boundary";
  // North, south (facing along z), east, west (turned a quarter).
  for (const [x, z, rot] of [
    [0, -edge, 0],
    [0, edge, 0],
    [edge, 0, Math.PI / 2],
    [-edge, 0, Math.PI / 2],
  ] as const) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0, z);
    m.rotation.y = rot;
    m.renderOrder = 10;
    m.frustumCulled = false;
    group.add(m);
  }
  let glow = 0;
  return {
    group,
    update(t, player) {
      uniforms.uTime.value = t;
      uniforms.uPlayer.value.set(player.x, player.y + 1.5, player.z);
      // Pressed: within half a metre of where the body is stopped.
      const gap = edge - Math.max(Math.abs(player.x), Math.abs(player.z));
      const press = 1 - Math.min(1, Math.max(0, gap - 0.05) / 0.5);
      uniforms.uPress.value += (press - uniforms.uPress.value) * 0.2;
      glow = Math.max(0, 1 - gap / BOUNDARY_REACH);
      // Nothing to draw far from every edge.
      group.visible = gap < BOUNDARY_REACH;
    },
    glow: () => glow,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
