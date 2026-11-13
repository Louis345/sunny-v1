import { describe, expect, it } from "vitest";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import type { AdventureBoardNode } from "../../../src/shared/adventureBoardJson";
import type { HatchHuntAssignmentConfig } from "../../../src/shared/hatchHuntAssignment";
import { resolvePlannerBoardLaunchNode } from "../utils/adventureBoardLaunch";

const config: HatchHuntAssignmentConfig = {
  schemaVersion: 1,
  activityId: "hatch-hunt",
  mode: "baseline_assignment",
  encounterId: "hatch:ila:node-1:source",
  childId: "ila",
  homeworkId: "homework:source",
  domain: "math",
  creatureId: "mossback",
  source: { fingerprint: "source", documentIds: ["document:source"] },
  baselineItems: [
    { id: "b1", targetId: "fact:6x7", sourceEvidenceIds: ["evidence:1"], exposure: "unseen", prompt: "What is 6 × 7?", response: { mode: "numeric", correctValue: 42 }, timerSeconds: null },
    { id: "b2", targetId: "fact:7x8", sourceEvidenceIds: ["evidence:2"], exposure: "unseen", prompt: "What is 7 × 8?", response: { mode: "numeric", correctValue: 56 }, timerSeconds: null },
  ],
  verificationItems: [
    { id: "v1", targetId: "fact:6x7", sourceEvidenceIds: ["evidence:1"], exposure: "practiced", prompt: "Try 6 × 7 again", response: { mode: "numeric", correctValue: 42 }, timerSeconds: 15 },
  ],
  recoveryByTarget: {
    "fact:6x7": [{ id: "r1", prompt: "Use six groups of seven.", workedExplanation: "6 × 7 = 42" }],
    "fact:7x8": [{ id: "r2", prompt: "Use seven groups of eight.", workedExplanation: "7 × 8 = 56" }],
  },
  evidencePolicy: { purpose: "baseline", firstAttemptIndependent: true, maximumClaim: "practice_only", captureIsAcademicEvidence: false },
};

describe("Hatch Hunt planner board launch", () => {
  it("preserves the stamped assignment contract from the planner node into runtime", () => {
    const boardNode = {
      id: "hatch-node",
      kind: "activity",
      activityId: "hatch-hunt",
      label: "Hatch Hunt",
      state: "available",
      action: { type: "launch-activity", payloadId: "hatch-node" },
    } as AdventureBoardNode;
    const packet = {
      activeSessionPlan: {
        planId: "plan-1",
        nodePlan: [{
          id: "hatch-node",
          type: "hatch-hunt",
          activityId: "hatch-hunt",
          title: "Mossy's Baseline Hunt",
          targets: ["fact:6x7", "fact:7x8"],
          difficulty: 2,
          source: "chart_planner",
          hatchHuntConfig: config,
        }],
      },
    } as unknown as ChildExperiencePacket;

    expect(resolvePlannerBoardLaunchNode(packet, boardNode)).toMatchObject({
      id: "hatch-node",
      type: "hatch-hunt",
      planId: "plan-1",
      hatchHuntConfig: config,
    });
  });
});
