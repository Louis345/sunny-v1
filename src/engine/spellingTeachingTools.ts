import { createHash } from "crypto";
import { z } from "zod";
import { expandJourneySequence, journeyExecutions } from "../shared/adventureBoardDefinition";
import { assignmentPlannerAllowedEvidenceIds, hydrateNativeLearningProgram, type AssignmentPlanningPacket } from "./assignmentPlanner";
import type { PlannerTool } from "./plannerToolLoop";
import { finishJourneySequence, journeyOrderTools, removeFromJourney, type JourneyOrderState } from "./journeyTools";

/** The Teaching Planner's small locked tools. The model decides activities, words, order, the
 * choice and its predictions; the handlers stamp IDs, configuration, measurement bookkeeping and
 * the journey, then assemble the same program `create_learning_program` produced, so everything
 * downstream (hydration, lineage, predictions, publishing) is unchanged. */
type Prediction = {
  expected_accuracy_min: number; expected_accuracy_max: number; confidence: number; reason: string; uncertainty: string;
  support_criteria: string; revise_criteria: string; falsify_criteria: string; evidence_ids: string[]; max_delay_days: number;
};
type Row = { id: string; title: string; type: string; role: "instruction" | "practice" | "fresh_checkpoint" | null; targets: string[]; prediction: Prediction | null; extra: Record<string, unknown> };
export type TeachingState = JourneyOrderState & {
  next: number; activities: Row[];
  requests: Array<{ id: string; skillTarget: string; domain: "spelling"; mechanicConstraints: string; reason: string }>;
  program?: Record<string, unknown>;
};
type Result = { ok: true; result: unknown } | { ok: false; error: string };

const text = (description: string) => z.string().min(1).describe(description);
const enumOf = (values: readonly string[], fallback: string) => z.enum((values.length ? values : [fallback]) as [string, ...string[]]);
const ROLES: Record<string, ReadonlyArray<"instruction" | "practice" | "fresh_checkpoint">> = {
  "word-radar:hidden_word_recall": ["fresh_checkpoint", "practice", "instruction"],
  "word-radar:visible_read": ["instruction", "practice"],
  "word-radar:partial_visual_recall": ["instruction", "practice"],
};

export function spellingTeachingToolkit(packet: AssignmentPlanningPacket) {
  const launchable = packet.activityCatalog.filter(card => card.launchable);
  const offered = new Set(launchable.map(card => card.nodeType ?? card.activityId));
  const radarModes = new Map<string, Record<string, unknown>>();
  for (const mode of launchable.find(card => card.activityId === "word-radar")?.capabilityModes ?? []) {
    const recall = (mode.config as { recallMode?: unknown } | undefined)?.recallMode;
    if (typeof recall === "string" && `word-radar:${recall}` in ROLES && !radarModes.has(recall)) radarModes.set(recall, structuredClone(mode.config as Record<string, unknown>));
  }
  const games = [...offered].filter(type => !["word-radar", "visual-explainer", "letter-rush", "mystery", "quest", "boss"].includes(type));
  const choices = [
    ...[...radarModes.keys()].map(mode => `word-radar:${mode}`),
    ...(offered.has("letter-rush") ? ["letter-rush:read-and-race", "letter-rush:hear-and-spell", "letter-rush:type-and-spell"] : []),
    ...games,
  ];
  const assigned = [...new Set([...packet.capturedHomework.words, ...(packet.capturedHomework.wordGroups ?? []).flatMap(group => group.words)])];
  // Predictions cite this homework's evidence. Her whole history stays in the prompt as context, but as
  // a pick-list it outgrew what strict mode can compile (251 IDs on a real chart, 2026-10-25).
  const thisHomework = new Set([
    ...(packet.capturedHomework.wordGroups ?? []).flatMap(group => group.evidence),
    ...(packet.discoveryEvidence?.observations ?? []).map(row => row.observationId),
    ...(packet.discoveryEvidence?.summary.constructs ?? []).flatMap(construct => construct.observationIds),
  ]);
  const evidence = assignmentPlannerAllowedEvidenceIds(packet).filter(id => thisHomework.has(id));
  const idPrefix = `act-${packet.sourceDocument.fileHash.slice(0, 6)}`;

  const word = enumOf(assigned, "none").describe("One of her assigned words.");
  const predictionSchema = z.object({
    activity_id: text("The activity this prediction is for."),
    expected_accuracy_min: z.number().min(0).max(1), expected_accuracy_max: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    reason: text("Why you expect this, in one sentence."), uncertainty: text("What you are unsure of, in one sentence."),
    support_criteria: text("What result would support your theory."), revise_criteria: text("What result would make you revise it."), falsify_criteria: text("What result would show it is wrong."),
    evidence_ids: z.array(enumOf(evidence, "none")).min(1).describe("The supplied observation IDs this prediction rests on."),
    max_delay_days: z.number().min(0).describe("How many days after this board the prediction still applies."),
  }).strict();

  const find = (state: TeachingState, id: string) => state.activities.find(row => row.id === id);
  const add = (state: TeachingState, row: Omit<Row, "id">): Result => {
    state.next += 1;
    const id = `${idPrefix}-${state.next}`;
    state.activities.push({ id, ...row });
    return { ok: true, result: { activity_id: id } };
  };
  const checkPrediction = (prediction: Prediction): string | undefined =>
    prediction.expected_accuracy_min > prediction.expected_accuracy_max ? "expected_accuracy_min must not be above expected_accuracy_max" : undefined;
  const repeated = (values: readonly string[]) => values.find((value, index) => values.indexOf(value) !== index);

  const tools: PlannerTool<TeachingState>[] = [
    { name: "add_activity", description: "Add one activity with the words it practices or checks. Returns its activity_id; then call predict for it. A fresh_checkpoint is the only independent measurement and must use word-radar:hidden_word_recall.",
      schema: z.object({ activity: enumOf(choices, "word-radar:hidden_word_recall").describe("Which tested activity, and its mode."), role: z.enum(["instruction", "practice", "fresh_checkpoint"]), words: z.array(word).min(1), title: text("The short name she sees under the portal: 2 to 4 words, like a game title.") }).strict(),
      run: (state, input) => {
        const allowed = ROLES[input.activity] ?? (input.activity.startsWith("letter-rush:") ? ["practice"] : ["instruction", "practice"]);
        if (!allowed.includes(input.role)) return { ok: false, error: input.role === "fresh_checkpoint" ? "only word-radar:hidden_word_recall can be a fresh_checkpoint" : `${input.activity} can only be ${allowed.join(" or ")}` };
        const twice = repeated(input.words); if (twice) return { ok: false, error: `the word ${twice} is listed more than once` };
        const [type, mode] = input.activity.split(":");
        const extra = type === "word-radar" ? { wordRadarConfig: structuredClone(radarModes.get(mode)) } : type === "letter-rush" ? { letterRushMode: mode } : {};
        return add(state, { title: input.title, type, role: input.role, targets: [...input.words], prediction: null, extra });
      } },
    // The explainer's teaching content is too large for the API's strict grammar alongside the
    // other tools (live compile check 2026-10-24); it stays unlocked and its handler checks it.
    ...(offered.has("visual-explainer") ? [{ name: "add_explainer", strict: false, description: "Add a Visual Explainer that teaches a spelling pattern with chunked words and one check question. It is always instruction. Returns its activity_id; then call predict for it.",
      schema: z.object({
        title: text("The short name she sees under the portal."), topic: z.string().min(1).max(120), learning_goal: z.string().min(1).max(220), misconception: text("The mistake this explainer addresses."),
        strategy: z.object({ title: z.string().min(1).max(100), steps: z.array(z.string().min(1).max(140)).min(2).max(4) }).strict(),
        words: z.array(z.object({ text: word, chunks: z.array(z.string().min(1)).min(2).max(6).describe("Letters split into chunks that join to spell the word exactly."), spoken_chunks: z.array(z.string().min(1).max(100)).min(2).max(6).describe("How each chunk sounds, one per chunk in the same order, spelled the way it is said (lee for ly), never letter names."), focus_chunk: text("One chunk from this word."), tip: z.string().min(1).max(160) }).strict()).min(1).max(8),
        check: z.object({ target_word: word, prompt: z.string().min(1).max(180), options: z.array(z.object({ label: text("An answer choice."), correct: z.boolean() }).strict()).min(2).max(4).describe("Exactly one option is correct.") }).strict(),
      }).strict(),
      run: (state: TeachingState, input: any): Result => {
        for (const row of input.words) {
          if (row.chunks.join("") !== row.text) return { ok: false, error: `the chunks for ${row.text} must join to spell it exactly` };
          if (!row.chunks.includes(row.focus_chunk)) return { ok: false, error: `focus_chunk for ${row.text} must be one of its chunks` };
        }
        const twice = repeated(input.words.map((row: { text: string }) => row.text)); if (twice) return { ok: false, error: `the word ${twice} is listed more than once` };
        if (!input.words.some((row: { text: string }) => row.text === input.check.target_word)) return { ok: false, error: "check.target_word must be one of this explainer's words" };
        if (input.check.options.filter((option: { correct: boolean }) => option.correct).length !== 1) return { ok: false, error: "the check needs exactly one correct option" };
        const options = input.check.options.map((option: { label: string; correct: boolean }, index: number) => ({ id: `option-${index + 1}`, label: option.label, correct: option.correct }));
        return add(state, { title: input.title, type: "visual-explainer", role: "instruction", targets: input.words.map((row: { text: string }) => row.text), prediction: null, extra: { activityConfig: {
          topic: input.topic, learningGoal: input.learning_goal, misconception: input.misconception, strategy: input.strategy,
          words: input.words.map((row: any) => ({ text: row.text, chunks: row.chunks, spokenChunks: row.spoken_chunks, focusChunk: row.focus_chunk, tip: row.tip })),
          check: { targetWord: input.check.target_word, prompt: input.check.prompt, options, correctOptionId: options.find((option: { correct: boolean }) => option.correct).id },
        } } });
      } } as PlannerTool<TeachingState>] : []),
    ...(offered.has("mystery") ? [{ name: "add_reward", description: "Add a Mystery reward with no words and no measurement. Returns its activity_id.",
      schema: z.object({ title: text("The short name she sees under the portal.") }).strict(),
      run: (state: TeachingState, input: { title: string }) => add(state, { title: input.title, type: "mystery", role: null, targets: [], prediction: null, extra: {} }) } as PlannerTool<TeachingState>] : []),
    { name: "predict", description: "Record your preregistered prediction for one academic activity. Every activity except a reward needs one. Calling it again replaces it. It is never a claim she has learned anything.",
      schema: predictionSchema,
      run: (state, input) => {
        const row = find(state, input.activity_id);
        if (!row) return { ok: false, error: `no activity ${input.activity_id}; use an activity_id you were given` };
        if (!row.role) return { ok: false, error: `${input.activity_id} is a reward and takes no prediction` };
        const bad = checkPrediction(input); if (bad) return { ok: false, error: bad };
        const { activity_id: _id, ...prediction } = input;
        row.prediction = prediction;
        state.program = undefined;
        return { ok: true, result: { predicted: input.activity_id } };
      } },
    { name: "remove_activity", description: "Remove an activity you added, and take it off the order and the choice.",
      schema: z.object({ activity_id: text("An activity_id you were given.") }).strict(),
      run: (state, input) => {
        if (!find(state, input.activity_id)) return { ok: false, error: `no activity ${input.activity_id}` };
        state.activities = state.activities.filter(row => row.id !== input.activity_id);
        removeFromJourney(state, input.activity_id);
        state.program = undefined;
        return { ok: true, result: { removed: input.activity_id } };
      } },
    ...journeyOrderTools<TeachingState>({ exists: (state, id) => Boolean(find(state, id)), idName: "activity_id", onChange: state => { state.program = undefined; } }),
    { name: "request_capability", description: "Ask for a spelling activity Sunny does not have yet. The request goes to a person; nothing is built automatically.",
      schema: z.object({ skill_target: text("The skill it would practice."), mechanic_constraints: text("How it would work."), reason: text("Why the tested activities are not enough.") }).strict(),
      run: (state, input) => {
        if (state.requests.length >= 6) return { ok: false, error: "at most 6 requests" };
        state.requests.push({ id: `request-${state.requests.length + 1}`, skillTarget: input.skill_target, domain: "spelling", mechanicConstraints: input.mechanic_constraints, reason: input.reason });
        return { ok: true, result: { requested: input.skill_target } };
      } },
    { name: "finish_board", description: "Finish the board when every activity is placed. Sunny checks it and replies accepted, or says exactly what to fix.",
      schema: z.object({ title: text("The board's name she sees."), endpoint_label: text("Name of the finish portal."), single_path_reason: z.string().describe("When there is no choice, why one path is right. Empty when there is a choice."),
        plan_theory: z.object({ hypothesis: text("Your teaching theory."), evidence_summary: z.array(z.string().min(1)).min(1), intervention: text("What this board does."), support_criteria: z.array(z.string().min(1)).min(1), revise_criteria: z.array(z.string().min(1)).min(1), falsify_criteria: z.array(z.string().min(1)).min(1) }).strict(),
        review_questions: z.array(z.string().min(1)).max(8) }).strict(),
      run: (state, input) => {
        const finished = finishJourneySequence(state, state.activities, input, { add: "add_activity", plural: "activities", remove: "remove_activity" });
        if (!finished.ok) return finished;
        const unpredicted = state.activities.filter(row => row.role && !row.prediction);
        if (unpredicted.length) return { ok: false, error: `call predict for ${unpredicted.map(row => row.id).join(", ")} first` };
        const sequence = finished.sequence;
        const executions = journeyExecutions(expandJourneySequence(sequence, state.activities)).map(path => path.activityNodeIds);
        const roleOf = new Map(state.activities.map(row => [row.id, row]));
        const isFinal = (row: Row) => executions.filter(path => path.includes(row.id)).every(path => path.slice(path.indexOf(row.id) + 1)
          .every(id => roleOf.get(id)?.role !== "fresh_checkpoint" || !roleOf.get(id)!.targets.some(target => row.targets.includes(target))));
        const activities = state.activities.map(row => ({
          id: row.id, title: row.title, type: row.type, activityId: row.type, ...(row.type === "visual-explainer" ? {} : { targets: row.targets }), ...row.extra,
          measurement: row.prediction && row.role ? {
            evidenceType: row.role === "fresh_checkpoint" ? "diagnostic" : "practice",
            supportCriteria: row.prediction.support_criteria, reviseCriteria: row.prediction.revise_criteria, falsifyCriteria: row.prediction.falsify_criteria,
            spelling: { role: row.role, evidenceIds: row.prediction.evidence_ids, reason: row.prediction.reason, uncertainty: row.prediction.uncertainty,
              expectedAccuracy: { min: row.prediction.expected_accuracy_min, max: row.prediction.expected_accuracy_max }, confidence: row.prediction.confidence,
              maxDelayDays: row.prediction.max_delay_days, finalCheck: row.role === "fresh_checkpoint" && isFinal(row) },
          } : null,
        }));
        const body = { domain: "spelling", journey: sequence, activities,
          planTheory: { hypothesis: input.plan_theory.hypothesis, evidenceSummary: input.plan_theory.evidence_summary, intervention: input.plan_theory.intervention, supportCriteria: input.plan_theory.support_criteria, reviseCriteria: input.plan_theory.revise_criteria, falsifyCriteria: input.plan_theory.falsify_criteria },
          reviewQuestions: input.review_questions, generationRequests: state.requests };
        const program = { ...body, planId: `teaching-${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 12)}` };
        let notReady: Array<{ nodeId: string; reason: string }>;
        try { notReady = hydrateNativeLearningProgram(program, packet).notReady ?? []; }
        catch (error) { return { ok: false, error: `the board cannot be read: ${error instanceof Error ? error.message : String(error)}` }; }
        if (notReady.length) return { ok: false, error: `these activities cannot run: ${notReady.map(row => `${row.nodeId} (${row.reason})`).join("; ")}. Change or remove them, then finish again.` };
        state.program = program;
        return { ok: true, result: { accepted: true, activities: activities.length } };
      } },
  ];
  return {
    tools,
    initialState: (): TeachingState => ({ next: 0, activities: [], requests: [] }),
    finished: (state: TeachingState) => Boolean(state.program),
    program: (state: TeachingState) => { if (!state.program) throw new Error("teaching_program_unfinished"); return state.program; },
  };
}
