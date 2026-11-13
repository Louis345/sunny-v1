import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAdaptiveMathLabEntrypoint, runAdaptiveMathTwoPhaseLab } from "./runAdaptiveMathTwoPhaseLab";

describe("adaptive math two-phase zero-cost proof", () => {
  it("recognizes direct tsx execution from the compiled module filename", () => {
    expect(isAdaptiveMathLabEntrypoint(
      "/repo/src/scripts/runAdaptiveMathTwoPhaseLab.ts",
      "/repo/src/scripts/runAdaptiveMathTwoPhaseLab.ts",
    )).toBe(true);
  });

  it("produces a playable interrupted/resumed episode and truthful before/after report", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-adaptive-proof-"));
    const protectedDir = path.join(rootDir, "src/context/reina");
    fs.mkdirSync(protectedDir, { recursive: true });
    fs.writeFileSync(path.join(protectedDir, "chart.json"), "{\"protected\":true}\n");

    const result = await runAdaptiveMathTwoPhaseLab({
      rootDir,
      now: new Date("2026-08-16T15:00:00.000Z"),
      protectedChildDirs: [protectedDir],
    });

    expect(result.summary.verdict).toBe("CONTRACT_PASS");
    expect(result.summary.outcome).toBe("improved");
    expect(result.summary.paidCalls).toBe(0);
    expect(result.summary.costUsd).toBe(0);
    expect(result.summary.costAccountingComplete).toBe(true);
    expect(result.summary.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.summary.realChildDataChanged).toBe(false);
    expect(result.summary.workerHistory).toContain("provider_paused");
    expect(result.summary.workerHistory.at(-1)).toBe("ready");

    for (const relative of [
      "report.html",
      "opening-evaluation.html",
      "visual-explainer.html",
      "board.html",
      "baseline-intervention.html",
      "fresh-exit-evaluation.html",
      "evidence/opening-evaluation.json",
      "evidence/findings.json",
      "decisions/intervention-decision.json",
      "catalog/manifest.json",
      "audit/worker-job.json",
    ]) {
      expect(fs.existsSync(path.join(result.outputDir, relative)), relative).toBe(true);
    }

    const report = fs.readFileSync(path.join(result.outputDir, "report.html"), "utf8");
    expect(report).toContain("ADAPTIVE MATH CONTRACT PROOF: PASS");
    expect(report).toContain("Recorded fixture evidence");
    expect(report).not.toContain("Sunny measured an independent starting point");
    expect(report).toContain("consistent with helping");
    expect(report).toContain("Elapsed:");
    expect(report).toContain("Opening evaluation");
    expect(report).toContain("Visual Explainer");
    expect(report).toContain("Fresh independent check");
    expect(report).toContain("Starting hypothesis");
    expect(report).toContain("Why Sunny chose this intervention");
    expect(report).toContain("attempt:opening-item-1");
    expect(report).not.toMatch(/mastered because|caused learning/i);

    const opening = fs.readFileSync(path.join(result.outputDir, "opening-evaluation.html"), "utf8");
    expect(opening).toContain("data-independent=\"true\"");
    expect(opening).toContain("Show what you know");
    expect(opening).not.toContain("The answer is");

    const exit = fs.readFileSync(path.join(result.outputDir, "fresh-exit-evaluation.html"), "utf8");
    expect(exit).toContain("unseen:exit-item-1");
    expect(exit).not.toContain("opening-item-1");
    const catalog = JSON.parse(fs.readFileSync(path.join(result.outputDir, "catalog/manifest.json"), "utf8"));
    expect(catalog.artifacts).toHaveLength(4);
    expect(catalog.artifacts.every((artifact: { reuseDecision?: string }) => artifact.reuseDecision === "candidate")).toBe(true);
    expect(catalog.artifacts.every((artifact: Record<string, unknown>) =>
      Boolean(artifact.childId && artifact.homeworkId && artifact.cycleId && artifact.source && artifact.title))).toBe(true);
  });
});
