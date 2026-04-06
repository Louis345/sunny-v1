import { describe, it, expect } from "vitest";
import { determineScaffoldLevel } from "../algorithms/retrievalPractice";
import { getScaffoldBlock } from "../server/session-context";

describe("retrieval practice scaffold", () => {
  it("escalates scaffold after failed attempt", () => {
    const r = determineScaffoldLevel({
      track: null as never,
      isNewWord: false,
      previousAttemptThisSession: { correct: false, scaffoldLevel: 1 },
    });
    expect(r.scaffoldLevel).toBe(2);
  });

  it("resets scaffold on correct cold recall", () => {
    const r = determineScaffoldLevel({
      track: null as never,
      isNewWord: false,
    });
    expect(r.scaffoldLevel).toBe(0);

    const map = new Map([
      [
        "testword",
        {
          word: "testword",
          domain: "spelling" as const,
          lastCorrect: true,
          lastScaffoldLevel: 2 as const,
          attemptCount: 2,
        },
      ],
    ]);
    const block = getScaffoldBlock("testword", map);
    expect(block).toBe("");
  });
});
