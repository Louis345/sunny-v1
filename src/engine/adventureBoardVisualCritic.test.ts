import { describe, expect, it } from "vitest";
import {
  shouldRunAdventureBoardVisualCritic,
  type AdventureBoardVisualCriticDecisionInput,
} from "./adventureBoardVisualCritic";

function input(overrides: Partial<AdventureBoardVisualCriticDecisionInput> = {}): AdventureBoardVisualCriticDecisionInput {
  return {
    plannerConfidence: 0.92,
    semanticAuditIssues: [],
    choiceOptionCount: 10,
    force: false,
    ...overrides,
  };
}

describe("adventure board visual critic risk gate", () => {
  it("skips the paid critic for high-confidence clean boards", () => {
    expect(shouldRunAdventureBoardVisualCritic(input())).toEqual({
      shouldRun: false,
      reasons: [],
    });
  });

  it("runs the paid critic for low confidence or failed semantic audit", () => {
    expect(shouldRunAdventureBoardVisualCritic(input({ plannerConfidence: 0.42 }))).toEqual(
      expect.objectContaining({
        shouldRun: true,
        reasons: expect.arrayContaining(["planner_confidence_low"]),
      }),
    );
    expect(shouldRunAdventureBoardVisualCritic(input({
      semanticAuditIssues: [{ code: "board_fake_agency", severity: "error" }],
    }))).toEqual(expect.objectContaining({
      shouldRun: true,
      reasons: expect.arrayContaining(["semantic_audit_failed"]),
    }));
  });

  it("can be forced from CLI or env without changing the board", () => {
    expect(shouldRunAdventureBoardVisualCritic(input({ force: true }))).toEqual({
      shouldRun: true,
      reasons: ["forced_by_cli"],
    });
  });
});
