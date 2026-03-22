/**
 * Word-builder style evaluation and helpers for spelling homework word lists.
 */

export interface GuessResult {
  letter: string;
  status: "correct" | "present" | "absent";
}

function countLetters(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const ch of s) {
    m.set(ch, (m.get(ch) ?? 0) + 1);
  }
  return m;
}

/**
 * Classic 5-letter-style rules: greens first (consume answer inventory), then yellows with remaining counts.
 * Result length matches `guess`. Case-insensitive; letters in output are lowercase.
 */
export function evaluateGuess(guess: string, answer: string): GuessResult[] {
  const g = guess.toLowerCase();
  const a = answer.toLowerCase();
  const n = g.length;
  const remaining = countLetters(a);

  const out: GuessResult[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ letter: g[i]!, status: "absent" });
  }

  for (let i = 0; i < n; i++) {
    if (i < a.length && g[i] === a[i]) {
      out[i]!.status = "correct";
      const ch = g[i]!;
      const left = (remaining.get(ch) ?? 0) - 1;
      remaining.set(ch, left);
    }
  }

  for (let i = 0; i < n; i++) {
    if (out[i]!.status === "correct") continue;
    const ch = g[i]!;
    const left = remaining.get(ch) ?? 0;
    if (left > 0) {
      out[i]!.status = "present";
      remaining.set(ch, left - 1);
    }
  }

  return out;
}

const WORD_RE = /[a-zA-Z]{4,}/g;

/**
 * Pull alphabetic tokens of length ≥ 4 from free-form homework text.
 */
export function buildWordBuilderWordList(homeworkContent: string): string[] {
  if (!homeworkContent.trim()) {
    return [];
  }
  const seen = new Set<string>();
  const words: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(WORD_RE.source, "g");
  while ((m = re.exec(homeworkContent)) !== null) {
    const raw = m[0];
    const lower = raw.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      words.push(lower);
    }
  }
  return words;
}

function statusPhrase(status: GuessResult["status"]): string {
  switch (status) {
    case "correct":
      return "correct (right letter, right spot)";
    case "present":
      return "present (in the word, wrong spot)";
    case "absent":
      return "absent (not in the word)";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Human-readable line for Claude describing one guess row.
 */
export function formatGuessForClaude(guess: string, result: GuessResult[]): string {
  const upper = guess.toUpperCase();
  const parts = result.map((cell) => {
    const L = cell.letter.toUpperCase();
    return `${L} ${statusPhrase(cell.status)}`;
  });
  return `Guessed ${upper} — ${parts.join(", ")}`;
}

const A_TO_Z = /^[a-z]+$/;

/**
 * Guess must be exactly `wordLength` Latin letters a–z.
 */
export function validateWordBuilderGuess(guess: string, wordLength: number): boolean {
  if (guess.length === 0 || guess.length !== wordLength) {
    return false;
  }
  return A_TO_Z.test(guess);
}
