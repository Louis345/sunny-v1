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

// Owner, 2026-11-21: Reina's new math board looked like it had no test date (a display copy was empty) and the owner
// asked for a guard so a missing date is never found by accident. The start check names each child's school test date,
// or says it is unknown, on every start and deploy.
it("names her school test date at start-up, or says it is unknown", async () => {
  const f = fixture();
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  expect(runStartupCheck([f.childId], { rootDir: f.rootDir })[0]).toMatchObject({ ok: true, testDate: null });
  expect(log.mock.calls.flat().join("\n")).toContain("test-date=unknown");
  const { resolveChildContextDir } = await import("../utils/contextRoot");
  const file = path.join(resolveChildContextDir(f.childId, { rootDir: f.rootDir }), "homework", "current.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ activeByDomain: { spelling: { homeworkId: f.homeworkId, testDate: "2026-11-30" } } }));
  log.mockClear();
  expect(runStartupCheck([f.childId], { rootDir: f.rootDir })[0]).toMatchObject({ ok: true, testDate: "2026-11-30" });
  expect(log.mock.calls.flat().join("\n")).toContain("test-date=2026-11-30");
  log.mockRestore();
});

// BUGS.md S47 (human-caught 2026-11-20 02:18 UTC): Elli told Ila "Sunny's having trouble saving answers… your parent's
// been told". Her answers were saved. The cause: three refused saves from an old spelling homework (11/11–11/12) were
// still held, so every turn's facts said Sunny cannot save right now, and they always added that the parent was told,
// though no alert is sent (the owner turned alerts off). Why the human caught it: only a person hears Elli say it.
// Why logs missed it: the facts were correct about the file, just not about now. Why the lab missed it: no test aged a
// held answer or checked the parent claim against an alert that was really sent.
it("tells her companion only about saves failing now, on this homework, and never claims the parent was told", () => {
  const f = fixture();
  holdCompletion({ ...f.completion, homeworkId: "old-homework", error: "learning_cycle_instrument_unknown_item:x" }, { rootDir: f.rootDir });
  expect(sunnyHealthFacts(f.childId, { rootDir: f.rootDir })).toBe("");
  holdCompletion({ ...f.completion, error: "disk full" }, { rootDir: f.rootDir });
  const tomorrow = new Date(Date.now() + 26 * 3_600_000);
  expect(sunnyHealthFacts(f.childId, { rootDir: f.rootDir, now: tomorrow })).toBe("");
  const facts = sunnyHealthFacts(f.childId, { rootDir: f.rootDir });
  expect(facts).toContain("1 finished game is held");
  expect(facts).not.toMatch(/parent/i);
});

// 11/22 (seen on Saori): Ila's 3 held saves from 11/11–11/12 were replayed and refused at every start since, because
// their stop is no longer playable or their word is not in the record; no replay can ever save them. Why the logs
// missed it: "still-held=3" every start looked like a waiting save. Kept, never deleted, for the owner's decision.
it("keeps a save the record can never accept, stops replaying it, and says so once", () => {
  const f = fixture();
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  holdCompletion({ ...f.completion, nodeId: "gone", error: "Error: learning_cycle_node_not_launchable:gone" }, { rootDir: f.rootDir });
  const first = replayHeldCompletions(f.childId, { rootDir: f.rootDir });
  const heldNow = JSON.parse(fs.readFileSync(path.join(f.rootDir, "src/context", f.childId, "sunny_health/held-completions.json"), "utf8"));
  expect({ first, error: heldNow[0].error }).toMatchObject({ first: { replayed: 0, stillHeld: 1, permanent: 1 } });
  expect(log.mock.calls.filter(call => String(call[0]).includes("[held-replay] [permanent]"))).toHaveLength(1);
  log.mockClear();
  expect(replayHeldCompletions(f.childId, { rootDir: f.rootDir })).toMatchObject({ replayed: 0, stillHeld: 1, permanent: 1 });
  expect(log.mock.calls.filter(call => String(call[0]).includes("[held-replay] [permanent]"))).toHaveLength(0);
  const held = JSON.parse(fs.readFileSync(path.join(f.rootDir, "src/context", f.childId, "sunny_health/held-completions.json"), "utf8"));
  expect(held).toEqual([expect.objectContaining({ nodeId: "gone", permanent: true })]);
});
