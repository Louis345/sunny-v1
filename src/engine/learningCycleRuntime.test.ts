import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { createLearningCycle, type CreateLearningCycleInput } from "./learningCycleRepository";
import { recordCanonicalNodeCompletion } from "./learningCycleRuntime";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-runtime-"));
}

function node(id: string, role: "baseline" | "quest" | "boss", state: "ready" | "locked" = "ready") {
  const title = role === "quest" ? "Quest" : role === "boss" ? "Boss" : id === "facts" ? "Fact Blaster" : "Story Solver";
  return {
    nodeId: id,
    role,
    title,
    state,
    academicTarget: { domain: "math", skill: "multiplication", targets: [id] },
    algorithmOwner: role === "baseline" ? "retrieval-practice" : "mastery-gating",
    theoryId: "theory-1",
    experimentId: `experiment-${id}`,
    mechanic: role === "baseline" ? id : `generated-after-${role === "quest" ? "baseline" : "quest"}`,
    theme: "math adventure",
    openingScreen: { title, purpose: `Practice ${id}` },
    generationPrompt: null,
    artifactBinding: role === "baseline" ? {
      contentId: `content-${id}`,
      artifactId: `artifact-${id}`,
      localArtifactPath: `/games/${id}.html`,
      localArtworkPath: `/generated/${id}.png`,
      contractFingerprint: `contract-${id}`,
      validationStatus: "passed" as const,
    } : null,
    artwork: { status: "ready" as const, localPath: `/generated/${id}.png`, prompt: null },
    sfxContract: ["tap", "correct", "incorrect", "progress", "complete"],
    companionContract: { events: ["session_complete"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
  };
}

function input(): CreateLearningCycleInput {
  return {
    childId: "reina",
    homeworkId: "hw-runtime",
    domain: "math",
    assignment: { title: "Multiplication", contentFingerprint: "fp", capturedEvidenceIds: ["pdf:1"], targets: ["facts", "story"] },
    academicTheory: { theoryId: "theory-1", revision: 1, hypothesis: "Measure recall and transfer", supportCriteria: ["accuracy >= .8"], reviseCriteria: ["accuracy < .8"], falsifyCriteria: ["accuracy < .5"] },
    engagementTheory: null,
    nodes: [node("facts", "baseline"), node("story", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
  };
}

describe("canonical learning cycle runtime", () => {
  it("records each baseline decision but generates Quest only after every baseline completes", () => {
    const rootDir = root();
    createLearningCycle(input(), { rootDir });
    const first = recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "2x5", correct: true }] } }, { rootDir });
    expect(first?.lifecycle).toBe("baseline_active");
    expect(first?.nodes.find((item) => item.nodeId === "quest")?.generationPrompt).toBeNull();

    const second = recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "story", result: { completed: true, accuracy: 0.8, timeSpent_ms: 1800, targetResults: [{ target: "groups", correct: true }] } }, { rootDir });
    expect(second?.lifecycle).toBe("quest_generating");
    expect(second?.nodes.find((item) => item.nodeId === "quest")?.generationPrompt?.createdFromEvidenceIds).toEqual(expect.arrayContaining(["s1:facts:completion", "s1:story:completion"]));
  });

  it("is idempotent for a repeated completion evidence id", () => {
    const rootDir = root();
    createLearningCycle({ ...input(), nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")] }, { rootDir });
    const payload = { childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [] } };
    const first = recordCanonicalNodeCompletion(payload, { rootDir });
    const repeated = recordCanonicalNodeCompletion(payload, { rootDir });
    expect(repeated?.revision).toBe(first?.revision);
    expect(repeated?.decisionHistory).toHaveLength(first?.decisionHistory.length ?? 0);
  });
});
