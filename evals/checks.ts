/**
 * Deterministic checks the rubric marks [CODE]: no model, fast, free, never argues.
 */
export type ChildId = "Ila" | "Reina";

export type CodeCheckInput = {
  child: ChildId;
  reply: string;
  childLine: string;
  /** Earlier lines spoken by the companion/narrator in the same activity. */
  priorSpoken: string[];
};

export type CodeCheckResult = {
  words: number;
  wordLimit: number;
  short: 0 | 1;
  exactRepeats: string[];
  nearRepeat: number;
  never_repeats: 0 | 1;
  wrongNames: string[];
  says_name_right: 0 | 1;
  listOrMarkdown: boolean;
  planningNotes: boolean;
  promisePhrases: string[];
};

/** Parent-approved TTS spellings stay allowed; these are the misspellings we have seen or expect. */
const WRONG_NAME_VARIANTS: Record<ChildId, RegExp> = {
  Ila: /\b(Isla|Ilah|Eila|Eela|Ella|Illa)\b/gi,
  Reina: /\b(Rayna|Reyna|Raina|Rena|Rayne)\b/gi,
};

const PROMISE_PATTERNS = [
  /\bI(?:'| wi)ll flag\b/i,
  /\bI promise\b/i,
  /\bpromise\b[.!]?\s*$/i,
  /\balready (?:told|know about)\b/i,
  /\b(?:told|tell) your (?:mom|dad|parents?)\b/i,
  /\btomorrow\b.*\bI(?:'m| am| will|'ll)\b/i,
  /\bnothing (?:you do )?(?:gets|is) lost\b/i,
];

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => normalize(s))
    .filter((s) => s.split(" ").length >= 3);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Word-bigram overlap (Dice), 0..1. Matches the spirit of the server's repeat= score. */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const w = normalize(s).split(" ").filter(Boolean);
    const out = new Map<string, number>();
    for (let i = 0; i < w.length - 1; i++) out.set(`${w[i]} ${w[i + 1]}`, (out.get(`${w[i]} ${w[i + 1]}`) ?? 0) + 1);
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  let total = 0;
  for (const [, n] of ga) total += n;
  for (const [, n] of gb) total += n;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}

export function runCodeChecks(input: CodeCheckInput): CodeCheckResult {
  const words = countWords(input.reply);
  const wordLimit = /\bwhy\b/i.test(input.childLine) ? 40 : 25;

  const priorSentences = new Set(input.priorSpoken.flatMap(splitSentences));
  const replySentences = splitSentences(input.reply);
  const seen = new Set<string>();
  const exactRepeats: string[] = [];
  for (const s of replySentences) {
    if (priorSentences.has(s) || seen.has(s)) exactRepeats.push(s);
    seen.add(s);
  }
  const nearRepeat = Math.max(0, ...input.priorSpoken.slice(-3).map((p) => similarity(p, input.reply)));

  const wrongNames = [...input.reply.matchAll(WRONG_NAME_VARIANTS[input.child])].map((m) => m[0]);
  const listOrMarkdown = /(^|\s)[-*•]\s+\S|\*\*|^#+\s|\n\s*\d+\.\s/m.test(input.reply);
  const planningNotes =
    /\b(she's|she is|the child)\b.*\b(unsure|confused|stuck)\b/i.test(input.reply) ||
    /\blet's help\b|\bhidden answer\b|\bwithout revealing\b/i.test(input.reply);
  const promisePhrases = PROMISE_PATTERNS.map((p) => input.reply.match(p)?.[0]).filter((m): m is string => Boolean(m));

  return {
    words,
    wordLimit,
    short: words <= wordLimit ? 1 : 0,
    exactRepeats,
    nearRepeat: Math.round(nearRepeat * 100) / 100,
    never_repeats: exactRepeats.length === 0 && nearRepeat < 0.8 ? 1 : 0,
    wrongNames,
    says_name_right: wrongNames.length === 0 ? 1 : 0,
    listOrMarkdown,
    planningNotes,
    promisePhrases,
  };
}

/**
 * README rule 4: golden cases must never be few-shot examples in a prompt. Returns every case phrase
 * (8+ words, normalized) found in the given prompt texts.
 */
export function findCaseTextInPrompts(caseTexts: string[], promptFiles: { path: string; text: string }[]): { path: string; phrase: string }[] {
  const hits: { path: string; phrase: string }[] = [];
  const normalizedFiles = promptFiles.map((f) => ({ path: f.path, text: normalize(f.text) }));
  for (const raw of caseTexts) {
    const words = normalize(raw).split(" ").filter(Boolean);
    for (let i = 0; i + 8 <= words.length; i++) {
      const phrase = words.slice(i, i + 8).join(" ");
      for (const f of normalizedFiles) if (f.text.includes(phrase)) hits.push({ path: f.path, phrase });
    }
  }
  return dedupe(hits);
}

function dedupe(hits: { path: string; phrase: string }[]) {
  const seen = new Set<string>();
  return hits.filter((h) => (seen.has(`${h.path}|${h.phrase}`) ? false : (seen.add(`${h.path}|${h.phrase}`), true)));
}
