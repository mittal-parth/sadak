import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOP_SIGNS, signsFor } from "./signage";
import { SEED_DISTRICTS } from "./districts";
import { RENDER_PRESETS, presetFor } from "./fx/presets";

test("every shipped district language has a full set of shop signs", () => {
  for (const d of SEED_DISTRICTS) {
    const signs = signsFor(d.language);
    assert.equal(signs.length, 8, `${d.id} (${d.language})`);
  }
});

test("every sign has native lettering and an English line", () => {
  for (const [lang, signs] of Object.entries(SHOP_SIGNS)) {
    for (const s of signs) {
      assert.ok(s.native.trim().length > 0, `${lang}: empty native`);
      assert.ok(s.en.trim().length > 0, `${lang}: empty english`);
      assert.equal(s.en, s.en.toUpperCase(), `${lang}: english line should be caps like a painted board`);
    }
  }
});

test("native lettering is actually in the district's script", () => {
  // First code point of each script block; a sign typed in the wrong script
  // (Devanagari on a Tamil street, say) fails here.
  const blocks: Record<string, [number, number]> = {
    "hi-IN": [0x0900, 0x097f],
    "mr-IN": [0x0900, 0x097f],
    "bn-IN": [0x0980, 0x09ff],
    "pa-IN": [0x0a00, 0x0a7f],
    "gu-IN": [0x0a80, 0x0aff],
    "od-IN": [0x0b00, 0x0b7f],
    "ta-IN": [0x0b80, 0x0bff],
    "te-IN": [0x0c00, 0x0c7f],
    "kn-IN": [0x0c80, 0x0cff],
    "ml-IN": [0x0d00, 0x0d7f],
  };
  for (const [lang, [lo, hi]] of Object.entries(blocks)) {
    for (const s of SHOP_SIGNS[lang as keyof typeof SHOP_SIGNS]) {
      const letters = [...s.native].filter((ch) => ch.trim() && !/[‌‍]/.test(ch));
      for (const ch of letters) {
        const cp = ch.codePointAt(0)!;
        assert.ok(cp >= lo && cp <= hi, `${lang}: "${s.native}" has ${ch} (U+${cp.toString(16)})`);
      }
    }
  }
});

test("every shipped district has its own render preset", () => {
  for (const d of SEED_DISTRICTS) {
    assert.ok(RENDER_PRESETS[d.id], `no preset for ${d.id}`);
    assert.equal(presetFor(d.id), RENDER_PRESETS[d.id]);
  }
});
