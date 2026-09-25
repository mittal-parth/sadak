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

export type MapRoad = {
  cls: RoadClass;
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
};

/** A real building footprint from OSM (outer ring). */
export type MapBuilding = { pts: Pt[]; holes?: Pt[][]; h: number; name?: string };

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
};

export type AreaKind = "water" | "park" | "beach" | "plaza" | "pitch" | "sea";
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
};

/** Surface height of raised footpaths. */
export const KERB_H = 0.2;
