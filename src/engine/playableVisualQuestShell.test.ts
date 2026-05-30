import { describe, expect, it } from "vitest";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";
import { renderPlayableVisualQuestShell } from "./playableVisualQuestShell";

describe("playable visual Quest shell", () => {
  it("keeps the generated visual dominant while adding only Sunny evidence plumbing", () => {
    const targetWords = ["write", "sign", "know"];
    const html = renderPlayableVisualQuestShell({
      kind: "quest",
      childId: "reina",
      candidateId: "secret-spelling-vault",
      title: "Secret Spelling Vault",
      imagePath: "/generated-asset/secret-spelling-vault.png",
      targetWords,
      assignment: {
        domain: "spelling",
        title: "Silent letters and high-frequency words",
        concepts: ["silent letters", "high-frequency recall"],
      },
    });

    expect(html).toContain("/generated-asset/secret-spelling-vault.png");
    expect(html).toContain('data-free-vision-runtime="true"');
    expect(html).toContain('data-overlay-policy="minimal"');
    expect(html).toContain('id="sunny-companion"');
    expect(html).toContain("fireAttemptEvent");
    expect(html).toContain("sendNodeComplete");
    expect(html).toContain("SUNNY_VALIDATION_HOOKS");
    expect(html).not.toMatch(/Race Tower|Suffix Factory|spell the words on their flags/i);
    for (const word of targetWords) {
      expect(html.toLowerCase()).not.toContain(word);
    }

    const validation = validateGeneratedGame(html, {
      words: targetWords,
      homeworkType: "spelling_test",
      childId: "reina",
      generationStage: "quest",
    });
    expect(validation.passed).toBe(true);
  });
});
