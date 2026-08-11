/**
 * The shop's radio, as explicit video ids.
 *
 * Sourced from the "banger songs that play at indian barber shops" playlist
 * (PLTJ1PnzCWyFw), but NOT referenced by playlist id: YouTube refuses to embed
 * that playlist ("This video is unavailable") while every video in it embeds
 * fine on its own. The embed player builds an anonymous queue from an explicit
 * `playlist=` id list instead, which has no such restriction.
 *
 * All 70 were checked one by one against the real embed endpoint; the two
 * that would not play were dropped. Re-check with scripts/check-barber-tracks.ts
 * if tracks start disappearing.
 */
export const BARBER_TRACKS: readonly string[] = [
  "N0jnLZxYwYc", "zuPoUsdXrqM", "3NWMK2MRqIk", "bga_0ziOOfQ", "oFxbBeYhLqM", "nNhv8A_rJTg",
  "d3lZvNexPL0", "CTuvMubzXpU", "i1IsLVz6T9Q", "5y_TCKNzAMI", "fBylcT-TWZw", "CTNgz5gb3D8",
  "lFdSi01tpYM", "dDR4oiyjUBA", "otQmzlm-s7Q", "tPNwGuu_rQ4", "p1jhKCIoVjI", "2OsyNo53MzU",
  "-N-k56i7M2k", "rXHY4Cv9cA8", "qGOTe3KmCdY", "cGKBs7rokos", "BtdiNnrftYM", "nRJ8vHpi6_g",
  "xKx_80QM2LU", "wYdXuNtJkPk", "RjJxWRFfG3s", "wV8njoRVefQ", "4ImdbyqnH8w", "5dWbn_qER3s",
  "6Na7GSV9bVY", "oEg_iXEWlt4", "QjqKXFGM3eI", "Dz1Ad3cdtQA", "G7AdjVDBLO8", "TgHYW8ubFko",
  "uIOrAkrjwp4", "HoMSu1iw0Zw", "WAgJ8KM5AVQ", "OgocnLh9P1M", "Zi9UBJQMz3I", "_dUAVM5ERXA",
  "lRBIcaSV-Ns", "9v2bq2JHt4I", "Gg9ZUppafLo", "w89fWEelFns", "fg9G1dacXjk", "Y-o8NQ8Y36A",
  "526hvVlBP1U", "iCZfjggJg3M", "BaAoZA0fup0", "cBGDDBHN22U", "nG85YFR3o6U", "TRUuSFW80Rk",
  "-pIMyf5dOnA", "GxaTSDnI71w", "XWKazQwFFdY", "9f6GhUb-WdM", "rMbQufI9xQw", "Mfeg92XPXik",
  "PqiddY3o3aY", "Dg7Z0YPlHY4", "KdR7mSLKyyE", "wXL4jlrK1Tw", "CHRMRsVu4do", "khcLGIVHA7w",
  "Oj6rNyVUdUg", "amML_UjltQI", "xvevXfFGPFY", "pYQC-SA2gOo",
] as const;
