import type { LangCode } from "@/lib/sarvam";
import type { BaseLangCode } from "@/lib/i18n/base-lang";
import glossCatalog from "@/lib/i18n/glosses.json";
import { UI_KEY_TO_ENGLISH, type UiKey } from "@/lib/i18n/ui-keys";

export type GlossCatalog = Record<string, Partial<Record<LangCode, string>>>;

const catalog = glossCatalog as GlossCatalog;

export function gloss(english: string, baseLang: BaseLangCode): string {
  const source = english.trim();
  if (!source || baseLang === "en-IN") return english;
  const translated = catalog[source]?.[baseLang];
  return translated?.trim() ? translated : english;
}

export function ui(key: UiKey, baseLang: BaseLangCode): string {
  return gloss(UI_KEY_TO_ENGLISH[key], baseLang);
}
