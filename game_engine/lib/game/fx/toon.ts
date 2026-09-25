/**
 * Cel shading for the whole city.
 *
 * Every lit surface is converted to a MeshToonMaterial with a hand-authored
 * gradient ramp, so sunlight lands in two to four flat bands instead of a
 * smooth falloff. The toon BRDF is patched so the darker bands are tinted
 * toward a cool hue rather than just being a darker copy of the base colour;
 * that hue shift in shadow is most of what separates an illustrated street
 * from low-poly 3D.
 *
 * The world builders keep creating ordinary Standard/Lambert materials and
 * `celify()` converts the finished scene in one pass. That keeps the forty-odd
 * material call sites untouched and means a new prop is cel-shaded without
 * anyone remembering to opt it in.
 *
 * Ramp values and the shadow-tint patch are adapted from sakura-crossing
 * (https://github.com/Kenton-GMI/sakura-crossing), MIT License,
 * Copyright (c) 2026 Kenton Wang.
 */

import * as THREE from "three";

export type RampName = "two" | "three" | "four" | "soft";

const RAMPS: Record<RampName, number[]> = {
  two: [96, 255],
  three: [92, 178, 255],
  four: [80, 142, 202, 255],
  // High-key: pale masses (foliage, cloth) that must stay light on the shadow side.
  soft: [172, 214, 255],
};

const rampCache = new Map<RampName, THREE.DataTexture>();

export function gradientMap(name: RampName = "three"): THREE.DataTexture {
  const hit = rampCache.get(name);
  if (hit) return hit;
  const stops = RAMPS[name];
  const data = new Uint8Array(stops.length * 4);
  stops.forEach((v, i) => {
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  });
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
  // Nearest, or the bands blur back into a smooth falloff.
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  rampCache.set(name, tex);
  return tex;
}

const TOON_CHUNK = "lights_toon_pars_fragment";
const TOON_LINE =
  "vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;";
const TOON_PATCH = `
	vec3 celBand = getGradientIrradiance( geometryNormal, directLight.direction );
	vec3 irradiance = celBand * mix( uShadowTint, vec3( 1.0 ), celBand ) * directLight.color;`;

/**
 * Patched chunk, or null if a three.js upgrade changed the line we hook. In
 * that case we fail loudly at build time rather than silently shipping
 * untinted shadows.
 */
function patchedToonChunk(): string {
  const src = THREE.ShaderChunk[TOON_CHUNK as keyof typeof THREE.ShaderChunk] as string | undefined;
  if (!src || !src.includes(TOON_LINE)) {
    throw new Error(
      `[toon] three.js ${THREE.REVISION} changed ${TOON_CHUNK}; update TOON_LINE in fx/toon.ts`
    );
  }
  return "uniform vec3 uShadowTint;\n" + src.replace(TOON_LINE, TOON_PATCH);
}

/** Library surfaces whose colour maps are procedural noise (cracks, grain,
 *  stains). Under flat cel bands that noise reads as dirt, so these collapse
 *  to their average colour. Patterned surfaces (brick, tile, kerb stripes)
 *  and every non-library texture — signs, posters — keep their maps. */
const NOISY_SURFACES = [
  "weathered_plaster",
  "painted_plaster",
  "concrete",
  "asphalt",
  "corrugated_metal",
  "rusted_metal",
  "painted_wood",
  "tarpaulin",
  "dry_mud",
];

export function isNoisySurface(mat: THREE.Material): boolean {
  // Library materials are named "<surface>" or "<surface>#<hex>@<repeat>".
  const surface = mat.name.split("#")[0];
  return NOISY_SURFACES.includes(surface);
}

const averageCache = new Map<string, THREE.Color>();
const WHITE = new THREE.Color(0xffffff);

/**
 * Mean colour of a canvas-backed texture, so a dropped map does not change
 * the surface's overall tone. Returns null for textures with no readable
 * canvas (DataTextures, or node where there is no DOM).
 */
function textureAverage(tex: THREE.Texture): THREE.Color | null {
  const key = tex.source.uuid;
  const hit = averageCache.get(key);
  if (hit) return hit;
  const img = tex.image as HTMLCanvasElement | undefined;
  if (!img || typeof img.getContext !== "function") return null;
  const ctx = img.getContext("2d");
  if (!ctx) return null;
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  let r = 0;
  let g = 0;
  let b = 0;
  // Every 16th pixel is plenty for a mean over a 256² noise field.
  let n = 0;
  for (let i = 0; i < data.length; i += 64) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  const c = new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
  averageCache.set(key, c);
  return c;
}

export type CelOptions = {
  /** Cool hue the shadow bands shift toward. Shared by every material, so a
   *  preset change retints the whole city without recompiling. */
  shadowTint: THREE.Color;
  /** Keep the colour map? Defaults to dropping library noise surfaces. */
  keepMap?: (mat: THREE.Material) => boolean;
};

type Convertible =
  | THREE.MeshStandardMaterial
  | THREE.MeshLambertMaterial
  | THREE.MeshPhongMaterial;

function isConvertible(m: THREE.Material): m is Convertible {
  return (
    (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true ||
    (m as THREE.MeshLambertMaterial).isMeshLambertMaterial === true ||
    (m as THREE.MeshPhongMaterial).isMeshPhongMaterial === true
  );
}

/** Foliage and cloth read better on the high-key ramp. */
function rampFor(src: THREE.Material): RampName {
  return (src.userData.celRamp as RampName | undefined) ?? "three";
}

export type Celifier = {
  /** Convert one material; identical inputs map to the same output. */
  convert(src: THREE.Material): THREE.Material;
  /** Convert every mesh material under `root` in place. */
  apply(root: THREE.Object3D): number;
  /** The shared shadow-tint uniform. */
  shadowTint: { value: THREE.Color };
};

export function createCelifier(opts: CelOptions): Celifier {
  const chunk = patchedToonChunk();
  const shadowTint = { value: opts.shadowTint.clone() };
  const keepMap = opts.keepMap ?? ((m: THREE.Material) => !isNoisySurface(m));
  // Keyed by source material, so a material shared by two hundred facades
  // stays one material (and one program) after conversion.
  const converted = new Map<string, THREE.Material>();

  function toToon(src: Convertible): THREE.MeshToonMaterial {
    const color = src.color.clone();
    let map: THREE.Texture | null = src.map;
    if (map && !keepMap(src)) {
      // A tinted surface's colour IS the district palette, so it stands as is:
      // multiplying in the noise field's greyish mean is what made every
      // facade read dull. Only an untinted (white) library material needs
      // the texture mean to keep its tone.
      if (color.equals(WHITE)) {
        const avg = textureAverage(map);
        if (avg) color.copy(avg);
      }
      map = null;
    }

    const mat = new THREE.MeshToonMaterial({
      name: src.name,
      color,
      map,
      gradientMap: gradientMap(rampFor(src)),
      emissive: src.emissive.clone(),
      emissiveIntensity: src.emissiveIntensity,
      emissiveMap: src.emissiveMap,
      alphaMap: src.alphaMap,
      transparent: src.transparent,
      opacity: src.opacity,
      alphaTest: src.alphaTest,
      side: src.side,
      vertexColors: src.vertexColors,
      depthWrite: src.depthWrite,
      depthTest: src.depthTest,
      polygonOffset: src.polygonOffset,
      polygonOffsetFactor: src.polygonOffsetFactor,
      polygonOffsetUnits: src.polygonOffsetUnits,
      visible: src.visible,
      fog: src.fog,
    });
    // Faceted normals: cylinders and spheres read as cut shapes with a crisp
    // light/shadow split, which is the look, rather than a smeared gradient.
    // WebGLPrograms honours flatShading on every material; the r172 typings
    // just do not declare it on MeshToonMaterial.
    Object.assign(mat, { flatShading: true });
    mat.userData = { ...src.userData, celSource: src.uuid };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uShadowTint = shadowTint;
      shader.fragmentShader = shader.fragmentShader.replace(`#include <${TOON_CHUNK}>`, chunk);
    };
    mat.customProgramCacheKey = () => "celTint";
    return mat;
  }

  function convert(src: THREE.Material): THREE.Material {
    if (!isConvertible(src)) return src;
    // Additive/multiply blends are light effects, not surfaces.
    if (src.blending !== THREE.NormalBlending) return src;
    const hit = converted.get(src.uuid);
    if (hit) return hit;
    const out = toToon(src);
    converted.set(src.uuid, out);
    return out;
  }

  function apply(root: THREE.Object3D): number {
    let count = 0;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => {
          const c = convert(m);
          if (c !== m) count++;
          return c;
        });
      } else {
        const c = convert(mesh.material);
        if (c !== mesh.material) count++;
        mesh.material = c;
      }
    });
    return count;
  }

  return { convert, apply, shadowTint };
}
