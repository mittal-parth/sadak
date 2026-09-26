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

  // Distance to the nearest hexagon edge, for a honeycomb.
  float hexEdge(vec2 p) {
    p /= vec2(1.0, 0.8660254);
    p.x += 0.5 * floor(p.y);
    vec2 f = fract(p) - 0.5;
    return 0.5 - max(abs(f.x) * 1.5 + abs(f.y) * 0.866, abs(f.y) * 1.732) * 0.577;
  }

  void main() {
    // A disc on the wall centred where the player is nearest it.
    vec3 d = vWorld - uPlayer;
    float r = length(d);
    float bloom = 1.0 - smoothstep(uReach * 0.25, uReach, r);
    if (bloom <= 0.001) discard;
    // Along the wall and up it, for the pattern.
    vec2 q = vec2(vWorld.x + vWorld.z, vWorld.y) * 0.9;
    float hex = smoothstep(0.08, 0.0, hexEdge(q + vec2(0.0, uTime * 0.35)));
    // Rings running out from the contact point, faster when pressed.
    float ring = 0.5 + 0.5 * sin(r * 2.2 - uTime * (3.0 + uPress * 6.0));
    float core = 1.0 - smoothstep(0.0, uReach * 0.35, r);
    float a = bloom * (0.10 + 0.45 * hex + 0.12 * ring) + core * (0.08 + 0.35 * uPress);
    // Fade out up the wall so it reads as a field, not a slab.
    a *= 1.0 - smoothstep(6.0, 16.0, vWorld.y - uPlayer.y + 1.5);
    gl_FragColor = vec4(uColour * (0.6 + 0.8 * hex + uPress * 0.6), a);
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
