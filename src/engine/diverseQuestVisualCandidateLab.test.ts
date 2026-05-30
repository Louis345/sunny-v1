import { describe, expect, it } from "vitest";
import { createQuestVisualPromptLabFixture, findQuestVisualPromptPollution } from "./questVisualPromptLab";
import {
  buildDiverseQuestVisualCandidateDirections,
  selectQuestVisualCandidateDirection,
} from "./diverseQuestVisualCandidateLab";

describe("diverse Quest visual candidate lab", () => {
  it("creates three meaningfully different Quest directions from the same learning truth", () => {
    const fixture = createQuestVisualPromptLabFixture("reina-spelling-mystery");
    const directions = buildDiverseQuestVisualCandidateDirections(fixture);

    expect(directions).toHaveLength(3);
    expect(directions.map((direction) => direction.family)).toEqual([
      "mystery_vault",
      "strategy_machine",
      "cozy_collection",
    ]);
    for (const direction of directions) {
      expect(direction.prompt).toContain("Create a premium 16:9 game screen concept");
      expect(direction.prompt).toContain("Learning truth: this is a spelling mastery quest");
      expect(direction.prompt).toContain("the actual spelling target words must NOT be visible");
      expect(direction.prompt).toContain("the image is the experience");
      expect(findQuestVisualPromptPollution(direction.prompt, fixture.assignment.targetWords ?? [])).toEqual([]);
    }
  });

  it("keeps paid image prompts away from fake readable game UI labels", () => {
    const fixture = createQuestVisualPromptLabFixture("reina-spelling-mystery");
    const directions = buildDiverseQuestVisualCandidateDirections(fixture);

    for (const direction of directions) {
      expect(direction.prompt).toMatch(/no fake readable UI text/i);
      expect(direction.prompt).toMatch(/no scoreboards with readable copy/i);
      expect(direction.prompt).toMatch(/invented unreadable glyphs/i);
    }
  });

  it("keeps skipped visual directions as not_selected preference evidence", () => {
    const fixture = createQuestVisualPromptLabFixture("reina-spelling-mystery");
    const directions = buildDiverseQuestVisualCandidateDirections(fixture);
    const selection = selectQuestVisualCandidateDirection(directions, "strategy-machine");

    expect(selection.selected.id).toBe("strategy-machine");
    expect(selection.lifecycle.map((candidate) => [candidate.id, candidate.status])).toEqual([
      ["mystery-vault", "not_selected"],
      ["strategy-machine", "selected"],
      ["cozy-collection", "not_selected"],
    ]);
    expect(selection.choiceEvent.selectedOptionId).toBe("strategy-machine");
    expect(selection.choiceEvent.skippedOptionIds).toEqual(["mystery-vault", "cozy-collection"]);
    expect(selection.choiceEvent.masteryEvidence).toBe(false);
  });
});
