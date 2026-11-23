import { afterEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { OrbAnnouncer, type AnnouncerAudio } from "../components/orbAnnouncer";
import { createVoiceFloor, voiceFloorMachine } from "../utils/voiceFloor";

// Owner, 2026-11-21 (Reina's birthday session, everyone watching): in Orb Catcher the recorded announcer talked while
// Matilda talked. Why the human caught it: two voices at once is obvious to a listener. Why logs missed it: the
// announcer logs its own lines and the session logs Matilda's, and nothing compares the two. Why the lab missed it:
// the announcer queue only kept its own clips apart; no test put a companion reply next to an announcer line.

const BANK = {
  childId: "reina",
  week: "2026-W47",
  clips: [
    { id: "catch-1", event: "catch", text: "Caught!", lang: "en", file: "clips/catch-1.mp3" },
    { id: "slot-word-mail", event: "slot", slot: "word:mail", text: "mail", lang: "en", file: "clips/w.mp3" },
    { id: "slot-ready", event: "slot", slot: "ready", text: "Ready? Go!", lang: "en", file: "clips/r.mp3" },
  ],
};

function fakeAudio() {
  const loaded = new Set<string>();
  const played: string[] = [];
  let stopped = 0;
  const audio: AnnouncerAudio = {
    loadExtra: vi.fn(async (sounds: Record<string, string>) => {
      Object.keys(sounds).forEach((key) => loaded.add(key));
      return loaded.size;
    }),
    play: (key) => played.push(key),
    duration: () => 0.5,
    has: (key) => loaded.has(key),
    duck: () => undefined,
    msToNextBeat: () => 0,
    sayTestWord: () => undefined,
    stopVoice: () => { stopped += 1; },
  };
  return { audio, played, stopped: () => stopped };
}

async function announcerWith(floor = createVoiceFloor()) {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => BANK })));
  const fake = fakeAudio();
  const announcer = await OrbAnnouncer.load("reina", fake.audio, () => Date.now(), floor);
  return { announcer: announcer!, floor, ...fake };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("one voice at a time: the voice floor", () => {
  it("is free, then held by whoever starts, and free again when they finish", () => {
    const actor = createActor(voiceFloorMachine).start();
    expect(actor.getSnapshot().value).toBe("free");
    actor.send({ type: "ANNOUNCER_STARTED" });
    expect(actor.getSnapshot().value).toBe("announcer");
    actor.send({ type: "COMPANION_STARTED" });
    expect(actor.getSnapshot().value).toBe("companion");
    actor.send({ type: "ANNOUNCER_STARTED" });
    expect(actor.getSnapshot().value).toBe("companion");
    actor.send({ type: "COMPANION_ENDED" });
    expect(actor.getSnapshot().value).toBe("free");
  });

  it("the announcer stays quiet while the companion is talking (and the game does not fall back to another voice)", async () => {
    const { announcer, floor, played } = await announcerWith();
    floor.companionStarted();
    expect(announcer.call({ event: "catch" })).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(played).toEqual([]);
  });

  it("the companion starting mid-line stops the announcer at once", async () => {
    const { announcer, floor, played, stopped } = await announcerWith();
    announcer.call({ event: "catch" });
    vi.advanceTimersByTime(10);
    expect(played).toEqual(["ann:catch-1"]);
    floor.companionStarted();
    expect(stopped()).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(played).toEqual(["ann:catch-1"]);
  });

  it("a line she needs (her word, Ready? Go!) waits for the companion to finish instead of being lost", async () => {
    const { announcer, floor, played } = await announcerWith();
    floor.companionStarted();
    announcer.sayWord("mail");
    announcer.cue("ready");
    vi.advanceTimersByTime(3000);
    expect(played).toEqual([]);
    floor.companionEnded();
    vi.advanceTimersByTime(3000);
    expect(played).toEqual(["ann:slot-word-mail", "ann:slot-ready"]);
  });

  it("the announcer holds the floor while it talks and gives it back when done", async () => {
    const { announcer, floor } = await announcerWith();
    announcer.call({ event: "catch" });
    vi.advanceTimersByTime(10);
    expect(floor.current()).toBe("announcer");
    vi.advanceTimersByTime(3000);
    expect(floor.current()).toBe("free");
  });
});

describe("the companion's voice takes the floor", () => {
  it("homework speech playback tells the floor when her reply starts, ends, or is stopped", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(__dirname, "../hooks/useSession.ts"), "utf8");
    expect(source.match(/voiceFloor\.companionStarted\(\)/g)?.length).toBe(1);
    // Reply finished, playback cancelled, muted, and karaoke silence each give the floor back.
    expect(source.match(/voiceFloor\.companionEnded\(\)/g)?.length).toBe(4);
  });
});
