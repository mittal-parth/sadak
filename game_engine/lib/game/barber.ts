import type { LangCode } from "@/lib/sarvam";

/** Offset from CHOWK centre — away from plaza errands and ring-road tasks. */
export const BARBER_POS: [number, number] = [-34, -34];

export const BARBER_ENTER_RADIUS = 4.5;

export const BARBER_SIGN_LABEL = "BARBER";

export const BARBER_INTERACT_LABEL = "Enter barber shop";

/**
 * YouTube playlist ids per learning language. Placeholders — swap for real
 * YT Music playlists when ready.
 */
export const BARBER_PLAYLISTS: Record<LangCode, string> = {
  "hi-IN": "PLhi_placeholder",
  "ta-IN": "PLta_placeholder",
  "te-IN": "PLte_placeholder",
  "kn-IN": "PLkn_placeholder",
  "ml-IN": "PLml_placeholder",
  "mr-IN": "PLmr_placeholder",
  "gu-IN": "PLgu_placeholder",
  "bn-IN": "PLbn_placeholder",
  "pa-IN": "PLpa_placeholder",
  "od-IN": "PLod_placeholder",
  "en-IN": "PLen_placeholder",
};

const FALLBACK_PLAYLIST = "PLen_placeholder";

export function barberPlaylistFor(language: LangCode): string {
  return BARBER_PLAYLISTS[language] ?? FALLBACK_PLAYLIST;
}

export function barberEmbedUrl(playlistId: string): string {
  const params = new URLSearchParams({
    list: playlistId,
    autoplay: "1",
    mute: "0",
    rel: "0",
    modestbranding: "1",
  });
  return `https://www.youtube.com/embed/videoseries?${params.toString()}`;
}
