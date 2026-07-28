/**
 * District asset kits.
 *
 * Each city previously reused the same handful of props with only colours
 * swapped (an arch, a tram, a boat, a billboard, all boxes-with-a-cone) so
 * the four districts read as one recoloured street. This module gives each
 * of the four a genuinely distinct, code-built landmark set: a signature
 * hero silhouette or two, a road vehicle that could not be mistaken for
 * another city's, and pavement-scale street furniture.
 *
 * Every factory takes an optional `MaterialLibrary` (see ../materials.ts)
 * so the props ride the project's procedural PBR surfaces when the caller
 * wires one in, and otherwise falls back to shared.ts's own cached
 * MeshStandardMaterial — never Basic/Lambert.
 */

import * as THREE from "three";
import type { MaterialLibrary } from "../materials";
import type { AssetMaterialLib } from "./shared";
import {
  makeBazaarGate,
  makeHaveliBalcony,
  makeCycleRickshaw,
  makeJalebiStall,
  makeIndiaGate,
  makeStreetMandir,
} from "./delhi";
import { makeGopuram, makeCatamaran, makeCoconutPalm, makeTiffinCart, makeTiffinStall } from "./chennai";
import { makeStall } from "../props";
import {
  makeTechParkSlab,
  makeScaffolding,
  makeMetroPillar,
  makeDeliveryBike,
} from "./bengaluru";
import {
  makeAmbassadorTaxi,
  makeTramWithPantograph,
  makeColonialFacade,
  makePandalFrame,
  makeHandRickshaw,
} from "./kolkata";

export type Landmark = "delhi" | "chennai" | "bengaluru" | "kolkata";

export type DistrictKit = {
  hero: Array<() => THREE.Group>;
  vehicles: Array<() => THREE.Group>;
  streetProps: Array<() => THREE.Group>;
};

/** Adapts the project's MaterialLibrary (surface-name based) to the plain
 * colour-based AssetMaterialLib every prop factory in this kit expects, so
 * props still get real PBR surfaces (painted wood, rusted metal, etc.)
 * instead of a flat tinted MeshStandardMaterial when a library is passed. */
function adapt(mats?: MaterialLibrary): AssetMaterialLib | undefined {
  if (!mats) return undefined;
  return {
    standard(color, opts = {}) {
      // painted_plaster/painted_wood tiles cheaply and takes a tint well for
      // the wide variety of small, brightly-coloured parts these kits need.
      const surface = (opts.metalness ?? 0) > 0.4 ? "rusted_metal" : "painted_wood";
      const mat = mats.tint(surface, color, 4);
      if (opts.transparent) {
        mat.transparent = true;
        mat.opacity = opts.opacity ?? mat.opacity;
      }
      if (opts.emissive) {
        mat.emissive = new THREE.Color(opts.emissive as THREE.ColorRepresentation);
        mat.emissiveIntensity = opts.emissiveIntensity ?? 1;
      }
      return mat;
    },
  };
}

let seedCounter = 0;
function nextSeed() {
  seedCounter += 1;
  return seedCounter * 97 + 13;
}

/** Shop geometry at mission sites — district-specific when it helps readability. */
export function makeMissionShopStall(
  districtId: string,
  role: string,
  canopyColour: number,
  seed: number,
  mats?: MaterialLibrary
): THREE.Group {
  const al = adapt(mats);
  if (role.includes("Tiffin")) {
    return makeTiffinStall(al, seed, canopyColour);
  }
  if (districtId === "purani-sadak") {
    return makeJalebiStall(al, seed);
  }
  return makeStall(canopyColour);
}

export function getDistrictKit(landmark: Landmark, mats?: MaterialLibrary): DistrictKit {
  const al = adapt(mats);

  switch (landmark) {
    case "delhi":
      return {
        hero: [
          () => makeBazaarGate(al, nextSeed()),
          () => makeHaveliBalcony(al, nextSeed()),
          () => makeIndiaGate(al, nextSeed()),
        ],
        vehicles: [() => makeCycleRickshaw(al, nextSeed())],
        streetProps: [() => makeJalebiStall(al, nextSeed()), () => makeStreetMandir(al, nextSeed())],
      };

    case "chennai":
      return {
        hero: [() => makeGopuram(al, nextSeed()), () => makeCoconutPalm(al, nextSeed())],
        vehicles: [() => makeCatamaran(al, nextSeed())],
        streetProps: [() => makeTiffinCart(al, nextSeed()), () => makeCoconutPalm(al, nextSeed())],
      };

    case "bengaluru":
      return {
        hero: [() => makeTechParkSlab(al, nextSeed()), () => makeMetroPillar(al, nextSeed())],
        vehicles: [() => makeDeliveryBike(al, nextSeed())],
        streetProps: [() => makeScaffolding(al, nextSeed())],
      };

    case "kolkata":
      return {
        hero: [() => makeColonialFacade(al, nextSeed()), () => makePandalFrame(al, nextSeed())],
        vehicles: [() => makeAmbassadorTaxi(al, nextSeed()), () => makeTramWithPantograph(al, nextSeed())],
        streetProps: [() => makeHandRickshaw(al, nextSeed())],
      };
  }
}

export {
  makeBazaarGate,
  makeHaveliBalcony,
  makeCycleRickshaw,
  makeJalebiStall,
  makeIndiaGate,
  makeStreetMandir,
} from "./delhi";
export { makeGopuram, makeCatamaran, makeCoconutPalm, makeTiffinCart, makeTiffinStall } from "./chennai";
export {
  makeTechParkSlab,
  makeScaffolding,
  makeMetroPillar,
  makeDeliveryBike,
} from "./bengaluru";
export {
  makeAmbassadorTaxi,
  makeTramWithPantograph,
  makeColonialFacade,
  makePandalFrame,
  makeHandRickshaw,
} from "./kolkata";
export { countTriangles } from "./shared";
