import { describe, expect, it } from "vitest";
import { announce, checkAnnouncerLine, type AnnouncerBank, type AnnouncerMemory } from "../../../src/shared/announcer";

const clip = (id: string, event: string, text: string, extra: Record<string, string> = {}) => ({ id, event, text, lang: "en", file: `${id}.mp3`, ...extra });

const BANK: AnnouncerBank = {
  childId: "ila",
  week: "2026-W47",
  clips: [
    clip("perfect-1", "perfect", "PERFECT!"),
    clip("perfect-2", "perfect", "Right on the beat!"),
    clip("perfect-3", "perfect", "Sugoi!", { lang: "ja" }),
    clip("right-1", "right", "Nice!"),
    clip("miss-1", "miss", "Next one!"),
    clip("catch-1", "catch", "It's a catch!"),
    clip("callback-pardon", "callback", "Pardon got you yesterday. Not today!", { word: "pardon" }),
    clip("slot-name", "slot", "Eye-lah!", { slot: "name" }),
    clip("slot-streak-5", "slot", "Five in a row!", { slot: "streak:5" }),
    clip("slot-round-3", "slot", "Round three!", { slot: "round:3" }),
    clip("slot-glowmoth", "slot", "Glowmoth!", { slot: "creature:glowmoth" }),
  ] as AnnouncerBank["clips"],
};

const fresh = (now = 10_000): AnnouncerMemory => ({ recent: [], lastSpokeAt: -Infinity, now });

describe("announcer picker", () => {
  it("says the callback line only when the record shows she missed that word on an earlier day", () => {
    const withRecord = announce(BANK, { event: "right", word: "pardon", missedBefore: true }, fresh(), () => 0.99);
    expect(withRecord?.clips).toEqual(["callback-pardon"]);
    const noRecord = announce(BANK, { event: "right", word: "pardon", missedBefore: false }, fresh(), () => 0);
    expect(noRecord?.clips ?? []).not.toContain("callback-pardon");
    const otherWord = announce(BANK, { event: "right", word: "carnival", missedBefore: true }, fresh(), () => 0);
    expect(otherWord?.clips ?? []).not.toContain("callback-pardon");
  });

  it("never says the same line twice in a row", () => {
    let memory = fresh();
    const said: string[] = [];
    for (let index = 0; index < 9; index += 1) {
      const result = announce(BANK, { event: "perfect" }, { ...memory, now: memory.now + 5_000 }, () => 0);
      expect(result).not.toBeNull();
      said.push(result!.clips[0]);
      memory = result!.memory;
    }
    for (let index = 1; index < said.length; index += 1) expect(said[index]).not.toBe(said[index - 1]);
    expect(new Set(said).size).toBe(3);
  });

  it("calls a streak as one whole recorded line, sometimes with her name first", () => {
    expect(announce(BANK, { event: "streak", streak: 5 }, fresh(), () => 0)?.clips).toEqual(["slot-name", "slot-streak-5"]);
    expect(announce(BANK, { event: "streak", streak: 5 }, fresh(), () => 0.9)?.clips).toEqual(["slot-streak-5"]);
    expect(announce(BANK, { event: "streak", streak: 7 }, fresh(), () => 0)).toBeNull();
  });

  it("names the creature after the catch line, and calls the round as one line", () => {
    expect(announce(BANK, { event: "catch", creatureId: "glowmoth" }, fresh(), () => 0)?.clips).toEqual(["catch-1", "slot-glowmoth"]);
    expect(announce(BANK, { event: "round", round: 3 }, fresh(), () => 0)?.clips).toEqual(["slot-round-3"]);
  });

  it("does not talk over itself, except for the big moments", () => {
    const just = { recent: [], lastSpokeAt: 9_500, now: 10_000 };
    expect(announce(BANK, { event: "right" }, just, () => 0)).toBeNull();
    expect(announce(BANK, { event: "catch", creatureId: "glowmoth" }, just, () => 0)).not.toBeNull();
  });

  it("stays quiet when the bank has nothing for the moment (the game falls back to its own lines)", () => {
    expect(announce(BANK, { event: "hatch" }, fresh(), () => 0)).toBeNull();
    expect(announce(null, { event: "perfect" }, fresh(), () => 0)).toBeNull();
  });
});

describe("announcer line check", () => {
  const words = ["carnival", "pardon"];
  it("keeps a good line", () => {
    expect(checkAnnouncerLine("Right on the beat!", "perfect", words)).toEqual({ ok: true });
  });
  it("throws out a line that spells letters out", () => {
    expect(checkAnnouncerLine("C, A, R, that's how!", "right", words).ok).toBe(false);
    expect(checkAnnouncerLine("c-a-r-n-i-v-a-l!", "right", words).ok).toBe(false);
  });
  it("throws out a target word outside a callback, so it never gives the answer away", () => {
    expect(checkAnnouncerLine("Carnival is coming!", "intro", words).ok).toBe(false);
    expect(checkAnnouncerLine("Pardon got you yesterday. Not today!", "callback", words)).toEqual({ ok: true });
  });
  it("throws out a miss line that tells her she was wrong", () => {
    expect(checkAnnouncerLine("Wrong! Try harder.", "miss", words).ok).toBe(false);
    expect(checkAnnouncerLine("Oops, you missed it.", "miss", words).ok).toBe(false);
    expect(checkAnnouncerLine("Next one is yours!", "miss", words)).toEqual({ ok: true });
  });
  it("throws out anything about diagnoses, school scores, or her sister as a comparison", () => {
    expect(checkAnnouncerLine("Dyslexia can't stop you!", "perfect", words).ok).toBe(false);
    expect(checkAnnouncerLine("Faster than Reina!", "perfect", words, { avoidNames: ["Reina"] }).ok).toBe(false);
  });
  it("throws out lines too long to land on a beat", () => {
    expect(checkAnnouncerLine("This is a very long line that goes on and on and will never fit", "right", words).ok).toBe(false);
  });
});
