import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { buildSpellingRecallItems } from "./learningCycleIngest";
import { createLearningCycle, getLearningCycle, type LearningCycleNodeContract } from "./learningCycleRepository";
import { publishBoardInstance } from "./learningBoardInstances";
import { recordCanonicalNodeCompletion } from "./learningCycleRuntime";
import { holdCompletion, raiseParentAlert, replayHeldCompletions, runStartupCheck, sunnyHealthFacts } from "./sunnyHealth";
import { resealPublishedBoards } from "./learningCycleRepository";

// 2026-11-10, Reina's test morning: a hand edit broke her boards' seals, every save after it was refused, and nothing
// in Sunny noticed. She worked 35 minutes, saw "Progress could not be saved", and reported it four times; Matilda
// promised "your answers will count this time". The human caught it because Reina came downstairs. The logs caught it
// ([completion] [failed], 10 times) but nothing read them, and the session packet held no failure at all. The lab
// never checked that a real record can still accept a save before a child sits down, or what happens to answers when
// a save is refused. Invariants: the start check reads every board's seal; refused answers are held, never lost, and
// replayed once the record accepts them; the parent is told; the companion is told, as a fact.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); vi.unstubAllGlobals(); delete process.env.SUNNY_PARENT_ALERT_URL; });

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-health-")); roots.push(rootDir);
  const childId = "health-child", homeworkId = "school-words";
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
  const base = { childId, homeworkId, domain: "spelling", assignment: { title: "School spelling", contentFingerprint: "recorded", capturedEvidenceIds: ["school:one"], targets: ["night", "light"] }, academicTheory: { theoryId: "theory", revision: 1, hypothesis: "Test", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null, nodes: [node], initialLifecycle: "board_ready" as const };
  const board = publishBoardInstance({ ...base, boards: [] } as never, { kind: "teaching", predecessorBoardId: null, plannerDecisionId: "original-plan", evidenceIds: ["school:one"], nodeIds: [node.nodeId], publishedAt: "2026-10-01T00:00:00Z" });
  createLearningCycle({ ...base, boards: [board] }, { rootDir });
  const cycleFile = fs.readdirSync(rootDir, { recursive: true }).map(String).find(name => name.endsWith(`cycles/${homeworkId}.json`))!;
  const completion = { childId, homeworkId, nodeId: node.nodeId, sessionId: "play-1",
    result: { completed: true, accuracy: 0.5, timeSpent_ms: 60_000, targetResults: items.map(item => ({ target: item.id, correct: item.word === "night", attemptedValue: item.word === "night" ? "night" : "lite" })) } };
  /** Reina's 11/10 failure: a published stop's saved content changed by hand, without resealing its board. */
  const handEdit = () => {
    const file = path.join(rootDir, cycleFile); const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    stored.nodes[0].openingScreen.purpose = "Edited by hand"; fs.writeFileSync(file, JSON.stringify(stored));
    return () => { stored.nodes[0].openingScreen.purpose = "Practice school words"; fs.writeFileSync(file, JSON.stringify(stored)); };
  };
  return { rootDir, childId, homeworkId, completion, handEdit };
}

it("finds a broken seal at start-up, before she sits down, and tells the parent", () => {
  const f = fixture();
  expect(runStartupCheck([f.childId], { rootDir: f.rootDir })).toMatchObject([{ childId: f.childId, ok: true }]);
  f.handEdit();
  const [result] = runStartupCheck([f.childId], { rootDir: f.rootDir });
  expect(result).toMatchObject({ ok: false, problem: expect.stringContaining("learning_board_topology_changed") });
  expect(sunnyHealthFacts(f.childId, { rootDir: f.rootDir })).toContain("cannot save her answers");
});

it("holds refused answers, tells the parent and the companion, and replays them once the record accepts them", async () => {
  const f = fixture();
  const sent: string[] = [];
  process.env.SUNNY_PARENT_ALERT_URL = "https://alerts.example/topic";
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => { sent.push(init.body); return { ok: true } as Response; }));
  const restore = f.handEdit();
  let error: unknown;
  try { recordCanonicalNodeCompletion(f.completion, { rootDir: f.rootDir }); } catch (caught) { error = caught; }
  expect(String(error)).toContain("learning_board_topology_changed");
  holdCompletion({ ...f.completion, error: String(error) }, { rootDir: f.rootDir });
  await raiseParentAlert({ childId: f.childId, kind: "save_failed", text: "Saving her answers failed; they are held." }, { rootDir: f.rootDir });
  expect(sent).toEqual([expect.stringContaining("Saving her answers failed")]);
  // Her companion sees it as a fact, so it never promises that this will count.
  const facts = sunnyHealthFacts(f.childId, { rootDir: f.rootDir });
  expect(facts).toContain("[Sunny's own state]");
  expect(facts).toContain("held");
  // Still broken: the held answers stay held.
  expect(replayHeldCompletions(f.childId, { rootDir: f.rootDir })).toMatchObject({ replayed: 0, stillHeld: 1 });
  restore();
  expect(replayHeldCompletions(f.childId, { rootDir: f.rootDir })).toMatchObject({ replayed: 1, stillHeld: 0 });
  expect(getLearningCycle(f.childId, f.homeworkId, { rootDir: f.rootDir })!.observations.filter(row => row.sourceId.includes("practice"))).not.toHaveLength(0);
  expect(sunnyHealthFacts(f.childId, { rootDir: f.rootDir })).toBe("");
});

// 2026-11-10, owner approved ("Yes, reseal"): Reina's boards were edited by hand on 11/9 (her sweater table) and
// never resealed. The edit was wanted; the missing seal was the bug. A reseal goes through Sunny's own record code:
// it refuses when nothing is broken, records each old and new seal with the reason, and saves work again after it.
it("reseals boards after an approved repair, records why, and lets her answers save again", () => {
  const f = fixture();
  expect(() => resealPublishedBoards(f.childId, f.homeworkId, "nothing broken", { rootDir: f.rootDir })).toThrow("reseal_not_needed");
  f.handEdit();
  expect(runStartupCheck([f.childId], { rootDir: f.rootDir })[0].ok).toBe(false);
  const result = resealPublishedBoards(f.childId, f.homeworkId, "owner-approved sweater table repair, 2026-11-09", { rootDir: f.rootDir });
  expect(result.resealed).toHaveLength(1);
  expect(runStartupCheck([f.childId], { rootDir: f.rootDir })[0].ok).toBe(true);
  expect(() => recordCanonicalNodeCompletion(f.completion, { rootDir: f.rootDir })).not.toThrow();
  const log = fs.readFileSync(path.join(f.rootDir, "src/context", f.childId, "sunny_health", "reseals.ndjson"), "utf8");
  expect(log).toContain("owner-approved sweater table repair");
  expect(sunnyHealthFacts(f.childId, { rootDir: f.rootDir })).toBe("");
});
