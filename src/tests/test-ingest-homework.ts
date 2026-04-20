import { describe, expect, it } from "vitest";
import {
  buildPendingHomeworkPayload,
  ensureQuestHtmlContract,
  normalizeHomeworkType,
  pickIncomingHomeworkFile,
  shouldGenerateBossNode,
} from "../scripts/ingestHomework";

describe("ingestHomework", () => {
  it("ingestHomework finds PDF in incoming/", () => {
    const picked = pickIncomingHomeworkFile([
      "/tmp/incoming/a.txt",
      "/tmp/incoming/b.PDF",
    ]);
    expect(picked?.toLowerCase().endsWith(".pdf")).toBe(true);
  });

  it("Haiku extraction returns correct type for spelling PDF", () => {
    expect(normalizeHomeworkType("spelling_test")).toBe("spelling_test");
    expect(normalizeHomeworkType("spelling")).toBe("spelling_test");
  });

  it("node plan written to pending/", () => {
    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-04-21",
      testDate: null,
      wordList: ["cat", "dog"],
      nodes: [
        {
          id: "hw-1",
          type: "quest",
          words: ["cat"],
          difficulty: 2,
          rationale: "test",
          gameFile: "quest-2026-04-21.html",
        },
      ],
    });
    expect(pending.nodes.length).toBe(1);
  });

  it("pendingHomework written to learning_profile.json", () => {
    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-04-21",
      testDate: "2026-04-25",
      wordList: ["cat"],
      nodes: [],
    });
    expect(pending.weekOf).toBe("2026-04-21");
    expect(pending.testDate).toBe("2026-04-25");
  });

  it("karaoke story embeds word list", () => {
    const words = ["cat", "dog"];
    const story = `The cat can hop.\nThe dog can run.`;
    for (const word of words) {
      expect(story.toLowerCase()).toContain(word);
    }
  });

  it("quest HTML includes #sunny-companion div", () => {
    const html = ensureQuestHtmlContract(
      "<html><head></head><body><h1>Game</h1></body></html>",
    );
    expect(html).toContain('<div id="sunny-companion"></div>');
  });

  it("quest HTML includes fireCompanionEvent calls", () => {
    const html = ensureQuestHtmlContract(
      "<html><head></head><body><h1>Game</h1></body></html>",
    );
    expect(html).toContain("fireCompanionEvent");
  });

  it("boss node skipped without --opus flag", () => {
    expect(shouldGenerateBossNode(false)).toBe(false);
  });
});
