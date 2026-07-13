import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { createLearningCycle, transitionLearningCycle } from "./learningCycleRepository";
import { generateCanonicalProgressionArtifact } from "./canonicalProgressionGenerator";

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-progression-")); }

function baseInput() {
  const contract = (id: string, role: "baseline" | "quest" | "boss", state: "ready" | "locked") => ({
    nodeId: id, role, title: role === "quest" ? "Quest" : role === "boss" ? "Boss" : "Fact Blaster", state,
    academicTarget: { domain: "math", skill: "multiplication", targets: ["2x5"] }, algorithmOwner: "retrieval-practice",
    theoryId: "theory", experimentId: `experiment-${id}`, mechanic: role === "baseline" ? "fact-retrieval" : "adaptive-challenge", theme: "space",
    openingScreen: { title: role === "quest" ? "Quest" : role === "boss" ? "Boss" : "Fact Blaster", purpose: "Practice multiplication" },
    generationPrompt: null, artifactBinding: role === "baseline" ? { contentId: "facts", artifactId: "facts", localArtifactPath: "/games/facts.html", localArtworkPath: "/generated/facts.png", contractFingerprint: "facts", validationStatus: "passed" as const } : null,
    artwork: { status: "ready" as const, localPath: role === "quest" ? "/generated/adventure-board-demo/quest.jpeg" : role === "boss" ? "/generated/adventure-board-demo/boss.jpeg" : "/generated/facts.png", prompt: null },
    sfxContract: ["tap", "correct", "incorrect", "progress", "complete"], companionContract: { events: ["session_complete"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true }, evidenceIds: [],
  });
  return { childId: "reina", homeworkId: "hw-progression", domain: "math", assignment: { title: "Multiplication", contentFingerprint: "fp", capturedEvidenceIds: ["pdf"], targets: ["2x5"] }, academicTheory: { theoryId: "theory", revision: 1, hypothesis: "Test transfer", supportCriteria: [".8"], reviseCriteria: ["below .8"], falsifyCriteria: ["below .5"] }, engagementTheory: null, nodes: [contract("facts", "baseline", "ready"), contract("quest", "quest", "locked"), contract("boss", "boss", "locked")] };
}

describe("canonical progression generation", () => {
  it("generates and binds Quest only from the canonical Quest prompt", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    const generating = transitionLearningCycle("reina", "hw-progression", created.revision, { type: "baseline_completed", nodeId: "facts", academicEvidence: [{ evidenceId: "attempt:1", summary: "correct", accuracy: 1 }], engagementEvidence: [], companionObservations: [], decision: { status: "supported", reason: "Ready for transfer", nextAction: "Generate Quest" } }, { rootDir });
    let receivedPrompt = "";
    const result = await generateCanonicalProgressionArtifact({ childId: "reina", homeworkId: "hw-progression", generateHtml: async ({ prompt }) => { receivedPrompt = prompt; return "<html><body><h1>Quest</h1></body></html>"; }, validate: async () => ({ passed: true, failures: [] }) }, { rootDir });
    expect(receivedPrompt).toContain(generating.nodes.find((node) => node.role === "quest")?.generationPrompt?.text);
    expect(result.lifecycle).toBe("quest_ready");
    expect(result.nodes.find((node) => node.role === "quest")?.artifactBinding?.localArtifactPath).toContain("/api/homework/game/reina/");
  });

  it("does nothing unless the canonical lifecycle is generating", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    let calls = 0;
    const result = await generateCanonicalProgressionArtifact({ childId: "reina", homeworkId: "hw-progression", generateHtml: async () => { calls += 1; return ""; }, validate: async () => ({ passed: true, failures: [] }) }, { rootDir });
    expect(result.revision).toBe(created.revision);
    expect(calls).toBe(0);
  });

  it("rejects a generated Quest whose first visible heading conflicts with the canonical role", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    transitionLearningCycle("reina", "hw-progression", created.revision, {
      type: "baseline_completed",
      nodeId: "facts",
      academicEvidence: [{ evidenceId: "attempt:1", summary: "correct", accuracy: 1 }],
      engagementEvidence: [], companionObservations: [],
      decision: { status: "supported", reason: "Ready", nextAction: "Generate Quest" },
    }, { rootDir });

    await expect(generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-progression",
      generateHtml: async () => "<html><body><h1>Vault Cracker</h1><p>Multiplication Quest</p></body></html>",
      validate: async () => ({ passed: true, failures: [] }),
    }, { rootDir })).rejects.toThrow(/opening_title_mismatch/);
  });
});
