import { describe, expect, it } from "vitest";
import { resolvePreparationSurface } from "../components/AdventurePreparation/useAppAdventurePreparation";
import { isPreparationSlow, preparationElapsedLabel, preparationEventsFromStatus } from "../components/AdventurePreparation/preparationStatusAdapter";

const status = (phase: string, nodes: Array<[string, string]> = [], extra: Record<string, unknown> = {}) =>
  ({ phase, updatedAt: "t", nodes: nodes.map(([nodeId, s]) => ({ nodeId, status: s })), ...extra });
const types = new Map([["a", "word-radar"], ["b", "letter-rush"]]);

describe("preparationEventsFromStatus", () => {
  it("proves nothing while the Planner is still planning", () => {
    expect(preparationEventsFromStatus(null, types)).toEqual([]);
    expect(preparationEventsFromStatus(status("targeted_planning"), types)).toEqual([]);
  });

  it("reports the plan's stops in order with their real activity types", () => {
    expect(preparationEventsFromStatus(status("board_generating", [["a", "preparing"], ["b", "preparing"], ["c", "preparing"]]), types)).toEqual([
      { type: "PLAN_DONE", stops: [{ activityType: "word-radar" }, { activityType: "letter-rush" }, { activityType: "" }] },
    ]);
  });

  it("counts ready, completed and locked-but-built activities as prepared", () => {
    const events = preparationEventsFromStatus(status("board_generating", [["a", "ready"], ["b", "evidence_locked"], ["c", "preparing"]]), types);
    expect(events.at(-1)).toEqual({ type: "ACTIVITY_READY", n: 2, total: 3 });
  });

  it("reports a failure instead of progress", () => {
    expect(preparationEventsFromStatus(status("board_generating", [["a", "ready"], ["b", "failed_resumable"]]), types)).toEqual([
      { type: "FAILED", reason: "failed_resumable", retryable: true },
    ]);
    expect(preparationEventsFromStatus(status("needs_attention", [], { error: "creator_timeout" }), types)[0]).toMatchObject({ type: "FAILED", reason: "creator_timeout" });
  });
});

describe("elapsed time", () => {
  const start = "2026-10-04T18:00:00Z", at = (s: number) => Date.parse(start) + s * 1000;
  it("shows real elapsed time, never an estimate", () => {
    expect(preparationElapsedLabel(start, at(20), false)).toBe("under 1 min so far");
    expect(preparationElapsedLabel(start, at(150), false)).toBe("2 min so far");
    expect(preparationElapsedLabel(start, at(192), true)).toBe("3 min 12 s");
    expect(preparationElapsedLabel(undefined, at(10), false)).toBeUndefined();
  });
  it("becomes slow only after six real minutes", () => {
    expect(isPreparationSlow(start, at(359))).toBe(false);
    expect(isPreparationSlow(start, at(360))).toBe(true);
    expect(isPreparationSlow(undefined, at(9999))).toBe(false);
  });
});

describe("which screen the app shows", () => {
  const packet = (domain: string) => ({ activeSessionPlan: { domain } }) as never;
  it("uses the new screen only for real spelling waits", () => {
    expect(resolvePreparationSurface({ packet: packet("spelling"), directDiscoveryMode: true, handoff: "targeted-planning", held: false, preview: false })).toBe("chapter");
    expect(resolvePreparationSurface({ packet: packet("spelling"), directDiscoveryMode: false, handoff: null, held: true, preview: false })).toBe("held");
    expect(resolvePreparationSurface({ packet: packet("spelling"), directDiscoveryMode: true, handoff: "preview-complete", held: false, preview: false })).toBeNull();
    expect(resolvePreparationSurface({ packet: packet("spelling"), directDiscoveryMode: false, handoff: null, held: true, preview: true })).toBeNull();
    expect(resolvePreparationSurface({ packet: packet("math"), directDiscoveryMode: true, handoff: "targeted-planning", held: false, preview: false })).toBeNull();
  });
});
