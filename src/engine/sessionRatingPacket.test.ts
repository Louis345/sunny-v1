/**
 * 2026-11-10: `sunny:rate -- --child ila --session <math session>` rated it "no math answer this session" because Ila
 * had since been switched to spelling and the rating read the chart's selected lane. Why the human caught it: the
 * rating contradicted the session he watched. Why logs did not: the rating logged only its verdict, not which homework
 * it read. Why the lab missed it: lab ratings run right after the session, before any subject switch.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLearningCycle } from "./learningCycleRepository";
import { sessionLearningCycle } from "./sessionRatingPacket";

const node = (nodeId: string, domain: string) => ({ nodeId, role: "baseline", title: nodeId, state: "ready", academicTarget: { domain, skill: "s", targets: [] },
  algorithmOwner: "retrieval-practice", theoryId: "t", experimentId: "e", mechanic: "m", theme: "t", openingScreen: { title: nodeId, purpose: "p" }, generationPrompt: null,
  artifactBinding: null, artwork: { status: "ready", localPath: null, prompt: null }, sfxContract: [], companionContract: { events: [] },
  evidenceContract: { academic: true, engagement: true, companionObservations: true }, evidenceIds: [] });
const cycle = (homeworkId: string, domain: string, nodeId: string) => ({ childId: "lab-child", homeworkId, domain,
  assignment: { title: homeworkId, contentFingerprint: homeworkId, capturedEvidenceIds: ["x"], targets: [] },
  academicTheory: { theoryId: "t", revision: 1, hypothesis: "h", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null, nodes: [node(nodeId, domain)] as never });

describe("the rating reads the homework the session played", () => {
  it("finds the session's cycle from its own game traces, whatever subject is selected now", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-rate-cycle-"));
    try {
      createLearningCycle(cycle("hw-math", "math", "kappa-hop"), { rootDir });
      createLearningCycle(cycle("hw-spelling", "spelling", "word-radar"), { rootDir });
      const sessionDir = path.join(rootDir, "logs/sessions/s1"); fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(sessionDir, "metadata.json"), JSON.stringify({ sessionId: "s1", startedAt: "2026-11-10T15:00:00Z" }));
      fs.writeFileSync(path.join(sessionDir, "game-traces.ndjson"), [{ ts: "2026-11-10T15:01:00Z", nodeId: "kappa-hop", type: "attempt_event" }].map(row => JSON.stringify(row)).join("\n"));
      expect(sessionLearningCycle("lab-child", sessionDir, { rootDir })?.homeworkId).toBe("hw-math");
      fs.writeFileSync(path.join(sessionDir, "game-traces.ndjson"), "");
      expect(sessionLearningCycle("lab-child", sessionDir, { rootDir })).toBeNull();
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });
});

// 2026-11-10: the kiosk runs for days, so the startup check of a session's kiosk run can sit in an earlier day's
// dated log. Why the human caught it: Ila's sessions failed N4 on a kiosk that had checked itself. Why logs did not: the
// check is written once, in the log of the day the kiosk started. Why the lab missed it: lab logs never span a day.
describe("the startup check of the session's kiosk run", () => {
  it("reads startup check lines from earlier dated server logs, never later ones", async () => {
    const { earlierStartupLines } = await import("./sessionRatingPacket");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-rate-startup-"));
    try {
      fs.writeFileSync(path.join(dir, "2026-11-08.log"), "2026-11-08T07:00:00.000Z  🎮 [startup-check] [passed] child=ila boards=1\n2026-11-08T07:00:01.000Z other line\n");
      fs.writeFileSync(path.join(dir, "2026-11-10.log"), "2026-11-10T07:00:00.000Z  🎮 [session] [started]\n");
      fs.writeFileSync(path.join(dir, "2026-11-11.log"), "2026-11-11T07:00:00.000Z  🎮 [startup-check] [failed] child=ila\n");
      expect(earlierStartupLines(path.join(dir, "2026-11-10.log"))).toEqual(["2026-11-08T07:00:00.000Z  🎮 [startup-check] [passed] child=ila boards=1"]);
      expect(earlierStartupLines(path.join(dir, "kiosk-run.log"))).toEqual([]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
