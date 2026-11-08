import type { LearningCycleRecordV2 } from "./learningCycleRepository";

/**
 * The school test as a goal plus facts (owner, 2026-11-08): Elli and the Planner read the date, the
 * days left, the test's conditions and how each word has gone, and decide for themselves how strict
 * to be. No schedule lives in code.
 */
type HomeworkRow = { homeworkId?: string | null; testDate?: string | null } | null | undefined;
export type HomeworkSources = { pending?: HomeworkRow; activeByDomain?: Record<string, HomeworkRow>; waterfall?: { current?: HomeworkRow } };
export type SchoolTestFacts = { testDate: string; weekday: string; today: string; daysLeft: number };

export const SPELLING_TEST_GOAL = "Her goal is to spell these words on her own by the school test.";
export const SPELLING_TEST_CONDITIONS = "At the school test she writes each word from memory with no letters shown.";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const utcDay = (date: string) => { const [y, m, d] = date.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const localDate = (now: Date) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** This homework's school test date, from her homework file (homework/current.json first), with today and days left. */
export function schoolTestFacts(homework: HomeworkSources | undefined, homeworkId: string, now = new Date()): SchoolTestFacts | null {
  const rows = [homework?.waterfall?.current, ...Object.values(homework?.activeByDomain ?? {}), homework?.pending];
  const testDate = rows.find(row => row?.homeworkId === homeworkId && ISO_DATE.test(row.testDate ?? ""))?.testDate;
  if (!testDate) return null;
  const today = localDate(now);
  return { testDate, today, daysLeft: Math.round((utcDay(testDate) - utcDay(today)) / 86_400_000),
    weekday: new Date(utcDay(testDate)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) };
}

/** One line for the Planner: the date and days left, or that none is recorded. */
export function schoolTestLine(facts: SchoolTestFacts | null): string {
  if (!facts) return "School test date: not recorded.";
  const when = facts.daysLeft > 0 ? `${facts.daysLeft} day${facts.daysLeft === 1 ? "" : "s"} from today` : facts.daysLeft === 0 ? "today" : `${-facts.daysLeft} day${facts.daysLeft === -1 ? "" : "s"} ago`;
  return `School test: ${facts.weekday} ${facts.testDate}, ${when}.`;
}

/** How each word on the list has gone for her, on her own and with help, from the cycle's recorded answers. */
export function spellingWordHistoryLines(cycle: LearningCycleRecordV2, today: string): string[] {
  const wordByItem = new Map<string, string>();
  for (const node of cycle.nodes) for (const item of Object.values(node.evidenceContract?.spellingItems ?? {})) wordByItem.set(item.id, item.word);
  const words = [...new Set(wordByItem.values())];
  return words.map(word => {
    const rows = (cycle.observations ?? []).filter(row => wordByItem.get(row.itemId) === word && typeof row.result?.correct === "boolean");
    if (!rows.length) return `- ${word}: not tried yet`;
    const own = rows.filter(row => row.assistance.status === "unassisted"), helped = rows.filter(row => row.assistance.status !== "unassisted");
    const right = (list: typeof rows) => list.filter(row => row.result.correct).length;
    const parts = [...(own.length ? [`on her own ${right(own)} of ${own.length} right`] : []), ...(helped.length ? [`with help ${right(helped)} of ${helped.length} right`] : [])];
    const todays = rows.filter(row => localDate(new Date(row.observedAt)) === today)
      .map(row => `${row.result.correct ? "right" : "missed"} ${row.assistance.status === "unassisted" ? "on her own" : "with help"}`);
    return `- ${word}: ${parts.join("; ")}${todays.length ? `; today: ${todays.join(", ")}` : ""}`;
  });
}

/** Elli's goal and facts for this list: the test, this word's role and how each word has gone. */
export function companionSpellingTestObjective(input: { cycle: LearningCycleRecordV2; homework?: HomeworkSources; instrument?: string; now?: Date }): string {
  const now = input.now ?? new Date();
  const facts = schoolTestFacts(input.homework, input.cycle.homeworkId, now);
  const when = !facts ? "School test date: not recorded."
    : `School test: ${facts.weekday} ${facts.testDate}. Today is ${facts.today}: ${facts.daysLeft > 0 ? `${facts.daysLeft} day${facts.daysLeft === 1 ? "" : "s"} left` : facts.daysLeft === 0 ? "the test is today" : "the test date has passed"}.`;
  const role = input.instrument === undefined ? [] : [input.instrument === "practice"
    ? "This word is practice: help counts as part of learning it."
    : "This word is a check: it measures what she spells on her own."];
  return ["[Her spelling goal]", SPELLING_TEST_GOAL, when, SPELLING_TEST_CONDITIONS, ...role,
    "How each word has gone for her:", ...spellingWordHistoryLines(input.cycle, localDate(now))].join("\n");
}

export const MATH_TEST_GOAL = "Her goal is to solve problems like these on her own by the school test.";

/** Matilda's (or any math companion's) goal and facts for this assignment: the test and how her problems have gone. */
export function companionMathTestObjective(input: { cycle: LearningCycleRecordV2; homework?: HomeworkSources; now?: Date }): string {
  const now = input.now ?? new Date();
  const facts = schoolTestFacts(input.homework, input.cycle.homeworkId, now);
  const when = !facts ? "School test date: not recorded."
    : `School test: ${facts.weekday} ${facts.testDate}. Today is ${facts.today}: ${facts.daysLeft > 0 ? `${facts.daysLeft} day${facts.daysLeft === 1 ? "" : "s"} left` : facts.daysLeft === 0 ? "the test is today" : "the test date has passed"}.`;
  const rows = (input.cycle.observations ?? []).filter(row => typeof row.result?.correct === "boolean");
  const own = rows.filter(row => row.assistance.status === "unassisted"), helped = rows.filter(row => row.assistance.status !== "unassisted");
  const right = (list: typeof rows) => list.filter(row => row.result.correct).length;
  const so = rows.length
    ? `Her problems so far: on her own ${right(own)} of ${own.length} right; with help ${right(helped)} of ${helped.length} right.`
    : "Her problems so far: none answered yet.";
  return ["[Her math goal]", MATH_TEST_GOAL, when, so].join("\n");
}
