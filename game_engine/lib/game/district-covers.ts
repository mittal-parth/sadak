import type { StaticImageData } from "next/image";

import puraniSadak from "../../public/covers/purani-sadak.png";
import marinaNagar from "../../public/covers/marina-nagar.png";
import majesticCross from "../../public/covers/majestic-cross.png";
import parkGully from "../../public/covers/park-gully.png";
import charminarLane from "../../public/covers/charminar-lane.jpg";
import fortKochi from "../../public/covers/fort-kochi.jpg";
import dadarChowk from "../../public/covers/dadar-chowk.jpg";
import manekChowk from "../../public/covers/manek-chowk.jpg";
import hallBazaar from "../../public/covers/hall-bazaar.jpg";
import lingarajLane from "../../public/covers/lingaraj-lane.jpg";

/** Bundled cover art so every district card loads reliably in dev and prod. */
export const DISTRICT_COVER_IMAGES: Record<string, StaticImageData> = {
  "purani-sadak": puraniSadak,
  "marina-nagar": marinaNagar,
  "majestic-cross": majesticCross,
  "park-gully": parkGully,
  "charminar-lane": charminarLane,
  "fort-kochi": fortKochi,
  "dadar-chowk": dadarChowk,
  "manek-chowk": manekChowk,
  "hall-bazaar": hallBazaar,
  "lingaraj-lane": lingarajLane,
};
