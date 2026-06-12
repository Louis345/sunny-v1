import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runClosedLoopAdaptationProof } from "./closedLoopAdaptationProof";

describe("closed-loop adaptation proof", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function root(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-closed-loop-"));
    roots.push(dir);
    return dir;
  }

  it("proves real assignment evidence changes the next board through the map runtime", async () => {
    const report = await runClosedLoopAdaptationProof({
      rootDir: root(),
      generatedAt: "2026-05-18T15:00:00.000Z",
    });

    expect(report.proved).toBe(true);
    expect(report.childId).toBe("demo_adaptive");
    expect(report.nodeCompleted.type).toBe("word-radar");
    expect(report.evidence.missedTargets).toEqual([report.selectedMissTarget]);
    expect(report.runtimeDiff.changedNodeIds.length).toBeGreaterThan(0);
    expect(report.runtimeDiff.nextTargets).toContain(report.selectedMissTarget);
    expect(report.postSessionTruth.adaptationDecision.status).toBe("changed");
    expect(report.files.gameTraces).toBe(true);
    expect(report.files.gameSummary).toBe(true);
    expect(report.files.postSessionTruth).toBe(true);
    expect(report.files.adaptationDiff).toBe(true);

    const changedNode = report.boardAfter.find((node) =>
      report.runtimeDiff.changedNodeIds.includes(node.id),
    );
    expect(changedNode?.words).toContain(report.selectedMissTarget);
    expect(changedNode?.words).not.toEqual(
      report.boardBefore.find((node) => node.id === changedNode?.id)?.words,
    );
  });

  it("proves worsening and improving synthetic child trajectories adapt differently", async () => {
    const report = await runClosedLoopAdaptationProof({
      rootDir: root(),
      generatedAt: "2026-05-18T15:05:00.000Z",
    });

    const worsening = report.trajectories.find((trajectory) => trajectory.id === "worsening_child");
    const improving = report.trajectories.find((trajectory) => trajectory.id === "improving_child");

    expect(worsening).toMatchObject({
      direction: "worse",
      proved: true,
      expectedBoardMove: "route_support",
    });
    expect(worsening?.nextTargets).toEqual(["again", "around"]);
    expect(worsening?.changedNodeIds.length).toBeGreaterThan(0);

    expect(improving).toMatchObject({
      direction: "better",
      proved: true,
      expectedBoardMove: "increase_challenge_or_skip_repetition",
    });
    expect(improving?.nextTargets).toEqual([]);
    expect(improving?.skippedPracticeNodeIds.length).toBeGreaterThan(0);
  });
});
