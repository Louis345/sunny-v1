/**
 * Per-child epsilon-greedy bandit over node types (TASK-005).
 * Reward updates use the `egreedy` package; arm selection uses the same rule with `Math.random` (testable via mock).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EpsilonGreedy = require("egreedy") as new (opts?: Record<string, unknown>) => {
  arms: number;
  epsilon: number;
  counts: number[];
  values: number[];
  reward(arm: number, value: number): Promise<unknown>;
  serialize(): Promise<{
    arms: number;
    epsilon: number;
    counts: number[];
    values: number[];
  }>;
};

import type { LearningProfile } from "../context/schemas/learningProfile";
import type { NodeType } from "../shared/adventureTypes";
import { ALL_NODE_TYPES } from "../shared/adventureTypes";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";

const N = ALL_NODE_TYPES.length;

function armIndex(t: NodeType): number {
  const i = ALL_NODE_TYPES.indexOf(t);
  return i >= 0 ? i : 0;
}

function epsilonFromProfile(lp: LearningProfile): number {
  const sessions = lp.sessionStats?.totalSessions ?? 0;
  return sessions < 10 ? 0.3 : 0.1;
}

function makeAlgo(
  epsilon: number,
  lp: LearningProfile | null,
): InstanceType<typeof EpsilonGreedy> {
  const bs = lp?.banditState;
  if (bs && bs.counts.length === N && bs.values.length === N) {
    return new EpsilonGreedy({
      arms: N,
      epsilon,
      counts: bs.counts,
      values: bs.values,
    });
  }
  return new EpsilonGreedy({ arms: N, epsilon });
}

export function rewardValue(
  liked: boolean,
  completed: boolean,
  accuracy: number,
): number {
  const a = Math.min(1, Math.max(0, accuracy));
  return (liked ? 0.5 : 0) + (completed ? 0.3 : 0) + a * 0.2;
}

export type BanditState = {
  arms: number;
  counts: number[];
  values: number[];
  epsilon: number;
  sessions: number;
  armOrder: NodeType[];
};

export function getBanditState(childId: string): BanditState {
  const lp = readLearningProfile(childId);
  const eps = lp ? epsilonFromProfile(lp) : 0.3;
  const counts =
    lp?.banditState?.counts?.length === N
      ? [...lp.banditState.counts]
      : Array.from({ length: N }, () => 0);
  const values =
    lp?.banditState?.values?.length === N
      ? [...lp.banditState.values]
      : Array.from({ length: N }, () => 0);
  return {
    arms: N,
    counts,
    values,
    epsilon: eps,
    sessions: lp?.sessionStats?.totalSessions ?? 0,
    armOrder: [...ALL_NODE_TYPES],
  };
}

export async function selectNodeType(
  childId: string,
  availableTypes: NodeType[],
): Promise<NodeType> {
  if (availableTypes.length === 0) {
    throw new TypeError("selectNodeType: availableTypes must be non-empty");
  }
  const lp = readLearningProfile(childId);
  if (!lp) {
    throw new Error(`selectNodeType: unknown child ${childId}`);
  }
  const eps = epsilonFromProfile(lp);
  const algo = makeAlgo(eps, lp) as {
    counts: number[];
    values: number[];
    epsilon: number;
  };
  const availIdx = availableTypes
    .map((t) => armIndex(t))
    .filter((i) => i >= 0);
  const pool = availIdx.length ? availIdx : [armIndex(availableTypes[0])];
  const r = Math.random();
  const totalPulls = pool.reduce((s, i) => s + algo.counts[i], 0);
  let chosen: number;
  if (eps > r || totalPulls === 0) {
    chosen = pool[Math.floor(Math.random() * pool.length)];
  } else {
    chosen = pool.reduce((best, i) =>
      algo.values[i] > algo.values[best] ? i : best,
    pool[0]);
  }
  return ALL_NODE_TYPES[chosen];
}

export async function recordReward(
  childId: string,
  nodeType: NodeType,
  liked: boolean,
  completed: boolean,
  accuracy: number,
): Promise<void> {
  const lp = readLearningProfile(childId);
  if (!lp) {
    throw new Error(`recordReward: unknown child ${childId}`);
  }
  const eps = epsilonFromProfile(lp);
  const algo = makeAlgo(eps, lp);
  const arm = armIndex(nodeType);
  const rv = rewardValue(liked, completed, accuracy);
  await algo.reward(arm, rv);
  const ser = (await algo.serialize()) as { counts: number[]; values: number[] };
  lp.banditState = { counts: ser.counts, values: ser.values };
  writeLearningProfile(childId, lp);
}

export async function resetBandit(childId: string): Promise<void> {
  const lp = readLearningProfile(childId);
  if (!lp) return;
  delete lp.banditState;
  writeLearningProfile(childId, lp);
}
