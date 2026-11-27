import type { AdventureMapProfile } from "../context/schemas/learningProfile";
import type { ChildChart } from "./childChart";
import type { CompanionConfig } from "../shared/companionTypes";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
import { isSpellingPracticeContinuation, presentedSpellingItems, type LearningCycleNodeContract } from "../engine/learningCycleRepository";
import { readChoiceEvents } from "../engine/choiceEvents";

/**
 * A math stop's problems as its game receives them at play time: what she sees, her choices, and the answer, so the
 * game can tell her right or wrong and can come back later with new problems (owner 2026-11-24). Code scores her.
 */
export function mathItemBindings(node: LearningCycleNodeContract) {
  return Object.values(node.evidenceContract?.itemContracts ?? {}).map(item => {
    const response = item.response;
    if (response.mode === "selection") return { itemId: item.id, display: item.prompt, options: response.options.map(option => ({ id: option.id, label: option.label })),
      answer: response.options.filter(option => option.correct).map(option => option.id).join(" or ") };
    if (response.mode === "numeric") return { itemId: item.id, display: item.prompt, answer: `${response.expected}${response.unit ? ` ${response.unit}` : ""}` };
    return { itemId: item.id, display: item.prompt };
  });
}

export type ChildExperiencePacket = {
  /** Stops left before this board ends and earns the FaceTime call (owner, 2026-11-07). Display only. */
  boardProgress?: { stopsLeft: number };
  spellingEvaluationResults?: Array<{ display: string; correct?: boolean; typed?: string }>;
  /** Her first try at each word, and her latest try without help; a word with no such try has no `correct`. */
  spellingBoardResults?: Array<{ display: string; firstTry?: boolean; correct?: boolean; typed?: string }>;
  /** Per math board: each problem she answered, shown as her answer and read aloud as the problem (owner 2026-11-12). */
  /** helped: her final answer came with a hint or Elli's help (shown honestly; never counted as on her own). */
  mathBoardResults?: Record<string, Array<{ display: string; spoken: string; firstTry?: boolean; correct?: boolean; helped?: true; own?: true }>>;
  spellingDiscovery?: { nodeId: string; items: Array<{ itemId: string; display: string; acceptedResponses: string[]; label: string; subject: string }> };
  spellingInstruments?: Record<string, { assessment: boolean; items: NonNullable<ChildExperiencePacket["spellingDiscovery"]>["items"] }>;
  /** Each built game's items to open through the contract's openItem, per stop (display = the item as she sees it). */
  itemBindings?: Record<string, ReturnType<typeof mathItemBindings>>;
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
    /** How loud and bright game sound is for her; the kiosk hands it to gameSfx. */
    sensory?: ChildChart["sensory"];
    adventureMapProfile: AdventureMapProfile;
    learningCycle?: {
      homeworkId: string;
      lifecycle: string;
      revision: number;
      boardKind?: "probe" | "teaching" | "successor" | "legacy";
      boardPublishedAt?: string | null;
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
  const authoredLead = normalized.split(/\s+[—–]\s+/, 1)[0]?.trim();
  if (authoredLead && authoredLead.length >= 32) return authoredLead;
  if (!normalized || normalized.length <= 120) return normalized || undefined;
  const sentence = normalized.match(/^.{1,117}(?:[.!?](?:\s|$)|\s)/)?.[0]?.trim();
  return `${(sentence ?? normalized.slice(0, 117)).replace(/[\s,;:.-]+$/, "")}...`;
}

function projectCanonicalAgencyChoice(
  chart: ChildChart,
  plan: ChildChart["activeSessionPlan"],
): ChildChart["activeSessionPlan"] {
  const cycle = chart.learningCycle;
  if (plan?.boardDefinition) return plan;
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
  const isLaunchable = (nodeId: string | undefined) => {
    const state = nodeId ? cycleNodeState.get(nodeId) : undefined;
    return state === "ready" || state === "active";
  };
  const launchableNodeId = firstIncompleteShared
    ? (isLaunchable(firstIncompleteShared) ? firstIncompleteShared : undefined)
    : (isLaunchable(firstIncompleteSelected) ? firstIncompleteSelected : undefined);
  const previewUrl = (nodeId: string) =>
    `/generated/direct-math/${plan.activeHomeworkId}-previews/${nodeId}-opening.png`;

  const nodes: AdventureBoardJson["nodes"] = board.nodes.map((node) => {
    if (experiment.sharedNodeIds.includes(node.id)) {
      const state: AdventureBoardJson["nodes"][number]["state"] = completedNodeIds.has(node.id)
        ? "completed"
        : node.id === launchableNodeId
          ? "current"
          : node.state === "preview"
            ? "preview"
            : "locked";
      return { ...node, state };
    }
    if (node.kind === "choice-gate") {
      return {
        ...node,
        label: cycle.routeSelection ? "Change Path" : "Choose Path",
        shortLabel: cycle.routeSelection ? "Change Path" : "Choose Path",
        state: (selectedRouteComplete ? "hidden" : sharedComplete ? "current" : "locked") as AdventureBoardJson["nodes"][number]["state"],
      };
    }
    const routeId = routeByNodeId.get(node.id);
    if (routeId) {
      const state: AdventureBoardJson["nodes"][number]["state"] = completedNodeIds.has(node.id)
        ? "completed"
        : routeId === selectedRoute?.routeId && node.id === launchableNodeId
          ? "current"
          : node.state === "preview"
            ? "preview"
            : "locked";
      return { ...node, state, thumbnailUrl: node.thumbnailUrl ?? previewUrl(node.id) };
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
        thumbnailUrl: option.thumbnailUrl ?? (option.nodeId ? previewUrl(option.nodeId) : undefined),
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
      layout: {
        ...board.layout,
        preset: board.layout?.preset ?? "horizontal-adventure-spine",
        routeChoiceBehavior: "exclusive",
      },
      nodes,
      choiceSets,
      progress: {
        ...board.progress,
        completedNodeIds: [...new Set([...(board.progress?.completedNodeIds ?? []), ...completedNodeIds])],
        currentNodeId: launchableNodeId,
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
  const spellingEvaluation = chart.learningCycle?.domain === "spelling" && ["evaluation_ready", "evaluation_active"].includes(chart.learningCycle.lifecycle)
    ? chart.learningCycle.nodes.find(node => node.role === "evaluation" && node.evidenceContract.spellingItems)
    : undefined;
  const answered = new Set(spellingEvaluation ? chart.learningCycle!.observations.map(observation => observation.itemId) : []);
  const spellingInstruments = chart.learningCycle?.domain === "spelling" ? Object.fromEntries(chart.learningCycle.nodes.flatMap(node => {
    const items = presentedSpellingItems(node);
    if (!items.length) return [];
    const assessment = node.state !== "completed" && !isSpellingPracticeContinuation(chart.learningCycle!) && (node.role === "evaluation" || items.every(item => item.lineage.measurementRole === "fresh_checkpoint"));
    const captured = new Set(chart.learningCycle!.observations.map(row => row.itemId));
    return [[node.nodeId, { assessment, items: items.filter(item => !assessment || node.state === "completed" || !captured.has(item.id)).map(item => ({ itemId: item.id, display: item.word, acceptedResponses: item.response.acceptedForms, label: "Spelling", subject: "spelling" })) }]];
  })) : undefined;
  const itemBindings = chart.learningCycle && chart.learningCycle.domain !== "spelling" ? Object.fromEntries((chart.learningCycle.nodes ?? []).flatMap(node => {
    const items = mathItemBindings(node);
    return node.implementationType === "generated-game" && items.length ? [[node.nodeId, items]] : [];
  })) : undefined;
  const spellingEvaluationResults = chart.learningCycle?.domain === "spelling"
    && !["evaluation_ready", "evaluation_active"].includes(chart.learningCycle.lifecycle)
    ? chart.learningCycle.nodes.filter(node => node.role === "evaluation").flatMap(node =>
      Object.values(node.evidenceContract.spellingItems ?? {}).map(item => {
        const observation = chart.learningCycle!.observations.find(row => row.itemId === item.id && row.sourceId === `evaluation:${node.nodeId}`);
        return { display: item.word, ...(typeof observation?.result.correct === "boolean" ? { correct: observation.result.correct } : {}), ...missedSpelling(observation) };
      }))
    : undefined;
  const spellingBoardResults = spellingEvaluationResults?.length ? chart.learningCycle!.nodes.filter(node => node.role === "evaluation").flatMap(node =>
    Object.values(node.evidenceContract.spellingItems ?? {}).map(item => {
      const first = chart.learningCycle!.observations.find(row => row.itemId === item.id && row.sourceId === `evaluation:${node.nodeId}`);
      const construct = first?.constructLinks?.[0]?.constructId;
      const latest = construct ? chart.learningCycle!.observations.filter(row => !row.sourceId.startsWith("evaluation:")
        && row.assistance?.status === "unassisted" && row.constructLinks?.some(link => link.constructId === construct)).at(-1) : undefined;
      return { display: item.word, ...(typeof first?.result.correct === "boolean" ? { firstTry: first.result.correct } : {}), ...(typeof latest?.result.correct === "boolean" ? { correct: latest.result.correct } : {}), ...missedSpelling(latest) };
    })) : undefined;
  // The screen shows her final answer, right or still wrong, and says when she had help (2026-11-15: a fixed answer
  // showed as a cross and a helped one as blank). Her learning record is unchanged: help is never "on her own".
  const mathCycle = chart.learningCycle?.domain === "math" ? chart.learningCycle : null;
  const mathBoardResults = mathCycle ? Object.fromEntries((mathCycle.boards ?? []).map(board => {
    const nodeIds = (board as { nodeIds?: string[] }).nodeIds ?? [];
    const rows = mathCycle.nodes.filter(node => nodeIds.includes(node.nodeId)).flatMap(node =>
      Object.values(node.evidenceContract?.itemContracts ?? {}).flatMap(item => {
        const seen = mathCycle.observations.filter(row => row.itemId === item.id && row.sourceId.endsWith(`:${node.nodeId}`));
        if (!seen.length) return [];
        const final = seen.at(-1)!;
        return [{ display: String(final.childResponse ?? "?"), spoken: item.prompt,
          ...(typeof seen[0].result.correct === "boolean" ? { firstTry: seen[0].result.correct } : {}),
          ...(typeof final.result.correct === "boolean" ? { correct: final.result.correct } : {}),
          ...(final.assistance?.status === "assisted" ? { helped: true as const } : {}),
          // On her own: her very first answer was right, with no help (the report card's first group).
          ...(seen[0].result.correct === true && seen[0].assistance?.status === "unassisted" ? { own: true as const } : {}) }];
      }));
    return [board.boardId, rows] as const;
  }).filter(([, rows]) => rows.length)) : {};
  return {
    ...(Object.keys(mathBoardResults).length ? { mathBoardResults } : {}),
    ...(spellingEvaluationResults?.length ? { spellingEvaluationResults } : {}),
    ...(spellingBoardResults?.length ? { spellingBoardResults } : {}),
    ...(spellingInstruments ? { spellingInstruments } : {}),
    ...(itemBindings && Object.keys(itemBindings).length ? { itemBindings } : {}),
    ...(spellingEvaluation ? { spellingDiscovery: { nodeId: spellingEvaluation.nodeId, items: presentedSpellingItems(spellingEvaluation).filter(item => !answered.has(item.id)).map(item => ({ itemId: item.id, display: item.word, acceptedResponses: item.response.acceptedForms, label: "Spelling", subject: "spelling" })) } } : {}),
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
      sensory: chart.sensory,
      adventureMapProfile: chart.adventureMapProfile,
      learningCycle: chart.learningCycle
        ? {
            homeworkId: chart.learningCycle.homeworkId,
            lifecycle: chart.learningCycle.lifecycle,
            revision: chart.learningCycle.revision,
            boardKind: chart.learningCycle.boards?.find(board => board.boardId === selectedPlan?.adventureBoard?.boardId)?.kind,
            // When the board on screen was published: an earned call is offered only for the board just finished.
            boardPublishedAt: chart.learningCycle.boards?.find(board => board.boardId === selectedPlan?.adventureBoard?.boardId)?.publishedAt ?? null,
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

/** What she typed for a word she missed, so the screen shows her spelling with the cross (BUGS.md S23). */
function missedSpelling(observation: { childResponse?: unknown; result: { correct?: boolean } } | undefined): { typed?: string } {
  return observation?.result.correct === false && typeof observation.childResponse === "string" && observation.childResponse.trim()
    ? { typed: observation.childResponse.trim() } : {};
}
