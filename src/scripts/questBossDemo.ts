import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { linearJourneyFixture } from "./fixtures/authoredJourney";
import { plainDraw, successorToolReply } from "./fixtures/successorToolConversation";
import { buildSpellingRecallItems } from "../engine/learningCycleIngest";
import { createLearningCycle, getLearningCycle, type LearningCycleRecordV2, type LearningCycleRepositoryOptions } from "../engine/learningCycleRepository";
import { prepareSuccessorBoard } from "../engine/canonicalProgressionGenerator";
import { resolveAdaptiveMathDraftDir } from "../engine/adaptiveMathDiscovery";
import { resolveChildContextDir } from "../utils/contextRoot";

/** The free Quest/Boss demo (owner, 2026-11-05): "I want to see it before the kids see it" without paying
 * for generation. Only the demo child exists here; filler words, a hidden-word Radar for every encounter,
 * the plain map layout, and Planner decisions answered by code. A real child never reaches this file. */
export const DEMO_CHILD_ID = "demo-pashley";
export const DEMO_HOMEWORK_ID = "hw-spelling-quest-boss-demo";
const WORDS = ["rocket", "garden", "puzzle", "window"];
const RADAR = "radar-check";
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const items = () => buildSpellingRecallItems({ homeworkId: DEMO_HOMEWORK_ID, words: WORDS, evidenceIds: ["demo:filler-words"], measurementRole: "fresh_checkpoint", exposure: "practiced", occasionId: RADAR });

/** The decision a Planner would make at each stage of the demo, answered through the same locked tools. */
function demoDecision(cycle: LearningCycleRecordV2) {
  // Each board is the encounter alone: it bursts out with its ceremony the first time the board shows, and one tap opens it.
  const step = (id: string, title: string, encounter?: "quest" | "boss") => ({ nodeId: `${DEMO_HOMEWORK_ID}:${id}`, title, academicTarget: "Spell each word from memory", openingPurpose: "Check", ...(encounter ? { encounter } : {}),
    spelling: { builtInActivityId: RADAR, wordIds: items().map(item => item.wordId) } });
  const board = (title: string, encounter: "quest" | "boss", name: string) => ({ nextInstruments: [step(RADAR, name, encounter)],
    boardDefinition: { ...linearJourneyFixture([`${DEMO_HOMEWORK_ID}:${RADAR}`]), title } });
  const base = { status: "supported", reason: "Demo: recorded decision for the free Quest/Boss walkthrough.", preserve: [], change: [], testNext: [], nextEvidenceRequired: ["Typed words"], predictionEvaluationIds: [] };
  if (cycle.lifecycle === "baseline_evaluating") return { ...base, progressionAction: "generate_quest", ...board("Quest Board", "quest", "Quest: Lantern Trail") };
  if (cycle.lifecycle === "quest_evaluating") return { ...base, progressionAction: "generate_boss", ...board("Boss Board", "boss", "Boss: Storm Dragon") };
  return { ...base, status: "awaiting_calibration", progressionAction: "await_calibration" };
}

/** The demo child's Planner and map, answered in code; undefined for every other child. */
export function freeDemoPlannerFor(childId: string, homeworkId: string, opts: LearningCycleRepositoryOptions = {}) {
  if (childId !== DEMO_CHILD_ID || homeworkId !== DEMO_HOMEWORK_ID) return undefined;
  const cycle = getLearningCycle(childId, homeworkId, opts);
  if (!cycle) return undefined;
  const decision = demoDecision(cycle);
  console.log(` 🎮 [quest-boss-demo] [planner] [recorded] lifecycle=${cycle.lifecycle} action=${decision.progressionAction}`);
  const client = { messages: { stream: (payload: unknown) => ({ finalMessage: async () => successorToolReply(decision, payload) }) } } as never;
  return { client, draw: plainDraw };
}

/** Starts the demo over: her first check and first board are done, and the Quest board is ready. */
export async function seedQuestBossDemo(opts: LearningCycleRepositoryOptions = {}): Promise<LearningCycleRecordV2> {
  const rootDir = opts.rootDir ?? process.cwd();
  const childDir = resolveChildContextDir(DEMO_CHILD_ID, { rootDir });
  const cyclesDir = path.join(childDir, "homework", "cycles");
  const draftDir = resolveAdaptiveMathDraftDir(DEMO_CHILD_ID, DEMO_HOMEWORK_ID, { rootDir });
  for (const target of [path.join(cyclesDir, `${DEMO_HOMEWORK_ID}.json`), path.join(cyclesDir, ".planner", DEMO_HOMEWORK_ID), draftDir]) fs.rmSync(target, { recursive: true, force: true });
  const recall = items();
  const wordRadarConfig = { recallMode: "hidden_word_recall", inputMode: "keyboard" };
  const evidenceContract = { academic: true, engagement: true, companionObservations: true, spellingItems: Object.fromEntries(recall.map(item => [item.id, item])),
    itemRoles: Object.fromEntries(recall.map(item => [item.id, "fresh_checkpoint"])), nativeConfig: { activityId: "word-radar", wordRadarConfig } };
  const configFile = path.join(draftDir, "native-instruments", `${RADAR}.json`);
  const configuration = { version: 1, node: { id: RADAR, type: "word-radar", activityId: "word-radar", targets: WORDS, difficulty: 1, title: "Radar Check", wordRadarConfig }, evidenceContract };
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(configuration));
  const localArtifactPath = `/${path.relative(childDir, configFile).split(path.sep).join("/")}`;
  const node = (nodeId: string, role: string, state: string, skill: string) => ({
    nodeId, role, title: "Radar Check", state, implementationType: "word-radar", academicTarget: { domain: "spelling", skill, targets: WORDS }, algorithmOwner: "ai_tutor", theoryId: "demo-theory", experimentId: nodeId,
    mechanic: "word-radar", theme: "world", openingScreen: { title: "Radar Check", purpose: "Check" }, generationPrompt: null,
    artifactBinding: { contentId: `${DEMO_HOMEWORK_ID}:${nodeId}`, artifactId: `${DEMO_HOMEWORK_ID}:${nodeId}:native`, localArtifactPath, localArtworkPath: "/thumbnails/activities/word-radar.svg", contractFingerprint: sha(configuration), validationStatus: "passed" },
    artwork: { status: "ready", localPath: "/thumbnails/activities/word-radar.svg", prompt: null }, sfxContract: [], companionContract: { events: [] }, evidenceContract, evidenceIds: [] });
  createLearningCycle({ childId: DEMO_CHILD_ID, homeworkId: DEMO_HOMEWORK_ID, domain: "spelling",
    assignment: { title: "Demo words", contentFingerprint: "demo-filler", capturedEvidenceIds: ["demo:filler-words"], targets: WORDS },
    academicTheory: { theoryId: "demo-theory", revision: 1, hypothesis: "Demo only", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null,
    boardDefinition: linearJourneyFixture([RADAR]), initialLifecycle: "board_ready", nodes: [node(RADAR, "baseline", "ready", "spelling") as never] }, { rootDir });
  // Her first check, as the kiosk saves it: one fresh word right on her own, so Quest is earned.
  const cycleFile = path.join(cyclesDir, `${DEMO_HOMEWORK_ID}.json`);
  const saved = JSON.parse(fs.readFileSync(cycleFile, "utf8"));
  saved.nodes.push(node(`${DEMO_HOMEWORK_ID}:discovery`, "evaluation", "completed", "independent_recall"));
  saved.observations.push({ observationId: "demo-discovery-1", itemId: recall[0].id, sourceId: `evaluation:${DEMO_HOMEWORK_ID}:discovery`, childResponse: recall[0].word,
    constructLinks: [{ constructId: recall[0].constructId, role: "primary", confidence: 1 }], result: { correct: true, score: 1 }, assistance: { status: "unassisted", scaffolds: [] },
    exposure: "unseen", provenance: "independent_probe", observedAt: new Date().toISOString(), confounds: [`word_id:${recall[0].wordId}`, "measurement_role:fresh_checkpoint", "first_response"] });
  fs.writeFileSync(cycleFile, JSON.stringify(saved));
  // The kiosk opens this homework for the demo child.
  const homeworkFile = path.join(childDir, "homework", "current.json");
  fs.writeFileSync(homeworkFile, JSON.stringify({ version: 1, childId: DEMO_CHILD_ID, current: { homeworkId: DEMO_HOMEWORK_ID, weekOf: "2026-11-02", wordList: WORDS }, activeByDomain: {}, updatedAt: new Date().toISOString() }, null, 2));
  const { recordCanonicalNodeCompletion, recordSpellingDiscoveryAttempt, advanceCanonicalCycleFromEvidence } = await import("../engine/learningCycleRuntime");
  // Her first board, typed the way the kiosk records it, then finished.
  recall.forEach((item, index) => recordSpellingDiscoveryAttempt({ childId: DEMO_CHILD_ID, homeworkId: DEMO_HOMEWORK_ID,
    attempt: { attemptId: `demo-first-board-${index}`, itemId: item.id, attemptedValue: item.word, observedAt: new Date().toISOString() }, support: { status: "unassisted", scaffolds: [] } }, { rootDir }));
  recordCanonicalNodeCompletion({ childId: DEMO_CHILD_ID, homeworkId: DEMO_HOMEWORK_ID, nodeId: RADAR, sessionId: "demo-first-board",
    result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: recall.map(item => ({ target: item.id, correct: true, attemptedValue: item.word })) } }, { rootDir });
  await advanceCanonicalCycleFromEvidence({ childId: DEMO_CHILD_ID, homeworkId: DEMO_HOMEWORK_ID }, { rootDir });
  const ready = await prepareSuccessorBoard({ childId: DEMO_CHILD_ID, homeworkId: DEMO_HOMEWORK_ID }, { rootDir });
  console.log(` 🎮 [quest-boss-demo] [seed] [${ready.lifecycle === "quest_ready" ? "ready" : "not-ready"}] lifecycle=${ready.lifecycle}`);
  return ready;
}

if (process.argv[1]?.endsWith("questBossDemo.ts")) {
  seedQuestBossDemo().then(cycle => { if (cycle.lifecycle !== "quest_ready") process.exitCode = 1; })
    .catch(error => { console.error(" 🎮 [quest-boss-demo] [seed] [failed]", error); process.exitCode = 1; });
}
