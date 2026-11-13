import { describe, expect, it } from "vitest";

import {
  EngineerCeilingBudget,
  buildCeilingRequest,
  evaluateCeilingRun,
  frozenPacketHash,
  renderCeilingReport,
} from "./runEngineerTokenCeilingComparison";

const frozen = {
  curriculum: { packetId: "packet-1", upstreamHash: "charter-hash", items: [{ itemId: "item-1" }] },
  design: { artifactId: "artifact-1", upstreamHash: "curriculum-hash", title: "Lantern Festival" },
};

describe("engineer token ceiling comparison", () => {
  it("changes only max_tokens between the 52K and 78K requests", () => {
    const packetHash = frozenPacketHash(frozen);
    const prompt = "Implement the exact frozen packet.";
    const doubled = buildCeilingRequest({ prompt, packetHash, maxTokens: 52_000 });
    const tripled = buildCeilingRequest({ prompt, packetHash, maxTokens: 78_000 });

    expect(doubled.max_tokens).toBe(52_000);
    expect(tripled.max_tokens).toBe(78_000);
    expect({ ...doubled, max_tokens: 0 }).toEqual({ ...tripled, max_tokens: 0 });
    expect(doubled).not.toHaveProperty("thinking");
  });

  it("freezes curriculum and design together", () => {
    expect(frozenPacketHash(frozen)).toMatch(/^[a-f0-9]{64}$/);
    expect(frozenPacketHash(structuredClone(frozen))).toBe(frozenPacketHash(frozen));
    expect(frozenPacketHash({ ...frozen, design: { ...frozen.design, title: "Changed" } })).not.toBe(frozenPacketHash(frozen));
  });

  it("permits two calls and stops before exceeding the five-dollar ceiling", () => {
    const budget = new EngineerCeilingBudget({ maxCalls: 2, maxCostUsd: 5 });
    expect(budget.canStart(2.1)).toEqual({ allowed: true });
    budget.record({ status: "complete", costUsd: 1.4 });
    expect(budget.canStart(2.1)).toEqual({ allowed: true });
    budget.record({ status: "failed", costUsd: 0.2 });
    expect(budget.snapshot()).toEqual({ attempts: 2, spentUsd: 1.6, failedAttempts: 1 });
    expect(budget.canStart(0)).toEqual({ allowed: false, reason: "call_ceiling_reached" });
  });

  it("requires naturally closed HTML and reports truncation honestly", () => {
    expect(evaluateCeilingRun({
      historicalPlayable: true,
      prior26k: { stopReason: "max_tokens", htmlClosed: false, outputTokens: 26_000 },
      doubled52k: { stopReason: "end_turn", htmlClosed: true, outputTokens: 31_500 },
      tripled78k: { stopReason: "end_turn", htmlClosed: true, outputTokens: 34_200 },
      costUsd: 2.4,
    })).toMatchObject({ status: "READY_FOR_HUMAN_REVIEW", bottleneck: "resolved_below_52k" });

    expect(evaluateCeilingRun({
      historicalPlayable: true,
      prior26k: { stopReason: "max_tokens", htmlClosed: false, outputTokens: 26_000 },
      doubled52k: { stopReason: "max_tokens", htmlClosed: false, outputTokens: 52_000 },
      tripled78k: { stopReason: "max_tokens", htmlClosed: false, outputTokens: 78_000 },
      costUsd: 4.8,
    })).toMatchObject({ status: "INCOMPLETE", bottleneck: "implementation_exceeds_78k_or_prompt_bloat" });
  });

  it("renders historical, 52K, and 78K experiences with the 26K failure diagnostic", () => {
    const html = renderCeilingReport({
      historicalPath: "historical/experience.html",
      doubledPath: "52k/experience.html",
      tripledPath: "78k/experience.html",
      summary: { status: "READY_FOR_HUMAN_REVIEW", costUsd: 2.4 },
    });
    expect(html).toContain("26K diagnostic");
    expect(html).toContain("historical/experience.html");
    expect(html).toContain("52k/experience.html");
    expect(html).toContain("78k/experience.html");
  });
});
