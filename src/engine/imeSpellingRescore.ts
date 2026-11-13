/**
 * Re-scores saved spelling answers that a Japanese-input keyboard turned into kana (2026-11-10), through the
 * repository's own "observation_rescored" transition: each old answer and result is kept beside the new one.
 * Refuses when a published board's seal no longer matches (reseal through its own approved command first).
 */
import { readTypedSpelling } from "./imeTypedSpelling";
import { scoreSpellingRecall } from "./learningCycleRuntime";
import { getLearningCycle, transitionLatestLearningCycle, type LearningCycleRepositoryOptions, type ObservationRescore } from "./learningCycleRepository";
import { boardTopologyHash } from "./learningBoardInstances";

const KANA_OR_FULL_WIDTH = /[ぁ-ゖァ-ヺー！-～]/;

export type RescoreImeArgs = { childId: string; homeworkId: string; since: string; source: string; dryRun: boolean };

export function parseRescoreImeArgs(argv: string[]): RescoreImeArgs | null {
  const value = (flag: string) => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1]?.trim() : undefined; };
  const childId = value("--child"), homeworkId = value("--homework"), since = value("--since"), source = value("--source");
  if (!childId || !homeworkId || !since || !source || !/^\d{4}-\d{2}-\d{2}T/.test(since) || !Number.isFinite(Date.parse(since))) return null;
  return { childId, homeworkId, since, source, dryRun: argv.includes("--dry-run") };
}

export function rescoreImeSpellingObservations(input: Omit<RescoreImeArgs, "dryRun"> & { dryRun?: boolean }, opts: LearningCycleRepositoryOptions = {}): { rescored: Array<Pick<ObservationRescore, "observationId" | "from" | "to">> } {
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if (cycle.domain !== "spelling") throw new Error(`rescore_not_spelling:${cycle.domain}`);
  const broken = (cycle.boards ?? []).filter(board => board.publishedAt !== null && board.topologyHash !== boardTopologyHash(cycle, board));
  if (broken.length) throw new Error(`learning_board_seal_broken:${broken.map(board => board.boardId).join(",")}`);
  const items = new Map(cycle.nodes.flatMap(node => Object.values(node.evidenceContract.spellingItems ?? {})).map(item => [item.id, item]));
  const since = Date.parse(input.since);
  const rescores = cycle.observations.flatMap(observation => {
    const raw = observation.childResponse ?? "";
    const item = items.get(observation.itemId);
    // Only answers code scored right/wrong from kana; skipped, ambiguous and already re-scored answers stay as they are.
    if (!item || Date.parse(observation.observedAt) < since || !KANA_OR_FULL_WIDTH.test(raw) || typeof observation.result.correct !== "boolean"
      || observation.confounds.some(value => value.startsWith("rescored:"))) return [];
    const typed = readTypedSpelling(raw, item.response.acceptedForms, item.response.caseSensitive);
    const result = scoreSpellingRecall(item, raw);
    const childResponse = typed.status === "ime_normalized" ? typed.value : raw;
    console.log(` 🎮 [spelling-rescore] [ime] obs=${observation.observationId} item=${item.id} old=${JSON.stringify({ answer: raw, result: observation.result })} new=${JSON.stringify({ answer: childResponse, result })}`);
    return [{ observationId: observation.observationId, childResponse, result, addConfounds: ["keyboard_ime_input", `ime_raw:${raw}`, ...(result.observedErrorType ? [result.observedErrorType] : [])],
      from: { childResponse: raw, result: observation.result } }];
  });
  if (!rescores.length || input.dryRun) {
    console.log(` 🎮 [spelling-rescore] [ime] [${input.dryRun ? "dry-run" : "nothing-to-do"}] child=${input.childId} homework=${input.homeworkId} found=${rescores.length}`);
    return { rescored: rescores.map(row => ({ observationId: row.observationId, from: row.from, to: { childResponse: row.childResponse, result: row.result } })) };
  }
  transitionLatestLearningCycle(input.childId, input.homeworkId, { type: "observation_rescored", source: input.source,
    reason: "Japanese-input keyboard turned her typed letters into kana; scored the letters she typed.",
    rescores: rescores.map(({ observationId, childResponse, result, addConfounds }) => ({ observationId, childResponse, result, addConfounds })) }, opts);
  console.log(` 🎮 [spelling-rescore] [ime] [committed] child=${input.childId} homework=${input.homeworkId} rescored=${rescores.length}`);
  return { rescored: rescores.map(row => ({ observationId: row.observationId, from: row.from, to: { childResponse: row.childResponse, result: row.result } })) };
}
