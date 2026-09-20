import { describe, expect, it } from "vitest";

import type { MathGenerationJob } from "../engine/adaptiveMathDiscovery";
import { shouldResumeAdaptiveMathWorker } from "./routes";

function job(
  phase: MathGenerationJob["phase"],
  statuses: MathGenerationJob["nodes"][number]["status"][],
): MathGenerationJob {
  return {
    version: 1,
    childId: "lab-child",
    homeworkId: "hw-lab",
    phase,
    programHash: "program",
    designHash: "design",
    startedAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
    nodes: statuses.map((status, index) => ({
      nodeId: `node-${index + 1}`,
      status,
      updatedAt: "2026-09-20T12:00:00.000Z",
    })),
  };
}

describe("adaptive math worker startup reconciliation", () => {
  it("revisits board_ready jobs so interrupted canonical publication is repaired", () => {
    expect(shouldResumeAdaptiveMathWorker(job("board_ready", ["ready"]))).toBe(true);
  });

  it("resumes unfinished siblings even when another node needs parent attention", () => {
    expect(shouldResumeAdaptiveMathWorker(job("needs_attention", ["needs_attention", "preparing"]))).toBe(true);
    expect(shouldResumeAdaptiveMathWorker(job("needs_attention", ["needs_attention", "failed_resumable"]))).toBe(true);
  });

  it("leaves a fully exhausted parent-attention job stopped", () => {
    expect(shouldResumeAdaptiveMathWorker(job("needs_attention", ["needs_attention", "needs_attention"]))).toBe(false);
  });
});
