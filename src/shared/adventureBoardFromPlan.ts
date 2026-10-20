import type { AdventureBoardJson, AdventureBoardWordRadarConfig } from "./adventureBoardJson";
import { renderBoardDefinition, validateBoardDefinition, journeyExecutions, type AdventureBoardDefinition } from "./adventureBoardDefinition";

export interface ActiveSessionPlanBoardNodeSnapshot {
  id: string;
  type: string;
  activityId?: string;
  targets?: string[];
  targetLane?: string;
  thumbnailUrl?: string;
  thumbnailPrompt?: string;
  theoryId?: string;
  experimentId?: string;
  contentId?: string;
  engagementDimensions?: string[];
  engagementHypothesis?: string;
  mechanic?: string;
  theme?: string;
  sfxProfile?: string;
  companionPolicy?: string;
  gameHtmlPath?: string;
  activityConfigPath?: string;
  locked?: boolean;
  title?: string;
  choiceMode?: string;
  masteryUnlockState?: string;
  difficulty?: number;
  wordRadarConfig?: AdventureBoardWordRadarConfig;
}

export interface ActiveSessionPlanLearningRouteSnapshot {
  id: string;
  label: string;
  rationale: string;
  nodeIds: string[];
}

export interface ActiveSessionPlanBoardSnapshot {
  planId: string;
  childId: string;
  domain: string;
  nodePlan: ActiveSessionPlanBoardNodeSnapshot[];
  learningRoutes?: ActiveSessionPlanLearningRouteSnapshot[];
  plannedMeasurements?: Array<{
    id: string;
    activityId?: string;
    spelling?: { finalCheck?: boolean };
  }>;
  adventureBoard?: AdventureBoardJson;
  boardDefinition?: AdventureBoardDefinition;
}

export interface BuildAdventureBoardFromActiveSessionPlanOptions {
  plan: ActiveSessionPlanBoardSnapshot;
  verifiedActivityIds?: readonly string[];
  selections?: Record<string, string>;
  boardId: string;
  theme: AdventureBoardJson["theme"];
  title?: string;
  layout?: AdventureBoardJson["layout"];
  plannerRationale?: AdventureBoardJson["plannerRationale"];
  companion?: AdventureBoardJson["companion"];
  progress?: Partial<AdventureBoardJson["progress"]>;
  labelForNode?: (node: ActiveSessionPlanBoardNodeSnapshot, index: number) => string | undefined;
  thumbnailForNode?: (node: ActiveSessionPlanBoardNodeSnapshot, index: number) => string | undefined;
}

/** Compatibility entry point. It never invents topology from an activity inventory. */
export function buildAdventureBoardFromActiveSessionPlan(options: BuildAdventureBoardFromActiveSessionPlanOptions): AdventureBoardJson {
  const definition = options.plan.boardDefinition;
  if (!definition) {
    if (options.plan.adventureBoard) return structuredClone(options.plan.adventureBoard);
    throw new Error(`board_definition_missing:${options.plan.planId}: Historical inventory is not an authored board. Generate an explicit new board.`);
  }
  const issues = validateBoardDefinition(definition, options.plan.nodePlan.map(node => node.id));
  if (issues.length) throw new Error(`board_definition_invalid:${JSON.stringify(issues)}`);
  return renderBoardDefinition(definition, {
    boardId: options.boardId, planId: options.plan.planId, childId: options.plan.childId,
    domain: options.plan.domain, companion: options.companion,
    completedNodeIds: options.progress?.completedNodeIds, selections: options.selections,
    activities: options.plan.nodePlan.map(node => ({ ...node,
      verified: options.verifiedActivityIds?.includes(node.id) === true,
      state: options.progress?.completedNodeIds?.includes(node.id) ? 'completed' : 'ready',
    })),
  });
}

export const resolveAdventureBoardForActiveSessionPlan = buildAdventureBoardFromActiveSessionPlan;

/** Lossless compatibility projection for callers that still consume route sequences. */
export function getAdventureBoardSelectableRoutes(plan: Pick<ActiveSessionPlanBoardSnapshot, 'boardDefinition' | 'nodePlan' | 'learningRoutes' | 'plannedMeasurements'>): Array<{id:string;nodeIds:string[]}> {
  return plan.boardDefinition ? journeyExecutions(plan.boardDefinition).map(path => ({id:path.id,nodeIds:path.activityNodeIds})) : [];
}
