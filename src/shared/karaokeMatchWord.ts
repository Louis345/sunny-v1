import { normalizeNumberWord } from "./numberWords";
import { dictionary as cmuDictionary } from "cmu-pronouncing-dictionary";

export type KaraokeWordClass = "match" | "partial" | "mismatch";
export type KaraokeMatchMode = "speech" | "spelling" | "pronunciation";

export interface KaraokeMatchOptions {
  /** Speech tolerates STT orthography; spelling measures the actual written target. */
  mode?: KaraokeMatchMode;
}

/** Dyslexia-friendly confusions — paired letters fold to one canonical form. */
export const CONFUSION_PAIRS: [string, string][] = [
  ["m", "n"],
  ["b", "d"],
  ["p", "q"],
  ["f", "v"],
  ["s", "z"],
  ["w", "v"],
];

/** Normalize confusable letters to canonical form (m→n, b→d, …). */
export function applyConfusionPairs(word: string): string {
  return word
    .replace(/m/g, "n")
    .replace(/b/g, "d")
    .replace(/p/g, "q")
    .replace(/f/g, "v")
    .replace(/s/g, "z")
    .replace(/w/g, "v");
}

const STT_HOMOPHONE_GROUPS = [
  ["wear", "where"],
  ["hole", "whole"],
  ["pair", "pear", "pare", "payer"],
  ["be", "bee"],
  ["by", "buy", "bye"],
  ["for", "fore", "four"],
  ["one", "won"],
  ["no", "know"],
  ["there", "their", "theyre"],
  ["to", "too", "two"],
] as const;

const STT_HOMOPHONE_CANONICAL = new Map<string, string>(
  STT_HOMOPHONE_GROUPS.flatMap((group) =>
    group.map((word) => [word, group[0]] as const),
  ),
);

const STORY_NAME_STT_ALIASES = new Map<string, Set<string>>([
  ["ila", new Set(["isla", "iila"])],
  ["reina", new Set(["rayna", "raina", "rina"])],
]);

const PRONUNCIATION_STT_ALIASES = new Map<string, Set<string>>([
  ["able", new Set(["abel", "abull", "bull"])],
]);

const cmuPronunciationCache = new Map<string, string[]>();

function normalizeSttHomophone(word: string): string {
  return STT_HOMOPHONE_CANONICAL.get(word) ?? word;
}

function storyNameSttEquivalent(heard: string, expected: string): boolean {
  return STORY_NAME_STT_ALIASES.get(expected)?.has(heard) === true;
}

function pronunciationSttEquivalent(heard: string, expected: string): boolean {
  return PRONUNCIATION_STT_ALIASES.get(expected)?.has(heard) === true;
}

function normalizeCmuPronunciation(value: string): string {
  return value
    .replace(/\s+#.*$/, "")
    .replace(/\d/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cmuPronunciations(word: string): string[] {
  const lookup = word.toLowerCase().replace(/[^a-z']/g, "");
  if (!lookup) return [];
  const cached = cmuPronunciationCache.get(lookup);
  if (cached) return cached;

  const pronunciations: string[] = [];
  const add = (key: string) => {
    const value = (cmuDictionary as Record<string, string>)[key];
    if (!value) return;
    const normalized = normalizeCmuPronunciation(value);
    if (normalized && !pronunciations.includes(normalized)) {
      pronunciations.push(normalized);
    }
  };

  add(lookup);
  for (let variant = 2; variant <= 8; variant += 1) {
    add(`${lookup}(${variant})`);
  }

  cmuPronunciationCache.set(lookup, pronunciations);
  return pronunciations;
}

function cmuPronunciationEquivalent(heard: string, expected: string): boolean {
  if (!/^[a-z']+$/.test(heard) || !/^[a-z']+$/.test(expected)) return false;
  const heardPronunciations = cmuPronunciations(heard);
  if (heardPronunciations.length === 0) return false;
  const expectedPronunciations = new Set(cmuPronunciations(expected));
  return heardPronunciations.some((pronunciation) =>
    expectedPronunciations.has(pronunciation),
  );
}

function hasAmbiguousSpeechSpelling(word: string): boolean {
  return (
    STT_HOMOPHONE_CANONICAL.has(word) ||
    /(?:air|are|ear|eir|ere|ee|ea|ei|ie|ey|igh|ai|ay|oa|oe|ow|oo|ou|ew|ue|augh|ough|ph|gh|ck|kn|gn|pn|wr|wh|ble$|bull$|bul$|mb$|bt$|lk$|lm$|tion|sion)/.test(
      word,
    )
  );
}

function speechPhoneticKey(word: string): string {
  const closedClass = normalizeSttHomophone(word);
  if (closedClass !== word) return closedClass;

  return word
    .replace(/^kn|^gn|^pn/, "n")
    .replace(/^wr/, "r")
    .replace(/^wh(?=o)/, "h")
    .replace(/^wh/, "w")
    .replace(/qu/g, "kw")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/mb$/g, "m")
    .replace(/gh(?=$|t)/g, "")
    .replace(/(?:air|are|ear|eir|ere)/g, "er")
    .replace(/(?:eigh|ai|ay)/g, "a")
    .replace(/(?:ee|ea|ei|ie|ey)/g, "i")
    .replace(/(?:oa|oe|ow)/g, "o")
    .replace(/(?:oo|ou|ew|ue)/g, "u")
    .replace(/(?:bull|bul)$/g, "bl")
    .replace(/igh/g, "i")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/g(?=[eiy])/g, "j")
    .replace(/x/g, "ks")
    .replace(/e$/, "")
    .replace(/([^aeiou])\1+/g, "$1");
}

function speechPhoneticEquivalent(heard: string, expected: string): boolean {
  if (!/^[a-z]+$/.test(heard) || !/^[a-z]+$/.test(expected)) return false;
  if (normalizeSttHomophone(heard) === normalizeSttHomophone(expected)) {
    return true;
  }
  if (Math.min(heard.length, expected.length) < 3) {
    return false;
  }
  if (
    !hasAmbiguousSpeechSpelling(heard) &&
    !hasAmbiguousSpeechSpelling(expected)
  ) {
    return false;
  }
  const heardKey = speechPhoneticKey(heard);
  const expectedKey = speechPhoneticKey(expected);
  return heardKey.length >= 2 && heardKey === expectedKey;
}

function levenshtein1OrLess(a: string, b: string): boolean {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return false;
  if (m === 0 || n === 0) return m + n <= 1;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        cur[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    if (Math.min(...cur) > 1) return false;
    prev = cur;
  }
  return prev[n] <= 1;
}

/**
 * Tri-state karaoke match for STT streaming:
 * - match: advance karaoke index
 * - partial: expected still being spoken (prefix), do not penalize
 * - mismatch: genuine wrong token; hesitation may apply on phrase restart
 */
export function classifyKaraokeWordMatch(
  heard: string,
  expected: string,
  options: KaraokeMatchOptions = {},
): KaraokeWordClass {
  const mode = options.mode ?? "speech";

  // Step 1: clean
  const cleanH = heard.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanE = expected.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (mode === "pronunciation") {
    if (!cleanH || !cleanE) return "mismatch";
    if (normalizeNumberWord(cleanH) === normalizeNumberWord(cleanE)) return "match";
    if (normalizeSttHomophone(cleanH) === normalizeSttHomophone(cleanE)) return "match";
    if (pronunciationSttEquivalent(cleanH, cleanE)) return "match";
    if (cmuPronunciationEquivalent(cleanH, cleanE)) return "match";
    return "mismatch";
  }

  if (mode === "speech" && speechPhoneticEquivalent(cleanH, cleanE)) {
    return "match";
  }

  // Step 2: normalize numbers (word → digit)
  const normH = normalizeNumberWord(cleanH);
  const normE = normalizeNumberWord(cleanE);

  // Step 3: exact match after normalization
  if (normH === normE) return "match";

  // Step 4: speech equivalence — STT cannot reliably choose the intended spelling.
  if (
    mode === "speech" &&
    (storyNameSttEquivalent(normH, normE) ||
      speechPhoneticEquivalent(normH, normE))
  ) {
    return "match";
  }

  // Step 5: confusion pairs (dyslexia — only for pure alpha speech practice)
  if (
    mode === "speech" &&
    /^[a-z]+$/.test(normH) &&
    /^[a-z]+$/.test(normE)
  ) {
    if (applyConfusionPairs(normH) === applyConfusionPairs(normE)) {
      return "match";
    }
  }

  // Streaming prefix: letter-only tokens still forming the expected word (e.g. tw → twelve).
  // Runs before short-token cutoff so partial is not blocked when normE is a short digit string.
  if (
    /^[a-z]+$/.test(cleanH) &&
    /^[a-z]+$/.test(cleanE) &&
    cleanH !== cleanE &&
    cleanE.length > 4 &&
    cleanE.startsWith(cleanH) &&
    cleanH.length >= 2
  ) {
    return "partial";
  }

  // Step 6: short expected token — no fuzzy/prefix beyond steps above
  if (normE.length <= 4) return "mismatch";

  // Step 7: at most one edit for longer tokens (STT / pronunciation slack)
  if (mode === "speech" && levenshtein1OrLess(normH, normE)) return "match";

  return "mismatch";
}

/**
 * Karaoke word match: strict for short expected tokens (avoids "Matt" → mat),
 * at most one Levenshtein edit for longer words (STT / kid pronunciation slack).
 */
export function matchKaraokeWord(
  heard: string,
  expected: string,
  options?: KaraokeMatchOptions,
): boolean {
  return classifyKaraokeWordMatch(heard, expected, options) === "match";
}
