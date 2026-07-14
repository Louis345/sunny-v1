import type { AdventureMapProfile } from "../context/schemas/learningProfile";
import type { ChildChart } from "./childChart";
import type { CompanionConfig } from "../shared/companionTypes";

export type ChildExperiencePacket = {
  childChart: {
    childId: string;
    identity: ChildChart["identity"];
    companion: {
      id: string;
      displayName: string;
      config: CompanionConfig;
    };
    companionCare: ChildChart["companionCare"];
    economy: ChildChart["economy"];
    adventureMapProfile: AdventureMapProfile;
    learningCycle?: {
      homeworkId: string;
      lifecycle: string;
      revision: number;
    };
  };
  activeSessionPlan: ChildChart["activeSessionPlan"];
};

function projectPlayableHomeworkIdentity(
  plan: ChildChart["activeSessionPlan"],
): ChildChart["activeSessionPlan"] {
  if (!plan?.activeHomeworkId || !plan.nodePlan) return plan;
  const needsProjection = plan.nodePlan.some(
    (node) => node.type === "generated-baseline" && node.gameHtmlPath && node.date !== plan.activeHomeworkId,
  );
  if (!needsProjection) return plan;
  return {
    ...plan,
    nodePlan: plan.nodePlan.map((node) =>
      node.type === "generated-baseline" && node.gameHtmlPath
        ? { ...node, date: plan.activeHomeworkId }
        : node,
    ),
  };
}

export function buildChildExperiencePacket(chart: ChildChart): ChildExperiencePacket {
  const selectedDomain = chart.homework.selectedDomain ?? undefined;
  const legacySelectedDomainPlan = selectedDomain
    ? chart.sessionPlan?.waterfall.activeByDomain[selectedDomain] ??
      (chart as ChildChart & { activeSessionPlanByDomain?: Record<string, ChildChart["activeSessionPlan"]> })
        .activeSessionPlanByDomain?.[selectedDomain]
    : undefined;
  const selectedPlan = chart.learningCycle
    ? chart.activeSessionPlan
    : legacySelectedDomainPlan ?? chart.activeSessionPlan;
  return {
    childChart: {
      childId: chart.childId,
      identity: chart.identity,
      companion: {
        id: chart.companion.presetId,
        displayName: chart.companion.displayName,
        config: chart.companion.config,
      },
      companionCare: chart.companionCare,
      economy: chart.economy,
      adventureMapProfile: chart.adventureMapProfile,
      learningCycle: chart.learningCycle
        ? {
            homeworkId: chart.learningCycle.homeworkId,
            lifecycle: chart.learningCycle.lifecycle,
            revision: chart.learningCycle.revision,
          }
        : undefined,
    },
    activeSessionPlan: projectPlayableHomeworkIdentity(selectedPlan),
  };
}
