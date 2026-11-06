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

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-game-builder-")); roots.push(rootDir);
  const childId = "builder-child", homeworkId = "school-words";
  seedSpellingLab(rootDir, ["night", "light"], "", childId);
  const items = buildSpellingRecallItems({ homeworkId, words: ["night", "light"], evidenceIds: ["school:one"], measurementRole: "practice", exposure: "unseen" });
  const node: LearningCycleNodeContract = {
    nodeId: "practice", role: "baseline", title: "Word workshop", state: "ready", implementationType: "word-radar",
    academicTarget: { domain: "spelling", skill: "school words", targets: items.map(item => item.word) },
    algorithmOwner: "retrieval-practice", theoryId: "theory", experimentId: "practice", mechanic: "guided spelling", theme: "harbor",
    openingScreen: { title: "Word workshop", purpose: "Practice school words" }, generationPrompt: null,
    artifactBinding: { contentId: "practice", artifactId: "practice", localArtifactPath: "/games/practice.html", localArtworkPath: "/generated/practice.png", contractFingerprint: "recorded", validationStatus: "passed" },
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
  // The Planner is told what her game is and that each next board should let her choose it or a hand-made game.
  expect(plannerRequests[0].messages[0].content[0].text).toMatch(/generated-game[^\n]*choice[^\n]*hand-made/);
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
