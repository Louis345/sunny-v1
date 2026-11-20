import { afterEach, describe, expect, it, vi } from "vitest";
import { OrbAnnouncer, type AnnouncerAudio } from "../components/orbAnnouncer";

const BANK = {
  childId: "ila",
  week: "2026-W47",
  clips: [
    { id: "catch-1", event: "catch", text: "Caught!", lang: "en", file: "clips/catch-1.mp3" },
    { id: "slot-creature-glowmoth", event: "slot", slot: "creature:glowmoth", text: "Glowmoth!", lang: "en", file: "clips/g.mp3" },
    { id: "slot-word-pardon", event: "slot", slot: "word:pardon", text: "pardon", lang: "en", file: "clips/w.mp3" },
    { id: "slot-ready", event: "slot", slot: "ready", text: "Ready? Go!", lang: "en", file: "clips/r.mp3" },
  ],
};

function fakeAudio(msToNextBeat = 200) {
  const loaded = new Set<string>();
  const played: Array<{ key: string; at: number }> = [];
  const ducks: boolean[] = [];
  const audio: AnnouncerAudio = {
    loadExtra: vi.fn(async (sounds: Record<string, string>) => {
      Object.keys(sounds).forEach((key) => loaded.add(key));
      return loaded.size;
    }),
    play: (key) => played.push({ key, at: Date.now() }),
    duration: () => 0.5,
    has: (key) => loaded.has(key),
    duck: (on) => ducks.push(on),
    msToNextBeat: () => msToNextBeat,
  };
  return { audio, played, ducks };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("orb announcer player", () => {
  it("without a bank there is no announcer, so the game keeps its own lines", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const { audio } = fakeAudio();
    expect(await OrbAnnouncer.load("ila", audio)).toBeNull();
    expect(await OrbAnnouncer.load(undefined, audio)).toBeNull();
  });

  it("lands the catch line on the next beat, the creature's name right after, with the music dipped", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => BANK })));
    const { audio, played, ducks } = fakeAudio(200);
    const announcer = await OrbAnnouncer.load("ila", audio, () => Date.now());
    const start = Date.now();
    expect(announcer!.call({ event: "catch", creatureId: "glowmoth" })).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(played.map((entry) => entry.key)).toEqual(["ann:catch-1", "ann:slot-creature-glowmoth"]);
    expect(played[0].at - start).toBe(200);
    expect(played[1].at - start).toBe(780);
    expect(ducks).toEqual([true, false]);
  });

  it("says the practice word in the companion's recorded voice when this week has it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => BANK })));
    const { audio, played } = fakeAudio();
    const announcer = await OrbAnnouncer.load("ila", audio);
    expect(announcer!.sayWord("Pardon")).toBeGreaterThan(0);
    expect(announcer!.sayWord("carnival")).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(played.map((entry) => entry.key)).toEqual(["ann:slot-word-pardon"]);
  });

  it("one voice at a time: the word waits for the intro to finish instead of talking over it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => BANK })));
    const { audio, played } = fakeAudio(0);
    const announcer = await OrbAnnouncer.load("ila", audio, () => Date.now());
    const start = Date.now();
    announcer!.call({ event: "catch", creatureId: "glowmoth" });
    // The card learns when the word will be finished, to start the chunks after it.
    expect(announcer!.sayWord("pardon")).toBe(3 * 580);
    vi.advanceTimersByTime(3000);
    expect(played.map((entry) => entry.key)).toEqual(["ann:catch-1", "ann:slot-creature-glowmoth", "ann:slot-word-pardon"]);
    // Each clip lasts 0.5 s plus a short gap: the word starts only after both catch clips end.
    expect(played[2].at - start).toBeGreaterThanOrEqual(2 * 500);
  });

  it("never says the same word twice on top of itself (a double tap, a remount)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => BANK })));
    const { audio, played } = fakeAudio(0);
    const announcer = await OrbAnnouncer.load("ila", audio, () => Date.now());
    announcer!.sayWord("pardon");
    announcer!.sayWord("pardon");
    vi.advanceTimersByTime(300);
    announcer!.sayWord("pardon");
    vi.advanceTimersByTime(3000);
    expect(played.map((entry) => entry.key)).toEqual(["ann:slot-word-pardon"]);
    // Asked again well after it finished, it plays again.
    vi.advanceTimersByTime(2000);
    announcer!.sayWord("pardon");
    vi.advanceTimersByTime(1000);
    expect(played).toHaveLength(2);
  });

  it("the game's own cues come from the bank too (Ready? Go!), and a missing cue stays quiet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => BANK })));
    const { audio } = fakeAudio(0);
    const announcer = await OrbAnnouncer.load("ila", audio);
    expect(announcer!.cue("ready")).toBe(true);
    expect(announcer!.cue("listen")).toBe(false);
  });
});
