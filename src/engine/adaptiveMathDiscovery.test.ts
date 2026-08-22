import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  completeDiscoveryEvaluation,
  createDiscoveryLearningCycle,
  getMathGenerationStatus,
  recordDiscoveryAttempt,
  revealTargetedBoard,
  updateMathGenerationNode,
  writeMathGenerationJob,
  type MathDiscoveryEvaluationContract,
} from "./adaptiveMathDiscovery";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-discovery-"));
}

const contract: MathDiscoveryEvaluationContract = {
  evaluationId: "evaluation:equal-groups",
  title: "What Do You Notice?",
  assignmentEvidenceIds: ["assignment:equal-groups"],
  constructs: [{ constructId: "math.multiplication.equal_groups", prerequisiteIds: [] }],
  items: [{
    itemId: "probe-1",
    constructId: "math.multiplication.equal_groups",
    prompt: "Show how many equal groups you see.",
    responseContract: "select_group_count",
    correctAnswerContract: { acceptedValues: ["4"] },
    difficultyBoundary: "four groups within Grade 3 scope",
    exposureId: "evaluation:equal-groups:probe-1",
    possibleConfounds: ["pointer_precision"],
    falsifyingEvidence: ["Independent selection does not identify four groups."],
    measurementKeys: ["independent_correct", "response_mode"],
  }],
  artifact: {
    artifactId: "evaluation-artifact:equal-groups",
    htmlPath: "/games/hw-equal-groups/discovery.html",
    artworkPath: "/generated/discovery-equal-groups.jpeg",
    contractHash: "contract-hash",
    artifactHash: "artifact-hash",
  },
};

describe("adaptive math discovery", () => {
  it("publishes only one independent Discovery node before evidence exists", () => {
    const rootDir = root();
    const cycle = createDiscoveryLearningCycle({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      assignment: {
        title: "Equal groups",
        contentFingerprint: "fingerprint",
        capturedEvidenceIds: ["assignment:equal-groups"],
        targets: ["math.multiplication.equal_groups"],
      },
      evaluation: contract,
    });

    expect(cycle.lifecycle).toBe("evaluation_ready");
    expect(cycle.nodes).toHaveLength(1);
    expect(cycle.nodes[0]).toMatchObject({ role: "evaluation", state: "ready" });
    expect(cycle.nodes.some((node) => node.role === "quest" || node.role === "boss")).toBe(false);
  });

  it("keeps conceptual, assisted, ambiguity, and interface evidence distinct", () => {
    const rootDir = root();
    createDiscoveryLearningCycle({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      assignment: { title: "Equal groups", contentFingerprint: "fingerprint", capturedEvidenceIds: ["assignment:equal-groups"], targets: ["math.multiplication.equal_groups"] },
      evaluation: contract,
    });

    recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: {
      attemptId: "attempt-1", itemId: "probe-1", constructId: "math.multiplication.equal_groups",
      result: "incorrect", assistance: "unassisted", exposure: "unseen", responseMode: "tap",
      attemptedValue: "3", possibleConfounds: [], observedAt: "2026-08-22T12:00:00.000Z",
    } });
    const cycle = recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: {
      attemptId: "attempt-2", itemId: "probe-1", constructId: "math.multiplication.equal_groups",
      result: "instrument_ambiguous", assistance: "assisted", exposure: "previously_practiced", responseMode: "tap",
      attemptedValue: "4", possibleConfounds: ["interface_friction"], observedAt: "2026-08-22T12:01:00.000Z",
    } });

    expect(cycle.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ observationId: "attempt-1", result: expect.objectContaining({ correct: false }), assistance: { status: "unassisted", scaffolds: [] }, provenance: "independent_probe" }),
      expect.objectContaining({ observationId: "attempt-2", result: expect.objectContaining({ observedErrorType: "instrument_ambiguous" }), assistance: { status: "assisted", scaffolds: ["discovery_support"] }, confounds: expect.arrayContaining(["interface_friction", "instrument_ambiguous"]) }),
    ]));
  });

  it("reveals arbitrary targeted programs as preparing and binds siblings independently", () => {
    const rootDir = root();
    createDiscoveryLearningCycle({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", assignment: { title: "Equal groups", contentFingerprint: "fingerprint", capturedEvidenceIds: ["assignment:equal-groups"], targets: ["math.multiplication.equal_groups"] }, evaluation: contract });
    recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: {
      attemptId: "attempt-before-board", itemId: "probe-1", constructId: "math.multiplication.equal_groups",
      result: "correct", assistance: "unassisted", exposure: "unseen", responseMode: "tap",
      attemptedValue: "4", possibleConfounds: [], observedAt: "2026-08-22T12:01:00.000Z",
    } });
    completeDiscoveryEvaluation({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", completedAt: "2026-08-22T12:02:00.000Z" });
    const revealed = revealTargetedBoard({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      programHash: "program-hash",
      designHash: "design-hash",
      nodes: Array.from({ length: 7 }, (_, index) => ({
        nodeId: `N${index + 1}`,
        title: `Node ${index + 1}`,
        academicTarget: `target-${index + 1}`,
        algorithmOwner: "planner",
        theoryId: "theory-targeted",
        experimentId: `experiment-${index + 1}`,
        mechanic: `mechanic-${index + 1}`,
        theme: `theme-${index + 1}`,
      })),
    });

    expect(revealed.lifecycle).toBe("board_generating");
    expect(revealed.nodes.filter((node) => node.role === "baseline")).toHaveLength(7);
    expect(revealed.nodes.filter((node) => node.role === "baseline").every((node) => node.state === "generating")).toBe(true);
  });

  it("persists per-node generation status and resumes without changing ready hashes", () => {
    const rootDir = root();
    writeMathGenerationJob({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", programHash: "program", designHash: "design", nodeIds: ["N1", "N2"] });
    updateMathGenerationNode({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", nodeId: "N1", status: "ready", artifactHash: "html-hash-1" });
    updateMathGenerationNode({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", nodeId: "N2", status: "failed_resumable", error: "provider timeout" });

    const first = getMathGenerationStatus("lab-child", "hw-equal-groups", { rootDir });
    const resumed = writeMathGenerationJob({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", programHash: "program", designHash: "design", nodeIds: ["N1", "N2"] });

    expect(first?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "N1", status: "ready", artifactHash: "html-hash-1" }),
      expect.objectContaining({ nodeId: "N2", status: "failed_resumable" }),
    ]));
    expect(resumed.nodes.find((node) => node.nodeId === "N1")?.artifactHash).toBe("html-hash-1");
    expect(resumed.nodes.find((node) => node.nodeId === "N2")?.status).toBe("preparing");
  });
});
