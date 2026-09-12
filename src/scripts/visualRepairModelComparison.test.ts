import { describe, expect, it, vi } from "vitest";
import { runVisualRepairModelComparison } from "./visualRepairModelComparison";

describe("visual repair model comparison", () => {
  it("uses one identical prompt per arm and never retries a failed repair", async () => {
    const sonnet = vi.fn(async (prompt: string) => ({ html: `<html>${prompt}</html>`, usage: {}, latencyMs: 10 }));
    const gpt = vi.fn(async () => { throw new Error("provider_failed"); });
    const verify = vi.fn(async () => ({ passed: true, issues: [] as string[] }));

    const result = await runVisualRepairModelComparison({
      prompt: "same frozen repair prompt",
      arms: [
        { id: "sonnet", model: "claude-sonnet-5", generate: sonnet },
        { id: "gpt", model: "gpt-5.6", generate: gpt },
      ],
      verify,
    });

    expect(sonnet).toHaveBeenCalledTimes(1);
    expect(gpt).toHaveBeenCalledTimes(1);
    expect(sonnet).toHaveBeenCalledWith("same frozen repair prompt");
    expect(gpt).toHaveBeenCalledWith("same frozen repair prompt");
    expect(verify).toHaveBeenCalledTimes(1);
    expect(new Set(result.arms.map((arm) => arm.promptHash)).size).toBe(1);
    expect(result.arms.find((arm) => arm.id === "gpt")).toMatchObject({
      status: "provider_failed",
      error: "provider_failed",
    });
  });
});
