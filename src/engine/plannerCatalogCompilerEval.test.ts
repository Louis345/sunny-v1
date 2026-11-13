import { describe, expect, it } from "vitest";
import {
  compileAssignmentPlanPrescription,
  type AssignmentPlanPrescription,
} from "./assignmentPlanPrescription";

const spellingTargets = [
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
];

function prescription(args: {
  childId: "ila" | "reina";
  baselineActivityId: string;
  routeActivityIds: [string, string];
  supportLocked?: boolean;
  evidence: string;
}): AssignmentPlanPrescription {
  return {
    planId: `plan-${args.childId}`,
    childId: args.childId,
    domain: "spelling",
    title: "Same spelling homework",
    targetGroups: spellingTargets,
    baseline: {
      id: "baseline",
      label: args.childId === "ila" ? "Calm first pass" : "Recall check",
      activityId: args.baselineActivityId,
      targetGroupId: "silent_letters",
      reason: args.evidence,
    },
    agencyRoutes: [
      {
        id: "route-a",
        label: args.childId === "ila" ? "Read it steady" : "Beat the clock",
        activityId: args.routeActivityIds[0],
        targetGroupId: args.childId === "ila" ? "high_frequency_words" : "silent_letters",
        reason: args.evidence,
        childHook: args.childId === "ila" ? "calm" : "speed",
      },
      {
        id: "route-b",
        label: args.childId === "ila" ? "Say it with help" : "Say it strong",
        activityId: args.routeActivityIds[1],
        targetGroupId: "high_frequency_words",
        reason: args.evidence,
        childHook: "voice",
      },
    ],
    supportPath: {
      id: "story-support",
      label: "Story support",
      activityId: "karaoke",
      targetGroupId: "high_frequency_words",
      trigger: args.supportLocked
        ? "Recent misses and hesitation route to scaffolded support before transfer."
        : "Keep available as a fallback if route evidence declines.",
    },
    questHypothesis: {
      title: "Transfer quest",
      targetGroupIds: ["silent_letters", "high_frequency_words"],
      readiness: "Quest stays locked until baseline plus route evidence exist.",
    },
    bossHypothesis: {
      title: "Mastery boss",
      targetGroupIds: ["silent_letters"],
      masteryGate: "Boss stays locked until quest evidence supports transfer.",
    },
    evidenceUsed: [{ id: "same-homework", type: "captured_homework", summary: args.evidence }],
    rationale: {
      agency: args.evidence,
      support: args.supportLocked
        ? "Struggle evidence should route to support before generated transfer."
        : "Mastery evidence can move toward quest, but boss still requires transfer proof.",
      mastery: "In-app evidence is a hypothesis until transfer evidence supports it.",
    },
  };
}

describe("planner catalog compiler fast evals", () => {
  it("compiles the same spelling homework into child-chart-different boards with real agency routes", () => {
    const ila = compileAssignmentPlanPrescription(prescription({
      childId: "ila",
      baselineActivityId: "word-radar",
      routeActivityIds: ["karaoke", "pronunciation"],
      evidence: "Ila shows decoding hesitation and benefits from calm scaffolded reading.",
    })).activeSessionPlan;
    const reina = compileAssignmentPlanPrescription(prescription({
      childId: "reina",
      baselineActivityId: "spell-check",
      routeActivityIds: ["word-radar", "pronunciation"],
      evidence: "Reina responds to challenge and needs spelling production proof.",
    })).activeSessionPlan;

    expect(ila.adventureBoard?.choiceSets?.find((choiceSet) => choiceSet.kind === "baseline-route")?.options).toHaveLength(2);
    expect(reina.adventureBoard?.choiceSets?.find((choiceSet) => choiceSet.kind === "baseline-route")?.options).toHaveLength(2);
    expect(ila.nodePlan[0]?.activityId).toBe("word-radar");
    expect(reina.nodePlan[0]?.activityId).toBe("spell-check");
    expect(JSON.stringify(ila.nodePlan)).not.toEqual(JSON.stringify(reina.nodePlan));
  });

  it("routes struggle to support while mastery only advances toward quest without shortcutting boss", () => {
    const struggle = compileAssignmentPlanPrescription(prescription({
      childId: "ila",
      baselineActivityId: "word-radar",
      routeActivityIds: ["karaoke", "pronunciation"],
      supportLocked: true,
      evidence: "Ila missed silent-letter targets twice and hesitated on high-frequency words.",
    })).activeSessionPlan;
    const mastery = compileAssignmentPlanPrescription(prescription({
      childId: "reina",
      baselineActivityId: "spell-check",
      routeActivityIds: ["word-radar", "pronunciation"],
      supportLocked: false,
      evidence: "Reina has clean recent recall evidence and fast recovery after one miss.",
    })).activeSessionPlan;

    expect(struggle.nodePlan.some((node) => node.id === "support_story-support" && node.locked)).toBe(true);
    expect(mastery.adventureBoard?.nodes.find((node) => node.kind === "quest")?.state).toBe("locked");
    expect(mastery.adventureBoard?.nodes.find((node) => node.kind === "boss")?.state).toBe("locked");
    expect(mastery.generatedExperienceBriefs?.some((brief) => brief.kind === "quest")).toBe(true);
  });
});
