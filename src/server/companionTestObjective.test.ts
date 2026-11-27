import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Owner direction (Ila's session 2026-11-08): Elli should help generously on new words and grow
 * stricter as the school test nears, stated as her goal plus facts, never as a coded schedule.
 * Why the human caught it: Elli helped on day 5 just as on day 1; the owner knew the test was Friday.
 * Why logs did not: nothing failed; Elli's context simply never carried the date (current.json's
 * testDate was read only by unused prompt builders, and buildSessionPrompt discards homework text).
 * Why the lab missed it: no test asked what Elli is told about the test, only about the board.
 */
const item = (id: string, word: string) => ({ domain: "spelling", id, wordId: `w-${word}`, word, constructId: `spelling:${word}`,
  lineage: { measurementRole: "practice" }, response: { mode: "spelling_letters", acceptedForms: [word], caseSensitive: false } });
const observation = (id: string, itemId: string, correct: boolean, status: "assisted" | "unassisted", observedAt: string) => ({
  observationId: id, sourceId: id, itemId, constructLinks: [], result: { correct }, assistance: { status, scaffolds: [] },
  exposure: "unknown", provenance: status === "assisted" ? "practice" : "independent_probe", observedAt, confounds: [] });
const cycle = {
  childId: "ila-lab", homeworkId: "hw-lab", domain: "spelling", lifecycle: "board_ready", createdAt: "2026-11-06T00:00:00.000Z",
  boards: [],
  nodes: [{ nodeId: "radar", title: "Word Radar", role: "baseline", state: "ready", evidenceIds: [],
    evidenceContract: { spellingItems: { "i-night": item("i-night", "night"), "i-light": item("i-light", "light"), "i-climb": item("i-climb", "climb") } } }],
  observations: [
    observation("o1", "i-night", false, "unassisted", "2026-11-06T15:00:00.000Z"),
    observation("o2", "i-night", false, "unassisted", "2026-11-07T15:00:00.000Z"),
    observation("o3", "i-night", true, "assisted", "2026-11-08T15:00:00.000Z"),
    observation("o4", "i-light", true, "unassisted", "2026-11-08T15:05:00.000Z"),
  ],
  decisionHistory: [],
};
const homework = { pending: null, activeByDomain: {}, selectedDomain: "spelling", cyclesDir: "", currentFile: "",
  waterfall: { current: { homeworkId: "hw-lab", testDate: "2026-11-13" }, activeByDomain: {} } };
vi.mock("../profiles/childChart", () => ({ getChildChart: () => ({ learningCycle: cycle, homework }) }));
vi.mock("./companionInteractionMemory", () => ({ maybeCompactCompanionInteractionMemory: vi.fn(), recordCompanionInteractionEvent: vi.fn(),
  readCompanionCareMemoryForPrompt: () => null }));

const assessment = (instrument: "practice" | "recall_check", itemId = "i-night", word = "night") => ({ instrument, nodeId: "radar", homeworkId: "hw-lab",
  itemId, word, artifactHash: "h", audioDelivered: true, supportIds: [], lettersVisible: null, audioPlaybacks: 0 });
async function contextFor(instrument: "practice" | "recall_check") {
  const { buildActivityCompanionContext } = await import("./urgentLearningSupport");
  return buildActivityCompanionContext({ childId: "ila-lab", companionId: "Elli", presence: "summoned",
    snapshot: { childId: "ila-lab", sessionId: "s", nodeId: "radar", itemId: "i-night", game: "word-radar", targetIsSpeakable: true,
      answerVisibility: instrument === "practice" ? "visible" : "hidden", allowedActivities: [], updatedAt: "2026-11-08T15:10:00.000Z",
      spellingTarget: "night", spellingSupportMode: instrument === "practice" ? "pronunciation_model" : "stimulus_only" },
    spellingAssessment: assessment(instrument) as never });
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 10, 8, 16, 0, 0)); });
afterEach(() => { vi.useRealTimers(); });

describe("Elli is told the school-test goal and the facts, not a schedule", () => {
  it("gives the goal, the test date and days left, the word's role and how each word has gone", async () => {
    const practice = await contextFor("practice");
    expect(practice).toContain("Her goal is to spell these words on her own by the school test.");
    expect(practice).toContain("School test: Friday 2026-11-13. Today is 2026-11-08: 5 days left.");
    expect(practice).toContain("At the school test she writes each word from memory with no letters shown.");
    expect(practice).toContain("This word is practice: help counts as part of learning it.");
    expect(practice).toMatch(/night: on her own 0 of 2 right; with help 1 of 1 right; today: right with help/);
    expect(practice).toMatch(/light: on her own 1 of 1 right; today: right on her own/);
    expect(practice).toMatch(/climb: not tried yet/);

    const check = await contextFor("recall_check");
    expect(check).toContain("This word is a check: it measures what she spells on her own.");
    expect(check).toContain("5 days left");
  });

  it("adds no do-not lines and no coded day thresholds", async () => {
    const context = await contextFor("practice");
    const block = context.slice(context.indexOf("[Her spelling goal]"));
    const goal = block.slice(0, block.indexOf("\n\n") === -1 ? undefined : block.indexOf("\n\n"));
    expect(goal).toContain("[Her spelling goal]");
    expect(goal.split("\n").filter(line => /\b(do not|don't|never|must not)\b/i.test(line))).toEqual([]);
    expect(goal).not.toMatch(/\bafter day\b|\bdays? or fewer\b|\bwithin \d+ days\b/i);
  });

  it("says plainly when no test date is recorded", async () => {
    homework.waterfall.current.testDate = null as never;
    try {
      const context = await contextFor("practice");
      expect(context).toContain("Her goal is to spell these words on her own by the school test.");
      expect(context).toContain("School test date: not recorded.");
    } finally { homework.waterfall.current.testDate = "2026-11-13"; }
  });
});
