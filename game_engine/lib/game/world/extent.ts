/**
 * How much of its footprint each landmark model actually covers. Most fill
 * it; the small ones (a neighbourhood gurdwara, a wayside temple) are capped,
 * standing in the middle of a big compound. Shared by the model builders and
 * the map compiler, which clears OSM buildings from under the model but
 * keeps the rest of the compound.
 */
export function modelExtent(model: string, w: number, d: number): [number, number] {
  switch (model) {
    case "mosque_small":
    case "gurdwara_small":
      return [Math.min(w, 26), Math.min(d, 26)];
    case "dargah":
      return [Math.min(w, 18), Math.min(d, 18)];
    case "tomb":
      return [Math.min(w, 40), Math.min(d, 40)];
    case "temple":
    case "shrine":
      return [Math.max(6, Math.min(w, 22)), Math.max(7, Math.min(d, 26))];
    case "deul_small":
      return [Math.max(7, Math.min(w, 14)), Math.max(8, Math.min(d, 16))];
    case "church_small":
      return [Math.min(w, 22), Math.min(d, 32)];
    default:
      return [w, d];
  }
}
