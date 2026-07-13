import { describe, expect, it } from "vitest";
import { scoreContentVitality } from "./contentVitality";

describe("contentVitality", () => {
  it("keeps candidate status before 3 plays", () => {
    const verdict = scoreContentVitality({
      rootDir: process.cwd(),
      childId: "demo-pashley",
      contentId: "shell-1",
      mechanic: "array builder",
      theme: "monster",
      plays: 2,
      completionRate: 0.9,
      attentionScore: 0.9,
      banditPickRate: 0.8,
      instrumentQuality: 0.9,
      helpSpikeRate: 0.1,
    });
    expect(verdict.reuseStatus).toBe("candidate");
  });

  it("promotes strong shells after enough plays", () => {
    const verdict = scoreContentVitality({
      rootDir: process.cwd(),
      childId: "demo-pashley",
      contentId: "shell-1",
      mechanic: "array builder",
      theme: "monster",
      plays: 4,
      completionRate: 0.92,
      attentionScore: 0.88,
      banditPickRate: 0.7,
      instrumentQuality: 0.8,
      helpSpikeRate: 0.05,
    });
    expect(verdict.verdict).toBe("strong");
    expect(verdict.reuseStatus).toBe("reuse");
  });
});
