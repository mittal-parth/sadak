import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCelifier, gradientMap, isNoisySurface } from "./toon";

const tint = new THREE.Color(0x8a7fb8);

function celifier() {
  return createCelifier({ shadowTint: tint });
}

test("converts a standard material to toon, carrying every surface field over", () => {
  const src = new THREE.MeshStandardMaterial({
    name: "hero",
    color: 0x3366cc,
    emissive: 0x112233,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.6,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
    vertexColors: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -3,
  });
  src.userData.tag = "keep-me";

  const out = celifier().convert(src) as THREE.MeshToonMaterial;

  assert.equal(out.isMeshToonMaterial, true);
  assert.equal(out.name, "hero");
  assert.equal(out.color.getHex(), 0x3366cc);
  assert.equal(out.emissive.getHex(), 0x112233);
  assert.equal(out.emissiveIntensity, 0.4);
  assert.equal(out.transparent, true);
  assert.equal(out.opacity, 0.6);
  assert.equal(out.alphaTest, 0.1);
  assert.equal(out.side, THREE.DoubleSide);
  assert.equal(out.vertexColors, true);
  assert.equal(out.depthWrite, false);
  assert.equal(out.polygonOffset, true);
  assert.equal(out.polygonOffsetFactor, -2);
  assert.equal(out.polygonOffsetUnits, -3);
  assert.equal((out as unknown as { flatShading: boolean }).flatShading, true);
  assert.equal(out.gradientMap, gradientMap("three"));
  assert.equal(out.userData.tag, "keep-me");
  assert.equal(out.userData.celSource, src.uuid);
  // The source is left untouched.
  assert.equal(src.color.getHex(), 0x3366cc);
  assert.equal(src.isMeshStandardMaterial, true);
});

test("a shared source material stays shared after conversion", () => {
  const c = celifier();
  const src = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  assert.equal(c.convert(src), c.convert(src));
  assert.notEqual(c.convert(src), c.convert(new THREE.MeshLambertMaterial({ color: 0xff0000 })));
});

test("unlit, shader and additive materials are left alone", () => {
  const c = celifier();
  const basic = new THREE.MeshBasicMaterial();
  const shader = new THREE.ShaderMaterial();
  const additive = new THREE.MeshStandardMaterial({ blending: THREE.AdditiveBlending });
  assert.equal(c.convert(basic), basic);
  assert.equal(c.convert(shader), shader);
  assert.equal(c.convert(additive), additive);
});

test("noisy library surfaces drop their map and keep the tint", () => {
  const map = new THREE.Texture();
  const plaster = new THREE.MeshStandardMaterial({ name: "weathered_plaster#f2e3c4@1", color: 0xf2e3c4, map });
  const out = celifier().convert(plaster) as THREE.MeshToonMaterial;
  assert.equal(out.map, null);
  assert.equal(out.color.getHex(), 0xf2e3c4);
});

test("patterned surfaces and non-library textures keep their map", () => {
  const c = celifier();
  const map = new THREE.Texture();
  const brick = new THREE.MeshStandardMaterial({ name: "brick#aa4433@2", map });
  const sign = new THREE.MeshLambertMaterial({ map });
  assert.equal((c.convert(brick) as THREE.MeshToonMaterial).map, map);
  assert.equal((c.convert(sign) as THREE.MeshToonMaterial).map, map);
});

test("isNoisySurface keys off the library surface name only", () => {
  assert.equal(isNoisySurface(new THREE.MeshStandardMaterial({ name: "asphalt#4a4d54@26" })), true);
  assert.equal(isNoisySurface(new THREE.MeshStandardMaterial({ name: "dry_mud" })), true);
  assert.equal(isNoisySurface(new THREE.MeshStandardMaterial({ name: "tile#dccdb0@16" })), false);
  assert.equal(isNoisySurface(new THREE.MeshStandardMaterial({ name: "" })), false);
});

test("a celRamp hint on the source picks the matching gradient", () => {
  const src = new THREE.MeshLambertMaterial();
  src.userData.celRamp = "soft";
  const out = celifier().convert(src) as THREE.MeshToonMaterial;
  assert.equal(out.gradientMap, gradientMap("soft"));
});

test("apply() converts single and array materials in a subtree and counts them", () => {
  const c = celifier();
  const root = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const b = new THREE.Mesh(new THREE.BoxGeometry(), [
    new THREE.MeshLambertMaterial(),
    new THREE.MeshBasicMaterial(),
  ]);
  root.add(a);
  a.add(b);

  assert.equal(c.apply(root), 2);
  assert.equal((a.material as THREE.Material).type, "MeshToonMaterial");
  const arr = b.material as THREE.Material[];
  assert.equal(arr[0].type, "MeshToonMaterial");
  assert.equal(arr[1].type, "MeshBasicMaterial");
  // Idempotent: a second pass finds nothing left to convert.
  assert.equal(c.apply(root), 0);
});

test("the shader patch injects the shared shadow-tint uniform into the toon chunk", () => {
  const c = celifier();
  const out = c.convert(new THREE.MeshLambertMaterial());
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    fragmentShader: "#include <lights_toon_pars_fragment>\nvoid main() {}",
    vertexShader: "",
  };
  out.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  assert.equal(shader.uniforms.uShadowTint, c.shadowTint);
  assert.ok(shader.fragmentShader.includes("uniform vec3 uShadowTint;"));
  assert.ok(shader.fragmentShader.includes("mix( uShadowTint, vec3( 1.0 ), celBand )"));
  assert.ok(!shader.fragmentShader.includes("#include <lights_toon_pars_fragment>"));
  assert.equal(c.shadowTint.value.getHex(), tint.getHex());
});

test("gradient ramps are nearest-filtered and cached", () => {
  const g = gradientMap("four");
  assert.equal(g, gradientMap("four"));
  assert.equal(g.minFilter, THREE.NearestFilter);
  assert.equal(g.magFilter, THREE.NearestFilter);
  assert.equal(g.image.width, 4);
});
