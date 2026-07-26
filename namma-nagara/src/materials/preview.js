/**
 * Standalone visual harness for the materials subsystem.
 *
 * The rest of the engine is owned by other agents and may be stubbed at any
 * moment, so this page boots *only* materials against a minimal renderer,
 * physical sun/sky and a PMREM environment. It is a development tool: nothing
 * in the game imports it and it is not part of the production bundle.
 *
 *   /src/materials/preview.html?view=board|wall|street|closeup|grazing
 */
import * as THREE from 'three';
import { MaterialSystem } from './index.js';

const params = new URLSearchParams(location.search);
const VIEW = params.get('view') ?? 'board';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 400);

// ---------------------------------------------------------------- sky ------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    uSun: { value: new THREE.Vector3(0.42, 0.42, 0.8).normalize() },
    uZenith: { value: new THREE.Color(0.16, 0.31, 0.62) },
    uHorizon: { value: new THREE.Color(0.72, 0.74, 0.72) },
    uGround: { value: new THREE.Color(0.19, 0.16, 0.13) },
  },
  vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = (projectionMatrix * modelViewMatrix * vec4(position,1.0)).xyww; }`,
  fragmentShader: `
    varying vec3 vD; uniform vec3 uSun, uZenith, uHorizon, uGround;
    void main(){
      vec3 d = normalize(vD);
      float t = d.y;
      vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, t));
      c = mix(uGround, c, smoothstep(-0.12, 0.02, t));
      float s = max(dot(d, normalize(uSun)), 0.0);
      c += vec3(1.0, 0.82, 0.6) * pow(s, 8.0) * 0.6;
      c += vec3(1.0, 0.95, 0.85) * pow(s, 900.0) * 40.0;
      gl_FragColor = vec4(c * 1.35, 1.0);
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMat);
sky.frustumCulled = false;
scene.add(sky);

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

// -------------------------------------------------------------- lights -----
const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
sun.position.set(9, 9.5, 17);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

const bounce = new THREE.DirectionalLight(0x88a0c0, 0.35);
bounce.position.set(-8, 3, -10);
scene.add(bounce);

// ------------------------------------------------------------ materials ----
const materials = new MaterialSystem({ renderer });
await materials.init({ config: { quality: 'ultra', q: { anisotropy: 16 } } });
materials.setGroundLevel(0);

const env = pmrem.fromScene(scene, 0, 0.1, 300);
scene.environment = env.texture;
scene.environmentIntensity = 1.0;

// --------------------------------------------------------------- scenes ----
const disposables = [];
function mesh(geo, mat, pos, rot) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.fromArray(pos);
  if (rot) m.rotation.fromArray(rot);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  disposables.push(geo);
  return m;
}

function groundPlane(name = 'asphalt', size = 60) {
  const g = new THREE.PlaneGeometry(size, size, 40, 40);
  g.rotateX(-Math.PI / 2);
  return mesh(g, materials.get(name), [0, 0, 0]);
}

if (VIEW === 'board') {
  const cols = 5;
  const board = materials.debugBoard({ columns: cols, spacing: 1.35 });
  const rows = Math.ceil(materials.names().length / cols);
  board.position.set((-(cols - 1) * 1.35) / 2, 0.85 + (rows - 1) * 1.35, 0);
  scene.add(board);
  groundPlane('concrete_floor', 40);
  camera.position.set(0, 0.85 + ((rows - 1) * 1.35) / 2, 7.6);
  camera.lookAt(0, 0.85 + ((rows - 1) * 1.35) / 2, 0);
} else if (VIEW === 'flat') {
  // Unlit channel inspection: albedo | normal | ORM for every surface.
  const which = (params.get('m') ?? 'concrete,brick,plaster,asphalt').split(',');
  const quad = new THREE.PlaneGeometry(1, 1);
  which.forEach((name, row) => {
    const set = materials.getTextureSet(name);
    [set.albedo, set.normal, set.orm].forEach((tex, col) => {
      const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const q = new THREE.Mesh(quad, m);
      q.position.set(col * 1.06 - 1.06, -row * 1.06, 0);
      scene.add(q);
    });
  });
  scene.remove(sky);
  scene.background = new THREE.Color(0x101010);
  camera.position.set(0, -((which.length - 1) * 1.06) / 2, 2.4 + which.length * 0.55);
  camera.lookAt(0, -((which.length - 1) * 1.06) / 2, 0);
} else if (VIEW === 'wall' || VIEW === 'closeup' || VIEW === 'grazing') {
  groundPlane('asphalt', 60);

  // A building corner: two brick walls, a concrete plinth, a plaster return.
  // vertexMasks: true consumes the curvature masks baked below, so corners are
  // worn back and creases are dirty.
  const dbg = params.get('dbg') ?? '';
  const M = { vertexMasks: true };
  if (dbg.includes('nopom')) M.parallax = 0;
  if (dbg.includes('nodetile')) M.detile = 0;
  if (dbg.includes('noweather')) M.weather = [0, 0, 0, 0];
  let brick = materials.get('brick', M);
  if (dbg.includes('plain')) {
    const set = materials.getTextureSet('brick');
    brick = new THREE.MeshStandardMaterial({
      map: set.albedo, normalMap: set.normal, roughnessMap: set.orm,
      roughness: 1, metalness: 1,
    });
    brick.map.repeat.set(1, 1);
  }
  if (dbg.includes('nograd')) brick = materials.get('brick', { ...M, noGrad: true });
  if (dbg.includes('meshuv')) brick = materials.get('brick', { ...M, uvMode: 'mesh', scale: 4 });
  const concrete = materials.get('concrete', M);
  const plaster = materials.get('plaster', M);
  const wood = materials.get('wood', M);
  const corr = materials.get('corrugated', M);
  const painted = materials.get('metal_painted', M);
  const rust = materials.get('metal_rust');
  const sandbagMat = materials.get('burlap');

  const wallGeo = new THREE.BoxGeometry(7, 4.2, 0.42, 14, 9, 2);
  materials.bakeMasks(wallGeo, { wear: 1, grime: 1 });
  mesh(wallGeo, brick, [0, 2.1 + 0.35, 0]);

  const wall2 = new THREE.BoxGeometry(0.42, 4.2, 6, 2, 9, 12);
  materials.bakeMasks(wall2, { wear: 1, grime: 1 });
  mesh(wall2, plaster, [-3.5 + 0.21, 2.1 + 0.35, -3.2]);

  const plinth = new THREE.BoxGeometry(7.4, 0.72, 0.62, 14, 3, 2);
  materials.bakeMasks(plinth, { wear: 1, grime: 1 });
  mesh(plinth, concrete, [0, 0.36, 0.02]);

  const pillar = new THREE.BoxGeometry(0.55, 3.4, 0.55, 3, 12, 3);
  materials.bakeMasks(pillar, { wear: 1, grime: 1 });
  mesh(pillar, concrete, [3.9, 1.7, 1.4]);

  const crate = new THREE.BoxGeometry(0.78, 0.62, 0.62, 6, 5, 5);
  materials.bakeMasks(crate, { wear: 1, grime: 1 });
  mesh(crate, wood, [1.55, 0.31, 1.5], [0, 0.34, 0]);
  mesh(crate.clone(), wood, [1.35, 0.93, 1.62], [0, -0.2, 0.03]);

  const sheet = new THREE.BoxGeometry(2.6, 2.0, 0.05, 8, 8, 1);
  mesh(sheet, corr, [-2.0, 1.35, 1.3], [0, 0.22, 0.04]);

  const drum = new THREE.CylinderGeometry(0.31, 0.31, 0.9, 40, 3);
  mesh(drum, rust, [2.9, 0.45, 1.9], [0, 0, 0.02]);

  const bar = new THREE.BoxGeometry(0.1, 1.9, 0.1, 1, 6, 1);
  materials.bakeMasks(bar, { wear: 1, grime: 1 });
  mesh(bar, painted, [-0.5, 0.95, 1.9]);

  const bag = new THREE.SphereGeometry(0.34, 24, 16);
  bag.scale(1.5, 0.6, 0.9);
  for (let i = 0; i < 5; i++) {
    mesh(bag.clone(), sandbagMat, [-3.0 + i * 0.62, 0.2 + (i % 2) * 0.01, 2.3], [0, i * 0.13, 0]);
  }
  for (let i = 0; i < 4; i++) {
    mesh(bag.clone(), sandbagMat, [-2.7 + i * 0.62, 0.58, 2.34], [0, 0.3 + i * 0.11, 0]);
  }

  if (VIEW === 'wall') {
    camera.position.set(4.4, 1.7, 5.6);
    camera.lookAt(-0.4, 1.5, 0.2);
  } else if (VIEW === 'closeup') {
    camera.fov = 40;
    camera.position.set(0.4, 1.35, 1.05);
    camera.lookAt(0.1, 1.15, 0.0);
  } else {
    // grazing: nearly parallel to the brick, to judge parallax silhouettes
    camera.fov = 38;
    camera.position.set(3.2, 1.25, 0.62);
    camera.lookAt(-3.2, 1.15, 0.35);
  }
  camera.updateProjectionMatrix();
} else {
  // street
  groundPlane('asphalt', 80);
  const sidewalk = new THREE.BoxGeometry(60, 0.18, 3.2, 30, 1, 3);
  mesh(sidewalk, materials.get('concrete_floor'), [0, 0.09, 6.5]);
  const sand = new THREE.PlaneGeometry(20, 14, 30, 30);
  sand.rotateX(-Math.PI / 2);
  mesh(sand, materials.get('sand'), [-14, 0.02, -4]);

  const facade = new THREE.BoxGeometry(9, 7, 0.5, 18, 14, 2);
  materials.bakeMasks(facade, { wear: 1, grime: 1 });
  mesh(facade, materials.get('brick'), [-6, 3.5, 9]);
  const facade2 = new THREE.BoxGeometry(11, 8.5, 0.5, 20, 16, 2);
  materials.bakeMasks(facade2, { wear: 1, grime: 1 });
  mesh(facade2, materials.get('plaster'), [6.5, 4.25, 9.2]);
  const facade3 = new THREE.BoxGeometry(14, 6, 0.5, 24, 12, 2);
  materials.bakeMasks(facade3, { wear: 1, grime: 1 });
  mesh(facade3, materials.get('concrete'), [0, 3, -9]);

  camera.position.set(9, 1.75, 15);
  camera.lookAt(-3, 2.0, -2);
}

sun.target.position.set(0, 1, 0);
sun.target.updateMatrixWorld();

// --------------------------------------------------------------- loop ------
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

if ((params.get('dbg') ?? '').includes('noshadow')) renderer.shadowMap.enabled = false;
if ((params.get('dbg') ?? '').includes('nonormal')) {
  scene.traverse((o) => { if (o.material && o.material.normalMap) o.material.normalMap = null; });
}
let frames = 0;
function tick() {
  renderer.render(scene, camera);
  if (++frames === 3) {
    window.__READY__ = true;
    window.__INFO__ = {
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
    };
  }
  requestAnimationFrame(tick);
}
tick();

window.__RENDERER__ = renderer;
window.__MATERIALS__ = materials;
