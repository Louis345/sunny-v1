/**
 * 2026-11-10, Ila's math: the games logged 34 answers and 26 were saved, so the given-vs-saved alert reported lost
 * answers. They were retries on the same problem that were folded into one. Human caught the count gap; the log had
 * both counts but no per-try record; the lab never retries. Now every try is saved, the scorecard counts first tries
 * and retries, and retries are never reported as lost.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLearningCycle } from "./learningCycleRepository";
import { recordCanonicalNodeCompletion } from "./learningCycleRuntime";
import { scorecardSection, timeRecord, writeSessionScorecard } from "./sessionScorecard";
import { getLearningCycle } from "./learningCycleRepository";

const item = (id: string) => ({ id, prompt: `What comes next? ${id}`, lineage: { sourceEvidenceIds: ["pdf:1"], exposure: "unseen" as const, measurementRole: "fresh_checkpoint" as const }, response: { mode: "numeric" as const, expected: 17 } });

describe("session scorecard with retries", () => {
  it("counts first tries and retries, and does not call retries lost", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-scorecard-"));
    try {
      createLearningCycle({ childId: "lab-child", homeworkId: "hw-math", domain: "math",
        assignment: { title: "Patterns", contentFingerprint: "fp", capturedEvidenceIds: ["pdf:1"], targets: ["pattern"] },
        academicTheory: { theoryId: "t", revision: 1, hypothesis: "h", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null,
        nodes: [{ nodeId: "kappa", role: "baseline", title: "Kappa Hop", state: "ready", academicTarget: { domain: "math", skill: "patterns", targets: ["p1"] },
          algorithmOwner: "retrieval-practice", theoryId: "t", experimentId: "e", mechanic: "hop", theme: "river", openingScreen: { title: "Kappa Hop", purpose: "p" },
          generationPrompt: null, artifactBinding: { contentId: "c", artifactId: "a", localArtifactPath: "/games/k.html", localArtworkPath: "/generated/k.png", contractFingerprint: "f", validationStatus: "passed" },
          artwork: { status: "ready", localPath: "/generated/k.png", prompt: null }, sfxContract: [], companionContract: { events: [] },
          evidenceContract: { academic: true, engagement: true, companionObservations: true, itemContracts: { p1: item("p1"), p2: item("p2") } }, evidenceIds: [] }] as never,
      }, { rootDir });
      const startedAt = new Date(Date.now() - 600_000).toISOString();
      const at = (min: number) => new Date(Date.parse(startedAt) + min * 60_000).toISOString();
      recordCanonicalNodeCompletion({ childId: "lab-child", homeworkId: "hw-math", sessionId: "s1", nodeId: "kappa", result: { completed: true, accuracy: 1, timeSpent_ms: 1000,
        targetResults: [{ target: "p1", correct: false, attemptedValue: "34", tries: ["34", "34", "34", "17"].map((attemptedValue, index) => ({ attemptedValue, at: Date.parse(at(1 + index / 10)) })) },
          { target: "p2", correct: true, attemptedValue: "17" }] } }, { rootDir });
      const sessionDir = path.join(rootDir, "logs/sessions/s1"); fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(sessionDir, "metadata.json"), JSON.stringify({ sessionId: "s1", startedAt }));
      fs.writeFileSync(path.join(sessionDir, "game-traces.ndjson"), [0, 1, 2, 3, 4].map(index => JSON.stringify({ ts: at(1 + index / 10), nodeId: "kappa", activityTitle: "Kappa Hop", type: "attempt_event" })).join("\n"));
      const card = writeSessionScorecard({ childId: "lab-child", homeworkId: "hw-math", sessionDir }, { rootDir })!;
      expect(card.answers).toMatchObject({ given: 5, firstTries: 2, firstTryRight: 1, retries: 3 });
      expect(fs.existsSync(path.join(rootDir, "src/context/lab-child/sunny_health/parent-alerts.ndjson"))).toBe(false);
      // Owner 2026-11-10: learning vs play minutes, per session and per day, for the Planner to weigh against results.
      expect(card.minutes).toMatchObject({ learning: expect.any(Number), play: 0, call: 0 });
      const cycle = getLearningCycle("lab-child", "hw-math", { rootDir })!;
      expect(scorecardSection(cycle, { rootDir })).toMatch(/minutes: learning games [\d.]+ min, play \(Mystery\/arcade\) 0 min/);
      expect(timeRecord(cycle, { rootDir })).toEqual({ sessions: [{ sessionId: "s1", startedAt, minutes: card.minutes }], days: [expect.objectContaining({ sessions: 1, minutes: card.minutes })] });
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });
});
