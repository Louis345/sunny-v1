import { describe, expect, it } from "vitest";
import { validateAdventureBoardJson } from "../shared/adventureBoardValidation";
import {
  compileAssignmentPlanPrescription,
  validateAssignmentPlanPrescription,
  type AssignmentPlanPrescription,
} from "./assignmentPlanPrescription";
import { buildPlannerActivityCatalog, plannerLaunchableActivityIds } from "./plannerActivityCatalog";

const basePrescription: AssignmentPlanPrescription = {
  planId: "assignment-plan-reina-catalog-test",
  childId: "reina",
  domain: "spelling",
  title: "Reina Unit 9 Spelling",
  targetGroups: [
    {
      id: "silent_letters",
      label: "Silent letters",
      skill: "spell_from_memory",
      targets: ["sign", "know", "write", "thumb"],
    },
    {
      id: "high_frequency_words",
      label: "High frequency words",
      skill: "read_fluently",
      targets: ["among", "building", "circle", "decided"],
    },
  ],
  baseline: {
    id: "baseline-spell",
    label: "Check silent letters",
    activityId: "spell-check",
    targetGroupId: "silent_letters",
    reason: "Start with production evidence from the captured spelling list.",
  },
  agencyRoutes: [
    {
      id: "voice-route",
      label: "Say it out loud",
      activityId: "pronunciation",
      targetGroupId: "high_frequency_words",
      reason: "Reina can use voice confidence for the reading-heavy words.",
      childHook: "voice challenge",
    },
    {
      id: "speed-route",
      label: "Find it fast",
      activityId: "word-radar",
      targetGroupId: "silent_letters",
      reason: "A visual speed route gives the same homework a lower-writing agency path.",
      childHook: "speed challenge",
    },
  ],
  supportPath: {
    id: "support-story",
    label: "Story support",
    activityId: "karaoke",
    targetGroupId: "high_frequency_words",
    trigger: "If baseline spelling is below 70%, route to a scaffolded reading pass first.",
  },
  questHypothesis: {
    title: "Silent Letter Mission",
    targetGroupIds: ["silent_letters", "high_frequency_words"],
    readiness: "Unlock only after at least one route produces usable target-level evidence.",
  },
  bossHypothesis: {
    title: "Homework Boss",
    targetGroupIds: ["silent_letters"],
    masteryGate: "Boss remains locked until quest evidence supports transfer.",
  },
  evidenceUsed: [
    {
      id: "homework-pdf",
      type: "captured_homework",
      summary: "Spelling list includes silent letters and high frequency words.",
    },
  ],
  rationale: {
    agency: "Two real routes let Reina choose voice or visual speed without changing homework targets.",
    support: "Story support is available if baseline evidence shows struggle.",
    mastery: "Quest and boss are hypotheses, not automatic proof of mastery.",
  },
};

describe("assignment plan prescription", () => {
  it("rejects unknown activities, wrappers as main activities, and missing target groups before map compilation", () => {
    expect(validateAssignmentPlanPrescription({
      ...basePrescription,
      baseline: {
        ...basePrescription.baseline,
        activityId: "spark-orb-charge",
      },
    }).issues).toContainEqual(expect.objectContaining({
      code: "not_launchable_intervention",
      path: "baseline.activityId",
    }));

    expect(validateAssignmentPlanPrescription({
      ...basePrescription,
      agencyRoutes: [{
        ...basePrescription.agencyRoutes[0],
        activityId: "made-up-game",
      }],
    }).issues).toContainEqual(expect.objectContaining({
      code: "unknown_activity",
      path: "agencyRoutes[0].activityId",
    }));

    expect(validateAssignmentPlanPrescription({
      ...basePrescription,
      agencyRoutes: [{
        ...basePrescription.agencyRoutes[0],
        targetGroupId: "not-a-real-group",
      }],
    }).issues).toContainEqual(expect.objectContaining({
      code: "missing_target_group",
      path: "agencyRoutes[0].targetGroupId",
    }));
  });

  it("compiles two agency routes into real board choices, node plan ids, edges, and launch payloads", () => {
    const compiled = compileAssignmentPlanPrescription(basePrescription, {
      createdAt: "2026-06-17T00:00:00.000Z",
      companionId: "matilda",
      companionName: "Matilda",
    });
    const board = compiled.activeSessionPlan.adventureBoard;
    expect(board).toBeDefined();
    if (!board) throw new Error("expected compiler-owned adventureBoard");

    const nodePlanIds = new Set(compiled.activeSessionPlan.nodePlan.map((node) => node.id));
    const boardNodeIds = new Set(board.nodes.map((node) => node.id));
    const routeChoice = board.choiceSets?.find((choiceSet) => choiceSet.kind === "baseline-route");

    expect(routeChoice?.options).toHaveLength(2);
    expect(routeChoice?.options.map((option) => option.nodeId)).toEqual([
      "route_voice-route",
      "route_speed-route",
    ]);
    for (const option of routeChoice?.options ?? []) {
      expect(option.nodeId && nodePlanIds.has(option.nodeId)).toBe(true);
      expect(option.nodeId && boardNodeIds.has(option.nodeId)).toBe(true);
      expect(option.choiceSignal?.algorithmFeed).toBe("choicePolicy");
      expect(option.choiceSignal?.preferenceNotMastery).toBe(true);
    }

    for (const node of board.nodes) {
      if (node.action?.type === "launch-activity") {
        expect(node.action.payloadId).toBe(node.id);
        expect(nodePlanIds.has(node.action.payloadId)).toBe(true);
      }
    }
    for (const edge of board.edges) {
      expect(boardNodeIds.has(edge.from)).toBe(true);
      expect(boardNodeIds.has(edge.to)).toBe(true);
    }

    const launchableIds = new Set(plannerLaunchableActivityIds(buildPlannerActivityCatalog()));
    expect(validateAdventureBoardJson(board, launchableIds).filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
