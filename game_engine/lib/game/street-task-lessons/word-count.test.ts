import { test } from "node:test";
import assert from "node:assert/strict";
import { STREET_TASK_LESSONS } from ".";
import { s } from "./types";
import { wordCount, wordCountMismatches } from "./word-count";

test("wordCount ignores punctuation and counts script words", () => {
  assert.equal(wordCount("Thik ache, trame uthbo"), 4);
  assert.equal(wordCount("ঠিক আছে, ট্রামে উঠব"), 4);
  assert.equal(wordCount("মিটার চালাবেন?"), 2);
  assert.equal(wordCount("তিন শো! ঠিক আছে"), 4);
  assert.equal(wordCount("  ?  "), 0);
});

test("wordCountMismatches flags a line whose roman has a different word count", () => {
  const lessons = {
    "t-1": {
      easy: [
        s("ঠিক আছে, ট্রামে উঠব", "Thik ache, tram e uthbo", "Okay, I'll board the tram", "ধন্যবাদ", "Dhonnobad", "Thank you"),
      ],
      medium: [],
      hard: [
        s("কোথায়?", "Kothay?", "Where to?", "ਚਾਲੀ ਵਿੱਚ ਲੇ ਲੋ", "Chaali vich lelo", "Take it for forty"),
      ],
    },
  };
  assert.deepEqual(wordCountMismatches(lessons), [
    { taskId: "t-1", tier: "easy", step: 1, side: "npc", native: "ঠিক আছে, ট্রামে উঠব", roman: "Thik ache, tram e uthbo" },
    { taskId: "t-1", tier: "hard", step: 1, side: "prompt", native: "ਚਾਲੀ ਵਿੱਚ ਲੇ ਲੋ", roman: "Chaali vich lelo" },
  ]);
});

test("every street lesson line transliterates word for word", () => {
  assert.deepEqual(wordCountMismatches(STREET_TASK_LESSONS), []);
});
