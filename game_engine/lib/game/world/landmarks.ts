/**
 * Places the district's named landmarks on their real footprints.
 *
 * Each model key from the map compiler resolves to a builder: a parametric
 * walkable monument (monuments.ts) in the city's own stone (red sandstone in
 * Delhi, grey granite in Hyderabad, yellow sandstone in Ahmedabad, laterite
 * in Bhubaneswar), or one of the hand-built hero models in assets/ fitted to
 * the footprint. Colliders and climbable surfaces are transformed into world
 * space and registered with the collision world and height field.
 */

import * as THREE from "three";
import type { Landmark } from "../assets";
import {
  makeArtDecoCinema,
  makeCharminar,
  makeChineseFishingNet,
  makeGopuram,
  makeStreetMandir,
} from "../assets";
import type { MapLandmark } from "./mapData";
import type { CollisionWorld } from "./collide";
import type { HeightField } from "./height";
import {
  busStation,
  church,
  colonialBlock,
  fountain,
  gateway,
  gurdwara,
  kabutarKhana,
  memorialGarden,
  mosque,
  promenade,
  smallMosque,
  temple,
  tomb,
  type Monument,
  type MosqueStyle,
  type TempleStyle,
} from "./monuments";
import { CITY_TRAFFIC } from "../transit";

/** Mosque stone per city: the building material is the identity. */
const MOSQUE: Partial<Record<Landmark, MosqueStyle>> & { default: MosqueStyle } = {
  default: { stone: 0xe9e1d0, accent: 0xc9b28a, dome: 0xf4f0e8, plinth: 1.2 },
  // Jama Masjid: red sandstone with white marble bands and domes.
  delhi: { stone: 0xb5563a, accent: 0xf1ece2, dome: 0xf4f0e8, plinth: 3.2 },
  // Mecca Masjid: grey granite.
  hyderabad: { stone: 0xa89f8e, accent: 0xd8cfbd, dome: 0xc9c1b0, plinth: 1.6 },
  // Ahmedabad's Jama Masjid: yellow sandstone.
  ahmedabad: { stone: 0xd4b483, accent: 0xb89660, dome: 0xd9bf8f, plinth: 1.4 },
  mumbai: { stone: 0xf0ede4, accent: 0x2e8b57, dome: 0x2e8b57, plinth: 0.8 },
  bengaluru: { stone: 0xf0ede4, accent: 0x2e8b57, dome: 0x2e8b57, plinth: 0.8 },
  kolkata: { stone: 0xf0ede4, accent: 0x2e8b57, dome: 0x2e8b57, plinth: 0.8 },
};

const TEMPLE: Partial<Record<Landmark, TempleStyle>> & { default: TempleStyle } = {
  default: { stone: 0xe8d7b0, accent: 0xd9642b, plinth: 1.0, kind: "nagara", tower: 1.6 },
  // Lingaraj and its shrines: laterite and sandstone, Kalinga rekha deul.
  bhubaneswar: { stone: 0xa9745a, accent: 0x8f5f48, plinth: 1.2, kind: "kalinga", tower: 2.1 },
  delhi: { stone: 0xf2e8d5, accent: 0xd9642b, plinth: 1.1, kind: "nagara", tower: 1.5 },
  mumbai: { stone: 0xf2e8d5, accent: 0xe06a2a, plinth: 0.9, kind: "nagara", tower: 1.4 },
  bengaluru: { stone: 0xf2e8d5, accent: 0xc0392b, plinth: 0.9, kind: "nagara", tower: 1.3 },
  hyderabad: { stone: 0xf2e8d5, accent: 0xd9642b, plinth: 0.6, kind: "nagara", tower: 1.2 },
  kolkata: { stone: 0xf2e8d5, accent: 0xc0392b, plinth: 0.9, kind: "nagara", tower: 1.3 },
  ahmedabad: { stone: 0xf2e8d5, accent: 0xd9642b, plinth: 0.9, kind: "nagara", tower: 1.3 },
};

/** Fit a hand-built model into a footprint, uniformly, sitting on y=0. */
function fit(model: THREE.Group, w: number, d: number, maxScale = 3): Monument {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = Math.min(maxScale, Math.max(0.4, Math.min(w / Math.max(0.1, size.x), d / Math.max(0.1, size.z))));
  model.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  const g = new THREE.Group();
  g.add(model);
  return { group: g, colliders: [{ x: 0, z: 0, hw: (size.x * s) / 2, hd: (size.z * s) / 2 }], heights: [] };
}

/** Builds the model for one landmark, in its local frame. */
export function buildLandmark(l: MapLandmark, city: Landmark): Monument {
  const ms = MOSQUE[city] ?? MOSQUE.default;
  const ts = TEMPLE[city] ?? TEMPLE.default;
  const { w, d } = l;
  switch (l.model) {
    case "jama_masjid":
      return mosque(w, d, ms);
    case "mosque_small":
      return smallMosque(Math.min(w, 26), Math.min(d, 26), ms);
    case "dargah":
      return smallMosque(Math.min(w, 18), Math.min(d, 18), { ...ms, dome: 0x2e8b57, accent: 0x2e8b57, stone: 0xf2efe6 });
    case "tomb":
      return tomb(Math.min(w, 40), Math.min(d, 40), ms);
    case "temple":
    case "shrine":
      return temple(Math.max(6, Math.min(w, 22)), Math.max(7, Math.min(d, 26)), ts);
    case "deul_small":
      return temple(Math.max(7, Math.min(w, 14)), Math.max(8, Math.min(d, 16)), TEMPLE.bhubaneswar!);
    case "lingaraj":
      return temple(w, d, { ...TEMPLE.bhubaneswar!, compound: true, tower: 2.6 });
    case "gopuram_temple": {
      // Walled Dravidian temple: the gopuram over the gate, a vimana inside.
      const m = temple(w, d, { stone: 0xe9dcc0, accent: 0xc84b31, plinth: 0.8, kind: "nagara", tower: 1.0, compound: true });
      const gop = fit(makeGopuram(), Math.min(w * 0.3, 18), 10, 4);
      gop.group.position.z = d / 2 - 2;
      m.group.add(gop.group);
      return m;
    }
    case "church_small":
      return church(Math.min(w, 22), Math.min(d, 32), { wall: 0xf4efe4, trim: 0xd9c9a8, roof: 0x9b3b2f, towers: 1 });
    case "church":
      return church(w, d, { wall: 0xf4efe4, trim: 0xd9c9a8, roof: 0x7a3a2f, towers: 1 });
    case "basilica":
      // Santa Cruz: pale with twin spires.
      return church(w, d, { wall: 0xf6f2ea, trim: 0xb9a57c, roof: 0x5c6f8f, towers: 2 });
    case "gurdwara_small":
      return gurdwara(Math.min(w, 26), Math.min(d, 26), { storeys: 2, gold: false, nishan: true });
    case "harmandir_sahib":
      return gurdwara(w, d, { storeys: 2, gold: true, nishan: false });
    case "akal_takht":
      return gurdwara(w, d, { storeys: 4, gold: false, nishan: true });
    case "kaman":
      return gateway(Math.max(w, 14), Math.max(4, Math.min(d, 8)), 1, 0xcfc2a3, 0xb09a72);
    case "teen_darwaza":
      return gateway(Math.max(w, 22), 7, 3, 0xd4b483, 0xb89660);
    case "fountain":
      return fountain(w, d, 0xd8cfbd);
    case "kabutar_khana":
      return kabutarKhana(w, d);
    case "colonial":
      return colonialBlock(w, d, Math.max(2, Math.min(4, Math.round(Math.min(w, d) / 8))), 0xe6d8b8);
    case "agiyari":
      return colonialBlock(w, d, 2, 0xf0e6d0);
    case "memorial_garden":
      return memorialGarden(w, d);
    case "bus_station":
      return busStation(w, d, CITY_TRAFFIC[city].bus);
    case "charminar":
      return fit(makeCharminar(), w, d, 4);
    case "cinema":
      return fit(makeArtDecoCinema(), w, d);
    case "fishing_nets": {
      // A row of nets along the shore.
      const g = new THREE.Group();
      const colliders: Monument["colliders"] = [];
      const n = Math.max(2, Math.floor(w / 16));
      for (let i = 0; i < n; i++) {
        const net = fit(makeChineseFishingNet(undefined, 40 + i), 14, 12, 2);
        net.group.position.x = -w / 2 + (w * (i + 0.5)) / n;
        g.add(net.group);
        colliders.push({ ...net.colliders[0], x: net.group.position.x });
      }
      return { group: g, colliders, heights: [] };
    }
    case "promenade":
      return promenade(w, Math.max(d, 6));
    default:
      if (process.env.NODE_ENV !== "production") console.warn(`[landmarks] no builder for "${l.model}" (${l.name})`);
      return fit(makeStreetMandir(), w, d);
  }
}

/** A spot inside a monument where someone stands, in world space. */
export type InnerSpot = { x: number; z: number; yaw: number; name: string };

/** Build, place and register every landmark on the map. */
export function placeLandmarks(
  landmarks: MapLandmark[],
  city: Landmark,
  collide: CollisionWorld,
  height: HeightField
): { group: THREE.Group; inners: InnerSpot[] } {
  const group = new THREE.Group();
  group.name = "landmarks";
  const inners: InnerSpot[] = [];
  for (const l of landmarks) {
    const m = buildLandmark(l, city);
    m.group.position.set(l.x, 0, l.z);
    m.group.rotation.y = l.rot;
    m.group.userData.landmark = l.name;
    group.add(m.group);
    const c = Math.cos(l.rot);
    const s = Math.sin(l.rot);
    // Local (u, v) -> world: local +x = (cos, -sin), local +z = (sin, cos).
    const world = (u: number, v: number) => [l.x + u * c + v * s, l.z - u * s + v * c] as const;
    for (const b of m.colliders) {
      const [x, z] = world(b.x, b.z);
      collide.box(x, z, b.hw, b.hd, l.rot + (b.rot ?? 0));
    }
    for (const h of m.heights) {
      const [x, z] = world(h.x, h.z);
      height.rect(x, z, h.hw, h.hd, l.rot, h.y0, h.y1);
    }
    if (m.inner) {
      const [x, z] = world(m.inner.x, m.inner.z);
      inners.push({ x, z, yaw: l.rot, name: l.name });
    }
  }
  return { group, inners };
}
