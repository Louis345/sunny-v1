import { readTypedSpelling } from "../engine/imeTypedSpelling";

/**
 * What the spelling chart stores for a typed answer, and the companion's keyboard fact (2026-11-10).
 * A Japanese-input keyboard turns her letters into kana; the chart keeps the letters she typed, and an answer
 * that cannot become plain letters is stored as ambiguous (never scored wrong). Facts only, no tutoring words.
 */
export function typedSpellingForChart(raw: string, acceptedForms: string[] | undefined): { rawResponse: string; unreadable: boolean; keyboardFact?: string } {
  const typed = readTypedSpelling(raw, acceptedForms ?? []);
  if (typed.status === "plain") return { rawResponse: raw, unreadable: false };
  const unreadable = typed.status !== "ime_normalized";
  console.log(` 🎮 [spelling-input] [ime-${unreadable ? "unreadable" : "normalized"}] raw=${JSON.stringify(raw)} read=${JSON.stringify(typed.candidates)}`);
  return {
    rawResponse: unreadable ? raw : typed.value,
    unreadable,
    keyboardFact: `Her keyboard is in Japanese input mode: her typed letters reached Sunny as "${raw}". `
      + (unreadable ? "Sunny could not tell which letters she typed, so this answer is not scored." : `Sunny read it as "${typed.value}" and scored those letters.`),
  };
}
