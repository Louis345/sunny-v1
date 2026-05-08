import {
  evaluateNodeCompletion,
  normalizeEvaluatorTarget,
  type AdaptiveEvaluatorSummary,
  type EvaluatorBucket,
  type EvaluatorNodeTargetResult,
} from "./evaluator/evaluator";

export type TargetedPracticeStatus = "ready" | "no-evidence";

export type TargetedPracticePlan = {
  status: TargetedPracticeStatus;
  sourceNodeId: string;
  sourceNodeType: string;
  nextTargets: string[];
  masteredTargets: string[];
  unattemptedTargets: string[];
  buckets: AdaptiveEvaluatorSummary["buckets"];
  evaluator: AdaptiveEvaluatorSummary;
  reason: string;
};

export type SelectTargetedPracticePlanInput = {
  nodeId: string;
  nodeType: string;
  domain?: string;
  targets?: string[];
  correctWords?: string[];
  missedWords?: string[];
  targetResults?: EvaluatorNodeTargetResult[];
  includeUnattempted?: boolean;
  maxTargets?: number;
};

const CONTINUE_BUCKETS = new Set<EvaluatorBucket>([
  "known_but_slow",
  "fragile",
  "unknown",
]);

function pushUnique(out: string[], value: string): void {
  const normalized = normalizeEvaluatorTarget(value);
  if (!normalized || out.includes(normalized)) return;
  out.push(normalized);
}

function normalizedUnique(values: string[] | undefined): string[] {
  const out: string[] = [];
  for (const value of values ?? []) pushUnique(out, value);
  return out;
}

function rowsFromWordLists(input: SelectTargetedPracticePlanInput): EvaluatorNodeTargetResult[] {
  const rows: EvaluatorNodeTargetResult[] = [];
  for (const word of normalizedUnique(input.correctWords)) {
    rows.push({ target: word, correct: true, attempts: 1 });
  }
  for (const word of normalizedUnique(input.missedWords)) {
    rows.push({ target: word, correct: false, attempts: 1 });
  }
  return rows;
}

function normalizedRows(input: SelectTargetedPracticePlanInput): EvaluatorNodeTargetResult[] {
  const raw = input.targetResults?.length ? input.targetResults : rowsFromWordLists(input);
  return raw
    .map((row) => ({
      ...row,
      target: normalizeEvaluatorTarget(row.target),
    }))
    .filter((row) => row.target);
}

function emptyEvaluator(): AdaptiveEvaluatorSummary {
  return {
    status: "missing",
    confidence: 0,
    summary: "No node-level evaluator evidence was available.",
    evidenceIds: [],
    buckets: {
      mastered_now: [],
      known_but_slow: [],
      fragile: [],
      unknown: [],
    },
    items: [],
  };
}

function itemBucketByTarget(evaluator: AdaptiveEvaluatorSummary): Map<string, EvaluatorBucket> {
  return new Map(evaluator.items.map((item) => [item.target, item.bucket]));
}

export function selectTargetedPracticePlan(
  input: SelectTargetedPracticePlanInput,
): TargetedPracticePlan {
  const rows = normalizedRows(input);
  const attemptedTargets = normalizedUnique(rows.map((row) => row.target));
  const configuredTargets = normalizedUnique(input.targets);
  const targetUniverse = input.includeUnattempted
    ? normalizedUnique([...configuredTargets, ...attemptedTargets])
    : attemptedTargets;
  const unattemptedTargets = configuredTargets.filter(
    (target) => !attemptedTargets.includes(target),
  );

  if (rows.length === 0 || targetUniverse.length === 0) {
    const evaluator = emptyEvaluator();
    return {
      status: "no-evidence",
      sourceNodeId: input.nodeId,
      sourceNodeType: input.nodeType,
      nextTargets: [],
      masteredTargets: [],
      unattemptedTargets,
      buckets: evaluator.buckets,
      evaluator,
      reason: "No per-target evidence was available, so future nodes were left unchanged.",
    };
  }

  const evaluator = evaluateNodeCompletion({
    childId: "session",
    nodeId: input.nodeId,
    nodeType: input.nodeType,
    domain: input.domain,
    targets: targetUniverse,
    targetResults: rows,
  });
  const byTarget = itemBucketByTarget(evaluator);
  const masteredTargets = targetUniverse.filter(
    (target) => byTarget.get(target) === "mastered_now",
  );
  const nextTargets = targetUniverse
    .filter((target) => CONTINUE_BUCKETS.has(byTarget.get(target) ?? "unknown"))
    .slice(0, input.maxTargets);

  return {
    status: "ready",
    sourceNodeId: input.nodeId,
    sourceNodeType: input.nodeType,
    nextTargets,
    masteredTargets,
    unattemptedTargets,
    buckets: evaluator.buckets,
    evaluator,
    reason:
      nextTargets.length > 0
        ? `Continuing ${nextTargets.length} non-mastered target(s); ${masteredTargets.length} mastered target(s) drop out.`
        : `All attempted targets are currently mastered; future practice can skip this set.`,
  };
}
