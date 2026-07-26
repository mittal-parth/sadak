/**
 * Word-level scoring for the language lesson: how close was what the player
 * said to the line they were shown?
 *
 * STT hands back native-script text, the prompt is authored native + roman
 * side by side (word-aligned), so we diff against the native line and paint
 * the verdict onto the same index of the roman line the player actually reads.
 */

export type WordVerdict = "green" | "yellow" | "red";

function normalize(word: string): string {
  return word.replace(/[.,!?।؟""'']/g, "").trim().toLowerCase();
}

function tokenize(line: string): string[] {
  return line.split(/\s+/).map(normalize).filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export type ScoreResult = {
  verdicts: WordVerdict[];
  accuracy: number; // 0..1
  points: number; // 0..100, rounded
};

/**
 * Greedy alignment: each expected word claims the best remaining transcript
 * word. Order drifts a little in speech, so we don't require exact position,
 * only that the word shows up somewhere in what was said.
 */
export function scoreAttempt(expectedNative: string, transcript: string): ScoreResult {
  const expected = tokenize(expectedNative);
  const said = tokenize(transcript);
  const used = new Array(said.length).fill(false);

  const verdicts: WordVerdict[] = expected.map((word) => {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < said.length; i++) {
      if (used[i]) continue;
      const s = similarity(word, said[i]);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (best !== -1 && bestScore >= 0.4) used[best] = true;
    if (bestScore >= 0.72) return "green";
    if (bestScore >= 0.4) return "yellow";
    return "red";
  });

  const total = verdicts.length || 1;
  const weight = verdicts.reduce((s, v) => s + (v === "green" ? 1 : v === "yellow" ? 0.5 : 0), 0);
  const accuracy = weight / total;

  return { verdicts, accuracy, points: Math.round(accuracy * 100) };
}
