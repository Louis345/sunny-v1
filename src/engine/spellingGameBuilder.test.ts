import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { linearJourneyFixture } from "../scripts/fixtures/authoredJourney";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { plainDraw, successorToolReply } from "../scripts/fixtures/successorToolConversation";
import { buildSpellingRecallItems } from "./learningCycleIngest";
import { createLearningCycle, getLearningCycle, type LearningCycleNodeContract } from "./learningCycleRepository";
import { advanceCanonicalCycleFromEvidence, recordCanonicalNodeCompletion } from "./learningCycleRuntime";
import { preparingBoardInstance, publishBoardInstance } from "./learningBoardInstances";
import { prepareSuccessorBoard } from "./canonicalProgressionGenerator";
import type { SpellingGameClient } from "./spellingGameBuilder";
import { recordProductIssue } from "./productIssues";
import { spellingActivityMenu } from "./spellingTeachingTools";
import { spellingActivityCatalog } from "./assignmentPlanner";
import { NODE_REGISTRY } from "../shared/nodeRegistry";

// 2026-11-03 dinner test: games built from each girl's own profile and play history were picked over
// Sunny's hand-made games 3 of 3 times. The owner asked for that builder inside Sunny: one card on the
// next board, beside the hand-made games, so her picks become a taste signal and her answers count.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const GOOD = `<!doctype html><html><head><title>Lantern Harbor</title></head><body><p>Spell the word Elli says.</p><input id="box"><script>
const words = window.GAME_PARAMS.words; let i = 0;
window.openSpellingItem(words[i], "Lantern 1");
document.getElementById("box").onchange = event => { window.fireAttemptEvent({ domain: "spelling", target: words[i], attemptedValue: event.target.value, correct: event.target.value === words[i] });
  i += 1; if (i < words.length) window.openSpellingItem(words[i], "Lantern " + (i + 1)); else window.sendNodeComplete({ completed: true }); };
</script></body></html>`;
// Reports answers but never opens a word through the contract, so no answer could bind to her items.
const UNBOUND = GOOD.replace(/window\.openSpellingItem\(/g, "console.log(");

function fixture(played?: { title: string; path: string }) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-game-builder-")); roots.push(rootDir);
  const childId = "builder-child", homeworkId = "school-words";
  seedSpellingLab(rootDir, ["night", "light"], "", childId);
  const items = buildSpellingRecallItems({ homeworkId, words: ["night", "light"], evidenceIds: ["school:one"], measurementRole: "practice", exposure: "unseen" });
  const node: LearningCycleNodeContract = {
    nodeId: "practice", role: "baseline", title: played?.title ?? "Word workshop", state: "ready", implementationType: played ? "generated-game" : "word-radar",
    academicTarget: { domain: "spelling", skill: "school words", targets: items.map(item => item.word) },
    algorithmOwner: "retrieval-practice", theoryId: "theory", experimentId: "practice", mechanic: "guided spelling", theme: "harbor",
    openingScreen: { title: "Word workshop", purpose: "Practice school words" }, generationPrompt: null,
    artifactBinding: { contentId: "practice", artifactId: "practice", localArtifactPath: played?.path ?? "/games/practice.html", localArtworkPath: "/generated/practice.png", contractFingerprint: "recorded", validationStatus: "passed" },
    artwork: { status: "ready", localPath: "/generated/practice.png", prompt: null }, sfxContract: [], companionContract: { events: ["completion"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true, spellingItems: Object.fromEntries(items.map(item => [item.id, item])),
      nativeConfig: { activityId: "word-radar", wordRadarConfig: { recallMode: "hidden_word_recall", inputMode: "keyboard" } } }, evidenceIds: [],
  };
  const base = { childId, homeworkId, domain: "spelling", assignment: { title: "School spelling", contentFingerprint: "recorded", capturedEvidenceIds: ["school:one"], targets: ["night", "light"] }, academicTheory: { theoryId: "theory", revision: 1, hypothesis: "Test the spelling gap", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null, nodes: [node], initialLifecycle: "board_ready" as const };
  const board = publishBoardInstance({ ...base, boards: [] } as never, { kind: "teaching", predecessorBoardId: null, plannerDecisionId: "original-plan", evidenceIds: ["school:one"], nodeIds: [node.nodeId], publishedAt: "2026-10-01T00:00:00Z" });
  createLearningCycle({ ...base, boards: [board] }, { rootDir });
  recordCanonicalNodeCompletion({ childId, homeworkId, sessionId: "recorded", nodeId: node.nodeId, result: { completed: true, accuracy: 0, timeSpent_ms: 1000, targetResults: items.map(item => ({ target: item.id, correct: false, attemptedValue: "unknown" })) } }, { rootDir });
  const instrument = { nodeId: "her-game", title: "Lantern Harbor", academicTarget: "school words", openingPurpose: "Practice the missed words in a world made for her", spelling: { builtInActivityId: "generated-game", wordIds: items.map(item => item.wordId) } };
  const decision = { boardDefinition: linearJourneyFixture([instrument.nodeId]), status: "revised", reason: "Practice the gap in a game made for her", progressionAction: "generate_support", preserve: [], change: ["a game made for her"], testNext: ["recall"], nextEvidenceRequired: ["later recall"], nextInstruments: [instrument] };
  return { rootDir, childId, homeworkId, items, decision };
}

const plannerRequests: any[] = [];
async function plannedBoard(f: ReturnType<typeof fixture>) {
  const stream = (payload: any) => { plannerRequests.push(payload); return { finalMessage: async () => successorToolReply(f.decision as never, payload) }; };
  return advanceCanonicalCycleFromEvidence({ childId: f.childId, homeworkId: f.homeworkId, client: { messages: { stream } } as never, draw: plainDraw }, { rootDir: f.rootDir });
}

/** A recorded builder: each request gets the next reply, and every request is kept for inspection. */
function recordedBuilder(replies: string[]): { requests: any[]; client: SpellingGameClient } {
  const requests: any[] = [];
  return { requests, client: { messages: { stream: (request: any) => { requests.push(request); const text = replies[Math.min(requests.length - 1, replies.length - 1)]!;
    return { finalMessage: async () => ({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: "end_turn" }) as never }; } } } };
}

it("offers her own generated game on the next-board menu, as practice", () => {
  const f = fixture();
  const menu = spellingActivityMenu(spellingActivityCatalog(f.childId));
  expect(menu.choices).toContain("generated-game");
  expect(menu.roles("generated-game")).toEqual(["practice"]);
});

it("builds her game from her chart and the Planner's story, binds every word, and launches it from her folder", async () => {
  const f = fixture();
  const planned = await plannedBoard(f);
  const node = planned.nodes.find(row => preparingBoardInstance(planned)!.nodeIds.includes(row.nodeId))!;
  expect(node.implementationType).toBe("generated-game");
  // The Planner is told what her game is; whether to offer it is its call (owner, 2026-11-08).
  expect(plannerRequests[0].messages[0].content[0].text).toMatch(/generated-game is a new game Sunny builds for her/);
  const builder = recordedBuilder([GOOD]);
  const ready = await prepareSuccessorBoard({ childId: f.childId, homeworkId: f.homeworkId, spellingGameClient: builder.client }, { rootDir: f.rootDir });
  const built = ready.nodes.find(row => row.nodeId === node.nodeId)!;
  // One model call, asked through Sunny's model rule, with her words and the Planner's story for this stop.
  expect(builder.requests).toHaveLength(1);
  const ask = builder.requests[0].messages[0].content as string;
  expect(builder.requests[0].model).toBe("claude-sonnet-5-5");
  expect(ask).toContain("night"); expect(ask).toContain("Story: Lantern Harbor");
  expect(built.notReadyReason).toBeUndefined();
  expect(built.artifactBinding).toMatchObject({ validationStatus: "passed", localArtifactPath: expect.stringMatching(/^\/homework\/games\/school-words\/.+\.html$/) });
  expect(built.artifactBinding!.creativeProvenance).toMatchObject({ builderModel: "claude-sonnet-5-5" });
  const file = path.join(f.rootDir, "src/context", f.childId, built.artifactBinding!.localArtifactPath);
  const html = fs.readFileSync(file, "utf8");
  // Code, not the model, loads Sunny's contract and locks the game off the internet.
  expect(html).toContain('<script src="/games/_contract.js"></script>');
  expect(html).toMatch(/Content-Security-Policy[^>]*connect-src 'none'/);
  // Every one of her frozen items stays on the node, so each answer can bind to its item.
  expect(Object.keys(built.evidenceContract.spellingItems ?? {})).toHaveLength(2);
  const url = NODE_REGISTRY["generated-game"]!.getUrl!({ id: built.nodeId, type: "generated-game", words: ["night", "light"], gameHtmlPath: built.artifactBinding!.localArtifactPath, date: f.homeworkId,
    spellingItemBindings: [{ itemId: "item-night", word: "night" }] } as never, { childId: f.childId, companion: "elli", previewParam: "" } as never);
  expect(url).toMatch(new RegExp(`^/api/homework/game/${f.childId}/school-words/[^?]+\\.html\\?`));
  expect(new URL(url, "http://kiosk").searchParams.get("spellingItemBindings")).toContain("item-night");
});

it("sends a game whose answers could not bind back once, with the problem, and keeps the repaired game", async () => {
  const f = fixture();
  await plannedBoard(f);
  const builder = recordedBuilder([UNBOUND, GOOD]);
  const ready = await prepareSuccessorBoard({ childId: f.childId, homeworkId: f.homeworkId, spellingGameClient: builder.client }, { rootDir: f.rootDir });
  expect(builder.requests).toHaveLength(2);
  expect(JSON.stringify(builder.requests[1].messages.at(-1).content)).toMatch(/openSpellingItem/);
  const built = ready.nodes.find(row => row.implementationType === "generated-game")!;
  expect(built.notReadyReason).toBeUndefined();
  expect(fs.readFileSync(path.join(f.rootDir, "src/context", f.childId, built.artifactBinding!.localArtifactPath), "utf8")).toContain("openSpellingItem");
});

it("degrades only her game to Not ready when the repair still cannot bind answers, and never buys it again", async () => {
  const f = fixture();
  await plannedBoard(f);
  const builder = recordedBuilder([UNBOUND]);
  const ready = await prepareSuccessorBoard({ childId: f.childId, homeworkId: f.homeworkId, spellingGameClient: builder.client }, { rootDir: f.rootDir });
  expect(builder.requests).toHaveLength(2);
  const built = ready.nodes.find(row => row.implementationType === "generated-game")!;
  expect(built.notReadyReason).toMatch(/generated_game_problems/);
  expect(preparingBoardInstance(getLearningCycle(f.childId, f.homeworkId, { rootDir: f.rootDir })!)).toBeUndefined();
  await prepareSuccessorBoard({ childId: f.childId, homeworkId: f.homeworkId, spellingGameClient: builder.client }, { rootDir: f.rootDir });
  expect(builder.requests).toHaveLength(2);
});

// 2026-11-08 owner (Ila's "inport"): her game could only be described by a story, so the Planner had no way to
// build a game aimed at the m before p it kept seeing. The focus it names now reaches the builder's ask.
it("aims her game at the one error the Planner names", async () => {
  const f = fixture();
  (f.decision.nextInstruments[0] as Record<string, unknown>).focus = "the m before p in import";
  const planned = await plannedBoard(f);
  expect(plannerRequests.at(-1).tools.find((tool: any) => tool.name === "add_step").input_schema.properties.focus).toBeTruthy();
  expect(planned.nodes.find(row => row.implementationType === "generated-game")).toMatchObject({ focus: "the m before p in import" });
  const builder = recordedBuilder([GOOD]);
  await prepareSuccessorBoard({ childId: f.childId, homeworkId: f.homeworkId, spellingGameClient: builder.client }, { rootDir: f.rootDir });
  expect(builder.requests[0].messages[0].content as string).toContain("- What this game is aimed at: the m before p in import");
});

// 2026-11-08 Reina (math Boss, stop 4): "the hints, I tried them all, and they kind of were too long. They didn't
// make sense." Matilda saved it as a product issue, but no builder ever read it, so her next games were written
// blind. The human heard it; the logs recorded it ([product-issue] [recorded]); the lab never asked whether what
// she says about Sunny's games reaches the one who builds them. Facts only: her words, where, when.
it("shows the builder what she said about Sunny's games, in her own words, and leaves the conclusion to it", async () => {
  const f = fixture();
  recordProductIssue({ childId: f.childId, activityId: "generated-game", nodeId: "practice", issueType: "flow_complaint", severity: "medium", source: "child_utterance", confidence: 0.9,
    childUtterance: "the hints were too long, they didn't make sense", evidenceText: "Hints too long.", createdAt: "2026-11-08T22:20:00Z" }, { rootDir: f.rootDir });
  recordProductIssue({ childId: f.childId, activityId: "pronunciation", issueType: "companion_lag", severity: "medium", source: "observed_behavior", confidence: 0.7,
    childUtterance: "session transcript contained product complaint", evidenceText: "Audit.", createdAt: "2026-11-08T22:49:00Z" }, { rootDir: f.rootDir });
  await plannedBoard(f);
  const builder = recordedBuilder([GOOD]);
  await prepareSuccessorBoard({ childId: f.childId, homeworkId: f.homeworkId, spellingGameClient: builder.client }, { rootDir: f.rootDir });
  const ask = builder.requests[0].messages[0].content as string;
  expect(ask).toContain(`2026-11-08, at \\"Word workshop\\": \\"the hints were too long, they didn't make sense\\"`);
  expect(ask).not.toContain("session transcript contained product complaint");
});

// 2026-11-09 Ila: a built game hid its keyboard behind an unexplained step; the companion could not see the step.
it("asks every built game to report each step and its on-screen instruction", async () => {
  const { buildSpellingGameAsk, buildMathGameAsk } = await import("./spellingGameBuilder");
  const f = fixture();
  const cycle = getLearningCycle(f.childId, f.homeworkId, { rootDir: f.rootDir })!;
  const node = cycle.nodes[0];
  for (const ask of [buildSpellingGameAsk({ cycle, node, rootDir: f.rootDir }), buildMathGameAsk({ cycle, node, rootDir: f.rootDir })]) {
    expect(ask).toContain('window.reportStep("<short step name>", "<the instruction on screen>")');
  }
});

// 2026-11-09 owner, after Ila's Spelling Voice Gate (the highlight of her day; she wanted to see what was behind the
// door): a game she loved could only be replayed with its own words, because its words were written into it. The
// Planner was missing a tool, not a rule: build from a game she played, so she keeps the mechanic she already
// learned and gets new content behind the door. Whether and when to reuse stays the Planner's call.
it("builds her next game from a game she played when the Planner names it, keeping what she already learned", async () => {
  const playedPath = "/homework/games/school-words/voice-gate.html";
  const f = fixture({ title: "Spelling Voice Gate", path: playedPath });
  // Her completed game is a built-for-her game with its finished HTML in her folder.
  fs.mkdirSync(path.join(f.rootDir, "src/context", f.childId, "homework/games/school-words"), { recursive: true });
  fs.writeFileSync(path.join(f.rootDir, "src/context", f.childId, playedPath), `<!doctype html><html><body><div id="door">Voice Gate door</div></body></html>`);
  (f.decision.nextInstruments[0] as Record<string, unknown>).buildFrom = "practice";
  const planned = await plannedBoard(f);
  const prompt = plannerRequests.at(-1).messages[0].content[0].text as string;
  expect(prompt).toMatch(/Games Sunny built for her that she played[^\n]*build_from/);
  expect(prompt).toContain('"title":"Spelling Voice Gate"');
  expect(plannerRequests.at(-1).tools.find((tool: any) => tool.name === "add_step").input_schema.properties.build_from.enum).toContain("practice");
  expect(planned.nodes.find(row => row.implementationType === "generated-game" && row.nodeId !== "practice")).toMatchObject({ buildFrom: "practice" });
  const builder = recordedBuilder([GOOD]);
  await prepareSuccessorBoard({ childId: f.childId, homeworkId: f.homeworkId, spellingGameClient: builder.client }, { rootDir: f.rootDir });
  const ask = builder.requests[0].messages[0].content as string;
  expect(ask).toContain('Start from "Spelling Voice Gate", a game she already played');
  expect(ask).toContain("Voice Gate door");
  expect(ask).toContain("night");
});

// 2026-11-10, both audits: the builder was told to invent a new world every time and never told which games she
// finished fast, which walled her, or what the Planner concluded about them; lessons about a game went to BUGS.md,
// which only engineers read. Each played game now carries its track record (answers, right, minutes to her first
// answer from the scorecards) and the Planner's own keep / fix / retire note, for the Planner and the builder.
it("gives the Planner and the builder each played game's track record and the Planner's keep, fix or retire note", async () => {
  const playedPath = "/homework/games/school-words/voice-gate.html";
  const f = fixture({ title: "Spelling Voice Gate", path: playedPath });
  fs.mkdirSync(path.join(f.rootDir, "src/context", f.childId, "homework/games/school-words"), { recursive: true });
  fs.writeFileSync(path.join(f.rootDir, "src/context", f.childId, playedPath), "<!doctype html><html><body>gate</body></html>");
  fs.mkdirSync(path.join(f.rootDir, "src/context", f.childId, "homework/scorecards"), { recursive: true });
  fs.writeFileSync(path.join(f.rootDir, "src/context", f.childId, "homework/scorecards/school-words.ndjson"),
    `${JSON.stringify({ sessionId: "s1", startedAt: "2026-11-10T00:22:00Z", homeworkId: "school-words", answers: {}, games: [{ title: "Spelling Voice Gate", answers: 11, right: 5, finished: true, minutesToFirstAnswer: 14.9 }], helpRequests: 4, bugsReported: 1, predictions: { checked: 0, inRange: 0 } })}\n`);
  (f.decision as Record<string, unknown>).gameNotes = [{ game: "practice", verdict: "keep", why: "She loved the doors once she understood them." }];
  await plannedBoard(f);
  const prompt = plannerRequests.at(-1).messages[0].content[0].text as string;
  expect(prompt).toContain('"minutesToFirstAnswer":14.9');
  expect(plannerRequests.at(-1).tools.find((tool: any) => tool.name === "decide").input_schema.properties.game_notes).toBeTruthy();
  const builder = recordedBuilder([GOOD]);
  await prepareSuccessorBoard({ childId: f.childId, homeworkId: f.homeworkId, spellingGameClient: builder.client }, { rootDir: f.rootDir });
  const ask = builder.requests[0].messages[0].content as string;
  expect(ask).toContain("14.9");
  expect(ask).toContain("She loved the doors once she understood them.");
});

