import fs from "fs";
import path from "path";
import type {
  LearningProfile,
  LearningTheoryDecision,
  LearningTheoryDecisionStatus,
} from "../context/schemas/learningProfile";
import { getChildChart } from "../profiles/childChart";
import type { ChildChart } from "../profiles/childChart";
import {
  appendDecisionTrace,
  slimLearningProfileForDoorway,
  writeWaterfallContentCatalog,
  writeWaterfallSessionPlan,
} from "../profiles/chartWaterfall";
import { resolveChildContextDir } from "../utils/contextRoot";
import type { PostSessionTruthPacket } from "./postSessionTruthPacket";

type PersistOptions = { rootDir?: string; now?: Date };

function decisionStatus(
  domain: string,
  packet: PostSessionTruthPacket,
): LearningTheoryDecisionStatus {
  if (domain === "math") return "awaiting_calibration";
  if (packet.contradictions.length || packet.trustworthiness.missingEvidence.length) {
    return "inconclusive";
  }
  if (packet.adaptationDecision.status === "changed") return "revised";
  if (
    packet.adaptationDecision.status === "unchanged" &&
    packet.trustworthiness.trustworthyTargets.length > 0 &&
    packet.trustworthiness.weakTargets.length === 0
  ) {
    return "supported";
  }
  return "inconclusive";
}

function nextAction(status: LearningTheoryDecisionStatus): string {
  if (status === "awaiting_calibration") {
    return "Keep the math theory open and collect delayed reassessment or graded-work calibration before claiming transfer.";
  }
  if (status === "supported") return "Stay course while collecting delayed transfer evidence.";
  if (status === "revised") return "Revise the next intervention from the weak and recovered targets.";
  if (status === "falsified") return "Replace the theory before generating another intervention.";
  return "Collect clearer uncontaminated target evidence before adapting the care plan.";
}

function academicSummary(packet: PostSessionTruthPacket): string[] {
  return [
    `activities=${packet.activityReports.map((row) => row.activityId).join(",") || "none"}`,
    `trustworthy=${packet.trustworthiness.trustworthyTargets.join(",") || "none"}`,
    `weak=${packet.trustworthiness.weakTargets.join(",") || "none"}`,
    `contaminated=${packet.trustworthiness.contaminatedTargets.join(",") || "none"}`,
  ];
}

export function deriveLearningTheoryDecision(
  chart: ChildChart,
  packet: PostSessionTruthPacket,
  opts: PersistOptions = {},
): LearningTheoryDecision | null {
  if (packet.activityReports.length === 0 && packet.targetEvidence.length === 0) return null;
  const plan = chart.activeSessionPlan;
  if (!plan?.planTheory) return null;
  const theoryDecisionId = `theory:${plan.planId}`;
  const prior = chart.learningProfile.learningTheoryDecisions ?? [];
  const theoryVersion = (prior.find((row) => row.theoryDecisionId === theoryDecisionId)?.theoryVersion ?? 0) + 1;
  const status = decisionStatus(plan.domain, packet);
  const homeworkIds = new Set(packet.assignmentSourceSummary.homeworkIds);
  const contentIds = chart.contentCatalog.items
    .filter((item) => !item.homeworkId || homeworkIds.size === 0 || homeworkIds.has(item.homeworkId))
    .map((item) => item.contentId);
  const reason = packet.adaptationDecision.reason.trim();
  return {
    theoryDecisionId,
    theoryId: theoryDecisionId,
    theoryVersion,
    childId: chart.childId,
    planId: plan.planId,
    domain: plan.domain,
    sessionDir: packet.sessionDir,
    hypothesis: plan.planTheory.hypothesis,
    intervention: plan.planTheory.intervention,
    evidenceIds: [
      `session:${path.basename(packet.sessionDir)}`,
      ...packet.targetEvidence.map((row) => `target:${row.target}`),
    ],
    contentIds,
    academicEvidenceSummary: academicSummary(packet),
    companionObservations: packet.companionObservations.map((row) => row.observation),
    status,
    reason: reason || "No explicit adaptation reason was recorded.",
    nextAction: nextAction(status),
    createdAt: (opts.now ?? new Date()).toISOString(),
  };
}

export function buildLearningTheoryDecision(
  childId: string,
  packet: PostSessionTruthPacket,
  opts: PersistOptions = {},
): LearningTheoryDecision | null {
  return deriveLearningTheoryDecision(
    getChildChart(childId, { rootDir: opts.rootDir }),
    packet,
    opts,
  );
}

export function persistLearningTheoryDecision(
  childId: string,
  packet: PostSessionTruthPacket,
  opts: PersistOptions = {},
): LearningTheoryDecision | null {
  const decision = buildLearningTheoryDecision(childId, packet, opts);
  if (!decision) return null;
  const chart = getChildChart(childId, { rootDir: opts.rootDir });
  const prior = chart.learningProfile.learningTheoryDecisions ?? [];
  const nextDecisions = [
    decision,
    ...prior.filter((row) => row.theoryDecisionId !== decision.theoryDecisionId),
  ].slice(0, 100);
  const nextCatalog = chart.contentCatalog.items.map((item) =>
    decision.contentIds.includes(item.contentId) && !item.theoryDecisionId
      ? { ...item, theoryDecisionId: decision.theoryDecisionId }
      : item,
  );
  const nextProfile: LearningProfile = {
    ...chart.learningProfile,
    learningTheoryDecisions: nextDecisions,
    aiContentCatalog: nextCatalog,
    lastUpdated: decision.createdAt,
  };
  const profileFile = path.join(resolveChildContextDir(chart.childId, { rootDir: opts.rootDir }), "learning_profile.json");
  fs.writeFileSync(profileFile, `${JSON.stringify(slimLearningProfileForDoorway(nextProfile), null, 2)}\n`, "utf8");
  writeWaterfallSessionPlan(chart.childId, nextProfile, opts);
  writeWaterfallContentCatalog(chart.childId, nextProfile, opts);
  appendDecisionTrace(chart.childId, {
    traceId: decision.theoryDecisionId,
    eventType: "theory_decision",
    evidenceRead: decision.evidenceIds,
    theoryUsed: decision.hypothesis,
    changeSummary: `${decision.status}: ${decision.nextAction}`,
    reason: decision.reason,
    writesTo: [profileFile, decision.sessionDir],
    createdAt: decision.createdAt,
  }, opts);
  console.log(`🎮 [learning-loop] [theory-decision] child=${chart.childId} status=${decision.status}`);
  return decision;
}
