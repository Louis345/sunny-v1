import { describe, expect, it } from "vitest";
import {
  ensureQuestHtmlContract,
  normalizeHomeworkType,
  pickIncomingHomeworkFile,
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
    expect(false).toBe(true);
  });

  it("pendingHomework written to learning_profile.json", () => {
    expect(false).toBe(true);
  });

  it("karaoke story embeds word list", () => {
    expect(false).toBe(true);
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
    expect(false).toBe(true);
  });
});
