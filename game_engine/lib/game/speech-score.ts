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

function verdictFor(score: number): WordVerdict {
  if (score >= 0.72) return "green";
  if (score >= 0.4) return "yellow";
  return "red";
}

/**
 * Order-preserving alignment (a weighted longest-common-subsequence over
 * per-word similarity, not free bag-of-words matching): each expected word
 * may only match a transcript word that comes *after* the one the previous
 * expected word matched. Free matching used to score "one idli two vada"
 * identical to "two idli one vada" — every word was present, so it didn't
 * matter that the quantities were swapped onto the wrong noun. Requiring
 * matches to stay in order means a swap breaks the alignment and gets
 * penalised, while still tolerating minor insertions/deletions/mis-hearings
 * the way the old greedy version did.
 */
export function scoreAttempt(expectedNative: string, transcript: string): ScoreResult {
  const expected = tokenize(expectedNative);
  const said = tokenize(transcript);
  const n = expected.length;
  const m = said.length;

  // dp[i][j]: best total similarity aligning expected[0..i) to said[0..j).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const matched = dp[i - 1][j - 1] + similarity(expected[i - 1], said[j - 1]);
      dp[i][j] = Math.max(matched, dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Trace back to recover which expected word (if any) matched which said
  // word, preferring a match over a skip whenever both reach the same total,
  // so "how many words paired up" wins ties over "how few steps".
  const verdicts: WordVerdict[] = new Array(n).fill("red");
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const matched = dp[i - 1][j - 1] + similarity(expected[i - 1], said[j - 1]);
    if (dp[i][j] === matched) {
      verdicts[i - 1] = verdictFor(similarity(expected[i - 1], said[j - 1]));
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j]) {
      i--;
    } else {
      j--;
    }
  }

  const total = verdicts.length || 1;
  const weight = verdicts.reduce((s, v) => s + (v === "green" ? 1 : v === "yellow" ? 0.5 : 0), 0);
  const accuracy = weight / total;

  return { verdicts, accuracy, points: Math.round(accuracy * 100) };
}
