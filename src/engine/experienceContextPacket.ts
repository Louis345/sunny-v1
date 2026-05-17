import crypto from "crypto";
import type {
  ActiveSessionPlan,
  PlanTheory,
  PlannedMeasurement,
} from "../context/schemas/learningProfile";
import type { ExperiencePlannerInput } from "./experiencePlanner";

export type ExperienceContextPacketAudience = "psychologist" | "quest" | "boss";

export type ExperienceContextPacketView = {
  audience: ExperienceContextPacketAudience;
  childId: string;
  sourcePacketId?: string;
  homeworkGoal: ExperiencePlannerInput["homeworkGoal"];
  algorithmFeeds: ExperiencePlannerInput["learningContext"]["algorithmFeeds"];
  diagnostics: ExperiencePlannerInput["learningContext"]["diagnostics"];
  contentCatalog: ExperiencePlannerInput["learningContext"]["contentCatalog"];
  activityCards: ExperiencePlannerInput["activityCards"];
  engagementSummary: string[];
  traitSignalSummary: ExperiencePlannerInput["traitSignalSummary"];
  calibrationSummary: string[];
  companionConversationAudit: ExperiencePlannerInput["companionConversationAudit"];
  previousSessionPerformance: {
    activeSessionPlan: ExperiencePlannerInput["learningContext"]["chart"]["activeSessionPlan"];
    activityModel: ExperiencePlannerInput["chart"]["learningProfile"]["activityModel"];
    adaptiveLoadState: ExperiencePlannerInput["chart"]["learningProfile"]["adaptiveLoadState"];
  };
  carePlanTheory?: PlanTheory;
  plannedMeasurements: PlannedMeasurement[];
  evidenceUsed: ActiveSessionPlan["evidenceUsed"];
  roleInstruction: string;
};

export type ExperienceContextPacket = {
  packetId: string;
  createdAt: string;
  psychologist: ExperienceContextPacketView;
  quest: ExperienceContextPacketView;
  boss: ExperienceContextPacketView;
};

function stablePacketId(input: ExperiencePlannerInput, plan: ActiveSessionPlan): string {
  return crypto
    .createHash("sha1")
    .update([
      input.childId,
      input.homeworkGoal?.homeworkId ?? "no-homework",
      plan.planId,
      plan.createdAt,
    ].join("|"))
    .digest("hex")
    .slice(0, 12);
}

function baseView(
  input: ExperiencePlannerInput,
  plan: ActiveSessionPlan,
  audience: ExperienceContextPacketAudience,
  roleInstruction: string,
  sourcePacketId?: string,
): ExperienceContextPacketView {
  return {
    audience,
    childId: input.childId,
    ...(sourcePacketId ? { sourcePacketId } : {}),
    homeworkGoal: input.homeworkGoal,
    algorithmFeeds: input.learningContext.algorithmFeeds,
    diagnostics: input.learningContext.diagnostics,
    contentCatalog: input.learningContext.contentCatalog,
    activityCards: input.activityCards,
    engagementSummary: input.engagementSummary,
    traitSignalSummary: input.traitSignalSummary,
    calibrationSummary: input.calibrationSummary,
    companionConversationAudit: input.companionConversationAudit,
    previousSessionPerformance: {
      activeSessionPlan: input.learningContext.chart.activeSessionPlan,
      activityModel: input.chart.learningProfile.activityModel,
      adaptiveLoadState: input.chart.learningProfile.adaptiveLoadState,
    },
    ...(plan.planTheory ? { carePlanTheory: plan.planTheory } : {}),
    plannedMeasurements: plan.plannedMeasurements ?? [],
    evidenceUsed: plan.evidenceUsed,
    roleInstruction,
  };
}

export function buildExperienceContextPacket(
  input: ExperiencePlannerInput,
  plan: ActiveSessionPlan,
  opts: { now?: Date } = {},
): ExperienceContextPacket {
  const packetId = `experience_packet_${stablePacketId(input, plan)}`;
  return {
    packetId,
    createdAt: (opts.now ?? new Date()).toISOString(),
    psychologist: baseView(
      input,
      plan,
      "psychologist",
      "Write the measurable care plan theory and intervention sequence from the chart.",
    ),
    quest: baseView(
      input,
      plan,
      "quest",
      "Generate a playable intervention that tests the psychologist care-plan theory after baseline evidence exists.",
      packetId,
    ),
    boss: baseView(
      input,
      plan,
      "boss",
      "Generate the mastery-gated finale only after quest evidence supports readiness.",
      packetId,
    ),
  };
}
