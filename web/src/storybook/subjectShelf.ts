/** The subject picker's data and rules, shared by every child (storybook mockup; see SubjectPicker.tsx). */
import type { SunnyHomeworkDomain } from "../../../src/shared/runtimeConfig";

export type ShelfSubject = {
  domain: SunnyHomeworkDomain;
  /** The assignment as the school names it (grown-up label; only shown when the config allows text). */
  title: string;
  goal: "test" | "worksheet";
  /** ISO date (YYYY-MM-DD) of the test or hand-in, or null when nothing is dated. */
  due: string | null;
  /** The Planner's pick for today, if it has one. */
  suggested?: boolean;
  /** Her best checked score on this assignment so far, from the chart (correct out of total). */
  best?: { correct: number; total: number } | null;
};

/** How the shelf is drawn for one child. Every field is profile data; the component only reads it. */
export type PickerPresentation = {
  layout: "shelf" | "list";
  /** none = pictures only; short = one or two words; full = school titles too. */
  text: "none" | "short" | "full";
  motion: "calm" | "lively";
  bookSize: "large" | "medium";
  /** How a dated book calls her: a soft glow, sleeps-until counted as moons, or a match countdown with her best. */
  dueCue: Array<"glow" | "sleeps" | "countdown" | "beatBest">;
  /** With only one subject, open it straight away instead of asking her to choose. */
  singleSubject: "skip" | "show";
  palette: { sky: string; shelf: string; ink: string; accent: string };
  companion: { name: string; emoji: string };
};

/** One registry of what each subject looks like, shared by every child. A new domain is one row here. */
export const DOMAIN_LOOK: Record<SunnyHomeworkDomain, { emoji: string; word: string; cover: string; spine: string }> = {
  spelling: { emoji: "🔤", word: "Spelling", cover: "#f6b26b", spine: "#d9822b" },
  math: { emoji: "➗", word: "Math", cover: "#7ec8e3", spine: "#3a8fb7" },
  reading: { emoji: "📖", word: "Reading", cover: "#b6d7a8", spine: "#6aa84f" },
  science: { emoji: "🔬", word: "Science", cover: "#c9a0dc", spine: "#8e63a8" },
};

/** Whole days from `today` to `due`; null when there is no date. */
export function daysUntil(due: string | null, today: string): number | null {
  if (!due) return null;
  const ms = Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Shelf order: the suggested book first, then the soonest dated one, then undated. Same rule for every child. */
export function arrangeShelf(subjects: ShelfSubject[], today: string): ShelfSubject[] {
  const rank = (s: ShelfSubject) => (s.suggested ? -1_000 : 0) + (daysUntil(s.due, today) ?? 10_000);
  return [...subjects].sort((a, b) => rank(a) - rank(b));
}

/** What the picker does with this shelf: nothing to pick, open the only book, or ask her to choose. */
export function pickerMode(subjects: ShelfSubject[], config: PickerPresentation): "empty" | "auto-open" | "choose" {
  if (subjects.length === 0) return "empty";
  if (subjects.length === 1 && config.singleSubject === "skip") return "auto-open";
  return "choose";
}
