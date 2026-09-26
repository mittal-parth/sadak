/**
 * The real neighbourhood each district is built on, and how the map compiler
 * dresses it.
 *
 * Each district is a 720m OpenStreetMap extract centred so the box takes in
 * the places that name it. OSM supplies the street network, water, parks,
 * rail and the landmark footprints; it has only a fraction of the ordinary
 * buildings, so the compiler fills every street frontage with plots in the
 * city's own grain (narrow old-city shophouses in Delhi and Hyderabad, deep
 * colonial mansions on Park Street, low heritage houses in Fort Kochi).
 */

import type { RoadClass, RoadSurface, Wares } from "../../lib/game/world/mapData";

export const MAP_HALF = 360;

/** Retags a real street the way it is used now (OSM lags the street). */
export type StreetRule = {
  /** Matched against the road name. */
  match: RegExp;
  /** Road class to use instead of the OSM highway tag. */
  as?: RoadClass;
  /** Paving for pedestrian streets. */
  surface?: RoadSurface;
  /** Width override, metres. */
  w?: number;
  /** What every shop on the street sells. */
  wares?: Wares;
};

export type LandmarkRule = {
  /** Matched against the OSM name (and name:en). */
  match: RegExp;
  /** Hero model key, resolved at runtime by world/landmarks.ts. */
  model: string;
  /** Default footprint for point features, metres. */
  size?: [number, number];
  /** Compass bearing the main entrance faces (0 north, 90 east), where the
   *  footprint alone can't tell: Parthasarathy's gopuram looks to the sea. */
  faces?: number;
};

export type FillStyle = {
  /** Plot frontage and depth ranges, metres. */
  width: [number, number];
  depth: [number, number];
  /** Floors on a residential lane; main roads add to this. */
  floors: [number, number];
  /** Chance a street-facing plot has a ground-floor shop. */
  shop: number;
  /** Residential/living-street carriageway width (old cities are gullies). */
  laneWidth: number;
  /** Share of back-lot cells left open as courtyards and gardens. */
  courtyards: number;
};

export type OsmCity = {
  id: string;
  lat: number;
  lon: number;
  half: number;
  fill: FillStyle;
  landmarks: LandmarkRule[];
  /** Where the player starts: beside this landmark, facing it. */
  spawnNear: RegExp;
  /** The landmark the temple task happens at. When the extract has no
   *  suitable one, `shrineOn` names a road to build a small shrine beside. */
  temple?: RegExp;
  shrineOn?: RegExp;
  /** A bazaar street for the shop task. */
  shopStreet: RegExp;
  /** Open sea beyond one edge, for coasts the extract stops short of. */
  sea?: "east" | "west";
  /** City errands beyond the four staples, each at a real named place:
   *  matched against point names, then landmarks, areas and roads.
   *  `street` keeps the spot off footpaths (a ticket hall on the road). */
  errands?: { id: string; at: RegExp; street?: boolean }[];
  /** Streets that are not what their OSM tags say. */
  streets?: StreetRule[];
  /** Things OSM doesn't map that the street is known for, set beside the
   *  named street: the temple car parked on Car Street. */
  setPieces?: { model: string; name: string; on: RegExp; size: [number, number]; near?: RegExp }[];
  /** A sanctum on an island in a tank (the Harmandir Sahib in the sarovar):
   *  the compiler cuts its causeway and opens the ring of buildings round it. */
  pool?: { water: RegExp; sanctum: RegExp };
  /** The bus stand the bus errand is at, when the district has one. */
  busNear?: RegExp;
  /** Names for OSM elements mapped without one, by element id. */
  names?: Record<number, string>;
  /** A tank whose island carries a pavilion (Bindu Sagar's Jalamandira). */
  islandPavilion?: { water: RegExp; name: string };
};

const SMALL_TEMPLE: [number, number] = [9, 9];

export const OSM_CITIES: OsmCity[] = [
  {
    id: "purani-sadak",
    lat: 28.65323,
    lon: 77.2335,
    // 800m: Chandni Chowk along the north, the whole of the Jama Masjid to the
    // south.
    half: 400,
    fill: { width: [3.5, 7], depth: [8, 14], floors: [2, 4], shop: 0.95, laneWidth: 4.5, courtyards: 0.05 },
    landmarks: [
      { match: /^Jama Masjid$/, model: "jama_masjid" },
      { match: /Sunehri Masjid/, model: "mosque_small" },
      // Faces Chandni Chowk, to its north.
      { match: /Sis Ganj/, model: "gurdwara_small", faces: 0 },
      { match: /Gauri Shankar/, model: "temple", size: SMALL_TEMPLE },
      { match: /^Central Baptist Church$/, model: "church_small" },
    ],
    // Chandni Chowk was pedestrianised in 2021: red sandstone from the Red
    // Fort to Fatehpuri, a planted median, no cars.
    streets: [{ match: /^Chandni Chowk$/, as: "pedestrian", surface: "sandstone", w: 8 }],
    spawnNear: /Gauri Shankar/,
    temple: /Gauri Shankar/,
    shopStreet: /Dariba Kalan|Kinari Bazar/,
    errands: [
      { id: "purani-sadak-paranthe", at: /Paranthe Wali Gali/ },
      { id: "purani-sadak-minaret", at: /^Jama Masjid$/ },
    ],
  },
  {
    id: "dadar-chowk",
    // Dadar West: the Kabutar Khana and Ranade Road bazaar, with the station
    // and the rail corridor across the east of the box.
    lat: 19.01954,
    lon: 72.84186,
    half: MAP_HALF,
    fill: { width: [8, 16], depth: [10, 18], floors: [3, 7], shop: 0.7, laneWidth: 6, courtyards: 0.25 },
    landmarks: [
      { match: /Kabutar Khana/, model: "kabutar_khana", size: [12, 12] },
      { match: /Plaza Cinema/, model: "cinema" },
      { match: /Hanuman temple/, model: "temple", size: SMALL_TEMPLE },
      { match: /Pir Baghdadi Masjid/, model: "mosque_small" },
      { match: /Swami Narayan Mandir/, model: "temple" },
    ],
    spawnNear: /Kabutar Khana/,
    temple: /Hanuman temple/,
    shopStreet: /N C Kelkar|Ranade/,
    // The ticket hall is out on the station road, not between the platforms.
    errands: [{ id: "dadar-chowk-local", at: /^Ticket Counter$|Dadar \(Western\)/, street: true }],
  },
  {
    id: "marina-nagar",
    lat: 13.055,
    lon: 80.27913,
    // A little bigger than the rest: Triplicane runs 1.1km from the
    // Parthasarathy temple to the Marina, and both ends belong in the box.
    half: 420,
    fill: { width: [5, 9], depth: [8, 14], floors: [1, 3], shop: 0.5, laneWidth: 5.5, courtyards: 0.2 },
    landmarks: [
      { match: /Sri Parthasarathy Koil/, model: "gopuram_temple", faces: 90 },
      { match: /Peyalvar Shrine/, model: "temple", size: SMALL_TEMPLE },
      // The row of statues along the Marina.
      { match: /^(Kannagi|Thiruvalluvar|Subhas Chandra Bose)$/, model: "statue", size: [4, 4] },
    ],
    setPieces: [
      { model: "temple_car", name: "Parthasarathy temple car", on: /^Car Street$/, size: [6, 7], near: /Sri Parthasarathy Koil/ },
    ],
    spawnNear: /Sri Parthasarathy Koil/,
    temple: /Sri Parthasarathy Koil/,
    shopStreet: /Car Street|Singarachari/,
    sea: "east",
    errands: [{ id: "marina-nagar-sundal", at: /^Marina Beach$/ }],
  },
  {
    id: "majestic-cross",
    lat: 12.9765,
    lon: 77.5735,
    half: MAP_HALF,
    fill: { width: [6, 14], depth: [10, 16], floors: [2, 5], shop: 0.85, laneWidth: 6, courtyards: 0.2 },
    landmarks: [
      { match: /^Kempegowda Bus Station$/, model: "bus_station" },
      { match: /Triveni Theatre|Anupama Theatre|Sapna Theater|Santosh Theater/, model: "cinema" },
      { match: /Annammadevi/, model: "temple", size: SMALL_TEMPLE },
      { match: /Tawakkal Shah/, model: "dargah" },
    ],
    spawnNear: /Annammadevi/,
    busNear: /Kempegowda Bus Station/,
    temple: /Annammadevi/,
    shopStreet: /Subedar Chatram|Cottonpete|Balepet/,
    errands: [{ id: "majestic-cross-metro", at: /Nadaprabhu Kempegowda Station, Majestic$/ }],
  },
  {
    id: "park-gully",
    lat: 22.553,
    lon: 88.353,
    half: MAP_HALF,
    fill: { width: [12, 24], depth: [14, 22], floors: [3, 6], shop: 0.6, laneWidth: 6.5, courtyards: 0.3 },
    landmarks: [
      { match: /Old Building of the Asiatic Society/, model: "colonial" },
      { match: /Saint Thomas' Catholic Church/, model: "church" },
      { match: /Queens Mansions|Chowringhee Mansions/, model: "colonial" },
      { match: /Madina Masjid/, model: "mosque_small", size: [12, 12] },
    ],
    spawnNear: /Asiatic Society/,
    // Park Street's own place of worship (the extract maps no mandir).
    temple: /^Saint Thomas' Catholic Church$/,
    shopStreet: /Park Street|Mirza Ghalib/,
    errands: [{ id: "park-gully-roll", at: /^Mocambo$/ }],
  },
  {
    id: "charminar-lane",
    lat: 17.3616,
    lon: 78.4747,
    half: MAP_HALF,
    fill: { width: [4, 8], depth: [8, 14], floors: [2, 4], shop: 0.9, laneWidth: 5, courtyards: 0.06 },
    landmarks: [
      { match: /^Charminar$/, model: "charminar" },
      { match: /^Mecca Masjid$/, model: "jama_masjid" },
      { match: /Char Kaman|Machli Kaman/, model: "kaman" },
      { match: /Gulzar houz/, model: "fountain", size: [10, 10] },
      { match: /Bhagyalaxmi Temple/, model: "temple", size: [6, 6] },
      { match: /Shahi Maqbara/, model: "tomb" },
    ],
    // The Charminar Pedestrianisation Project: granite round the monument,
    // traffic kept out. Laad Bazaar runs west from it, all bangles.
    streets: [
      { match: /^Charminar Circle$/, as: "pedestrian", surface: "granite", w: 14 },
      { match: /Ladbazar|Lad Bazar|Laad Bazaar/, wares: "bangles" },
    ],
    spawnNear: /^Charminar$/,
    temple: /Bhagyalaxmi Temple/,
    shopStreet: /Ladbazar|Lad Bazar/,
    errands: [{ id: "charminar-lane-chai", at: /^Nimrah$/ }],
  },
  {
    id: "fort-kochi",
    lat: 9.9658,
    lon: 76.244,
    half: MAP_HALF,
    fill: { width: [7, 13], depth: [9, 14], floors: [1, 2], shop: 0.45, laneWidth: 5.5, courtyards: 0.35 },
    landmarks: [
      { match: /Chinese Fishing Nets/, model: "fishing_nets", size: [60, 14] },
      { match: /Santa Cruz Cathedral/, model: "basilica" },
      { match: /^St Francis Church$/, model: "church" },
      { match: /Orthodox Syrian Church|Little Flower Church/, model: "church_small" },
      { match: /Vasco da Gama Square/, model: "promenade" },
    ],
    spawnNear: /Santa Cruz Cathedral/,
    temple: /Santa Cruz Cathedral/,
    shopStreet: /Princess Street|Bastian Street/,
    errands: [
      { id: "fort-kochi-ferry", at: /Junkar Jetty|^Jetty$/ },
      { id: "fort-kochi-catch", at: /^Chinese Fishing Nets$/ },
    ],
  },
  {
    id: "manek-chowk",
    // The old city's spine, west to east: Teen Darwaza, the Jama Masjid,
    // Ahmad Shah's tomb, the queens' tombs and Manek Chowk.
    lat: 23.0245,
    lon: 72.58657,
    half: MAP_HALF,
    fill: { width: [3.5, 7], depth: [8, 13], floors: [2, 4], shop: 0.85, laneWidth: 4.5, courtyards: 0.05 },
    landmarks: [
      { match: /Teen Darwaza/, model: "teen_darwaza", size: [22, 8] },
      { match: /^Jama Masjid$/, model: "jama_masjid" },
      { match: /Tomb of Ahmad Shah|Tomb of ahmad shah/i, model: "tomb" },
      // (Mughli Bibi's tomb stands inside the queens' enclosure.)
      { match: /Rani's Hajira/, model: "hajira" },
      { match: /Khamasa Parsi Agiyari/, model: "agiyari", size: [12, 10] },
      { match: /^Maneknath Mandir$/, model: "temple", size: SMALL_TEMPLE },
    ],
    spawnNear: /^Jama Masjid$/,
    temple: /^Maneknath Mandir$/,
    // Baba Maneknath's temple in the square named after him, mapped unnamed.
    names: { 14067711774: "Maneknath Mandir" },
    shopStreet: /Manek Chowk|Gandhi Road/,
    errands: [
      { id: "manek-chowk-kulfi", at: /Open air food market/ },
      { id: "manek-chowk-masjid", at: /^Jama Masjid$/ },
    ],
  },
  {
    id: "hall-bazaar",
    lat: 31.6222,
    lon: 74.8775,
    half: MAP_HALF,
    fill: { width: [4, 8], depth: [8, 14], floors: [2, 4], shop: 0.9, laneWidth: 5, courtyards: 0.06 },
    landmarks: [
      { match: /^Shri Harmandir Sahib$/, model: "harmandir_sahib" },
      { match: /Akal Takht/, model: "akal_takht" },
      { match: /Jallianwala Bagh/, model: "memorial_garden" },
      // The node, not the compound way (which rings its whole sarovar).
      { match: /^Gurudwara Santokhsar Sahib$/, model: "gurdwara_small", size: [14, 14] },
      { match: /Saragarhi/, model: "gurdwara_small", size: [10, 10] },
    ],
    spawnNear: /^Shri Harmandir Sahib$/,
    temple: /^Shri Harmandir Sahib$/,
    pool: { water: /^Amritsaras$/, sanctum: /^Shri Harmandir Sahib$/ },
    // The heritage approach and the gate road: the only streets OSM names
    // here, and bazaars both.
    shopStreet: /^Golden Temple Road$|^Mahan Singh Gate Road$/,
    errands: [{ id: "hall-bazaar-langar", at: /Langar Ghar/ }],
  },
  {
    id: "lingaraj-lane",
    lat: 20.2395,
    lon: 85.83443,
    half: MAP_HALF,
    fill: { width: [6, 10], depth: [9, 14], floors: [1, 2], shop: 0.35, laneWidth: 5.5, courtyards: 0.3 },
    landmarks: [
      { match: /Lord Lingaraj Temple/, model: "lingaraj" },
      { match: /Vaital Mandir|Yameswar|Chitrakarini|Mohini Temple|Bakreswara|Maitreswara|Ananta Basudeva|Kartikeswar|Suresvara|Lakheswar/, model: "deul_small", size: [8, 8] },
    ],
    spawnNear: /Lord Lingaraj Temple/,
    islandPavilion: { water: /^Bindu Sagara$/, name: "Jalamandira, Bindu Sagar" },
    temple: /Lord Lingaraj Temple/,
    shopStreet: /Rath Road/,
    errands: [{ id: "lingaraj-lane-chhena", at: /Bindu Sagara/ }],
  },
];
