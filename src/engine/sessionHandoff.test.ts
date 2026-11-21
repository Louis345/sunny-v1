import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createLearningCycle, getLearningCycle } from "./learningCycleRepository";
import { handoffSection, writeSessionHandoff } from "./sessionHandoff";
import { measureRecordLines, type RecordFacts } from "./sessionRating";

/**
 * 2026-11-10 G11, rating Ila's 16 sessions: a board decision was made without its session's retro. Why the human
 * caught it: the rating said the Planner judged a board blind. Why logs did not: the log said "[handoff]
 * [before-decision] [skipped]" and the decision went ahead, but the Planner's question said nothing about why there
 * was no retro, so it could not tell "nothing to report" from "report missing". Why the lab missed it: lab sessions
 * always had answers and conversation. A retro skipped on purpose (she gave no answers) now leaves a factual note
 * the Planner reads, and the rating counts that decision N/A, not as a decision made blind.
 */
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const node = { nodeId: "radar", role: "baseline", title: "radar", state: "ready", academicTarget: { domain: "spelling", skill: "s", targets: [] },
  algorithmOwner: "retrieval-practice", theoryId: "t", experimentId: "e", mechanic: "m", theme: "t", openingScreen: { title: "radar", purpose: "p" }, generationPrompt: null,
  artifactBinding: null, artwork: { status: "ready", localPath: null, prompt: null }, sfxContract: [], companionContract: { events: [] },
  evidenceContract: { academic: true, engagement: true, companionObservations: true }, evidenceIds: [] };

it("leaves the Planner a factual note when a session's retro is skipped because she gave no answers", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-handoff-skip-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  createLearningCycle({ childId: "lab-child", homeworkId: "hw", domain: "spelling", assignment: { title: "hw", contentFingerprint: "hw", capturedEvidenceIds: ["x"], targets: [] },
    academicTheory: { theoryId: "t", revision: 1, hypothesis: "h", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null, nodes: [node] as never }, { rootDir });
  const sessionDir = path.join(rootDir, "logs/sessions/s9"); fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, "metadata.json"), JSON.stringify({ sessionId: "s9", child: "Ila", startedAt: "2026-11-10T15:00:00.000Z" }));
  fs.writeFileSync(path.join(sessionDir, "transcript.md"), "### 2026-11-10T15:01:00.000Z\n\n**user:** Hi Elli, can we FaceTime?\n");
  const create = vi.fn();
  expect(await writeSessionHandoff({ childId: "lab-child", sessionDir, homeworkId: "hw", client: { messages: { create } } as never }, { rootDir })).toBeUndefined();
  expect(create).not.toHaveBeenCalled();
  const section = handoffSection(getLearningCycle("lab-child", "hw", { rootDir })!, { rootDir });
  expect(section).toContain("No retro for session s9 (2026-11-10 15:00): she gave no answers in it (play only).");
});

it("counts a decision whose session had nothing to retro as N/A, and a missing retro as a failure", () => {
  const facts = (decisions: RecordFacts["decisions"]): RecordFacts => ({ domain: "spelling", serverFailures: 0, alertsInSession: 0, datedLogForDay: true, testDates: [], helpTurnsInGames: 0, helpedSaved: 0,
    playedGames: [], decisions, gamesWithNotes: 0, playedCount: 0, diagnoses: 1, builtSinceBatch: [], gamesOpened: [], paceLogged: [], newProblems: 0, trackRecordGames: 0 });
  const decision = (retro: "own" | "none_play_only" | "missing") => ({ hasOwnRetro: retro === "own", noRetroPlayOnly: retro === "none_play_only", hasCalls: true, questionChars: 1000, tools: [] });
  expect(measureRecordLines(facts([decision("none_play_only")])).G11).toMatchObject({ value: "no decision needing a retro this session" });
  expect(measureRecordLines(facts([decision("own"), decision("none_play_only")])).G11).toMatchObject({ pass: true, value: "1 of 1 decision(s) had this session's retro (1 more had nothing to retro: no answers)" });
  expect(measureRecordLines(facts([decision("missing"), decision("none_play_only")])).G11).toMatchObject({ pass: false, value: "0 of 1 decision(s) had this session's retro (1 more had nothing to retro: no answers)" });
});
