import type { LearningCycleRecordV2, LearningObservation } from "./learningCycleRepository";
import { isFirstTryOnHerOwn } from "./sessionTimeline";

/**
 * "Can she do it alone on paper?" (owner 2026-11-16). At each decision the Planner may give, per concept, the chance
 * she gets it right alone on paper now. The judgment is the Planner's; code only scores it. A parent tags each paper
 * item with its concept (`concept` in the upload), and each call is scored against her next paper done alone after
 * it: a school test, or a home check a parent recorded as done alone. Paper done with help never scores a call.
 * Across calls, code checks whether a higher chance goes with a better result (a monotonic relationship, measured by
 * Spearman's rank correlation): if not, the Planner's numbers rank nothing yet and nobody should trust them.
 */
export type PaperReadinessCall = { concept: string; chance: number; why: string; proof: string;
  /** Her problems or words the Planner counts in this concept; code locks the arithmetic guess from them. */
  items?: string[];
  /** Plain arithmetic's guess, locked with the call: her last first tries on her own on those items, smoothed. */
  baseline?: { chance: number; right: number; tries: number } };

export type ScoredReadyCall = PaperReadinessCall & {
  decisionId: string;
  decidedAt: string;
  paper?: { sourceId: string; kind: "school_test" | "home_check"; observedAt: string; right: number; total: number; share: number };
};

/** A ready call this high is news for the parent: give her the paper. */
export const READY_CHANCE = 0.8;
/** Below this many scored calls the rank correlation says nothing. */
export const MIN_CALIBRATION_PAIRS = 5;

export const conceptKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
export const paperConceptId = (name: string) => `concept:${conceptKey(name)}`;

const doneAlone = (row: LearningObservation): "school_test" | "home_check" | null =>
  row.provenance === "graded_work" ? "school_test"
  : row.provenance === "delayed_reassessment" && row.assistance?.status === "unassisted" ? "home_check" : null;

type Decision = LearningCycleRecordV2["decisionHistory"][number] & { readyOnPaper?: PaperReadinessCall[] };

export function scoreReadyCalls(cycle: LearningCycleRecordV2): ScoredReadyCall[] {
  const paper = (cycle.observations ?? []).filter(row => typeof row.result?.correct === "boolean" && doneAlone(row))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  return ((cycle.decisionHistory ?? []) as Decision[]).filter(row => row.eventType === "theory_decided" && row.readyOnPaper?.length).flatMap(decision =>
    decision.readyOnPaper!.map(call => {
      const key = conceptKey(call.concept);
      const after = paper.filter(row => Date.parse(row.observedAt) > Date.parse(decision.createdAt)
        && row.constructLinks?.some(link => link.constructId.startsWith("concept:") && conceptKey(link.constructId.slice("concept:".length)) === key));
      const first = after[0];
      const rows = first ? after.filter(row => row.sourceId === first.sourceId) : [];
      const right = rows.filter(row => row.result.correct === true).length;
      return { ...call, decisionId: decision.decisionId, decidedAt: decision.createdAt,
        ...(first ? { paper: { sourceId: first.sourceId, kind: doneAlone(first)!, observedAt: first.observedAt, right, total: rows.length, share: right / rows.length } } : {}) };
    }));
}

/** Ready calls (chance >= 0.8) from the latest decision that no paper done alone has checked yet: what to tell the parent. */
export function readyNow(cycle: LearningCycleRecordV2): ScoredReadyCall[] {
  const scored = scoreReadyCalls(cycle);
  const latest = scored.at(-1)?.decisionId;
  return scored.filter(row => row.decisionId === latest && row.chance >= READY_CHANCE && !row.paper);
}

/** Spearman's rank correlation (ties get their average rank); null when either side has no spread. */
export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const ranks = (values: number[]) => {
    const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    const out = new Array<number>(values.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && order[j + 1].value === order[i].value) j++;
      for (let k = i; k <= j; k++) out[order[k].index] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return out;
  };
  const rx = ranks(xs), ry = ranks(ys);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const mx = mean(rx), my = mean(ry);
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < rx.length; i++) { cov += (rx[i] - mx) * (ry[i] - my); vx += (rx[i] - mx) ** 2; vy += (ry[i] - my) ** 2; }
  return vx && vy ? cov / Math.sqrt(vx * vy) : null;
}

/** Her last 10 first tries on her own in Sunny on these items before `at`, smoothed so one answer never reads as
 * certainty: (right + 1) / (tries + 2). Spelling items count by their word. Paper is what this guesses, so it is left out. */
export function baselineChance(cycle: LearningCycleRecordV2, itemIds: string[], at: string): { chance: number; right: number; tries: number } | undefined {
  if (!itemIds.length) return undefined;
  const wordOf = new Map<string, string>();
  for (const node of cycle.nodes ?? []) for (const item of Object.values(node.evidenceContract?.spellingItems ?? {})) if (item.wordId) wordOf.set(item.id, item.wordId);
  const wanted = new Set(itemIds);
  const rows = (cycle.observations ?? []).filter(row => typeof row.result?.correct === "boolean" && isFirstTryOnHerOwn(row) && !doneAlone(row)
    && Date.parse(row.observedAt) < Date.parse(at) && (wanted.has(row.itemId) || wanted.has(wordOf.get(row.itemId) ?? "")))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)).slice(-10);
  const right = rows.filter(row => row.result.correct === true).length;
  return { chance: Math.round(((right + 1) / (rows.length + 2)) * 1000) / 1000, right, tries: rows.length };
}

type Pair = { chance: number; share: number };
export type Calibration = { pairs: Pair[]; rho: number | null; enough: boolean; meanChance?: number; meanShare?: number;
  /** Average chance minus average paper result: above 0 is too optimistic. */ gap?: number;
  /** Average distance between each chance and its paper result. */ meanError?: number };

function calibrationOf(pairs: Pair[]): Calibration {
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const stats = pairs.length ? { meanChance: mean(pairs.map(row => row.chance)), meanShare: mean(pairs.map(row => row.share)),
    meanError: mean(pairs.map(row => Math.abs(row.chance - row.share))) } : {};
  return { pairs, rho: spearman(pairs.map(row => row.chance), pairs.map(row => row.share)), enough: pairs.length >= MIN_CALIBRATION_PAIRS,
    ...stats, ...(pairs.length ? { gap: stats.meanChance! - stats.meanShare! } : {}) };
}

/** Chance vs paper result, one pair per concept per paper (the latest call before it), across her assignments: the
 * Planner's, and beside it arithmetic's on the calls that locked one. */
export function readinessCalibration(cycles: LearningCycleRecordV2[]): Calibration & { baseline: Calibration } {
  const latest = new Map<string, ScoredReadyCall>();
  for (const row of cycles.flatMap(scoreReadyCalls)) {
    if (!row.paper) continue;
    const key = `${row.paper.sourceId}|${conceptKey(row.concept)}`;
    const seen = latest.get(key);
    if (!seen || Date.parse(row.decidedAt) >= Date.parse(seen.decidedAt)) latest.set(key, row);
  }
  const rows = [...latest.values()];
  return { ...calibrationOf(rows.map(row => ({ chance: row.chance, share: row.paper!.share }))),
    baseline: calibrationOf(rows.filter(row => row.baseline).map(row => ({ chance: row.baseline!.chance, share: row.paper!.share }))) };
}

/** The Planner's own calls and what paper said, shown back to it with its other calls. */
export function readyOnPaperSection(cycle: LearningCycleRecordV2): string {
  const header = "Your ready-on-paper calls (the chance she gets each concept right alone on paper), checked by code against her next paper done alone:";
  const scored = scoreReadyCalls(cycle);
  if (!scored.length) return `${header}\n- No calls yet. With decide, ready_on_paper gives each concept's chance.`;
  return [header, ...scored.map(row => `- ${row.decidedAt.slice(0, 10)} ${row.concept}: you said ${row.chance}; ${row.paper
    ? `${row.paper.kind === "school_test" ? "school test" : "home check done alone"}: ${row.paper.right} of ${row.paper.total} right`
    : "no paper done alone on it yet"}`)].join("\n");
}

/** The parent's report for one child across her assignments: what is ready for paper now, every call with what paper
 * said, and whether higher chances have gone with better paper results so far. */
export function readyReportLines(childId: string, cycles: LearningCycleRecordV2[]): string[] {
  const lines = [`${childId}: the Planner's ready-on-paper calls`];
  for (const cycle of cycles) {
    const scored = scoreReadyCalls(cycle);
    if (!scored.length) continue;
    const ready = readyNow(cycle);
    lines.push("", `${cycle.homeworkId}:`, ready.length ? `Ready for paper alone: ${ready.map(row => `${row.concept} (${row.chance}; proof: ${row.proof})`).join(", ")}` : "Ready for paper alone: nothing yet",
      ...readyOnPaperSection(cycle).split("\n").slice(1));
  }
  const calibration = readinessCalibration(cycles);
  const { pairs, rho, enough } = calibration;
  const honest = (name: string, row: Calibration) => {
    if (row.gap === undefined) return [];
    const points = Math.round(Math.abs(row.gap) * 100);
    return [`${name}: says ${row.meanChance!.toFixed(2)} on average; she got ${Math.round(row.meanShare! * 100)}% alone on paper: ${points < 5 ? "about right" : `too ${row.gap > 0 ? "optimistic" : "cautious"} by ${points} points`}`];
  };
  lines.push("", ...honest("Planner", calibration), ...honest("Arithmetic", calibration.baseline));
  if (calibration.meanError !== undefined && calibration.baseline.meanError !== undefined) {
    const ai = Math.round(calibration.meanError * 100), plain = Math.round(calibration.baseline.meanError * 100);
    lines.push(ai === plain ? `Closer to her paper so far: a tie (off by ${ai} points per call)` : ai < plain
      ? `Closer to her paper so far: the Planner (off by ${ai} points per call vs arithmetic's ${plain})`
      : `Closer to her paper so far: arithmetic (off by ${plain} points per call vs the Planner's ${ai})`);
  }
  lines.push("", enough && rho !== null
    ? `Monotonic check: ${pairs.length} scored calls; Spearman ${rho.toFixed(2)} (1 = higher chance always did better on paper, 0 = no relationship, below 0 = backwards)`
    : `Monotonic check: ${pairs.length} scored call${pairs.length === 1 ? "" : "s"}; needs ${MIN_CALIBRATION_PAIRS} before it means anything`);
  return lines;
}
