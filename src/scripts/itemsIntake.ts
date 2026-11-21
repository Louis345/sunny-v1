import { queryRecordTool } from "../engine/recordQuery";
import fs from "fs";
import path from "path";
import type Anthropic from "@anthropic-ai/sdk";
import { assembleAdventureBoardDefinition, expandJourneySequence, type AdventureBoardComposition, type AdventureBoardDefinition, type AdventureJourneyDefinition } from "../shared/adventureBoardDefinition";
import { acquireMathGenerationLease, hashDiscoveryContract, recordGenerationFailure, releaseMathGenerationLease, resolveAdaptiveMathDraftDir } from "../engine/adaptiveMathDiscovery";
import { ASSIGNMENT_PLANNER_PERSONA, buildAssignmentPlanningPacket, resolveAssignmentPlannerModel, type AssignmentPlanningPacket } from "../engine/assignmentPlanner";
import { assignmentPlannerContent, assignmentSourceFileHash, loadOrExtractAssignmentSource } from "../engine/assignmentSourceExtraction";
import { prepareSuccessorBoard } from "../engine/canonicalProgressionGenerator";
import { drawJourney } from "../engine/directMathExperience";
import { writeActiveHomeworkLane } from "../engine/homeworkLanes";
import { buildItemIntakePrompt, itemIntakeToolkit, type ItemIntakeResult } from "../engine/itemIntakeTools";
import { preparingBoardInstance, withInitialBoard } from "../engine/learningBoardInstances";
import { createLearningCycle, getLearningCycle, projectLearningCycle, type CreateLearningCycleInput, type LearningCycleNodeContract } from "../engine/learningCycleRepository";
import { runPlannerToolLoop, type ToolLoopRequest } from "../engine/plannerToolLoop";
import { providerTurnSender } from "../engine/plannerToolProvider";
import { writeActiveSessionPlan } from "../engine/sessionPlanFromChart";
import type { SpellingGameClient } from "../engine/spellingGameBuilder";
import { getChildChart } from "../profiles/childChart";
import { pastWeeksForDraft, pastWeeksLine, pastWeeksTool, readPastWeeks, type PastWeeksArchive } from "../engine/pastWeeks";
import type { HomeworkSources } from "../engine/schoolTestObjective";

/**
 * Math intake in spelling's shape (owner, 2026-11-08: one pipeline for every subject). The Planner records
 * the worksheet's problems and plans her first board through tools; the map artist draws it; Sunny builds
 * one game per stop; a stop whose game cannot bind her answers is Not ready and the board still publishes.
 */
export type ItemsIntakeOptions = {
  model?: string;
  send?: (request: ToolLoopRequest, turn: number) => Promise<Anthropic.Messages.Message>;
  draw?: (journey: AdventureJourneyDefinition) => Promise<{ composition: AdventureBoardComposition; pattern?: string }>;
  gameClient?: SpellingGameClient;
};
type IntakeOutput = { intake: ItemIntakeResult; boardDefinition: AdventureBoardDefinition; model: string };

const stopNodeId = (homeworkId: string, stopId: string) => `${homeworkId}:${stopId}`;

async function planItemIntake(packet: AssignmentPlanningPacket, homeworkId: string, draftDir: string, options: ItemsIntakeOptions, pastWeeks?: PastWeeksArchive): Promise<IntakeOutput> {
  const model = resolveAssignmentPlannerModel({ model: options.model });
  const kit = itemIntakeToolkit(packet);
  // Her earlier weeks (owner, 2026-11-10): one line in the question, the rest behind read_past_weeks.
  const past = pastWeeks?.weeks.length ? pastWeeks : undefined;
  const loop = await runPlannerToolLoop({
    label: "math-intake", prompt: `${buildItemIntakePrompt(packet)}${past ? `\n${pastWeeksLine(past)}` : ""}`, system: ASSIGNMENT_PLANNER_PERSONA,
    content: prompt => assignmentPlannerContent(packet.sourceDocument, prompt),
    model, maxTokens: 16000, tools: past ? [...kit.tools, pastWeeksTool(past), ...(past.claims?.asOfSequence !== undefined ? [queryRecordTool(past.childId, past.claims.asOfSequence)] : [])] : kit.tools, state: kit.initialState(), finished: kit.finished,
    send: options.send ?? providerTurnSender({ label: "math-intake", stagePrefix: "math-intake-tools", draftDir }),
  });
  // Without recorded problems there is nothing to build; the intake stays unpublished and says why.
  if (!kit.finished(loop.state)) throw new Error(`item_intake_tools_unfinished:${loop.stats.stop}`);
  const intake = kit.result(loop.state);
  const journey = expandJourneySequence({ title: intake.title, opening: intake.stops.map(stop => stopNodeId(homeworkId, stop.id)), closing: [],
    singlePathReason: "The order the Planner chose for her first board.", endpointLabel: "Finish" }, intake.stops.map(stop => ({ id: stopNodeId(homeworkId, stop.id), title: stop.title })));
  const drawing = await (options.draw ?? (given => drawJourney({ journey: given, label: `math-intake:${packet.sourceDocument.fileHash.slice(0, 8)}`, stagePrefix: "math-intake-design",
    identity: { childId: packet.childId, assignment: packet.sourceDocument.fileHash, journey: given }, ...(packet.childChart.childVoice ? { child: packet.childChart.childVoice } : {}),
    checkpointFile: path.join(draftDir, "math-intake-design.json"), rawResponseDir: path.join(draftDir, "provider-diagnostics") })))(journey);
  return { intake, boardDefinition: assembleAdventureBoardDefinition(journey, drawing.composition, drawing.pattern), model };
}

/** The cycle's first board: one built-game stop per Planner stop, each with its own problems and prediction. */
function itemCycleInput(input: { childId: string; homeworkId: string; fingerprint: string; rawText: string; filename: string; output: IntakeOutput; now: string }): CreateLearningCycleInput {
  const { intake } = input.output;
  const theoryId = `${input.homeworkId}:academic-theory`;
  const evidenceId = `assignment:${input.fingerprint}`;
  const constructId = `math.${intake.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "assignment"}`;
  const items = new Map(intake.items.map(item => [item.id, item]));
  const nodes: LearningCycleNodeContract[] = intake.stops.map(stop => {
    // A reward break is play (Law 16): a built-in Mystery with no problems, no prediction, never learning evidence.
    if (stop.reward) return {
      nodeId: stopNodeId(input.homeworkId, stop.id), role: "mystery", title: stop.title, state: "generating", implementationType: "mystery",
      academicTarget: { domain: "math", skill: intake.title, targets: [] }, algorithmOwner: "activity-affinity", theoryId, experimentId: `${input.homeworkId}:${stop.id}`,
      mechanic: "mystery", theme: stop.story, openingScreen: { title: stop.title, purpose: stop.purpose },
      generationPrompt: { promptId: `${input.homeworkId}:${stop.id}:reward`, createdFromEvidenceIds: [evidenceId], text: stop.story },
      artifactBinding: null, artwork: { status: "pending", localPath: null, prompt: stop.picture },
      sfxContract: ["interaction", "progress", "completion"], companionContract: { events: ["completion"] },
      evidenceContract: { academic: false, engagement: true, companionObservations: true }, evidenceIds: [],
    };
    const role = stop.checkFirst ? "fresh_checkpoint" as const : "practice" as const;
    const stopItems = stop.itemIds.map(id => { const item = structuredClone(items.get(id)!); return { ...item, lineage: { ...item.lineage, measurementRole: role } }; });
    return {
      nodeId: stopNodeId(input.homeworkId, stop.id), predictionId: `${input.homeworkId}:prediction:${stop.id}`, role: "baseline", title: stop.title, state: "generating",
      implementationType: "generated-game", academicTarget: { domain: "math", skill: intake.title, targets: stopItems.map(item => item.prompt) },
      algorithmOwner: "ai_tutor", theoryId, experimentId: `${input.homeworkId}:${stop.id}`, mechanic: "generated-game", theme: stop.story,
      openingScreen: { title: stop.title, purpose: stop.purpose },
      generationPrompt: { promptId: `${input.homeworkId}:${stop.id}:game`, createdFromEvidenceIds: [evidenceId], text: stop.story },
      prediction: { claim: stop.prediction!.why, createdAt: input.now, evidenceLimit: "practice_only" },
      artifactBinding: null, artwork: { status: "pending", localPath: null, prompt: stop.picture },
      sfxContract: ["interaction", "recovery", "progress", "completion"], companionContract: { events: ["completion", "frustration", "replay"] },
      evidenceContract: { academic: true, engagement: true, companionObservations: true,
        itemRoles: Object.fromEntries(stopItems.map(item => [item.id, role])), itemContracts: Object.fromEntries(stopItems.map(item => [item.id, item])) },
      evidenceIds: [],
    };
  });
  return {
    childId: input.childId, homeworkId: input.homeworkId, domain: "math", boardDefinition: input.output.boardDefinition,
    assignment: { title: intake.title, contentFingerprint: input.fingerprint, capturedEvidenceIds: [evidenceId], targets: [intake.title],
      returnTag: `#sunny_${input.childId}_${input.homeworkId}`.toLowerCase().replace(/[^#a-z0-9]+/g, "_"), rawText: input.rawText, sourceFilename: input.filename },
    academicTheory: { theoryId, revision: 1, hypothesis: intake.theory,
      supportCriteria: ["Real child evidence and returned work support the prediction."], reviseCriteria: ["Observed performance is mixed or a confound limits the claim."], falsifyCriteria: ["Returned work contradicts the prediction."] },
    engagementTheory: null,
    nodes,
    academicPredictions: intake.stops.flatMap(stop => !stop.prediction ? [] : [{
      predictionId: `${input.homeworkId}:prediction:${stop.id}`, theoryId, constructId, context: stop.purpose, horizon: "Her first answers at this stop on her first board.",
      eligibility: { sources: [stop.checkFirst ? "independent_probe" as const : "practice" as const], maxDelayDays: 14, checkpointItemIds: [...stop.itemIds] },
      expectedMetric: { key: "first_answer_accuracy", min: stop.prediction.min, max: stop.prediction.max }, predictedErrorPatterns: [], confidence: stop.prediction.confidence,
      evidenceIds: [evidenceId], intervention: stop.story, evidenceLimit: "practice_only" as const, createdAt: input.now, lockedAt: input.now,
    }]),
    assumptions: [],
  };
}

export async function runItemsIntake(args: { childId: string; sourceFile: string; rootDir?: string; testDate?: string | null }, options: ItemsIntakeOptions = {}): Promise<{ homeworkId: string }> {
  const rootDir = args.rootDir ?? process.cwd();
  const chart = getChildChart(args.childId, { rootDir });
  const fingerprint = assignmentSourceFileHash(args.sourceFile);
  const homeworkId = `hw-math-${fingerprint.slice(0, 8)}`;
  const scope = { rootDir, childId: args.childId, homeworkId };
  const lease = acquireMathGenerationLease({ ...scope, homeworkId: "discovery-intake" });
  if (!lease.acquired || !lease.token) throw new Error("math_intake_worker_already_running");
  const draft = resolveAdaptiveMathDraftDir(args.childId, homeworkId, { rootDir });
  const startedAt = Date.now();
  const save = (filename: string, value: unknown): void => {
    fs.mkdirSync(draft, { recursive: true });
    const file = path.join(draft, filename), temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2)); fs.renameSync(temporary, file);
  };
  try {
    console.log(` 🎮 [math-intake] [assignment-capture] [running] child=${args.childId} homework=${homeworkId}`);
    const { extraction } = await loadOrExtractAssignmentSource(args.sourceFile, path.join(draft, "assignment-extraction.json"));
    const packetFile = path.join(draft, "math-intake-request.json");
    const packet = fs.existsSync(packetFile) ? JSON.parse(fs.readFileSync(packetFile, "utf8")) as AssignmentPlanningPacket
      : buildAssignmentPlanningPacket({ childId: args.childId, extraction, childChart: chart });
    if (packet.childId !== args.childId || packet.sourceDocument.fileHash !== fingerprint) throw new Error("math_intake_checkpoint_identity_mismatch");
    if (!fs.existsSync(packetFile)) save("math-intake-request.json", packet);
    // A restart replays the saved intake and map at no cost.
    const responseFile = path.join(draft, "math-intake-response.json");
    const saved = fs.existsSync(responseFile) ? JSON.parse(fs.readFileSync(responseFile, "utf8")) as { output: IntakeOutput; requestHash: string; outputHash: string } : null;
    const requestHash = hashDiscoveryContract(packet);
    if (saved && (saved.requestHash !== requestHash || saved.outputHash !== hashDiscoveryContract(saved.output))) throw new Error("math_intake_checkpoint_hash_mismatch");
    const output = saved?.output ?? await planItemIntake(packet, homeworkId, draft, options,
      pastWeeksForDraft({ draftDir: draft, stagePrefix: "math-intake-tools", build: () => readPastWeeks(args.childId, { rootDir, homework: chart.homework as HomeworkSources, excludeHomeworkIds: [homeworkId] }) }));
    if (!saved) save("math-intake-response.json", { output, requestHash, outputHash: hashDiscoveryContract(output) });
    console.log(` 🎮 [math-intake] [assignment-capture] [${saved ? "reused" : "saved"}] problems=${output.intake.items.length} stops=${output.intake.stops.length}`);
    if (!getLearningCycle(args.childId, homeworkId, { rootDir })) {
      const now = new Date().toISOString();
      createLearningCycle(withInitialBoard(itemCycleInput({ childId: args.childId, homeworkId, fingerprint, rawText: extraction.fullText, filename: extraction.filename, output, now }), "teaching", now), { rootDir });
      console.log(` 🎮 [math-intake] [cycle] [created] homework=${homeworkId} lifecycle=board_generating`);
    }
    const cycle = await prepareSuccessorBoard({ childId: args.childId, homeworkId, ...(options.gameClient ? { spellingGameClient: options.gameClient } : {}) }, { rootDir });
    if (preparingBoardInstance(cycle)) throw new Error(`math_intake_board_unpublished:${homeworkId}`);
    // What the kiosk reads: math is her current homework, and the plan is the cycle's own projection.
    const contentProfile = { practiceDomain: "math", contentDomain: "math", topic: cycle.assignment.title, primarySkill: cycle.assignment.title, assignmentFormat: "worksheet", concepts: [], sourceEvidence: cycle.assignment.capturedEvidenceIds };
    writeActiveHomeworkLane(args.childId, "math", {
      homeworkId, weekOf: cycle.createdAt.slice(0, 10), testDate: args.testDate ?? null, returnTag: cycle.assignment.returnTag, wordList: [], contentProfile,
      capturedContent: { title: cycle.assignment.title, type: "math", rawText: extraction.fullText, words: [], questions: output.intake.items.map(item => item.prompt),
        sourceDocuments: [{ filename: extraction.filename, mediaType: extraction.mediaType }], contentProfile },
      generatedAt: cycle.createdAt, nodes: [],
    }, { rootDir, select: true });
    writeActiveSessionPlan(args.childId, projectLearningCycle(cycle).activeSessionPlan, { rootDir });
    const notReady = cycle.nodes.filter(node => node.notReadyReason).length;
    console.log(` 🎮 [math-intake] [board] [published] homework=${homeworkId} stops=${cycle.nodes.length} not_ready=${notReady} lifecycle=${cycle.lifecycle}`);
    return { homeworkId };
  } catch (error) {
    recordGenerationFailure({ draftDir: draft, childId: args.childId, homeworkId, stage: "math_intake", startedAt, error });
    console.error(` 🎮 [math-intake] [intake] [needs-attention] checkpoint=${draft}`, error);
    throw error;
  } finally { releaseMathGenerationLease({ ...scope, homeworkId: "discovery-intake", token: lease.token }); }
}
