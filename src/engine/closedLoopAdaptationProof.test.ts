import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runClosedLoopAdaptationProof } from "./closedLoopAdaptationProof";
import * as mapRuntime from "../server/map-coordinator";

describe("closed-loop adaptation proof", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function root(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-closed-loop-"));
    roots.push(dir);
    return dir;
  }

  it("reports only the actual runtime board, never a lab-authored targeted replacement", async () => {
    const runtime = vi.spyOn(mapRuntime, "applyNodeResult");
    const report = await runClosedLoopAdaptationProof({
      rootDir: root(),
      generatedAt: "2026-05-18T15:00:00.000Z",
    });

    const actual = (await runtime.mock.results[0]!.value).mapState;
    expect(report.boardAfter).toEqual(actual.nodes.map((node: { id: string; type: string; words?: string[]; isLocked?: boolean; isCompleted?: boolean }) => ({
      id: node.id, type: node.type, words: node.words ?? [], locked: node.isLocked === true, completed: node.isCompleted === true,
    })));
    expect(report.proved).toBe(false);
    expect(report.childId).toBe("demo_adaptive");
    expect(report.nodeCompleted.type).toBe("word-radar");
    expect(report.evidence.missedTargets).toEqual([report.selectedMissTarget]);
    expect(report.runtimeDiff.changedNodeIds).toEqual([]);
    expect(report.runtimeDiff.nextTargets).toEqual([]);
    expect(report.postSessionTruth.adaptationDecision.status).not.toBe("changed");
    expect(report.files.gameTraces).toBe(true);
    expect(report.files.gameSummary).toBe(true);
    expect(report.files.postSessionTruth).toBe(true);
    expect(report.files.adaptationDiff).toBe(true);

    expect(report.failures).toContain("no canonical next board diff");
  });

  it("does not claim adaptive success when both observed trajectories leave teaching targets unchanged", async () => {
    const report = await runClosedLoopAdaptationProof({
      rootDir: root(),
      generatedAt: "2026-05-18T15:05:00.000Z",
    });

    const worsening = report.trajectories.find((trajectory) => trajectory.id === "worsening_child");
    const improving = report.trajectories.find((trajectory) => trajectory.id === "improving_child");

    expect(worsening).toMatchObject({
      direction: "worse",
      proved: false,
      expectedBoardMove: "route_support",
    });
    expect(worsening?.nextTargets).toEqual([]);
    expect(worsening?.changedNodeIds).toEqual([]);

    expect(improving).toMatchObject({
      direction: "better",
      proved: false,
      expectedBoardMove: "increase_challenge_or_skip_repetition",
    });
    expect(improving?.nextTargets).toEqual([]);
    expect(improving?.skippedPracticeNodeIds).toEqual([]);
  });
});
