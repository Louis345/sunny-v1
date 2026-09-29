import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashDirectory } from "./sunnyCertification";
import {
  verifySelfTestingBoardAcceptance,
  writeFullBoardAcceptanceReceipt,
} from "./verifySelfTestingBoardAcceptance";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

function input(overrides: Record<string, unknown> = {}) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-full-board-proof-"));
  roots.push(runDir);
  const sourceHash = sha("source");
  const value = {
    runDir,
    certificationRunId: "cert-lab",
    assignmentFingerprint: sha("assignment"),
    sourceSnapshotHash: sourceHash,
    programHash: sha("program"),
    designHash: sha("design"),
    nodeIds: ["node-1"],
    boardVersion: 1,
    verifierVersion: 21,
    sourceInventoryHashBefore: sourceHash,
    sourceInventoryHashAfter: sourceHash,
    startedAt: "2026-09-24T12:00:00.000Z",
    endedAt: "2026-09-24T12:01:00.000Z",
    nodes: [{
      nodeId: "node-1",
      htmlHash: sha("html"),
      manifestHash: sha("manifest"),
      launchPassed: true,
      completionPassed: true,
      runtimeErrors: [],
      capturePaths: [path.join(runDir, "node-1.png")],
    }],
    boardLoaded: true,
    companionHostVisible: true,
    navigationPassed: true,
    hostViewports: [
      {
        width: 1365,
        height: 768,
        boardVisible: true,
        activityVisible: true,
        backControlVisible: true,
        companionCollapsedPassed: true,
        companionSummonedPassed: true,
        activityReservedCompanionSpace: true,
        capturePaths: [path.join(runDir, "host-1365x768-collapsed.png"), path.join(runDir, "host-1365x768-summoned.png")],
      },
      {
        width: 1280,
        height: 720,
        boardVisible: true,
        activityVisible: true,
        backControlVisible: true,
        companionCollapsedPassed: true,
        companionSummonedPassed: true,
        activityReservedCompanionSpace: true,
        capturePaths: [path.join(runDir, "host-1280x720-collapsed.png"), path.join(runDir, "host-1280x720-summoned.png")],
      },
    ],
    readyNodeIds: ["node-1"],
    preparingNodeIds: [],
    needsAttentionNodeIds: [],
    ...overrides,
  };
  for (const node of value.nodes) {
    for (const capture of node.capturePaths) {
      if (capture !== "missing.png") fs.writeFileSync(capture, "capture");
    }
  }
  for (const viewport of value.hostViewports) {
    for (const capture of viewport.capturePaths) fs.writeFileSync(capture, "capture");
  }
  return value;
}

describe("trusted full-board acceptance receipt", () => {
  it("refuses a browser host that does not belong to the requested certification run", async () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-full-board-host-"));
    const sourceChildDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-full-board-source-"));
    roots.push(runDir, sourceChildDir);
    fs.writeFileSync(path.join(sourceChildDir, "profile.json"), "{}\n");
    fs.writeFileSync(path.join(runDir, "certification-run.json"), `${JSON.stringify({
      evidenceAuthority: "simulation",
      sourceChildId: "fixture-child",
      certificationRunId: "cert-expected",
      assignmentFingerprint: sha("assignment"),
      sourceSnapshotHash: hashDirectory(sourceChildDir),
      sourceChildDir,
    })}\n`);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "ok", certificationRunId: "cert-live-family-server" }),
    })));

    await expect(verifySelfTestingBoardAcceptance({ runDir, baseUrl: "http://127.0.0.1:3001" }))
      .rejects.toThrow("full_board_acceptance_host_identity_mismatch");
  });

  it("writes one hash-bound append-only receipt for a complete isolated host journey", () => {
    const value = input();

    const file = writeFullBoardAcceptanceReceipt(value);
    const receipt = JSON.parse(fs.readFileSync(file, "utf8"));

    expect(receipt).toMatchObject({
      evidenceAuthority: "simulation",
      passed: true,
      plannerNodeIds: ["node-1"],
      launchedNodeIds: ["node-1"],
      completedNodeIds: ["node-1"],
      hostViewports: expect.arrayContaining([
        expect.objectContaining({ width: 1365, height: 768, companionSummonedPassed: true }),
        expect.objectContaining({ width: 1280, height: 720, companionSummonedPassed: true }),
      ]),
      sourceInventoryHashBefore: value.sourceSnapshotHash,
      sourceInventoryHashAfter: value.sourceSnapshotHash,
    });
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(writeFullBoardAcceptanceReceipt(value)).toBe(file);
    expect(() => writeFullBoardAcceptanceReceipt({ ...value, boardVersion: 2 }))
      .toThrow("full_board_acceptance_receipt_conflict");
  });

  it.each([
    ["changed family source", { sourceInventoryHashAfter: sha("changed") }, "full_board_acceptance_family_data_changed"],
    ["missing capture", { nodes: [{ nodeId: "node-1", htmlHash: sha("html"), manifestHash: sha("manifest"), launchPassed: true, completionPassed: true, runtimeErrors: [], capturePaths: ["missing.png"] }] }, "full_board_acceptance_capture_missing"],
    ["runtime error", { nodes: [{ nodeId: "node-1", htmlHash: sha("html"), manifestHash: sha("manifest"), launchPassed: true, completionPassed: true, runtimeErrors: ["boom"], capturePaths: ["missing.png"] }] }, "full_board_acceptance_node_failed"],
    ["preparing node", { preparingNodeIds: ["node-1"] }, "full_board_acceptance_pending_nodes"],
    ["missing supported viewport", { hostViewports: [{ width: 1365, height: 768, boardVisible: true, activityVisible: true, backControlVisible: true, companionCollapsedPassed: true, companionSummonedPassed: true, activityReservedCompanionSpace: true, capturePaths: [] }] }, "full_board_acceptance_host_viewports_missing"],
    ["summoned companion obscures activity", { hostViewports: [{ width: 1365, height: 768, boardVisible: true, activityVisible: true, backControlVisible: true, companionCollapsedPassed: true, companionSummonedPassed: false, activityReservedCompanionSpace: false, capturePaths: [] }, { width: 1280, height: 720, boardVisible: true, activityVisible: true, backControlVisible: true, companionCollapsedPassed: true, companionSummonedPassed: true, activityReservedCompanionSpace: true, capturePaths: [] }] }, "full_board_acceptance_host_viewport_failed:1365x768"],
  ])("rejects %s", (_label, overrides, code) => {
    const value = input(overrides);
    expect(() => writeFullBoardAcceptanceReceipt(value)).toThrow(code);
  });
});
