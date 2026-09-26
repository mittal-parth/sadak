/**
 * The compiled map for one district: real street network and features from
 * OpenStreetMap, plus the building plots the map compiler lays along every
 * frontage (scripts/osm/build.ts). Served as /maps/<districtId>.json and
 * fetched before the game starts.
 *
 * Coordinates are metres from the map centre: +x east, +z south (so north is
 * -z and a top-down view is not mirrored). Map data (c) OpenStreetMap
 * contributors, ODbL 1.0.
 */

export type Pt = [number, number];

export type RoadClass =
  | "trunk"
  | "primary"
  | "secondary"
  | "tertiary"
  | "unclassified"
  | "residential"
  | "living_street"
  | "service"
  | "pedestrian"
  | "footway"
  | "steps";

/** Paving of a pedestrian street, where it is not the city's plain paving. */
export type RoadSurface = "sandstone" | "granite";

/** What a street's shops sell, where the street is known for it. */
export type Wares = "bangles";

export type MapRoad = {
  cls: RoadClass;
  surface?: RoadSurface;
  /** Carriageway width, metres. */
  w: number;
  /** Raised footpath width on each side; 0 where the lane is shared. */
  foot: number;
  oneway: boolean;
  /** Graph node ids at each end. */
  a: number;
  b: number;
  pts: Pt[];
  name?: string;
};

export type MapNode = { id: number; x: number; z: number };

/** One procedurally filled building, facing the road at local +z. */
export type Plot = {
  x: number;
  z: number;
  /** Yaw: local +z points to (sin rot, cos rot), toward the street. */
  rot: number;
  w: number;
  d: number;
  floors: number;
  /** Street frontage with a ground-floor shop, versus a back-lot block. */
  front: boolean;
  seed: number;
  /** The real name over the shop, where OSM has one here (Mocambo, Trupti). */
  sign?: string;
  /** What the shop sells, on a street known for it (Laad Bazaar's bangles). */
  wares?: Wares;
};

/** A real building footprint from OSM (outer ring). */
export type MapBuilding = {
  pts: Pt[];
  holes?: Pt[][];
  h: number;
  name?: string;
  /** A roof on posts (OSM building=roof): bus platforms, fuel forecourts,
   *  market sheds. Walk-under, no walls. */
  canopy?: true;
};

/** A shop's signboard on an OSM building's street wall: centre on the wall
 *  line, facing out along (sin rot, cos rot), `w` wide. */
export type FacadeBoard = { name: string; x: number; z: number; rot: number; w: number };

/** A named place rendered with a hero model instead of its footprint. */
export type MapLandmark = {
  model: string;
  name: string;
  x: number;
  z: number;
  rot: number;
  /** Oriented footprint extents. */
  w: number;
  d: number;
  /** The foot of the main stair or gate (on local +z), for monuments you
   *  walk into; the compiler keeps a path from it to the street clear. */
  door?: Pt;
};

export type AreaKind = "water" | "park" | "beach" | "plaza" | "market" | "pitch" | "sea";
export type MapArea = { kind: AreaKind; pts: Pt[]; holes?: Pt[][]; name?: string };

export type RailKind = "rail" | "subway" | "light_rail" | "tram" | "monorail";
export type MapRail = { kind: RailKind; elevated: boolean; underground: boolean; pts: Pt[] };

export type PoiKind =
  | "bus_stop"
  | "worship"
  | "taxi"
  | "market"
  | "station"
  | "subway_entrance"
  | "fuel"
  | "shop"
  | "food";
export type MapPoi = { kind: PoiKind; x: number; z: number; name?: string; religion?: string };

export type Spot = { x: number; z: number; yaw: number };

export type TaskSpotKind = "auto" | "bus" | "temple" | "shop";

export type MapData = {
  id: string;
  /** Half the side of the square map, metres. */
  half: number;
  attribution: string;
  nodes: MapNode[];
  roads: MapRoad[];
  plots: Plot[];
  buildings: MapBuilding[];
  landmarks: MapLandmark[];
  areas: MapArea[];
  rails: MapRail[];
  pois: MapPoi[];
  spawn: Spot;
  spots: Record<TaskSpotKind, Spot>;
  /** Spots for the city's own errands, by task id. */
  errandSpots: Record<string, Spot>;
  /** Real shops' own boards on real (OSM) buildings: Mocambo on Park Street. */
  boards: FacadeBoard[];
  /** The barber's lock-up: a gap in a street frontage near the spawn,
   *  facing the street along (sin yaw, cos yaw). */
  barber: Spot;
  /** The tricolour's flagpole: in a park or plaza near the spawn, or on
   *  open ground beside it. */
  flag: Spot;
};

/** Surface height of raised footpaths. */
export const KERB_H = 0.2;

/**
 * Where a task happens on the map: its city errand's own spot, else the spot
 * the compiler reserved for its kind. The map is the only source of task
 * positions; a task pack's stored `pos` is not read.
 */
export function taskSpot(map: MapData, task: { id: string; kind: string }): Spot {
  const spot = map.errandSpots[task.id] ?? map.spots[task.kind as TaskSpotKind];
  if (!spot) throw new Error(`${map.id}: no spot for task ${task.id} (${task.kind})`);
  return spot;
}
