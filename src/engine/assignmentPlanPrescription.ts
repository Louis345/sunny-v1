import type { ActiveSessionPlan, HomeworkDomain, PlannedMeasurement } from "../context/schemas/learningProfile";
import type {
  AdventureBoardJson,
  AdventureBoardNode,
  AdventureChoiceOption,
} from "../shared/adventureBoardJson";
import type { NodeType } from "../shared/adventureTypes";
import {
  buildPlannerActivityCatalog,
  plannerLaunchableActivityIds,
  validatePlannerActivityId,
  type PlannerActivityCatalog,
} from "./plannerActivityCatalog";

export type AssignmentPrescriptionTargetGroup = {
  id: string;
  label: string;
  skill: string;
  targets: string[];
};

export type AssignmentPrescriptionActivity = {
  id: string;
  label: string;
  activityId: string;
  targetGroupId: string;
  reason: string;
  childHook?: string;
};

export type AssignmentPrescriptionSupportPath = {
  id: string;
  label: string;
  activityId: string;
  targetGroupId: string;
  trigger: string;
};

export type AssignmentPlanPrescription = {
  planId: string;
  childId: string;
  domain: HomeworkDomain;
  title?: string;
  targetGroups: AssignmentPrescriptionTargetGroup[];
  baseline: AssignmentPrescriptionActivity;
  requiredActivities?: AssignmentPrescriptionActivity[];
  agencyRoutes: AssignmentPrescriptionActivity[];
  supportPath?: AssignmentPrescriptionSupportPath;
  questHypothesis?: {
    title: string;
    targetGroupIds: string[];
    readiness: string;
  };
  bossHypothesis?: {
    title: string;
    targetGroupIds: string[];
    masteryGate: string;
  };
  evidenceUsed: ActiveSessionPlan["evidenceUsed"];
  rationale: {
    agency: string;
    support: string;
    mastery: string;
  };
};

export type AssignmentPrescriptionValidationCode =
  | "unknown_activity"
  | "not_launchable_intervention"
  | "missing_target_group"
  | "too_few_agency_routes"
  | "empty_targets";

export type AssignmentPrescriptionValidationIssue = {
  code: AssignmentPrescriptionValidationCode;
  path: string;
  message: string;
};

export type AssignmentPrescriptionValidationResult = {
  ok: boolean;
  issues: AssignmentPrescriptionValidationIssue[];
};

export type AssignmentPlanCompilerOptions = {
  createdAt?: string;
  activeHomeworkId?: string;
  testDate?: string | null;
  companionId?: string;
  companionName?: string;
  plannerConfidence?: number;
  preserveActivityRefIds?: boolean;
  requireTwoAgencyRoutes?: boolean;
  destinationIds?: {
    mystery?: string;
    quest?: string;
    boss?: string;
  };
};

export type CompiledAssignmentPlan = {
  activeSessionPlan: ActiveSessionPlan;
};

const DEFAULT_THEME: AdventureBoardJson["theme"] = {
  background: { type: "image", value: "/generated/adventure-board/default-spelling-map.png" },
  palette: {
    path: "#ffffff",
    completed: "#2f9f6f",
    available: "#7058f4",
    locked: "#aeb7c2",
    current: "#ef9825",
    preview: "#d5dde5",
    text: "#ffffff",
    panel: "rgba(21, 31, 50, 0.80)",
  },
};

export function validateAssignmentPlanPrescription(
  prescription: AssignmentPlanPrescription,
  catalog: PlannerActivityCatalog = buildPlannerActivityCatalog(),
  options: { requireTwoAgencyRoutes?: boolean } = {},
): AssignmentPrescriptionValidationResult {
  const issues: AssignmentPrescriptionValidationIssue[] = [];
  const targetGroups = new Map(prescription.targetGroups.map((group) => [group.id, group]));

  for (const [index, group] of prescription.targetGroups.entries()) {
    if (group.targets.length === 0) {
      issues.push({
        code: "empty_targets",
        path: `targetGroups[${index}].targets`,
        message: `Target group ${group.id} must include captured homework targets.`,
      });
    }
  }

  validateActivityRef("baseline", prescription.baseline, issues, targetGroups, catalog);
  prescription.requiredActivities?.forEach((activity, index) => {
    validateActivityRef(`requiredActivities[${index}]`, activity, issues, targetGroups, catalog);
  });
  prescription.agencyRoutes.forEach((route, index) => {
    validateActivityRef(`agencyRoutes[${index}]`, route, issues, targetGroups, catalog);
  });
  if ((options.requireTwoAgencyRoutes ?? true) && prescription.agencyRoutes.length < 2) {
    issues.push({
      code: "too_few_agency_routes",
      path: "agencyRoutes",
      message: "Prescription must provide two agency routes when two valid route activities are available.",
    });
  }
  if (prescription.supportPath) {
    validateActivityRef("supportPath", prescription.supportPath, issues, targetGroups, catalog);
  }

  for (const [index, targetGroupId] of (prescription.questHypothesis?.targetGroupIds ?? []).entries()) {
    if (!targetGroups.has(targetGroupId)) {
      issues.push({
        code: "missing_target_group",
        path: `questHypothesis.targetGroupIds[${index}]`,
        message: `Quest hypothesis references missing target group ${targetGroupId}.`,
      });
    }
  }
  for (const [index, targetGroupId] of (prescription.bossHypothesis?.targetGroupIds ?? []).entries()) {
    if (!targetGroups.has(targetGroupId)) {
      issues.push({
        code: "missing_target_group",
        path: `bossHypothesis.targetGroupIds[${index}]`,
        message: `Boss hypothesis references missing target group ${targetGroupId}.`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

function validateActivityRef(
  path: string,
  ref: Pick<AssignmentPrescriptionActivity, "activityId" | "targetGroupId">,
  issues: AssignmentPrescriptionValidationIssue[],
  targetGroups: Map<string, AssignmentPrescriptionTargetGroup>,
  catalog: PlannerActivityCatalog,
): void {
  const activity = validatePlannerActivityId(ref.activityId, catalog);
  if (!activity.ok) {
    issues.push({
      code: activity.reason,
      path: `${path}.activityId`,
      message: `${path} references ${activity.reason === "unknown_activity" ? "unknown" : "non-launchable"} activity ${ref.activityId}.`,
    });
  }
  if (!targetGroups.has(ref.targetGroupId)) {
    issues.push({
      code: "missing_target_group",
      path: `${path}.targetGroupId`,
      message: `${path} references missing target group ${ref.targetGroupId}.`,
    });
  }
}

export function compileAssignmentPlanPrescription(
  prescription: AssignmentPlanPrescription,
  options: AssignmentPlanCompilerOptions = {},
): CompiledAssignmentPlan {
  const validation = validateAssignmentPlanPrescription(prescription, buildPlannerActivityCatalog(), {
    requireTwoAgencyRoutes: options.requireTwoAgencyRoutes,
  });
  if (!validation.ok) {
    throw new Error(`Invalid assignment plan prescription: ${validation.issues.map((issue) => `${issue.path}:${issue.code}`).join(", ")}`);
  }

  const createdAt = options.createdAt ?? new Date().toISOString();
  const companionId = options.companionId ?? "matilda";
  const companionName = options.companionName ?? "Matilda";
  const targetGroups = new Map(prescription.targetGroups.map((group) => [group.id, group]));
  const idFor = (role: "baseline" | "route" | "support", id: string) =>
    options.preserveActivityRefIds ? id : `${role}_${id}`;
  const mysteryId = options.destinationIds?.mystery ?? "mystery_reward";
  const questId = options.destinationIds?.quest ?? "quest_transfer";
  const bossId = options.destinationIds?.boss ?? "boss_mastery";
  const nodePlan = [
    planNode(idFor("baseline", prescription.baseline.id), prescription.baseline, targetGroups, "baseline"),
    ...(prescription.requiredActivities ?? []).map((activity) =>
      planNode(idFor("baseline", activity.id), activity, targetGroups, "baseline")
    ),
    ...prescription.agencyRoutes.map((route) => planNode(idFor("route", route.id), route, targetGroups, "preference")),
    ...(prescription.supportPath
      ? [planNode(idFor("support", prescription.supportPath.id), prescription.supportPath, targetGroups, "support", true)]
      : []),
    rewardNode(mysteryId, "mystery", allTargets(prescription), false),
    rewardNode(questId, "quest", hypothesisTargets(prescription, prescription.questHypothesis?.targetGroupIds), true),
    rewardNode(bossId, "boss", hypothesisTargets(prescription, prescription.bossHypothesis?.targetGroupIds), true),
  ];

  const activeSessionPlan: ActiveSessionPlan = {
    planId: prescription.planId,
    childId: prescription.childId,
    createdAt,
    source: "ingest_human_loop",
    activeHomeworkId: options.activeHomeworkId,
    domain: prescription.domain,
    testDate: options.testDate ?? null,
    nodePlan,
    adventureBoard: buildAdventureBoard(prescription, {
      companionId,
      companionName,
      preserveActivityRefIds: options.preserveActivityRefIds ?? false,
      destinationIds: { mystery: mysteryId, quest: questId, boss: bossId },
    }),
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: `${prescription.childId}:${prescription.planId}`,
      previousCompletedNodeCount: 0,
    },
    companionPolicy: {
      companionId,
      displayName: companionName,
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 2,
    },
    evidenceUsed: prescription.evidenceUsed,
    openQuestions: [],
    plannerConfidence: options.plannerConfidence ?? 0.78,
    planTheory: {
      hypothesis: prescription.rationale.mastery,
      evidenceSummary: prescription.evidenceUsed.map((evidence) => evidence.summary),
      intervention: prescription.rationale.agency,
      supportCriteria: [prescription.rationale.support],
      reviseCriteria: ["Route to support when baseline or route evidence shows unresolved target misses."],
      falsifyCriteria: ["Delayed or quest evidence fails to transfer after support."],
    },
    plannedMeasurements: buildPlannedMeasurements(prescription),
    generatedExperienceBriefs: [
      {
        briefId: `${prescription.planId}-quest-brief`,
        kind: "quest",
        title: prescription.questHypothesis?.title ?? "Generated Quest",
        learningGoal: prescription.questHypothesis?.readiness ?? "Test generated transfer after baseline evidence.",
        targetSkills: unique(prescription.targetGroups.map((group) => group.skill)),
        targetConcepts: [],
        targetWords: hypothesisTargets(prescription, prescription.questHypothesis?.targetGroupIds),
        engagementHooks: prescription.agencyRoutes.map((route) => route.childHook ?? route.label),
        algorithmTargets: ["generated_transfer", "retrieval_practice", "mastery_gating"],
        evidenceUsed: prescription.evidenceUsed.map((evidence) => evidence.id),
        artifactStatus: "brief_only",
        validationRequired: true,
      },
      {
        briefId: `${prescription.planId}-boss-brief`,
        kind: "boss",
        title: prescription.bossHypothesis?.title ?? "Mastery Boss",
        learningGoal: prescription.bossHypothesis?.masteryGate ?? "Gate mastery after generated quest evidence.",
        targetSkills: unique(prescription.targetGroups.map((group) => group.skill)),
        targetConcepts: [],
        targetWords: hypothesisTargets(prescription, prescription.bossHypothesis?.targetGroupIds),
        engagementHooks: ["mastery gate"],
        algorithmTargets: ["mastery_gating", "generated_transfer"],
        evidenceUsed: prescription.evidenceUsed.map((evidence) => evidence.id),
        artifactStatus: "brief_only",
        validationRequired: true,
      },
    ],
  };

  return { activeSessionPlan };
}

function planNode(
  id: string,
  ref: AssignmentPrescriptionActivity | AssignmentPrescriptionSupportPath,
  targetGroups: Map<string, AssignmentPrescriptionTargetGroup>,
  role: "baseline" | "preference" | "support",
  locked = false,
): ActiveSessionPlan["nodePlan"][number] {
  const targetGroup = mustTargetGroup(targetGroups, ref.targetGroupId);
  const node = {
    id,
    type: ref.activityId as NodeType,
    activityId: ref.activityId,
    targets: targetGroup.targets,
    difficulty: role === "support" ? 1 : 2,
    source: "chart_planner",
    targetLane: targetGroup.id,
    locked,
  } satisfies ActiveSessionPlan["nodePlan"][number];
  if (ref.activityId === "word-radar") {
    return {
      ...node,
      wordRadarConfig: {
        recallMode: role === "support" ? "visible_read" : "partial_visual_recall",
        inputMode: "whole-word",
        speakStyle: "option-a",
        showTimer: role !== "support",
        hideWordDuringResponse: role !== "support",
        requiresCapturedResponse: true,
      },
    };
  }
  if (ref.activityId === "pronunciation") {
    return {
      ...node,
      pronunciationConfig: {
        baseWordCount: targetGroup.targets.length,
        targetFlowWordCount: targetGroup.targets.length,
        maxWordCount: targetGroup.targets.length,
        expansionPolicy: "on_mastery_or_child_replay",
        masteryGate: {
          accuracyAtLeast: 0.85,
          minStreak: 2,
          noFrustrationSignal: true,
        },
        supportPolicy: "slow_on_help_or_repeated_miss",
        mode: "standard",
      },
    };
  }
  return node;
}

function rewardNode(
  id: string,
  activityId: "mystery" | "quest" | "boss",
  targets: string[],
  locked: boolean,
): ActiveSessionPlan["nodePlan"][number] {
  return {
    id,
    type: activityId as NodeType,
    activityId,
    targets,
    difficulty: activityId === "boss" ? 3 : 2,
    source: "chart_planner",
    targetLane: "generated_transfer",
    locked,
    masteryUnlockState: locked ? "preparing" : undefined,
  };
}

function buildAdventureBoard(
  prescription: AssignmentPlanPrescription,
  companion: {
    companionId: string;
    companionName: string;
    preserveActivityRefIds: boolean;
    destinationIds: { mystery: string; quest: string; boss: string };
  },
): AdventureBoardJson {
  const targetGroups = new Map(prescription.targetGroups.map((group) => [group.id, group]));
  const idFor = (role: "baseline" | "route" | "support", id: string) =>
    companion.preserveActivityRefIds ? id : `${role}_${id}`;
  const baselineId = idFor("baseline", prescription.baseline.id);
  const choiceGateId = "choose_agency_route";
  const routeIds = prescription.agencyRoutes.map((route) => idFor("route", route.id));
  const requiredIds = (prescription.requiredActivities ?? []).map((activity) => idFor("baseline", activity.id));
  const supportId = prescription.supportPath ? idFor("support", prescription.supportPath.id) : undefined;
  const mysteryId = companion.destinationIds.mystery;
  const questId = companion.destinationIds.quest;
  const bossId = companion.destinationIds.boss;
  const hasRouteChoice = routeIds.length >= 2;
  const nodes: AdventureBoardNode[] = [
    activityBoardNode({
      id: baselineId,
      ref: prescription.baseline,
      group: mustTargetGroup(targetGroups, prescription.baseline.targetGroupId),
      state: "current",
      role: "baseline",
      slot: "2",
      order: 1,
    }),
    ...(prescription.requiredActivities ?? []).map((activity, index) =>
      activityBoardNode({
        id: idFor("baseline", activity.id),
        ref: activity,
        group: mustTargetGroup(targetGroups, activity.targetGroupId),
        state: "available",
        role: "baseline",
        slot: index === 0 ? "3" : "4",
        order: index + 2,
      })
    ),
    ...(hasRouteChoice
      ? [{
          id: choiceGateId,
          kind: "choice-gate" as const,
          label: "Choose Path",
          shortLabel: "Choose",
          thumbnailUrl: "/images/activity-thumbnails/choice-gate.png",
          state: "available" as const,
          evidenceRole: "preference" as const,
          slot: (requiredIds.length > 0 ? "4" : "3") as AdventureBoardNode["slot"],
          layout: { role: "choice-gate" as const, lane: "main" as const, order: 1 },
          choiceSetId: "baseline-route-options",
          action: { type: "open-choice-set" as const, payloadId: "baseline-route-options" },
        }]
      : []),
    ...prescription.agencyRoutes.map((route, index) =>
      activityBoardNode({
        id: idFor("route", route.id),
        ref: route,
        group: mustTargetGroup(targetGroups, route.targetGroupId),
        state: "available",
        role: "preference",
        slot: routeLayout(index).slot,
        order: routeLayout(index).order,
        lane: routeLayout(index).lane,
      })
    ),
    ...(prescription.supportPath && supportId
      ? [
          activityBoardNode({
            id: supportId,
            ref: prescription.supportPath,
            group: mustTargetGroup(targetGroups, prescription.supportPath.targetGroupId),
            state: "locked",
            role: "support",
            slot: "5c.1",
            order: 1,
            lane: "middle",
            lockReason: prescription.supportPath.trigger,
          }),
        ]
      : []),
    destinationNode(mysteryId, "mystery", "Mystery", "6", "Complete a route to open a variable reward.", "preference"),
    destinationNode(questId, "quest", prescription.questHypothesis?.title ?? "Quest", "7", prescription.questHypothesis?.readiness ?? "Quest opens after usable route evidence.", "transfer"),
    destinationNode(bossId, "boss", prescription.bossHypothesis?.title ?? "Boss", "8", prescription.bossHypothesis?.masteryGate ?? "Boss opens after quest evidence.", "mastery"),
  ];

  const edges: AdventureBoardJson["edges"] = [
    ...requiredIds.map((requiredId, index) => ({
      id: index === 0 ? `edge_${baselineId}_${requiredId}` : `edge_${requiredIds[index - 1]}_${requiredId}`,
      from: index === 0 ? baselineId : requiredIds[index - 1]!,
      to: requiredId,
      state: "available" as const,
      style: "solid" as const,
    })),
    ...(hasRouteChoice
      ? [
          { id: "edge_baseline_choice", from: requiredIds[requiredIds.length - 1] ?? baselineId, to: choiceGateId, state: "available" as const, style: "solid" as const },
          ...routeIds.map((routeId) => ({
            id: `edge_choice_${routeId}`,
            from: choiceGateId,
            to: routeId,
            state: "available" as const,
            style: "solid" as const,
          })),
        ]
      : routeIds.length > 0
        ? [{ id: `edge_${baselineId}_${routeIds[0]}`, from: requiredIds[requiredIds.length - 1] ?? baselineId, to: routeIds[0]!, state: "available" as const, style: "solid" as const }]
        : []),
    ...routeIds.map((routeId) => ({
      id: `edge_${routeId}_mystery`,
      from: routeId,
      to: mysteryId,
      state: "locked" as const,
      style: "dashed" as const,
    })),
    ...(supportId
      ? [{ id: "edge_support_mystery", from: supportId, to: mysteryId, state: "locked" as const, style: "dashed" as const }]
      : []),
    { id: "edge_mystery_quest", from: mysteryId, to: questId, state: "locked" as const, style: "dashed" as const },
    { id: "edge_quest_boss", from: questId, to: bossId, state: "locked" as const, style: "dashed" as const },
  ];

  return {
    schemaVersion: 1,
    boardId: `${prescription.planId}-board`,
    planId: prescription.planId,
    childId: prescription.childId,
    domain: prescription.domain,
    title: prescription.title,
    theme: DEFAULT_THEME,
    layout: {
      preset: "horizontal-adventure-spine",
      companionSlot: "right",
      routeChoiceBehavior: "exclusive",
    },
    plannerRationale: {
      agencyDesign: prescription.rationale.agency,
      evidenceDesign: prescription.rationale.support,
      layoutChoice: "Compiler-owned horizontal spine: baseline, route choice, route evidence, mystery, quest, boss.",
    },
    nodes,
    edges,
    choiceSets: hasRouteChoice
      ? [{
          id: "baseline-route-options",
          kind: "baseline-route",
          title: "Pick your path",
          options: prescription.agencyRoutes.map((route, index) => routeChoiceOption(route, idFor("route", route.id), index)),
        }, mysteryChoiceSet(mysteryId)]
      : [mysteryChoiceSet(mysteryId)],
    companion: {
      id: companion.companionId,
      name: companion.companionName,
    },
    progress: {
      currentNodeId: baselineId,
      completedNodeIds: [],
      activeChoiceSetId: hasRouteChoice ? "baseline-route-options" : undefined,
    },
  };
}

function activityBoardNode(args: {
  id: string;
  ref: AssignmentPrescriptionActivity | AssignmentPrescriptionSupportPath;
  group: AssignmentPrescriptionTargetGroup;
  state: AdventureBoardNode["state"];
  role: AdventureBoardNode["evidenceRole"];
  slot: NonNullable<AdventureBoardNode["slot"]>;
  order: number;
  lane?: NonNullable<AdventureBoardNode["layout"]>["lane"];
  lockReason?: string;
}): AdventureBoardNode {
  return {
    id: args.id,
    kind: "activity",
    activityId: args.ref.activityId,
    label: args.ref.label,
    shortLabel: shortBoardLabel(args.ref.label),
    state: args.state,
    evidenceRole: args.role,
    slot: args.slot,
    thumbnailUrl: `/images/activity-thumbnails/${args.ref.activityId}.png`,
    layout: {
      role: args.role === "baseline" ? "baseline" : "evidence-route",
      lane: args.lane ?? "main",
      order: args.order,
      routeGroupId: args.role === "preference" ? args.ref.id : undefined,
    },
    target: {
      laneId: args.group.id,
      skill: args.group.skill,
      words: args.group.targets,
    },
    action: { type: "launch-activity", payloadId: args.id },
    lock: args.lockReason
      ? {
          reason: args.lockReason,
          label: "Needs support evidence",
        }
      : undefined,
  };
}

function routeLayout(index: number): {
  slot: NonNullable<AdventureBoardNode["slot"]>;
  lane: NonNullable<NonNullable<AdventureBoardNode["layout"]>["lane"]>;
  order: number;
} {
  const layouts = [
    { slot: "5a.1", lane: "upper", order: 1 },
    { slot: "5b.1", lane: "lower", order: 1 },
    { slot: "5a.2", lane: "upper", order: 2 },
    { slot: "5b.2", lane: "lower", order: 2 },
    { slot: "5c.1", lane: "middle", order: 1 },
    { slot: "5c.2", lane: "middle", order: 2 },
  ] as const;
  return layouts[index] ?? layouts[layouts.length - 1];
}

function destinationNode(
  id: string,
  kind: "mystery" | "quest" | "boss",
  label: string,
  slot: NonNullable<AdventureBoardNode["slot"]>,
  lockReason: string,
  evidenceRole: AdventureBoardNode["evidenceRole"],
): AdventureBoardNode {
  const choiceSetId = kind === "mystery" ? `${id}-options` : undefined;
  return {
    id,
    kind,
    activityId: kind,
    label,
    shortLabel: shortBoardLabel(label),
    state: "locked",
    evidenceRole,
    slot,
    thumbnailUrl: `/images/activity-thumbnails/${kind}.png`,
    layout: {
      role: kind,
      lane: "main",
      order: Number(slot),
    },
    lock: {
      reason: lockReason,
      label: "Locked",
    },
    choiceSetId,
    action: kind === "mystery"
      ? { type: "open-choice-set", payloadId: choiceSetId! }
      : { type: "show-locked-reason", payloadId: id },
  };
}

function mysteryChoiceSet(nodeId: string): NonNullable<AdventureBoardJson["choiceSets"]>[number] {
  return {
    id: `${nodeId}-options`,
    kind: "mystery",
    title: "Pick a mystery challenge",
    options: [
      {
        id: `${nodeId}-story`,
        label: "Story Challenge",
        description: "Try a story-flavored challenge after the evidence route.",
        icon: "book-open",
        state: "available",
        nodeId,
        choiceSignal: {
          algorithmFeed: "choicePolicy",
          traits: ["story"],
          expectedEvidence: "Whether story framing helps the child re-enter effort.",
          preferenceNotMastery: true,
        },
      },
      {
        id: `${nodeId}-speed`,
        label: "Speed Challenge",
        description: "Try a fast challenge after the evidence route.",
        icon: "timer",
        state: "available",
        nodeId,
        choiceSignal: {
          algorithmFeed: "choicePolicy",
          traits: ["speed"],
          expectedEvidence: "Whether speed framing helps the child persist after baseline work.",
          preferenceNotMastery: true,
        },
      },
    ],
  };
}

function routeChoiceOption(
  route: AssignmentPrescriptionActivity,
  nodeId: string,
  index: number,
): AdventureChoiceOption {
  return {
    id: `choice_${route.id}`,
    label: route.label,
    description: route.reason,
    icon: index === 0 ? "mic" : "target",
    state: "available",
    nodeId,
    tags: [route.activityId, route.targetGroupId, route.childHook ?? "choice"],
    choiceSignal: {
      algorithmFeed: "choicePolicy",
      traits: [route.childHook ?? route.activityId],
      expectedEvidence: route.reason,
      preferenceNotMastery: true,
    },
  };
}

function buildPlannedMeasurements(prescription: AssignmentPlanPrescription): PlannedMeasurement[] {
  return [
    prescription.baseline,
    ...prescription.agencyRoutes,
    ...(prescription.supportPath ? [prescription.supportPath] : []),
  ].map((ref) => ({
    id: `measure-${ref.id}`,
    activityId: ref.activityId,
    target: ref.targetGroupId,
    evidenceType: "target_level_activity_evidence",
    supportCriteria: "Use support path when misses, retries, skips, or pacing show unresolved struggle.",
    reviseCriteria: "Change route or scaffold when route evidence conflicts with baseline.",
    falsifyCriteria: "Do not advance to boss when quest evidence fails to transfer.",
  }));
}

function mustTargetGroup(
  targetGroups: Map<string, AssignmentPrescriptionTargetGroup>,
  targetGroupId: string,
): AssignmentPrescriptionTargetGroup {
  const targetGroup = targetGroups.get(targetGroupId);
  if (!targetGroup) throw new Error(`Missing target group ${targetGroupId}`);
  return targetGroup;
}

function allTargets(prescription: AssignmentPlanPrescription): string[] {
  return unique(prescription.targetGroups.flatMap((group) => group.targets));
}

function hypothesisTargets(
  prescription: AssignmentPlanPrescription,
  targetGroupIds: string[] | undefined,
): string[] {
  if (!targetGroupIds?.length) return allTargets(prescription);
  const groups = new Map(prescription.targetGroups.map((group) => [group.id, group]));
  return unique(targetGroupIds.flatMap((id) => groups.get(id)?.targets ?? []));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function shortBoardLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length <= 18) return trimmed;
  const firstWords = trimmed.split(/\s+/).filter(Boolean);
  let out = "";
  for (const word of firstWords) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > 18) break;
    out = next;
  }
  return out || trimmed.slice(0, 18);
}

export function assignmentPrescriptionActivityIdsSchemaValues(
  catalog = buildPlannerActivityCatalog(),
): [string, ...string[]] {
  const values = plannerLaunchableActivityIds(catalog);
  if (values.length === 0) throw new Error("Planner activity catalog has no launchable interventions.");
  return values as [string, ...string[]];
}
