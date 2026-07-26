/**
 * Procedural PBR material library.
 *
 * Everything is generated in code at load time: no image files ship with this
 * project. The surface builders in `mat/surfaces.ts` produce heightfields and
 * colour canvases; this module turns them into shared THREE materials and,
 * critically, caches them. The city has roughly 2000 meshes, so generating a
 * texture per mesh would be fatal.
 *
 * The single biggest visual lever here is the Sobel height-to-normal pass in
 * `mat/canvas.ts`. Flat colour reads as programmer art no matter how good the
 * palette is; a normal map is what makes plaster look like plaster.
 */

import * as THREE from "three";
import { grayscaleCanvas } from "./mat/canvas";
import {
  SIZE,
  buildAsphalt,
  buildBrick,
  buildConcrete,
  buildCorrugatedMetal,
  buildDryMud,
  buildKerbStone,
  buildPaintedPlaster,
  buildPaintedWood,
  buildRustedMetal,
  buildTarpaulin,
  buildTile,
  buildWeatheredPlaster,
  type SurfaceBuild,
} from "./mat/surfaces";

export type SurfaceName =
  | "weathered_plaster"
  | "painted_plaster"
  | "concrete"
  | "brick"
  | "asphalt"
  | "kerb_stone"
  | "corrugated_metal"
  | "rusted_metal"
  | "painted_wood"
  | "tarpaulin"
  | "dry_mud"
  | "tile";

const BUILDERS: Record<SurfaceName, (seed: number, size?: number) => SurfaceBuild> = {
  weathered_plaster: buildWeatheredPlaster,
  painted_plaster: buildPaintedPlaster,
  concrete: buildConcrete,
  brick: buildBrick,
  asphalt: buildAsphalt,
  kerb_stone: buildKerbStone,
  corrugated_metal: buildCorrugatedMetal,
  rusted_metal: buildRustedMetal,
  painted_wood: buildPaintedWood,
  tarpaulin: buildTarpaulin,
  dry_mud: buildDryMud,
  tile: buildTile,
};

/** Deterministic per-surface seed so the city looks the same every reload. */
const SEEDS: Record<SurfaceName, number> = {
  weathered_plaster: 1011,
  painted_plaster: 2027,
  concrete: 3041,
  brick: 4057,
  asphalt: 5077,
  kerb_stone: 6091,
  corrugated_metal: 7103,
  rusted_metal: 8117,
  painted_wood: 9133,
  tarpaulin: 10151,
  dry_mud: 11171,
  tile: 12197,
};

export type MaterialLibrary = {
  get(name: SurfaceName): THREE.MeshStandardMaterial;
  /**
   * Cheap recolour that shares the underlying texture data.
   * `repeatScale` multiplies the surface's own tiling: pass a big number for
   * large surfaces like roads and plazas, or the texture reads metres wide.
   */
  tint(
    name: SurfaceName,
    colour: number,
    repeatScale?: number
  ): THREE.MeshStandardMaterial;
  /** Rough texture-memory estimate in MB, for the perf budget. */
  textureMemoryMB(): number;
  dispose(): void;
};

function canvasTexture(
  canvas: HTMLCanvasElement,
  srgb: boolean,
  repeat: [number, number],
  aniso: number
): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  // Colour maps are sRGB; normal and roughness maps MUST stay linear or the
  // whole scene washes out. This is the classic three.js PBR mistake.
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export function createMaterialLibrary(renderer: THREE.WebGLRenderer): MaterialLibrary {
  const aniso = renderer.capabilities.getMaxAnisotropy();

  const base = new Map<SurfaceName, THREE.MeshStandardMaterial>();
  const tints = new Map<string, THREE.MeshStandardMaterial>();
  const textures: THREE.Texture[] = [];
  let bytes = 0;

  function build(name: SurfaceName): THREE.MeshStandardMaterial {
    const surf = BUILDERS[name](SEEDS[name], SIZE);

    const map = canvasTexture(surf.colorCanvas, true, surf.repeat, aniso);
    const normalMap = canvasTexture(surf.normalCanvas, false, surf.repeat, aniso);
    const roughnessMap = canvasTexture(
      grayscaleCanvas(surf.roughness, SIZE),
      false,
      surf.repeat,
      aniso
    );

    textures.push(map, normalMap, roughnessMap);
    // 4 bytes/px per map, plus ~33% for the mip chain.
    bytes += SIZE * SIZE * 4 * 3 * 1.33;

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughnessMap,
      metalness: surf.metalness,
      roughness: 1, // modulated by roughnessMap
    });
    mat.normalScale.set(surf.normalStrength ?? 1, surf.normalStrength ?? 1);

    if (surf.ao) {
      const aoMap = canvasTexture(grayscaleCanvas(surf.ao, SIZE), false, surf.repeat, aniso);
      textures.push(aoMap);
      bytes += SIZE * SIZE * 4 * 1.33;
      mat.aoMap = aoMap;
      mat.aoMapIntensity = 0.8;
    }

    mat.name = name;
    return mat;
  }

  return {
    get(name) {
      let m = base.get(name);
      if (!m) {
        m = build(name);
        base.set(name, m);
      }
      return m;
    },

    tint(name, colour, repeatScale = 1) {
      const key = `${name}:${colour}:${repeatScale}`;
      const hit = tints.get(key);
      if (hit) return hit;

      const src = this.get(name);
      const m = src.clone();
      m.color = new THREE.Color(colour);

      // A texture tuned on a test quad tiles absurdly on a 50m plaza. Cloning
      // the textures gives this instance its own repeat while `.source` stays
      // shared, so the GPU upload is not duplicated.
      if (repeatScale !== 1) {
        for (const slot of ["map", "normalMap", "roughnessMap", "aoMap"] as const) {
          const t = m[slot];
          if (!t) continue;
          const c = t.clone();
          c.repeat.set(t.repeat.x * repeatScale, t.repeat.y * repeatScale);
          c.needsUpdate = true;
          m[slot] = c;
        }
      }

      m.name = `${name}#${colour.toString(16)}@${repeatScale}`;
      tints.set(key, m);
      return m;
    },

    textureMemoryMB() {
      return +(bytes / (1024 * 1024)).toFixed(2);
    },

    dispose() {
      textures.forEach((t) => t.dispose());
      base.forEach((m) => m.dispose());
      tints.forEach((m) => m.dispose());
      base.clear();
      tints.clear();
      textures.length = 0;
      bytes = 0;
    },
  };
}

export const ALL_SURFACES: SurfaceName[] = Object.keys(BUILDERS) as SurfaceName[];
