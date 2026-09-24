import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateHumanBoardScores,
  prepareSelfTestingBoardComparison,
} from "./selfTestingBoardComparison";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function candidate(name: string, options: {
  nodeIds?: string[];
  assignmentFingerprint?: string;
  program?: unknown;
  design?: unknown;
  sourceHash?: string;
  currentSourceHash?: string;
  strict?: boolean;
  failedNodeId?: string;
  model?: string;
} = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `sunny-board-${name}-`));
  roots.push(root);
  const nodeIds = options.nodeIds ?? ["node-1", "node-2"];
  const program = options.program ?? { activities: nodeIds.map((id) => ({ id, items: [{ id: `${id}-item` }] })) };
  const design = options.design ?? { acts: nodeIds.map((id) => ({ nodeId: id, title: `Design ${id}` })) };
  const sourceHash = options.sourceHash ?? "child-snapshot";
  const assignmentFingerprint = options.assignmentFingerprint ?? "assignment-fingerprint";
  const draft = path.join(root, "workspace", "src", "context", "lab-child", "homework", "direct-drafts", "hw-math-lab");
  const artifacts = nodeIds.map((nodeId) => {
    const html = `<!doctype html><html><body>${nodeId}</body></html>`;
    const manifest = {
      version: 1,
      activityId: nodeId,
      items: [{ itemId: `${nodeId}-item`, actions: [{ type: "click", selector: "#answer" }], assertions: [{ type: "event", event: "attempt_event" }] }],
      completion: { actions: [{ type: "click", selector: "#finish" }], assertions: [{ type: "event", event: "node_complete" }] },
    };
    const htmlPath = path.join(root, "artifacts", `${nodeId}.html`);
    const creatorTestPath = path.join(root, "artifacts", `${nodeId}.playwright.json`);
    const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
    fs.writeFileSync(htmlPath, html);
    fs.writeFileSync(creatorTestPath, manifestBytes);
    return {
      nodeId,
      htmlPath,
      htmlHash: hash(html),
      creatorTestPath,
      creatorTestHash: hash(manifestBytes),
      plannerModel: "planner-model",
      architectModel: "architect-model",
      builderModel: options.model ?? "builder-model",
      academicContractHash: hash(`${nodeId}-academic`),
      designArtifactHash: hash(`${nodeId}-design`),
      itemIds: [`${nodeId}-item`],
    };
  });
  writeJson(path.join(root, "certification-run.json"), {
    version: 3,
    certificationRunId: `cert-${name}`,
    sourceSnapshotHash: sourceHash,
    assignmentFingerprint,
    homeworkId: "hw-math-lab",
    evidenceAuthority: "simulation",
    workspaceDir: path.join(root, "workspace"),
  });
  writeJson(path.join(root, "report", "report.json"), {
    sourceChildUnchanged: (options.currentSourceHash ?? sourceHash) === sourceHash,
    sourceSnapshotHash: sourceHash,
    currentSourceSnapshotHash: options.currentSourceHash ?? sourceHash,
  });
  writeJson(path.join(draft, "assignment-source.json"), { version: 3, fileHash: assignmentFingerprint });
  writeJson(path.join(draft, "math-learning-program.json"), program);
  writeJson(path.join(draft, "design-packet.json"), design);
  writeJson(path.join(draft, "candidate-build-v3.json"), { artifacts });
  writeJson(path.join(draft, "adaptive-generation-job.json"), {
    version: 1,
    phase: options.failedNodeId ? "needs_attention" : "board_ready",
    nodes: nodeIds.map((nodeId) => ({
      nodeId,
      status: nodeId === options.failedNodeId ? "needs_attention" : "ready",
      attemptCount: nodeId === options.failedNodeId ? 1 : 0,
    })),
  });
  writeJson(path.join(draft, "browser-verification.json"), Object.fromEntries(artifacts.map((artifact) => [artifact.nodeId, {
    passed: artifact.nodeId !== options.failedNodeId,
    failures: artifact.nodeId === options.failedNodeId ? ["blocked"] : [],
    htmlHash: artifact.htmlHash,
    verifierVersion: 14,
    screenshots: ["one.png", "two.png"],
    captures: [
      { viewport: "1365x768", kind: "completion" },
      { viewport: "1280x720", kind: "completion" },
    ],
    verification: {
      runtime: artifact.nodeId !== options.failedNodeId,
      scoring: artifact.nodeId !== options.failedNodeId,
      contracts: artifact.nodeId !== options.failedNodeId,
    },
    creatorTests: {
      passed: artifact.nodeId !== options.failedNodeId,
      manifestHash: artifact.creatorTestHash,
      viewports: ["1365x768", "1280x720"],
      failures: artifact.nodeId === options.failedNodeId ? ["blocked"] : [],
    },
    visualReview: { attribution: null, repairAuthorized: false, findings: [] },
  }])));
  if (!options.strict) {
    for (const artifact of artifacts) {
      delete (artifact as { creatorTestPath?: string }).creatorTestPath;
      delete (artifact as { creatorTestHash?: string }).creatorTestHash;
    }
    writeJson(path.join(draft, "candidate-build-v3.json"), { artifacts });
  }
  return root;
}

describe("self-testing full-board comparison", () => {
  it("stops instead of generating a replacement when the saved control is missing", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-comparison-out-"));
    roots.push(outputDir);
    expect(() => prepareSelfTestingBoardComparison({ candidateARunDir: path.join(outputDir, "missing"), candidateBRunDir: candidate("b", { strict: true }), outputDir }))
      .toThrow("comparison_candidate_a_missing");
    expect(fs.readdirSync(outputDir)).toEqual([]);
  });

  it("requires the same assignment, child snapshot, program, design, models, and Planner-owned node count", () => {
    const a = candidate("a", { nodeIds: ["one", "two", "three"] });
    const b = candidate("b", { nodeIds: ["one", "two"], strict: true });
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-comparison-out-"));
    roots.push(outputDir);
    expect(() => prepareSelfTestingBoardComparison({ candidateARunDir: a, candidateBRunDir: b, outputDir }))
      .toThrow("comparison_frozen_identity_mismatch:planner_program,design_packet,node_ids,node_count,model_settings,frozen_contracts");
  });

  it("blocks Candidate B until every exact HTML and manifest passes every quality layer at both viewports", () => {
    const a = candidate("a");
    const b = candidate("b", { strict: true, failedNodeId: "node-2" });
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-comparison-out-"));
    roots.push(outputDir);
    expect(() => prepareSelfTestingBoardComparison({ candidateARunDir: a, candidateBRunDir: b, outputDir }))
      .toThrow("comparison_candidate_b_not_ready:node-2");
  });

  it("writes a blinded playable report without revealing provenance before Saori chooses reveal", () => {
    const nodeIds = Array.from({ length: 7 }, (_, index) => `node-${index + 1}`);
    const a = candidate("a", { nodeIds });
    const b = candidate("b", { nodeIds, strict: true });
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-comparison-out-"));
    roots.push(outputDir);
    const result = prepareSelfTestingBoardComparison({ candidateARunDir: a, candidateBRunDir: b, outputDir });
    const html = fs.readFileSync(result.reportPath, "utf8");
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, "utf8"));
    expect(manifest.nodeCount).toBe(7);
    expect(manifest.readyForSaori).toBe(true);
    expect(html).toContain("Candidate A");
    expect(html).toContain("Candidate B");
    expect(html).toContain("Reveal provenance");
    expect(html).not.toContain(path.basename(a));
    expect(html).not.toContain(path.basename(b));
    expect(html).toContain("Mathematical validity");
    expect(html).toContain("First-action clarity");
    expect(html).toContain("Recovery after uncertainty");
    expect(html).toContain("Ability to continue");
    expect(html).not.toContain("Candidate B may be accepted");
  });

  it("fails isolation when the family snapshot changed", () => {
    const a = candidate("a");
    const b = candidate("b", { strict: true, currentSourceHash: "changed" });
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-comparison-out-"));
    roots.push(outputDir);
    expect(() => prepareSelfTestingBoardComparison({ candidateARunDir: a, candidateBRunDir: b, outputDir }))
      .toThrow("comparison_family_data_changed:candidate_b");
  });

  it("accepts B only when overall quality is not lower and no protected criterion regresses", () => {
    expect(evaluateHumanBoardScores({
      candidateA: { overall: 4, mathematicalValidity: 5, firstActionClarity: 4, recovery: 3, abilityToContinue: 4 },
      candidateB: { overall: 4, mathematicalValidity: 5, firstActionClarity: 5, recovery: 3, abilityToContinue: 5 },
    })).toEqual({ accepted: true, regressions: [] });
    expect(evaluateHumanBoardScores({
      candidateA: { overall: 4, mathematicalValidity: 5, firstActionClarity: 4, recovery: 3, abilityToContinue: 4 },
      candidateB: { overall: 5, mathematicalValidity: 4, firstActionClarity: 5, recovery: 5, abilityToContinue: 5 },
    })).toEqual({ accepted: false, regressions: ["mathematicalValidity"] });
  });
});
