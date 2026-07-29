import type { LangCode } from "@/lib/sarvam";

/** Language the player reads instructions and glosses in (not the language they are learning). */
export type BaseLangCode = LangCode;

export const BASE_LANG_STORAGE_KEY = "sadak.baseLang";

export const DEFAULT_BASE_LANG: BaseLangCode = "en-IN";

export type BaseLangOption = {
  code: BaseLangCode;
  label: string;
  native: string;
};

/** English plus the ten playable Indic district languages. */
export const BASE_LANG_OPTIONS: BaseLangOption[] = [
  { code: "en-IN", label: "English", native: "English" },
  { code: "hi-IN", label: "Hindi", native: "हिन्दी" },
  { code: "bn-IN", label: "Bengali", native: "বাংলা" },
  { code: "ta-IN", label: "Tamil", native: "தமிழ்" },
  { code: "te-IN", label: "Telugu", native: "తెలుగు" },
  { code: "kn-IN", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml-IN", label: "Malayalam", native: "മലയാളം" },
  { code: "mr-IN", label: "Marathi", native: "मराठी" },
  { code: "gu-IN", label: "Gujarati", native: "ગુજરાતી" },
  { code: "pa-IN", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "od-IN", label: "Odia", native: "ଓଡ଼ିଆ" },
];

export function readStoredBaseLang(): BaseLangCode {
  if (typeof window === "undefined") return DEFAULT_BASE_LANG;
  try {
    const raw = localStorage.getItem(BASE_LANG_STORAGE_KEY);
    if (raw && BASE_LANG_OPTIONS.some((o) => o.code === raw)) {
      return raw as BaseLangCode;
    }
  } catch {
    /* private mode / blocked storage */
  }
  return DEFAULT_BASE_LANG;
}

export function writeStoredBaseLang(code: BaseLangCode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BASE_LANG_STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}
