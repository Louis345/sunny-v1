import { describe, expect, it } from "vitest";
import {
  renderQuestBossShellFromSpec,
  validateQuestSpecV1,
  type QuestSpecV1,
} from "./questBossSpec";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";

function validSpec(overrides: Partial<QuestSpecV1> = {}): QuestSpecV1 {
  return {
    schemaVersion: 1,
    stage: "quest",
    title: "Silent Letter Shadow Quest",
    theme: "detective mystery",
    challengeFrame: "Find the hidden pattern and prove each answer from memory.",
    visualWorld: "A moonlit detective desk with clue cards, warm lamps, and bold arcade badges.",
    interactionFlavor: "Each round feels like unlocking one evidence locker.",
    tensionCurve: "Start calm, add a ticking case-board meter, then end with a final reveal.",
    rewardMoment: "The case board lights up and stamps the file solved.",
    failureRecoveryStyle: "Treat misses as new clues and invite one focused retry.",
    animationCues: ["case file opens", "evidence stamp lands", "badge glow"],
    styleReference: "Use Sunny adventure-card energy: high contrast, 8px corners, tactile buttons.",
    wrapperTraits: ["story", "calm", "mystery"],
    difficulty: 2,
    estimatedMinutes: 4,
    childFacingIntro: "A quiet case file opens with three locked clues.",
    successCopy: "Case solved.",
    retryCopy: "Try the clue again.",
    scenes: [
      {
        id: "case-file",
        title: "Case File",
        prompt: "Listen, remember, then type the answer without seeing it.",
      },
      {
        id: "final-lock",
        title: "Final Lock",
        prompt: "Use the pattern to unlock the last clue.",
      },
    ],
    ...overrides,
  };
}

describe("QuestSpecV1", () => {
  it("rejects runtime JavaScript and companion chrome", () => {
    const result = validateQuestSpecV1(
      validSpec({
        childFacingIntro: "window.sendNodeComplete({ completed: true })",
        scenes: [{ id: "bad", title: "Quest giver", prompt: "Draw an Elli speech bubble." }],
      }),
      { stage: "quest", targetWords: ["sign"] },
    );

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("runtime");
    expect(result.failures.join(" ")).toContain("companion");
  });

  it("rejects missing scenes, visible target words, and unsupported stage", () => {
    const result = validateQuestSpecV1(
      {
        ...validSpec({
          stage: "visual-explainer" as QuestSpecV1["stage"],
          scenes: [],
          challengeFrame: "Spell sign before the timer runs out.",
        }),
      },
      { stage: "quest", targetWords: ["sign"] },
    );

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("stage");
    expect(result.failures.join(" ")).toContain("scenes");
    expect(result.failures.join(" ")).toContain("visible target");
  });

  it("rejects specs that omit creative direction fields needed for quality comparison", () => {
    const thinSpec = validSpec();
    delete (thinSpec as Partial<QuestSpecV1>).visualWorld;
    delete (thinSpec as Partial<QuestSpecV1>).interactionFlavor;

    const result = validateQuestSpecV1(thinSpec, { stage: "quest", targetWords: ["sign"] });

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("visualWorld");
    expect(result.failures.join(" ")).toContain("interactionFlavor");
  });

  it("renders a trusted shell that owns contract plumbing and hides spelling targets", () => {
    const spec = validSpec();
    const validation = validateQuestSpecV1(spec, { stage: "quest", targetWords: ["sign", "know"] });
    expect(validation.ok).toBe(true);

    const html = renderQuestBossShellFromSpec(spec, {
      stage: "quest",
      targetWords: ["sign", "know"],
    });

    expect(html).toContain('<script src="/games/_contract.js"></script>');
    expect(html).toContain('id="sunny-companion"');
    expect(html).toContain("window.fireAttemptEvent");
    expect(html).toContain("window.sendNodeComplete");
    expect(html).toContain("window.SUNNY_VALIDATION_HOOKS");
    expect(html).toContain("[quest-boss-shell] [start]");
    expect(html).toContain("data-style-reference");
    expect(html).toContain("case file opens");
    expect(html).toContain("evidence stamp lands");
    expect(html).not.toContain(".innerHTML");
    expect(html).toContain("textContent = scene.prompt");

    const gameValidation = validateGeneratedGame(html, {
      words: ["sign", "know"],
      homeworkType: "spelling_test",
      childId: "reina",
      generationStage: "quest",
    });
    expect(gameValidation.passed).toBe(true);
    expect(gameValidation.warnings).not.toContain("Correct and wrong feedback may fire from same code path");
  });
});
