import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { linearJourneyFixture } from "../scripts/fixtures/authoredJourney";
import { builtInWordRadar } from "../scripts/fixtures/builtInSpellingActivity";
import { PAST_WEEKS_CHILD, WEEK1, WEEK2, seedPastWeeks } from "../scripts/fixtures/pastWeeksChild";
import { recordedIntake } from "../scripts/fixtures/recordedIntake";
import { recordedSpellingDiagnostic, seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { plainDraw, successorToolReply } from "../scripts/fixtures/successorToolConversation";
import { runSpellingDiscoveryIntake } from "../scripts/ingestHomework";
import * as canvas from "./adventureBoardCanvas";
import { resolveAdaptiveMathDraftDir } from "./adaptiveMathDiscovery";
import { buildSpellingRecallItems } from "./learningCycleIngest";
import { createLearningCycle, getLearningCycle } from "./learningCycleRepository";
import * as runtime from "./learningCycleRuntime";
import { pastWeeksLine, readPastWeeks } from "./pastWeeks";
import type { ToolLoopRequest } from "./plannerToolLoop";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";

// 2026-11-10 owner: a new week's FIRST board is where forgetting hurts most. Week 3 opens a list of -ant words; week 1
// already showed she wrote -ent for -ant until a recall-first race, and its graded test came back 5 of 6. Before this,
// the week-3 Planner was asked with "No earlier decisions on this list yet." These tests walk the real question paths.
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function lab(words: string[]) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-past-weeks-planner-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  vi.stubEnv("ANTHROPIC_API_KEY", ""); vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("GROK_API_KEY", "");
  vi.stubGlobal("fetch", () => { throw Error("lab_forbids_network"); });
  const sourceFile = seedSpellingLab(rootDir, words, "", PAST_WEEKS_CHILD);
  seedPastWeeks(rootDir);
  return { rootDir, sourceFile };
}
const promptOf = (request: ToolLoopRequest): string => { const first = request.messages[0].content; return typeof first === "string" ? first : first.flatMap(block => block.type === "text" ? [block.text] : []).join("\n"); };
const results = (request: ToolLoopRequest) => (request.messages.at(-1)!.content as Anthropic.Messages.ToolResultBlockParam[]).map(block => ({ error: block.is_error === true, value: block.is_error ? block.content : JSON.parse(String(block.content)) }));
const message = (turn: number, calls: Array<{ name: string; input: unknown }>) => ({ id: `past-${turn}`, type: "message", role: "assistant", model: "claude-sonnet-5", stop_reason: "tool_use", stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 }, content: calls.map((call, index) => ({ type: "tool_use", id: `past-${turn}-${index}`, ...call })) }) as unknown as Anthropic.Messages.Message;
const read = (view: string, extra: Record<string, unknown> = {}) => ({ name: "read_past_weeks", input: { view, week: "", query: "", offset: 0, limit: 20, ...extra } });

it("week 3's first board: the intake Planner sees one line of her earlier weeks and pulls -ant results, recall-first and the graded test from read_past_weeks", async () => {
  const words = ["elegant", "giant", "ancient"];
  const { rootDir, sourceFile } = lab(words);
  const sent: ToolLoopRequest[] = [];
  const { homeworkId } = await runSpellingDiscoveryIntake({ rootDir, childId: PAST_WEEKS_CHILD, sourceFile }, { plannerTools: packet => {
    const recorded = recordedIntake(async given => ({ draft: { diagnostic: recordedSpellingDiagnostic(given), title: "Week 10 words", words: words.map(word => ({ word, pageNumber: 1 })), uncertainty: [] } }))(packet);
    return { draw: recorded.draw, send: async (request, turn) => {
      sent.push(request);
      return turn === 1 ? message(turn, [read("index"), read("search", { query: "-ant" }), read("conclusions"), read("week", { week: WEEK1, offset: 0, limit: 100 })]) : recorded.send(request, turn);
    } };
  } });
  const opening = promptOf(sent[0]);
  expect(opening).toContain(`Her earlier weeks (2 on record, newest first): ${WEEK2} "Subtraction with regrouping"`);
  expect(opening).toContain(`${WEEK1} "Week 8 words: -ant and -ent" (spelling, from 2026-10-26; school test 5 of 6 right (83%), graded 2026-11-02)`);
  expect(opening).not.toContain("Recall-first worked");
  expect(sent[0].tools.map(tool => tool.name)).toContain("read_past_weeks");
  const [index, ant, conclusions, week] = results(sent[1]);
  expect(index.value.rows.map((row: { week: string }) => row.week)).toEqual([WEEK2, WEEK1]);
  expect(index.value.rows[1].schoolTest).toBe("5 of 6 right (83%), graded 2026-11-02");
  expect(ant.value.targets.map((row: { target: string }) => row.target)).toEqual(["dormant", "pleasant", "servant"]);
  expect(ant.value.targets[0]).toMatchObject({ week: WEEK1, firstTriesOnHerOwn: `board 1 missed "dorment" (2026-10-26); board 2 missed "dorment" (2026-10-27); board 3 right (2026-10-29)`, schoolTest: "right" });
  expect(conclusions.value.rows[1]).toMatchObject({ week: WEEK1, date: "2026-10-28", selfReview: { whatIKeep: "Recall-first worked: she says the word, spells it from memory, then checks." },
    evidence: "her first tries on its words on her own: before 0 of 8 right -> after 3 of 4 right: up" });
  expect(week.value.lines).toContain(`School test: graded 2026-11-02: 5 of 6 right (83%); missed: import (wrote "inport")`);
  // The week being planned is never its own past, and the archive is frozen beside the turns.
  expect(opening).not.toContain(homeworkId);
  expect(fs.existsSync(path.join(resolveAdaptiveMathDraftDir(PAST_WEEKS_CHILD, homeworkId, { rootDir }), "spelling-intake-tools-past-weeks.json"))).toBe(true);
  expect(getLearningCycle(PAST_WEEKS_CHILD, homeworkId, { rootDir })!.assignment.targets).toEqual(words);
}, 60000);

it("the next-board question carries the same line and tool, with the archive frozen in the question so a restart asks it again", async () => {
  const words = ["elegant", "giant"], homeworkId = "hw-spelling-wk3";
  const { rootDir } = lab(words);
  vi.spyOn(canvas, "verifyPreparingBoardCanvas").mockResolvedValue(undefined);
  const items = buildSpellingRecallItems({ homeworkId, words, evidenceIds: ["school:wk3"], measurementRole: "practice", exposure: "practiced", occasionId: "first" });
  createLearningCycle({ childId: PAST_WEEKS_CHILD, homeworkId, domain: "spelling", assignment: { title: "Week 10 words", contentFingerprint: "wk3", capturedEvidenceIds: ["school:wk3"], targets: words },
    academicTheory: { theoryId: "wk3-theory", revision: 1, hypothesis: "Recall-first may carry over", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null,
    boardDefinition: linearJourneyFixture(["radar"]), initialLifecycle: "board_ready", nodes: [{
      nodeId: "radar", role: "baseline", title: "Radar Run", state: "ready", academicTarget: { domain: "spelling", skill: "spelling", targets: words }, algorithmOwner: "ai_tutor", theoryId: "wk3-theory", experimentId: "radar",
      mechanic: "word-radar", theme: "world", openingScreen: { title: "Radar Run", purpose: "Practice" }, generationPrompt: null, artwork: { status: "ready", localPath: "/generated/world.jpeg", prompt: null }, sfxContract: [], companionContract: { events: [] }, evidenceIds: [],
      ...builtInWordRadar({ rootDir, childId: PAST_WEEKS_CHILD, homeworkId, nodeId: "radar", title: "Radar Run", items }),
    }] } as never, { rootDir });
  const opts = { rootDir }, at = new Date(Date.now() - 3_600_000).toISOString();
  const node = getLearningCycle(PAST_WEEKS_CHILD, homeworkId, opts)!.nodes[0];
  const own = Object.values(node.evidenceContract.spellingItems!);
  own.forEach(item => runtime.recordSpellingDiscoveryAttempt({ childId: PAST_WEEKS_CHILD, homeworkId, support: { status: "unassisted", scaffolds: [] },
    attempt: { attemptId: `radar:${item.id}`, itemId: item.id, attemptedValue: item.word === "giant" ? "gient" : item.word, observedAt: at } }, opts));
  runtime.recordCanonicalNodeCompletion({ childId: PAST_WEEKS_CHILD, homeworkId, nodeId: "radar", sessionId: "radar-session", result: { completed: true, accuracy: 0.5, timeSpent_ms: 100,
    targetResults: own.map(item => ({ target: item.id, correct: item.word !== "giant", attemptedValue: item.word === "giant" ? "gient" : item.word })) } }, opts);
  const decision = { status: "revised", reason: "giant came back as gient, the -ent for -ant of week 1.", progressionAction: "generate_support", change: ["Recall-first race, as in week 1."], testNext: ["giant on her own"],
    boardDefinition: linearJourneyFixture(["again"]), nextInstruments: [{ nodeId: "again", title: "Radar Again", academicTarget: "-ant", openingPurpose: "Practice", spelling: { builtInActivityId: "radar", wordIds: items.map(item => item.wordId) } }] };
  const requests: any[] = [];
  await runtime.advanceCanonicalCycleFromEvidence({ childId: PAST_WEEKS_CHILD, homeworkId, draw: plainDraw,
    client: { messages: { stream: (payload: any) => { requests.push(payload); return { finalMessage: async () => successorToolReply(decision, payload) }; } } } as never } as never, opts);
  const question = promptOf(requests[0]);
  expect(question).toContain(pastWeeksLine(readPastWeeks(PAST_WEEKS_CHILD, { rootDir, excludeHomeworkIds: [homeworkId] })));
  expect(question).toContain(`${WEEK1} "Week 8 words: -ant and -ent"`);
  expect(requests[0].tools.map((tool: { name: string }) => tool.name)).toContain("read_past_weeks");
  const frozen = fs.readdirSync(path.join(rootDir, "src/context", PAST_WEEKS_CHILD, "homework/cycles/.planner", homeworkId), { recursive: true }).map(String).find(file => file.endsWith("-tools.question.json"))!;
  const saved = JSON.parse(fs.readFileSync(path.join(rootDir, "src/context", PAST_WEEKS_CHILD, "homework/cycles/.planner", homeworkId, frozen), "utf8"));
  expect(saved.facts.pastWeeks.weeks.map((week: { homeworkId: string }) => week.homeworkId)).toEqual([WEEK2, WEEK1]);
}, 120000);

it("an older frozen next-board question, saved without past weeks, keeps its exact tools", () => {
  const facts: SuccessorFacts = { builtIns: [], activities: [{ id: "generated-game", checkpoint: false, setup: { type: "generated-game" } }], rerunnable: () => true, evaluationIds: [], allowedActions: ["generate_support"], idPrefix: "next" };
  expect(spellingSuccessorToolkit(facts).tools.map(tool => tool.name)).not.toContain("read_past_weeks");
  expect(spellingSuccessorToolkit({ ...facts, pastWeeks: { version: 1, childId: "x", weeks: [] } }).tools.map(tool => tool.name)).not.toContain("read_past_weeks");
});

it("week 3's first math board: the math intake question carries the line and read_past_weeks", async () => {
  const { rootDir } = lab(["night"]);
  const sourceFile = path.join(rootDir, "subtract.txt");
  fs.writeFileSync(sourceFile, "Subtraction across zeros\n1. 500 - 236 = ___\n");
  const sent: ToolLoopRequest[] = [];
  const send = async (request: ToolLoopRequest, turn: number) => { sent.push(request); return message(turn, turn === 1 ? [read("search", { query: "subtract" })] : [
    { name: "record_items", input: { items: [{ id: "p1", problem: "500 - 236 =", page_number: 1, answer: { kind: "number", value: 264 } }], source_notes: [] } },
    { name: "add_stop", input: { title: "Zero Canyon", story: "A canyon of zeros", picture: "A canyon", purpose: "Borrow across zeros", item_ids: ["p1"], check_first: true,
      prediction: { expected_correct_min: 0.3, expected_correct_max: 0.7, confidence: 0.5, why: "Week 2 she borrowed with blocks." } } },
    { name: "finish_intake", input: { title: "Subtraction across zeros", theory: "Borrowing across a zero is the step to watch." } }]); };
  const game = { messages: { stream: () => ({ finalMessage: async () => ({ content: [{ type: "text", text: "<html><body>game</body></html>" }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" }) }) } } as never;
  const { runItemsIntake } = await import("../scripts/itemsIntake");
  await runItemsIntake({ childId: PAST_WEEKS_CHILD, sourceFile, rootDir }, { send, draw: plainDraw, gameClient: game }).catch(() => undefined);
  expect(promptOf(sent[0])).toContain(`Her earlier weeks (2 on record, newest first): ${WEEK2} "Subtraction with regrouping"`);
  expect(sent[0].tools.map(tool => tool.name)).toContain("read_past_weeks");
  const [search] = results(sent[1]);
  expect(search.value.targets.map((row: { target: string }) => row.target)).toEqual([`p2 "Subtract 165 from 400."`]);
  expect(search.value.notes.map((row: { where: string }) => row.where)).toContain("decision 1 reason");
}, 60000);

it("the Teaching board question carries the line and read_past_weeks when given her earlier weeks", async () => {
  const { rootDir } = lab(["giant"]);
  const { buildAssignmentPlanningPacket, prepareSpellingDiagnosticPacket } = await import("./assignmentPlanner");
  const { askLearningPlanner } = await import("./directMathExperience");
  const { getChildChart } = await import("../profiles/childChart");
  const text = "Spelling Week 10\ngiant\nelegant";
  const extraction = { sourceKind: "scanned_assignment_image", sourcePath: "/nonexistent/wk3.png", filename: "wk3.png", mediaType: "image/png", fileHash: "f".repeat(64), extractionMethod: "tesseract", pages: [{ pageNumber: 1, text }], fullText: text, warnings: [] } as never;
  const chart = getChildChart(PAST_WEEKS_CHILD, { rootDir });
  const packet = prepareSpellingDiagnosticPacket(buildAssignmentPlanningPacket({ childId: PAST_WEEKS_CHILD, extraction, childChart: chart }), chart);
  const sent: any[] = [];
  const client = { messages: { stream: (request: any) => { sent.push(request); return { finalMessage: async () => ({ ...message(sent.length, []), content: [{ type: "text", text: "thinking" }] }) }; } } } as never;
  const pastWeeks = readPastWeeks(PAST_WEEKS_CHILD, { rootDir });
  await askLearningPlanner({ domain: "spelling", childId: PAST_WEEKS_CHILD, chart, extraction, packet, client, pastWeeks }).catch(() => undefined);
  expect(promptOf(sent[0])).toContain(pastWeeksLine(pastWeeks));
  expect(sent[0].tools.map((tool: { name: string }) => tool.name)).toContain("read_past_weeks");
});
