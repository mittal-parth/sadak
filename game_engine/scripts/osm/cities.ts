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

export const MAP_HALF = 360;

export type LandmarkRule = {
  /** Matched against the OSM name (and name:en). */
  match: RegExp;
  /** Hero model key, resolved at runtime by world/landmarks.ts. */
  model: string;
  /** Default footprint for point features, metres. */
  size?: [number, number];
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
};

const SMALL_TEMPLE: [number, number] = [9, 9];

export const OSM_CITIES: OsmCity[] = [
  {
    id: "purani-sadak",
    lat: 28.6535,
    lon: 77.2335,
    half: MAP_HALF,
    fill: { width: [3.5, 7], depth: [8, 14], floors: [2, 4], shop: 0.95, laneWidth: 4.5, courtyards: 0.05 },
    landmarks: [
      { match: /^Jama Masjid$/, model: "jama_masjid" },
      { match: /Sunehri Masjid/, model: "mosque_small" },
      { match: /Sis Ganj/, model: "gurdwara_small" },
      { match: /Gauri Shankar/, model: "temple", size: SMALL_TEMPLE },
      { match: /Central Baptist/, model: "church_small" },
    ],
    spawnNear: /Gauri Shankar/,
    temple: /Gauri Shankar/,
    shopStreet: /Dariba Kalan|Kinari Bazar/,
  },
  {
    id: "dadar-chowk",
    lat: 19.019,
    lon: 72.843,
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
  },
  {
    id: "marina-nagar",
    lat: 13.055,
    lon: 80.2795,
    half: MAP_HALF,
    fill: { width: [5, 9], depth: [8, 14], floors: [1, 3], shop: 0.5, laneWidth: 5.5, courtyards: 0.2 },
    landmarks: [
      { match: /Sri Parthasarathy Koil/, model: "gopuram_temple" },
      { match: /Peyalvar Shrine/, model: "temple", size: SMALL_TEMPLE },
    ],
    spawnNear: /Sri Parthasarathy Koil/,
    temple: /Sri Parthasarathy Koil/,
    shopStreet: /Car Street|Singarachari/,
    sea: "east",
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
    temple: /Annammadevi/,
    shopStreet: /Subedar Chatram|Cottonpete|Balepet/,
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
    shrineOn: /Park Street/,
    shopStreet: /Park Street|Mirza Ghalib/,
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
    spawnNear: /^Charminar$/,
    temple: /Bhagyalaxmi Temple/,
    shopStreet: /Ladbazar|Lad Bazar/,
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
  },
  {
    id: "manek-chowk",
    lat: 23.0245,
    lon: 72.5855,
    half: MAP_HALF,
    fill: { width: [3.5, 7], depth: [8, 13], floors: [2, 4], shop: 0.85, laneWidth: 4.5, courtyards: 0.05 },
    landmarks: [
      { match: /Teen Darwaza/, model: "teen_darwaza", size: [22, 8] },
      { match: /^Jama Masjid$/, model: "jama_masjid" },
      { match: /Tomb of Ahmad Shah|Tomb of ahmad shah/i, model: "tomb" },
      { match: /Rani's Hajira|Mughli Bibi/, model: "tomb" },
      { match: /Khamasa Parsi Agiyari/, model: "agiyari", size: [12, 10] },
    ],
    spawnNear: /^Jama Masjid$/,
    shrineOn: /Manek Chowk/,
    shopStreet: /Manek Chowk|Gandhi Road/,
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
      { match: /Santokh ?Sar/, model: "gurdwara_small" },
      { match: /Saragarhi/, model: "gurdwara_small", size: [10, 10] },
    ],
    spawnNear: /^Shri Harmandir Sahib$/,
    temple: /^Shri Harmandir Sahib$/,
    // The bazaars wrap the complex; any lane off the approach will do.
    shopStreet: /.*/,
  },
  {
    id: "lingaraj-lane",
    lat: 20.2395,
    lon: 85.835,
    half: MAP_HALF,
    fill: { width: [6, 10], depth: [9, 14], floors: [1, 2], shop: 0.35, laneWidth: 5.5, courtyards: 0.3 },
    landmarks: [
      { match: /Lord Lingaraj Temple/, model: "lingaraj" },
      { match: /Vaital Mandir|Yameswar|Chitrakarini|Mohini Temple|Bakreswara|Maitreswara|Ananta Basudeva|Kartikeswar|Suresvara|Lakheswar/, model: "deul_small", size: [8, 8] },
    ],
    spawnNear: /Lord Lingaraj Temple/,
    temple: /Lord Lingaraj Temple/,
    shopStreet: /Rath Road/,
  },
];
