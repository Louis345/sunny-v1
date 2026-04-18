/**
 * Spoken-number → digit-string normalization for karaoke STT (browser-safe, no npm deps).
 */

const SINGLE_DIGIT_WORD_TO_DIGIT: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

/** zero–nineteen, then tens up to ninety (same coverage as prior lookup table). */
const ENGLISH_NUMBER_UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/**
 * If the string is only lowercase letters and spaces, and every token is a
 * spoken digit (zero–nine), return the concatenated digit string (e.g. "one five zero" → "150").
 */
function tryConcatSpokenDigitWords(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!/^[a-z\s]+$/.test(trimmed)) return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const digits: string[] = [];
  for (const p of parts) {
    const d = SINGLE_DIGIT_WORD_TO_DIGIT[p];
    if (d === undefined) return null;
    digits.push(d);
  }
  return digits.join("");
}

/**
 * Parse common English cardinal phrases ("one hundred and fifty" → 150).
 * Returns null if any token is not a recognized number word (after dropping "and").
 */
function tryParseSpacedEnglishNumber(input: string): number | null {
  const raw = input.trim().toLowerCase();
  if (!/^[a-z\s]+$/.test(raw)) return null;
  const parts = raw.split(/\s+/).filter((p) => p !== "and" && p.length > 0);
  if (parts.length === 0) return null;

  let total = 0;
  let current = 0;

  for (const p of parts) {
    if (p === "hundred") {
      if (current === 0) current = 1;
      current *= 100;
      continue;
    }
    if (p === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
      continue;
    }
    const v = ENGLISH_NUMBER_UNITS[p];
    if (v === undefined) return null;
    current += v;
  }

  return total + current;
}

/** If `word` is a known number token or phrase, returns its digit form; otherwise returns `word`. */
export function normalizeNumberWord(word: string): string {
  const spokenDigits = tryConcatSpokenDigitWords(word);
  if (spokenDigits !== null) return spokenDigits;

  const spaced = tryParseSpacedEnglishNumber(word);
  if (spaced !== null) return String(spaced);

  return word;
}
