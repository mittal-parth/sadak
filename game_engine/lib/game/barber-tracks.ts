import type { LangCode } from "@/lib/sarvam";

/**
 * The shop's radio, per district language, as explicit video ids.
 *
 * NOT playlist ids. YouTube refuses to embed the Delhi source playlist
 * ("This video is unavailable" for any `list=`) while every video in it embeds
 * fine alone, and a known-public control playlist embeds fine from the same
 * page. The player builds an anonymous queue from an explicit id list instead,
 * which has no such restriction.
 *
 * Every id here was loaded in a real embed and confirmed to play. Three picks
 * had to be swapped for other uploads of the same song: two Bengali ones had
 * off-site playback disabled by the owner, and the Malayalam one was region
 * blocked. Re-check before adding: label-owned uploads often forbid embedding,
 * and there is no way to detect that short of trying it.
 */
export const BARBER_TRACKS: Record<LangCode, readonly string[]> = {
  /* Delhi — the "banger songs that play at indian barber shops"
     playlist (PLTJ1PnzCWyFw), flattened to ids. */
  "hi-IN": [
    "N0jnLZxYwYc", "zuPoUsdXrqM", "3NWMK2MRqIk", "bga_0ziOOfQ", "oFxbBeYhLqM",
    "nNhv8A_rJTg", "d3lZvNexPL0", "CTuvMubzXpU", "i1IsLVz6T9Q", "5y_TCKNzAMI",
    "fBylcT-TWZw", "CTNgz5gb3D8", "lFdSi01tpYM", "dDR4oiyjUBA", "otQmzlm-s7Q",
    "tPNwGuu_rQ4", "p1jhKCIoVjI", "2OsyNo53MzU", "-N-k56i7M2k", "rXHY4Cv9cA8",
    "qGOTe3KmCdY", "cGKBs7rokos", "BtdiNnrftYM", "nRJ8vHpi6_g", "xKx_80QM2LU",
    "wYdXuNtJkPk", "RjJxWRFfG3s", "wV8njoRVefQ", "4ImdbyqnH8w", "5dWbn_qER3s",
    "6Na7GSV9bVY", "oEg_iXEWlt4", "QjqKXFGM3eI", "Dz1Ad3cdtQA", "G7AdjVDBLO8",
    "TgHYW8ubFko", "uIOrAkrjwp4", "HoMSu1iw0Zw", "WAgJ8KM5AVQ", "OgocnLh9P1M",
    "Zi9UBJQMz3I", "_dUAVM5ERXA", "lRBIcaSV-Ns", "9v2bq2JHt4I", "Gg9ZUppafLo",
    "w89fWEelFns", "fg9G1dacXjk", "Y-o8NQ8Y36A", "526hvVlBP1U", "iCZfjggJg3M",
    "BaAoZA0fup0", "cBGDDBHN22U", "nG85YFR3o6U", "TRUuSFW80Rk", "-pIMyf5dOnA",
    "GxaTSDnI71w", "XWKazQwFFdY", "9f6GhUb-WdM", "rMbQufI9xQw", "Mfeg92XPXik",
    "PqiddY3o3aY", "Dg7Z0YPlHY4", "KdR7mSLKyyE", "wXL4jlrK1Tw", "CHRMRsVu4do",
    "khcLGIVHA7w", "Oj6rNyVUdUg", "amML_UjltQI", "xvevXfFGPFY", "pYQC-SA2gOo",
  ],
  /* Tamil */
  "ta-IN": [
    "OMkC_-ULEp0", // Ilaya Nila — Payanangal Mudivathillai (1982), Ilaiyaraaja
    "dp0tSJW_xUs", // Chinna Chinna Aasai — Roja (1992), A.R. Rahman
    "WfwCtR1iLFw", // Kannalane — Bombay (1995), A.R. Rahman
  ],
  /* Telugu */
  "te-IN": [
    "1V-aXf96pyA", // O Priya Priya — Geetanjali (1989), Ilaiyaraaja
    "Wm5n8V4N5f0", // Chinni Chinni Aasa — Roja Telugu (1992), A.R. Rahman
    "kiG1zSWjB4k", // Ilaiyaraaja evergreen Telugu hits — jukebox
  ],
  /* Malayalam */
  "ml-IN": [
    "k8NSnBnkFXM", // Malare — Premam (2015), Rajesh Murugesan
    "_ZvujZ8NNmY", // Ente Khalbile Vennilavu — Classmates (2006), Alex Paul
    "QggS4S8Buhg", // Evergreen Malayalam hits — jukebox
  ],
  /* Kannada */
  "kn-IN": [
    "sHMqV18F4aU", // Naguva Nayana — Pallavi Anu Pallavi (1983), Ilaiyaraaja
    "nlsLKA6hlVQ", // Anisuthide Yaako Indu — Mungaru Male (2006), Mano Murthy
    "bh6K-tFfpag", // Dr. Rajkumar evergreen hits — jukebox
  ],
  /* Marathi */
  "mr-IN": [
    "0USvmkQ97wo", // Airaneechya Deva Tula — Sadhi Mansa (1965), Lata Mangeshkar
    "OY5vL4aXMAo", // Apsara Aali — Natarang (2010), Ajay-Atul
    "4GowgfCbYmM", // Aika Dajiba — Vaishali Samant / Avadhoot Gupte
  ],
  /* Bengali */
  "bn-IN": [
    "kvadzdVaTtg", // Coffee Houser Sei Addata — Manna Dey (1983)
    "ly56-QHvLWY", // Ami Chini Go Chini Tomare — Kishore Kumar
    "MV7NxsPLkmA", // Ei Poth Jodi Na Shesh Hoy — Saptapadi (1961)
  ],
  /* Punjabi */
  "pa-IN": [
    "lk93MVajio0", // Dil Da Mamla Hai — Gurdas Maan
    "MCtZrsmiwwQ", // Apna Punjab Hove — Gurdas Maan
    "M_HKFJHZPqA", // Gurdas Maan evergreen top 20 — jukebox
  ],
  /* Odia */
  "od-IN": [
    "ynTQbYEc6HU", // Budha Budhi — Akshaya Mohanty
    "vBzz6HqKSU8", // Akshaya Mohanty hits — jukebox
    "IlmATNWgZ0k", // Songs of Akshaya Mohanty — jukebox
  ],
  /* Gujarati */
  "gu-IN": [
    "_UH1koWi4WM", // Pankhida Ne Aa Pinjaru — Mukesh / Avinash Vyas
    "ceexunkVe7c", // Pankhida — Kevi Rite Jaish (2012)
    "w7syI-3inKM", // Pankhida O Pankhida
  ],
  /* No English district ships yet; it borrows Delhi's block. */
  "en-IN": [],
};
