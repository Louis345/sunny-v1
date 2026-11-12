import { describe, expect, it } from "vitest";
import { isBoardFinishedPacket } from "../utils/adventureBoardLaunch";
import { resolvePreparationSurface } from "../components/AdventurePreparation/useAppAdventurePreparation";
import * as adapter from "../components/AdventurePreparation/preparationStatusAdapter";
import { isPreparationSlow, preparationElapsedLabel, preparationEventsFromStatus } from "../components/AdventurePreparation/preparationStatusAdapter";

const status = (phase: string, nodes: Array<[string, string]> = [], extra: Record<string, unknown> = {}) =>
  ({ phase, updatedAt: "t", nodes: nodes.map(([nodeId, s]) => ({ nodeId, status: s })), ...extra });
const types = new Map([["a", "word-radar"], ["b", "letter-rush"]]);

describe("published boards are final (single source: the server's publication)", () => {
  it("finishes preparation for a usable published board without hiding unavailable siblings", () => {
    expect(preparationEventsFromStatus(status("successor_published", [["a", "ready"], ["b", "not_ready"]]), types)).toEqual([
      { type: "PLAN_DONE", stops: [{ activityType: "word-radar" }, { activityType: "letter-rush" }] },
      { type: "ACTIVITY_READY", n: 2, total: 2, published: true },
    ]);
  });
  // 2026-10-22 human catch: the kiosk sat on "Planning your map" with a 1,395-minute timer while the server
  // reported successor_published. Next-board statuses carry no activity list, so no event ever reached the
  // waiting screen, and Not ready spots were read as "still preparing". The lab only modeled first boards.
  it("treats a published next board as ready even when its status lists no activities", () => {
    expect(preparationEventsFromStatus(status("successor_published"), types)).toEqual([
      { type: "PLAN_DONE", stops: [{ activityType: "word-radar" }, { activityType: "letter-rush" }] },
      { type: "ACTIVITY_READY", n: 2, total: 2, published: true },
    ]);
  });

  it("never holds the waiting screen over a board the server has published", () => {
    expect(resolvePreparationSurface({ packet: { activeSessionPlan: { domain: "spelling" } } as never, directDiscoveryMode: false, handoff: null, held: true, published: true, preview: false })).toBeNull();
  });
});

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

describe("truthful waiting screen", () => {
  it("names the real generation phase instead of showing nothing until nodes exist", () => {
    expect(adapter).toHaveProperty("preparationPhaseFromStatus");
    const phase = (adapter as unknown as { preparationPhaseFromStatus: (value: unknown) => string | undefined }).preparationPhaseFromStatus;
    expect(phase(null)).toBeUndefined();
    expect(phase(status("targeted_planning"))).toBe("planning");
    expect(phase(status("board_designing"))).toBe("designing");
    expect(phase(status("board_generating", [["a", "preparing"]]))).toBe("building");
    expect(phase(status("board_ready", [["a", "ready"]]))).toBe("ready");
  });

  it("treats a not-ready activity as finished preparation, not as a failed map", () => {
    const events = preparationEventsFromStatus(status("board_generating", [["a", "ready"], ["b", "not_ready"]]), types);
    expect(events.some(event => event.type === "FAILED")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "ACTIVITY_READY", n: 2, total: 2 });
  });
});

describe("a finished board", () => {
  const packet = (lifecycle: string, domain = "spelling") => ({ activeSessionPlan: { domain }, childChart: { learningCycle: { lifecycle } } }) as never;
  it("opens the same waiting screen until the next board is published", () => {
    const input = { packet: packet("baseline_evaluating"), directDiscoveryMode: false, handoff: "targeted-planning", held: false, preview: false, boardFinished: true };
    expect(resolvePreparationSurface(input)).toBe("chapter");
    expect(resolvePreparationSurface({ ...input, published: true })).toBeNull();
    expect(resolvePreparationSurface({ ...input, preview: true })).toBeNull();
  });
  // Owner 2026-11-12: Reina finished math board 3, came back from FaceTime while board 4 was being built, and saw the
  // finished board 3 as if it were current. Why the human caught it: an old, done board on screen. Why logs missed
  // it: the page reloaded into the board with no screen report. Why the lab missed it: this test pinned math to
  // "no waiting screen", and no case covered a page opened while the next board is generated.
  // Rule: one waiting screen for every subject, from the moment a board is finished until the next one is published.
  it("is known from the cycle deciding or building what comes next, for spelling and math", () => {
    for (const domain of ["spelling", "math"]) {
      for (const lifecycle of ["baseline_evaluating", "quest_evaluating", "boss_evaluating", "quest_generating", "boss_generating"]) {
        expect(isBoardFinishedPacket(packet(lifecycle, domain)), `${domain} ${lifecycle}`).toBe(true);
      }
      expect(isBoardFinishedPacket(packet("board_ready", domain))).toBe(false);
      expect(isBoardFinishedPacket(packet("baseline_generating", domain))).toBe(false);
    }
    expect(isBoardFinishedPacket(null)).toBe(false);
  });
  it("opens for a finished math board until the next one is published", () => {
    const input = { packet: packet("quest_generating", "math"), directDiscoveryMode: false, handoff: null, held: false, preview: false, boardFinished: true };
    expect(resolvePreparationSurface(input)).toBe("chapter");
    expect(resolvePreparationSurface({ ...input, published: true })).toBeNull();
  });
});
