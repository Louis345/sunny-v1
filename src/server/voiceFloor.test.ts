import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { ServerVoiceFloor, serverVoiceFloorMachine } from "./voiceFloor";

// Reina, 2026-11-22: game lines in the narrator slot landed on top of Matilda's live replies ("it talks too much and
// doesn't follow up"). Why the human caught it: two lines at once, and the game line won. Why logs missed it: the
// old gate held game speech only during a help answer, and logged nothing for any other overlap. Why the lab missed
// it: no test put a game line next to an ordinary companion reply. UFC rule: the ring announcer speaks, the
// commentators wait; when the fighter (the child) speaks, everyone stops and her companion answers her.
// 2026-11-09 Ila (kept from the old gate): "Ellie, can you help me?", then the game said "carnivore" over the answer.

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function floor() {
  vi.spyOn(console, "log").mockImplementation(() => {});
  return new ServerVoiceFloor();
}

describe("server voice floor (XState): one voice at a time", () => {
  it("the machine: free, held by whoever starts, the companion outranks the narrator, the child frees it", () => {
    const actor = createActor(serverVoiceFloorMachine).start();
    expect(actor.getSnapshot().value).toBe("free");
    actor.send({ type: "NARRATOR_STARTED" });
    expect(actor.getSnapshot().value).toBe("narrator");
    actor.send({ type: "COMPANION_STARTED" });
    expect(actor.getSnapshot().matches("companion")).toBe(true);
    actor.send({ type: "NARRATOR_STARTED" });
    expect(actor.getSnapshot().matches("companion")).toBe(true);
    actor.send({ type: "CHILD_SPOKE" });
    expect(actor.getSnapshot().value).toBe("free");
  });

  it("while the companion talks (any non-idle turn), the narrator's line waits and plays when she finishes", () => {
    const f = floor();
    f.companionTurn("PROCESSING");
    expect(f.narratorMayStart("Type where the kappa lands next.", { reason: "step" })).toBe(false);
    f.companionTurn("SPEAKING");
    expect(f.companionTurn("IDLE")).toEqual({ text: "Type where the kappa lands next.", metadata: { reason: "step" } });
    expect(f.current()).toBe("free");
    expect(f.narratorMayStart("7 + 5 = ?", {})).toBe(true);
    expect(f.current()).toBe("narrator");
  });

  it("a help request claims the floor at once, so the game's word waits for her answer (only the latest word is kept)", () => {
    const f = floor();
    f.companionClaimed();
    expect(f.narratorMayStart("carnivore.", { word: "carnivore" })).toBe(false);
    expect(f.narratorMayStart("carton.", { word: "carton" })).toBe(false);
    f.companionTurn("LOADING");
    expect(f.companionTurn("IDLE")).toEqual({ text: "carton.", metadata: { word: "carton" } });
    expect(f.companionTurn("IDLE")).toBeUndefined();
  });

  it("when the child speaks, both voices stop: a held screen line is dropped, a held test word still plays after", () => {
    const f = floor();
    f.companionTurn("SPEAKING");
    f.narratorMayStart("Tap the stone.", { reason: "step" });
    f.childSpoke();
    expect(f.current()).toBe("free");
    f.companionTurn("PROCESSING");
    expect(f.companionTurn("IDLE")).toBeUndefined();
    f.companionTurn("SPEAKING");
    f.narratorMayStart("night.", { word: "night", assessmentMode: true });
    f.childSpoke();
    f.companionTurn("PROCESSING");
    expect(f.companionTurn("IDLE")).toEqual({ text: "night.", metadata: { word: "night", assessmentMode: true } });
  });

  it("a stuck companion turn never strands the game: a held line is released after 20 s", () => {
    vi.useFakeTimers();
    const f = floor();
    const released: string[] = [];
    f.onRelease(line => released.push(line.text));
    f.companionTurn("SPEAKING");
    f.narratorMayStart("night.", { word: "night" });
    vi.advanceTimersByTime(19_000);
    expect(released).toEqual([]);
    vi.advanceTimersByTime(1_500);
    expect(released).toEqual(["night."]);
  });

  it("the narrator gives the floor back when its line ends", () => {
    const f = floor();
    expect(f.narratorMayStart("7 + 5 = ?", {})).toBe(true);
    f.narratorEnded();
    expect(f.current()).toBe("free");
  });
});

describe("the session uses the voice floor for every voice", () => {
  it("turn changes, help requests, the narrator's start and end, and child barge-in all reach the floor", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/server/session-manager.ts"), "utf8");
    expect(source).not.toMatch(/narrationGate/);
    expect(source).toMatch(/this\.voiceFloor\?\.companionTurn\(state\)/);
    expect(source).toMatch(/this\.voiceFloor\?\.companionClaimed\(\)/);
    expect(source).toMatch(/this\.voiceFloor\?\.narratorMayStart\(/);
    expect(source).toMatch(/this\.voiceFloor\?\.childSpoke\(\)/);
    expect(source.match(/this\.voiceFloor\?\.narratorEnded\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(fs.existsSync(path.join(process.cwd(), "src/server/narrationGate.ts"))).toBe(false);
  });

  it("AGENTS.md says XState owns every voice and turn-taking state", () => {
    expect(fs.readFileSync(path.join(process.cwd(), "AGENTS.md"), "utf8")).toContain("XState owns every voice and turn-taking state.");
  });
});
