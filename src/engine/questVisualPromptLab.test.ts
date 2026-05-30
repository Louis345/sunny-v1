import { describe, expect, it } from "vitest";
import {
  buildQuestVisualPromptVariants,
  createQuestVisualPromptLabFixture,
  findQuestVisualPromptPollution,
  renderQuestVisualPrompt,
} from "./questVisualPromptLab";

describe("quest visual prompt lab", () => {
  it("renders the north-star Reina spelling prompt from clean brief fields", () => {
    const fixture = createQuestVisualPromptLabFixture("reina-spelling-mystery");
    const variants = buildQuestVisualPromptVariants(fixture);
    const northStar = variants.find((variant) => variant.id === "north-star-baseline");

    expect(northStar?.prompt).toContain("Create a premium 16:9 game screen concept for Sunny, an adaptive learning Quest for Reina, age 8.");
    expect(northStar?.prompt).toContain("Learning truth: this is a spelling mastery quest");
    expect(northStar?.prompt).toContain("Child preference theory: Reina responds to mystery, magical rewards");
    expect(northStar?.prompt).toContain("Concept: Secret Spelling Vault.");
    expect(northStar?.prompt).toContain("Style: high-end stylized 3D game concept art");
    expect(northStar?.prompt).not.toContain("faster");
    expect(northStar?.prompt).not.toContain("fastest");
  });

  it("turns activity signal fixtures into prompt language without raw target words or planner candidate text", () => {
    const fixture = createQuestVisualPromptLabFixture("reina-spelling-mystery");
    const signalPrompt = buildQuestVisualPromptVariants(fixture).find((variant) => variant.id === "signal-derived")?.prompt ?? "";

    expect(signalPrompt).toContain("mystery");
    expect(signalPrompt).toContain("rare unlock");
    expect(signalPrompt).toContain("hidden recall");
    expect(signalPrompt).toContain("premium 16:9 game screen");
    expect(signalPrompt).not.toContain("Race Tower Climb");
    expect(signalPrompt).not.toContain("Candidate purpose");
    expect(signalPrompt).not.toContain("faster");
    expect(signalPrompt).not.toContain("fastest");
  });

  it("softens speed and competition when signals show abandon/frustration", () => {
    const fixture = createQuestVisualPromptLabFixture("spelling-speed-avoidant");
    const signalPrompt = buildQuestVisualPromptVariants(fixture).find((variant) => variant.id === "signal-derived")?.prompt ?? "";

    expect(signalPrompt).toContain("calm");
    expect(signalPrompt).toContain("control");
    expect(signalPrompt).toContain("no timer pressure");
    expect(signalPrompt).not.toContain("race car");
    expect(signalPrompt).not.toContain("speed arena");
  });

  it("changes learning truth and mechanic language for non-spelling domains", () => {
    const fixture = createQuestVisualPromptLabFixture("math-competition-positive");
    const prompt = renderQuestVisualPrompt(buildQuestVisualPromptVariants(fixture)[2]!.brief);

    expect(prompt).toContain("Learning truth: this is a math mastery quest");
    expect(prompt).toContain("reasoning powers the system");
    expect(prompt).not.toContain("spelling target words");
    expect(prompt).not.toContain("typed spelling recall");
  });

  it("flags real prompt pollution without matching target words inside unrelated words", () => {
    expect(findQuestVisualPromptPollution("recent engagement signals around mystery", ["sign"])).toEqual([]);
    expect(findQuestVisualPromptPollution("flags say 'faster' and the child boosts racers", ["faster"])).toContain(
      "target_word:faster",
    );
    expect(findQuestVisualPromptPollution("Candidate purpose: intervention", [])).toContain("planner_candidate_text");
  });
});
