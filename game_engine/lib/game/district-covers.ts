import type { StaticImageData } from "next/image";

import puraniSadak from "../../public/covers/purani-sadak.png";
import marinaNagar from "../../public/covers/marina-nagar.png";
import majesticCross from "../../public/covers/majestic-cross.png";
import parkGully from "../../public/covers/park-gully.png";

/** Bundled cover art so every district card loads reliably in dev and prod. */
export const DISTRICT_COVER_IMAGES: Record<string, StaticImageData> = {
  "purani-sadak": puraniSadak,
  "marina-nagar": marinaNagar,
  "majestic-cross": majesticCross,
  "park-gully": parkGully,
};
