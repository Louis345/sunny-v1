import type { AdventureMapProfile } from "../context/schemas/learningProfile";
import type { ChildChart } from "./childChart";
import type { CompanionConfig } from "../shared/companionTypes";
import { readChoiceEvents } from "../engine/choiceEvents";

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

function projectRecordedCompletions(
  chart: ChildChart,
  plan: ChildChart["activeSessionPlan"],
): ChildChart["activeSessionPlan"] {
  if (!plan?.adventureBoard) return plan;
  const completedNodeIds = new Set(
    readChoiceEvents(chart.childId, { rootDir: chart.rootDir })
      .filter((event) =>
        event.sessionId === plan.planId &&
        event.completed === true &&
        event.postActivityAction !== "abandon" &&
        Boolean(event.nodeId),
      )
      .map((event) => event.nodeId as string),
  );
  if (completedNodeIds.size === 0) return plan;
  for (const nodeId of plan.adventureBoard.progress?.completedNodeIds ?? []) {
    completedNodeIds.add(nodeId);
  }
  return {
    ...plan,
    adventureBoard: {
      ...plan.adventureBoard,
      nodes: plan.adventureBoard.nodes.map((node) =>
        completedNodeIds.has(node.id) && node.state !== "locked" && node.state !== "hidden"
          ? { ...node, state: "completed" }
          : node,
      ),
      progress: {
        ...plan.adventureBoard.progress,
        completedNodeIds: [...completedNodeIds],
      },
    },
  };
}

function conciseRouteDescription(value: string | undefined): string | undefined {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length <= 120) return normalized || undefined;
  const sentence = normalized.match(/^.{1,117}(?:[.!?](?:\s|$)|\s)/)?.[0]?.trim();
  return `${(sentence ?? normalized.slice(0, 117)).replace(/[\s,;:.-]+$/, "")}...`;
}

function projectCanonicalAgencyChoice(
  chart: ChildChart,
  plan: ChildChart["activeSessionPlan"],
): ChildChart["activeSessionPlan"] {
  const cycle = chart.learningCycle;
  const experiment = cycle?.agencyExperiment;
  const board = plan?.adventureBoard;
  if (!plan?.activeHomeworkId || !board || !experiment || experiment.routes.length < 2) return plan;

  const cycleNodeState = new Map(cycle.nodes.map((node) => [node.nodeId, node.state]));
  const completedNodeIds = new Set(
    cycle.nodes.filter((node) => node.state === "completed").map((node) => node.nodeId),
  );
  const firstIncompleteShared = experiment.sharedNodeIds.find((nodeId) => !completedNodeIds.has(nodeId));
  const sharedComplete = firstIncompleteShared === undefined;
  const selectedRoute = experiment.routes.find((route) => route.routeId === cycle.routeSelection?.selectedRouteId);
  const firstIncompleteSelected = selectedRoute?.nodeIds.find((nodeId) => !completedNodeIds.has(nodeId));
  const selectedRouteComplete = Boolean(selectedRoute) && firstIncompleteSelected === undefined;
  const routeByNodeId = new Map(experiment.routes.flatMap((route) =>
    route.nodeIds.map((nodeId) => [nodeId, route.routeId] as const)));
  const agencyNodeIds = new Set([...experiment.sharedNodeIds, ...routeByNodeId.keys()]);
  const launchableNodeId = firstIncompleteShared ?? firstIncompleteSelected;
  const previewUrl = (nodeId: string) =>
    `/generated/direct-math/${plan.activeHomeworkId}-previews/${nodeId}-opening.png`;

  const nodes = board.nodes.map((node) => {
    if (experiment.sharedNodeIds.includes(node.id)) {
      const state = completedNodeIds.has(node.id)
        ? "completed"
        : node.id === firstIncompleteShared
          ? "current"
          : "locked";
      return { ...node, state };
    }
    if (node.kind === "choice-gate") {
      return {
        ...node,
        label: cycle.routeSelection ? "Change Path" : "Choose Path",
        shortLabel: cycle.routeSelection ? "Change Path" : "Choose Path",
        state: selectedRouteComplete ? "hidden" : sharedComplete ? "current" : "locked",
      };
    }
    const routeId = routeByNodeId.get(node.id);
    if (routeId) {
      const state = completedNodeIds.has(node.id)
        ? "completed"
        : routeId === selectedRoute?.routeId && node.id === firstIncompleteSelected
          ? "current"
          : "locked";
      return { ...node, state, thumbnailUrl: previewUrl(node.id) };
    }
    const canonicalState = cycleNodeState.get(node.id);
    if (canonicalState === "completed") return { ...node, state: "completed" as const };
    if (canonicalState === "locked" || canonicalState === "generating" || canonicalState === "blocked") {
      return { ...node, state: "locked" as const };
    }
    return node;
  });

  const choiceSets = board.choiceSets?.map((choiceSet) => {
    if (choiceSet.kind !== "baseline-route") return choiceSet;
    return {
      ...choiceSet,
      title: "Choose your path",
      options: choiceSet.options.map((option) => ({
        ...option,
        description: conciseRouteDescription(option.description),
        thumbnailUrl: option.nodeId ? previewUrl(option.nodeId) : option.thumbnailUrl,
        state: sharedComplete && !selectedRouteComplete ? "available" as const : "locked" as const,
      })),
    };
  });

  return {
    ...plan,
    nodePlan: plan.nodePlan.map((node) => agencyNodeIds.has(node.id)
      ? { ...node, locked: !completedNodeIds.has(node.id) && node.id !== launchableNodeId }
      : node),
    adventureBoard: {
      ...board,
      layout: { ...board.layout, routeChoiceBehavior: "exclusive" },
      nodes,
      choiceSets,
      progress: {
        ...board.progress,
        completedNodeIds: [...new Set([...(board.progress?.completedNodeIds ?? []), ...completedNodeIds])],
        currentNodeId: firstIncompleteShared ?? firstIncompleteSelected,
        ...(!selectedRouteComplete && sharedComplete ? { activeChoiceSetId: choiceSets?.find((set) => set.kind === "baseline-route")?.id } : {}),
      },
    },
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
    activeSessionPlan: projectCanonicalAgencyChoice(
      chart,
      projectRecordedCompletions(
        chart,
        projectPlayableHomeworkIdentity(selectedPlan),
      ),
    ),
  };
}
