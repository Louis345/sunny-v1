import type { PsychologistStructuredOutput } from "../psychologist/today-plan";

/** Full psychologist plan object used for session injection. */
export type TodaysPlan = PsychologistStructuredOutput;

const FORBIDDEN = [
  "complete activities in order",
  "complete in order",
  "do not proceed until",
  "must finish",
  "finish before moving on",
  "mandatory",
] as const;

/** Must appear in the companion-facing block (normalizeForScan lowercases). */
const REQUIRED = [
  "what elli knows about today",
  "context only — not a checklist",
  "follow the child",
] as const;

function normalizeForScan(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

function truncateAtWord(s: string, maxLen: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim() + "…";
}

/** Short observation text only — no activity titles or methods. */
function observationFromProfile(childProfile: string, maxChars: number): string {
  const t = childProfile.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = "";
  for (let i = 0; i < Math.min(parts.length, 2); i++) {
    const next = out ? `${out} ${parts[i]}` : parts[i];
    if (next.length > maxChars) break;
    out = next;
  }
  if (out) return out.length > maxChars ? truncateAtWord(out, maxChars) : out;
  return truncateAtWord(t, maxChars);
}

function collectFocusWords(plan: TodaysPlan): string[] {
  const set = new Set<string>();
  for (const a of plan.todaysPlan) {
    for (const w of a.words ?? []) {
      const n = w.trim().toLowerCase();
      if (n) set.add(n);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Ensures care plan copy stays discretionary, not rigid checklist language.
 * Throws if forbidden phrases appear or required context-only lines are missing.
 */
export function assertCarePlanSectionLanguage(section: string): void {
  const n = normalizeForScan(section);
  for (const phrase of FORBIDDEN) {
    if (n.includes(phrase)) {
      throw new Error(
        `care plan section must not contain rigid language: "${phrase}"`,
      );
    }
  }
  for (const phrase of REQUIRED) {
    if (!n.includes(phrase)) {
      throw new Error(
        `care plan section missing required context framing: "${phrase}"`,
      );
    }
  }
}

/**
 * Companion-facing slice of the psychologist plan: words + short observation +
 * one-line note. No activity scripts, methods, probes, reward policy, or tool commands.
 */
export function buildCarePlanSection(plan: TodaysPlan): string {
  const words = collectFocusWords(plan);
  const wordsLine =
    words.length > 0
      ? `Words on the map today (names only): ${words.join(", ")}.`
      : "Words on the map today (names only): none listed in the plan file.";

  const observation = observationFromProfile(plan.childProfile, 360).trim();
  const obsBlock = observation
    ? `What we know about them (observation, not instructions):\n${observation}`
    : "What we know about them (observation, not instructions):\n(none in plan file)";

  const sortedActs = [...plan.todaysPlan].sort(
    (a, b) => a.priority - b.priority,
  );
  const topReason = sortedActs[0]?.reason?.trim() ?? "";
  const recLine = topReason
    ? `Psychologist note (one line, for context): ${truncateAtWord(topReason, 220)}`
    : `Psychologist note (one line, for context): ${truncateAtWord(plan.stopAfter.trim(), 220)}`;

  const section = `## What Elli knows about today

Context only — not a checklist. Nothing here assigns your next move; follow the child.

${wordsLine}

${obsBlock}

${recLine}`.trim();

  assertCarePlanSectionLanguage(section);
  return section;
}
