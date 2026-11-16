/**
 * Synthetic shelves and presentation configs for the subject-picker mockups. No real child records: titles, dates and
 * scores are invented. The configs stand in for what each child's profile would hold; the shelves stand in for what
 * the chart would compute (latest unfinished assignment per subject).
 */
import type { PickerPresentation, ShelfSubject } from "./subjectShelf";

/** The kiosk date the stories pretend it is (a Monday). */
export const MOCK_TODAY = "2026-11-16";

/** Profile-driven look for a dyslexic child who likes calm: pictures only, big books, a soft glow, sleeps as moons. */
export const CALM_PICTURES_CONFIG: PickerPresentation = {
  layout: "shelf",
  text: "none",
  motion: "calm",
  bookSize: "large",
  dueCue: ["glow", "sleeps"],
  singleSubject: "skip",
  palette: { sky: "linear-gradient(180deg, #a9d0ee 0%, #e9eef6 70%, #f4e6cc 100%)", shelf: "#b98a5e", ink: "#33404d", accent: "#ffd166" },
  companion: { name: "Elli", emoji: "🧚" },
};

/** Profile-driven look for a child moved by competition and personal bests: match countdown and her best to beat. */
export const CHALLENGE_CONFIG: PickerPresentation = {
  layout: "shelf",
  text: "short",
  motion: "lively",
  bookSize: "medium",
  dueCue: ["countdown", "beatBest"],
  singleSubject: "skip",
  palette: { sky: "linear-gradient(180deg, #23263f 0%, #3b3f6b 60%, #6b4a7a 100%)", shelf: "#555a7a", ink: "#f4f1fa", accent: "#ff7a45" },
  companion: { name: "Matilda", emoji: "🦸‍♀️" },
};

/** The owner's simpler alternative: same data, a plain list. */
export const PLAIN_LIST_CONFIG: PickerPresentation = {
  ...CALM_PICTURES_CONFIG,
  layout: "list",
  text: "full",
  palette: { ...CALM_PICTURES_CONFIG.palette, sky: "#f3f5f8" },
};

export const ILA_SHELF: ShelfSubject[] = [
  { domain: "math", title: "Multiplication packet (pages 4–7)", goal: "worksheet", due: null },
  { domain: "spelling", title: "Unit 9 spelling test", goal: "test", due: "2026-11-19", suggested: true, best: { correct: 6, total: 10 } },
];

export const REINA_SHELF: ShelfSubject[] = [
  { domain: "spelling", title: "Week 11 spelling list", goal: "worksheet", due: null },
  { domain: "math", title: "Division facts test", goal: "test", due: "2026-11-20", suggested: true, best: { correct: 14, total: 20 } },
];

export const ONE_SUBJECT_SHELF: ShelfSubject[] = [ILA_SHELF[1]];

export const NOTHING_DUE_SHELF: ShelfSubject[] = [
  { domain: "math", title: "Multiplication packet (pages 4–7)", goal: "worksheet", due: null },
  { domain: "spelling", title: "Week 11 spelling list", goal: "worksheet", due: null },
];

export const THREE_SUBJECT_SHELF: ShelfSubject[] = [
  ...REINA_SHELF,
  { domain: "reading", title: "Chapter book log", goal: "worksheet", due: "2026-11-24" },
];
