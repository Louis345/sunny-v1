import path from "node:path";
import type { AdventureBoardComposition, AdventureJourneyDefinition } from "../../shared/adventureBoardDefinition";
import { DEFAULT_THEME_PRESET, layoutJourney } from "../../shared/boardLayout";

/** Tests draw the next board on the plain layout; the map artist has its own tests. */
export async function plainDraw(journey: AdventureJourneyDefinition): Promise<{ composition: AdventureBoardComposition }> {
  const positions = layoutJourney(journey).positions;
  return { composition: { theme: { background: DEFAULT_THEME_PRESET.background, palette: { ...DEFAULT_THEME_PRESET.palette } },
    portals: journey.portals.map(portal => ({ id: portal.id, position: positions[portal.id] })), edges: journey.edges.map(edge => ({ id: edge.id })) } };
}

type Recorded = { progressionAction: string; status: string; reason: string; preserve?: string[]; change?: string[]; testNext?: string[]; nextEvidenceRequired?: string[]; predictionEvaluationIds?: string[]; revisedHypothesis?: string;
  nextInstruments?: Array<{ nodeId: string; title: string; academicTarget?: string; openingPurpose?: string; spelling?: { builtInActivityId?: string; wordIds?: string[] } }>;
  boardDefinition?: { title?: string; rootPathId: string; portals: Array<{ id: string; kind: string; activityNodeId?: string }>; paths: Array<{ id: string; portalIds: string[] }>; choices: Array<{ portalId: string; purpose: string; options: Array<{ label: string; hypothesis: string; pathId: string }> }> } };
const last = (id: string) => id.split(":").pop();
let replies = 0;

/** Answers one Planner request the way the model would through the next-board tools, from a
 * recorded decision: decide and add each step, then set the recorded order and choice, and finish.
 * Step IDs come from Sunny's own tool results. A request for the old single form gets the old form. */
export function successorToolReply(recorded: unknown, request: any): any {
  const decision = recorded as Recorded;
  const message = (content: unknown[]) => ({ id: `recorded-tools-${++replies}`, type: "message", role: "assistant", model: request.model, stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
    content: content.map((block: any, index) => ({ type: "tool_use", id: `tool-${replies}-${index}`, ...block })) });
  const names: string[] = (request.tools ?? []).map((tool: any) => tool.name);
  if (!names.includes("decide")) return message([{ name: "decide_learning_cycle_progression", input: decision }]);
  const schema = (name: string) => request.tools.find((tool: any) => tool.name === name).input_schema.properties;
  const builtIns: string[] = schema("add_step").built_in.enum ?? [];
  const offeredEvaluations: string[] | undefined = schema("decide").prediction_evaluation_ids.items?.enum;
  const cited = (decision.predictionEvaluationIds ?? []).filter(id => offeredEvaluations?.includes(id));
  const decide = { name: "decide", input: { status: decision.status, reason: decision.reason, progression_action: decision.progressionAction, preserve: decision.preserve ?? [], change: decision.change ?? [],
    test_next: decision.testNext ?? [], next_evidence_required: decision.nextEvidenceRequired ?? [],
    prediction_evaluation_ids: offeredEvaluations ? (cited.length ? cited : offeredEvaluations.slice(0, 1)) : [], revised_hypothesis: decision.revisedHypothesis ?? "" } };
  const steps = (decision.nextInstruments ?? []).flatMap(row => {
    const wanted = [row.spelling?.builtInActivityId, row.nodeId].filter((id): id is string => Boolean(id));
    const builtIn = builtIns.find(id => wanted.some(want => id === want || last(id) === last(want)));
    const offeredWords: string[] = schema("add_step").words.items?.enum ?? [];
    const words = (row.spelling?.wordIds ?? []).filter(word => offeredWords.includes(word));
    return builtIn ? [{ nodeId: row.nodeId, input: { built_in: builtIn, words, title: row.title, purpose: row.academicTarget || row.openingPurpose || "Practice." } }] : [];
  });
  const assistantTurns = (request.messages ?? []).filter((row: any) => row.role === "assistant").length;
  if (decision.progressionAction === "await_calibration") return message([decide, { name: "finish_board", input: { title: "Waiting", endpoint_label: "Finish", single_path_reason: "Awaiting graded work." } }]);
  if (assistantTurns === 0) return message([decide, ...steps.map(step => ({ name: "add_step", input: step.input }))]);
  const results = (request.messages.at(-1).content as any[]).filter(block => block.type === "tool_result" && !block.is_error).map(block => JSON.parse(block.content)).filter(row => row?.step_id);
  const stepOf = new Map(steps.map((step, index) => [step.nodeId, results[index]?.step_id as string]));
  const board = decision.boardDefinition;
  const portals = new Map((board?.portals ?? []).map(portal => [portal.id, portal]));
  const stepsOn = (portalIds: string[]) => portalIds.flatMap(id => { const node = portals.get(id)?.activityNodeId ?? id; const step = stepOf.get(node); return step ? [step] : []; });
  const root = board?.paths.find(path => path.id === board.rootPathId)?.portalIds ?? [];
  const choice = board?.choices.find(row => root.includes(row.portalId));
  const split = choice ? root.indexOf(choice.portalId) : root.length;
  const opening = board ? stepsOn(root.slice(0, split)) : [...stepOf.values()];
  const closing = board ? stepsOn(root.slice(split + 1)) : [];
  // As the old reader did, an option's copy of a shared closing stop resumes on the root path.
  const options = (choice?.options ?? []).map(option => ({ label: option.label, hypothesis: option.hypothesis, ids: stepsOn((board!.paths.find(path => path.id === option.pathId)?.portalIds ?? []).filter(id => !root.includes(id))) })).filter(option => option.ids.length);
  return message([
    { name: "set_order", input: { opening, closing } },
    ...(options.length >= 2 ? [{ name: "add_choice", input: { purpose: choice!.purpose, label: "Choose", options } }] : []),
    { name: "finish_board", input: { title: board?.title ?? "Next board", endpoint_label: "Finish", single_path_reason: options.length >= 2 ? "" : "The recorded order." } },
  ]);
}

/** Saves a next-board decision exactly as an older homework holds it on disk: received through the
 * old single form, keyed by its batch snapshot. Board 3 then replays it without a new purchase. */
export async function saveOldFormDecision(input: { rootDir: string; childId: string; homeworkId: string; decision: unknown }): Promise<void> {
  const { getLearningCycle } = await import("../../engine/learningCycleRepository");
  const { runMathProviderStage } = await import("../../engine/adaptiveMathDiscovery");
  const { resolveChildContextDir } = await import("../../utils/contextRoot");
  const cycle = getLearningCycle(input.childId, input.homeworkId, { rootDir: input.rootDir })!;
  // The same batch rule the runtime's plannerCheckpoint uses.
  const entry = [...cycle.decisionHistory].reverse().find(row => row.toLifecycle === cycle.lifecycle && row.fromLifecycle !== cycle.lifecycle);
  const batchId = entry?.decisionId ?? `${input.homeworkId}:r${cycle.revision}`;
  const recorded = Number(entry?.decisionId.match(/:r(\d+)$/)?.[1]);
  const revision = Number.isSafeInteger(recorded) ? recorded : cycle.revision;
  const draftDir = path.join(resolveChildContextDir(input.childId, { rootDir: input.rootDir }), "homework", "cycles", ".planner", input.homeworkId, batchId.replace(/[^a-zA-Z0-9_-]+/g, "_"));
  const snapshot = { childId: input.childId, homeworkId: input.homeworkId, batchId, lifecycle: cycle.lifecycle, cycleRevision: revision,
    observationIds: cycle.observations.filter(row => row.provenance !== "practice").map(row => row.observationId), model: process.env.SUNNY_EXPERIENCE_PLANNER_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5" };
  await runMathProviderStage({ draftDir, stage: `progression-decision-r${revision}`, model: snapshot.model, request: snapshot, execute: async () => ({ plannerMessage: { id: "saved-old-form", stop_reason: "tool_use", content: [{ type: "tool_use", name: "decide_learning_cycle_progression", input: input.decision }] } }) });
}
