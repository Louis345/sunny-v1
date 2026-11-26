// Reina, 2026-11-25: a Boss problem's own words held its answer ("The picture shows 9 circles ... 36 ÷ ? = 4").
// Code knows a problem's wording and its answer, so code measures whether she could read the answer off the screen.
// The Planner decides what to do about it; this only reports.

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** The English words for a whole number up to 100, as children's problems write it ("twenty-four", "a hundred"). */
function numberWords(value: number): string[] {
  if (!Number.isInteger(value) || value < 0 || value > 100) return [];
  if (value === 100) return ["one hundred", "a hundred", "hundred"];
  if (value < 20) return [ONES[value]!];
  const tens = TENS[Math.floor(value / 10)]!, ones = value % 10;
  return ones ? [`${tens}-${ONES[ones]}`, `${tens} ${ONES[ones]}`] : [tens];
}

/** The text in the wording that shows the answer (a number or its word), or null when the answer is not in it. */
export function answerInWording(prompt: string, expected: number): string | null {
  if (!Number.isFinite(expected)) return null;
  const digits = String(expected).replace(".", "\\.");
  const number = new RegExp(`(?<![\\d.,])${digits}(?![\\d]|[.,]\\d)`).exec(prompt);
  if (number) return number[0];
  for (const word of numberWords(expected)) {
    const found = new RegExp(`(?<![a-z-])${word.replace(" ", "[ -]")}(?![a-z-])`, "i").exec(prompt);
    if (found) return found[0];
  }
  return null;
}
