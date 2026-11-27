import { describe, expect, it } from "vitest";
import { companionSpellingTestObjective } from "./schoolTestObjective";

// BUGS.md 2026-11-04 "Elli misreads the session's results": after a check Elli praised two words as
// "brand new" when one had been missed on the previous check and is a target word. Human-caught: the owner
// heard the praise and knew the word's history. Logs did not catch it: the companion context is not logged
// per word. The lab missed it: every companion-context test built a single cycle, so a word whose history
// lives in an earlier list (the chart's per-word history) was never tried. Her per-word facts must come
// from the chart's history for that word, not only from this list's saved answers.
describe("Elli's per-word facts come from the chart's history for each word", () => {
  const obs = (id: string, itemId: string, word: string, correct: boolean, observedAt: string, status = "unassisted") => ({
    observationId: id, itemId, result: { correct }, assistance: { status, scaffolds: [] }, observedAt,
    constructLinks: [{ constructId: `spelling.word.${word}`, role: "primary", confidence: 1 }],
  });
  const item = (word: string) => ({ id: `hw-2:${word}`, word, wordId: `spelling.word.${word}`, constructId: `spelling.word.${word}` });
  const cycle = {
    homeworkId: "hw-2", domain: "spelling",
    nodes: [{ nodeId: "check", evidenceContract: { spellingItems: { "hw-2:pardon": item("pardon"), "hw-2:garden": item("garden") } } }],
    observations: [obs("o2", "hw-2:garden", "garden", true, "2026-11-04T20:00:00Z")],
  } as never;
  const earlierMiss = obs("o1", "hw-1:pardon", "pardon", false, "2026-11-03T20:00:00Z");
  const history = {
    childId: "ila", recentDecisions: [], pendingInterpretation: [],
    constructs: {
      "spelling.word.pardon": { constructId: "spelling.word.pardon", predictions: [], evaluations: [], decisions: [], observations: [earlierMiss] },
      "spelling.word.garden": { constructId: "spelling.word.garden", predictions: [], evaluations: [], decisions: [], observations: [cycle["observations" as never][0]] },
    },
  } as never;

  it("a word she missed on an earlier check does not read as not tried", () => {
    const text = companionSpellingTestObjective({ cycle, history, now: new Date(2026, 10, 4, 16) });
    const pardon = text.split("\n").find(line => line.startsWith("- pardon"));
    expect(pardon).toBeDefined();
    expect(pardon).not.toContain("not tried yet");
    expect(pardon).toContain("on her own 0 of 1 right");
    expect(pardon).toContain("last try: missed on her own on 2026-11-03");
  });

  it("counts each saved answer once when it is both in this list and in the chart's history", () => {
    const text = companionSpellingTestObjective({ cycle, history, now: new Date(2026, 10, 4, 16) });
    expect(text.split("\n").find(line => line.startsWith("- garden"))).toContain("on her own 1 of 1 right");
    expect(text.split("\n").filter(line => /\b(do not|don't|never|must not)\b/i.test(line))).toEqual([]);
  });

  it("a word with no saved answer anywhere is still not tried yet", () => {
    const text = companionSpellingTestObjective({ cycle, history: { ...(history as object), constructs: {} } as never, now: new Date(2026, 10, 4, 16) });
    expect(text.split("\n").find(line => line.startsWith("- pardon"))).toBe("- pardon: not tried yet");
  });
});
