import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDiscoveryEvidenceSummary,
  createDiscoveryLearningCycle,
  recordDiscoveryAttempt,
  type MathDiscoveryEvaluationContract,
} from "./adaptiveMathDiscovery";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-evidence-authority-"));
}

function contract(): MathDiscoveryEvaluationContract {
  return {
    evaluationId: "evaluation:graphs",
    title: "Graph Discovery",
    assignmentEvidenceIds: ["assignment:graphs"],
    constructs: [{ constructId: "math.graphs.compare", prerequisiteIds: [] }],
    items: [{
      itemId: "graph-1",
      constructId: "math.graphs.compare",
      prompt: "Which bar is taller?",
      responseContract: { mode: "tap_selection", representationId: "bar_graph" },
      correctAnswerContract: { acceptedValues: ["blue"] },
      difficultyBoundary: "Grade 3 bar graph",
      exposureId: "evaluation:graphs:graph-1",
      possibleConfounds: ["reading_friction"],
      falsifyingEvidence: ["A fresh comparison is incorrect."],
      measurementKeys: ["independent_correct"],
    }],
    artifact: {
      artifactId: "graphs:discovery",
      htmlPath: "/games/graphs/discovery.html",
      artworkPath: "/generated/graphs.svg",
      contractHash: "contract",
      artifactHash: "artifact",
    },
  };
}

function prepare(rootDir: string): void {
  const frozen = contract();
  createDiscoveryLearningCycle({
    rootDir,
    childId: "lab-child",
    homeworkId: "hw-graphs",
    assignment: {
      title: "Graphs",
      contentFingerprint: "fingerprint",
      capturedEvidenceIds: ["assignment:graphs"],
      targets: ["math.graphs.compare"],
    },
    evaluation: frozen,
  });
  const file = path.join(rootDir, "src/context/lab-child/homework/direct-drafts/hw-graphs/discovery-contract.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(frozen, null, 2)}\n`);
}

describe("adaptive math evidence authority", () => {
  it("rejects legacy or unsupported response contracts for newly generated Discovery", () => {
    const invalid = contract() as unknown as { items: Array<{ responseContract: unknown }> };
    invalid.items[0]!.responseContract = "type a sentence";
    expect(() => createDiscoveryLearningCycle({
      rootDir: root(), childId: "lab-child", homeworkId: "hw-graphs",
      assignment: { title: "Graphs", contentFingerprint: "f", capturedEvidenceIds: ["assignment:graphs"], targets: ["math.graphs.compare"] },
      evaluation: invalid as unknown as MathDiscoveryEvaluationContract,
    })).toThrow("discovery_response_contract_invalid");
  });

  it("derives academic truth from the frozen contract instead of client claims", () => {
    const rootDir = root();
    prepare(rootDir);
    const cycle = recordDiscoveryAttempt({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-graphs",
      attempt: {
        attemptId: "attempt-1",
        itemId: "graph-1",
        attemptedValue: "blue",
        supportEventIds: [],
        instrumentSignals: [],
        observedAt: "2026-09-02T12:00:00.000Z",
        // Deliberately malicious legacy claims. They must be ignored.
        constructId: "math.unrelated",
        result: "incorrect",
        assistance: "assisted",
        exposure: "previously_practiced",
        responseMode: "typed_text",
      } as never,
    });

    expect(cycle.observations[0]).toMatchObject({
      constructLinks: [{ constructId: "math.graphs.compare" }],
      result: { correct: true, score: 1 },
      assistance: { status: "unassisted", scaffolds: [] },
      exposure: "unseen",
      provenance: "independent_probe",
      confounds: ["response_mode:tap_selection", "representation:bar_graph"],
    });
  });

  it("derives repetition and support conservatively and summarizes canonical observations", () => {
    const rootDir = root();
    prepare(rootDir);
    recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-graphs", attempt: {
      attemptId: "attempt-1", itemId: "graph-1", attemptedValue: "red", supportEventIds: [], instrumentSignals: [], observedAt: "2026-09-02T12:00:00.000Z",
    } });
    const cycle = recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-graphs", attempt: {
      attemptId: "attempt-2", itemId: "graph-1", attemptedValue: "blue", supportEventIds: ["support:elli:1"], instrumentSignals: ["interface_friction"], observedAt: "2026-09-02T12:01:00.000Z",
    } });
    const summary = buildDiscoveryEvidenceSummary(cycle);

    expect(cycle.observations[1]).toMatchObject({
      assistance: { status: "assisted", scaffolds: ["support:elli:1"] },
      exposure: "previously_practiced",
      provenance: "practice",
      result: { observedErrorType: "instrument_ambiguous" },
    });
    expect(summary.constructs[0]).toMatchObject({
      constructId: "math.graphs.compare",
      independentIncorrect: 1,
      assisted: 1,
      ambiguous: 1,
      responseModes: ["tap_selection"],
      representationCount: 1,
      observationIds: ["attempt-1", "attempt-2"],
    });
  });
});
