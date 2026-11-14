import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLearningCycle, getLearningCycle } from "../engine/learningCycleRepository";

// BUGS.md "Measurement audit 2026-11-13" (a), AI-caught: a built math game that she leaves sends no completion, so the
// tries code saw stayed in memory and were never saved; a replay in the same session then piled its tries onto the
// first run's. Why the logs missed it: `[item-attempts] [answer]` lines showed her answers, but nothing compared them
// with the saved record. Why the lab missed it: lab children always finish. Closing the game saves her tries.
const contextRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-left-early-"));
vi.stubEnv("SUNNY_CONTEXT_ROOT", contextRoot);
vi.mock("../profiles/childChart", () => ({ getChildChart: (childId: string) => ({ learningCycle: getLearningCycle(childId, "hw-left") }) }));

const items = Object.fromEntries(["p1", "p2"].map(id => [id, { id, prompt: id, lineage: { sourceEvidenceIds: ["pdf:1"], exposure: "unseen", measurementRole: "fresh_checkpoint" }, response: { mode: "numeric", expected: 10 } }]));
const node = { nodeId: "duel", role: "baseline", title: "Duel", state: "ready", academicTarget: { domain: "math", skill: "multiplication", targets: ["duel"] },
  algorithmOwner: "retrieval-practice", theoryId: "theory-1", experimentId: "e", mechanic: "duel", theme: "t", openingScreen: { title: "Duel", purpose: "p" }, generationPrompt: null,
  artifactBinding: { contentId: "c", artifactId: "a", localArtifactPath: "/games/d.html", localArtworkPath: "/generated/d.png", contractFingerprint: "f", validationStatus: "passed" },
  artwork: { status: "ready", localPath: "/generated/d.png", prompt: null }, sfxContract: [], companionContract: { events: [] },
  evidenceContract: { academic: true, engagement: true, companionObservations: true, itemContracts: items }, evidenceIds: [] };

afterEach(() => { fs.rmSync(path.join(contextRoot, "lab-kid"), { recursive: true, force: true }); });

describe("math answers when she leaves a game early", () => {
  it("saves the tries code saw when the game closes unfinished, and a replay starts its own", async () => {
    createLearningCycle({ childId: "lab-kid", homeworkId: "hw-left", domain: "math",
      assignment: { title: "Math", contentFingerprint: "fp", capturedEvidenceIds: ["pdf:1"], targets: ["duel"] },
      academicTheory: { theoryId: "theory-1", revision: 1, hypothesis: "h", supportCriteria: ["s"], reviseCriteria: ["r"], falsifyCriteria: ["f"] },
      engagementTheory: null, nodes: [node] } as never);
    const { handleGameEventForSession } = await import("./game-event-handler");
    const { takeServerTries } = await import("./itemAttemptFacts");
    const session = { recordDebugEvent: vi.fn(), recordGameTrace: vi.fn(), chartChildId: "lab-kid", childName: "Kid" } as never;
    const send = (event: Record<string, unknown>) => handleGameEventForSession(session, event);
    send({ type: "attempt_event", nodeId: "duel", target: "p1", attemptedValue: "6" });
    send({ type: "game_state_update", nodeId: "duel", hintShownItemId: "p1" });
    send({ type: "attempt_event", nodeId: "duel", target: "p1", attemptedValue: "10" });
    send({ type: "game_state_update", nodeId: "duel", phase: "closed", launchToken: "launch-1" });
    const saved = getLearningCycle("lab-kid", "hw-left")!;
    expect(saved.observations.map(row => [row.itemId, row.childResponse, row.assistance.status, row.result.correct])).toEqual([["p1", "6", "unassisted", false], ["p1", "10", "assisted", true]]);
    expect(saved.nodes[0].state).not.toBe("completed");
    // The replay in the same session does not carry the first run's tries.
    send({ type: "attempt_event", nodeId: "duel", target: "p2", attemptedValue: "10" });
    expect([...takeServerTries("lab-kid", "duel").keys()]).toEqual(["p2"]);
    // Closing again after nothing new saves nothing new.
    send({ type: "game_state_update", nodeId: "duel", phase: "closed", launchToken: "launch-2" });
    expect(getLearningCycle("lab-kid", "hw-left")!.observations).toHaveLength(2);
  });
});
