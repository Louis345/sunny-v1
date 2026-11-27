import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCallOpeningCache, type WrittenCallLine } from "../utils/callMoment";

const line = (text: string): WrittenCallLine => ({ text, audio: null });

describe("call opening cache: her first words are written before she picks up", () => {
  it("writes the likely companion's opening once and hands it over at pickup without a second request", async () => {
    const write = vi.fn(async (key: { companionId: string; voiceId: string }) => line(`hi from ${key.companionId}`));
    const cache = createCallOpeningCache({ write, now: () => 0 });

    cache.prefetch({ companionId: "elli", voiceId: "v1" });
    cache.prefetch({ companionId: "elli", voiceId: "v1" });
    const taken = await cache.take({ companionId: "elli", voiceId: "v1" });

    expect(taken.text).toBe("hi from elli");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("writes on tap for any other pick, and never reuses an opening twice", async () => {
    const write = vi.fn(async (key: { companionId: string; voiceId: string }) => line(`hi from ${key.companionId}`));
    const cache = createCallOpeningCache({ write, now: () => 0 });

    cache.prefetch({ companionId: "elli", voiceId: "v1" });
    expect((await cache.take({ companionId: "kefla", voiceId: "v9" })).text).toBe("hi from kefla");
    await cache.take({ companionId: "elli", voiceId: "v1" });
    await cache.take({ companionId: "elli", voiceId: "v1" });
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("drops a stale opening (she waited too long) and writes a fresh one", async () => {
    let clock = 0;
    const write = vi.fn(async () => line(`at ${clock}`));
    const cache = createCallOpeningCache({ write, now: () => clock, maxAgeMs: 1000 });

    cache.prefetch({ companionId: "elli", voiceId: "v1" });
    clock = 5000;
    expect((await cache.take({ companionId: "elli", voiceId: "v1" })).text).toBe("at 5000");
  });

  it("a failed write is silence, never a stock line", async () => {
    const cache = createCallOpeningCache({ write: async () => { throw new Error("down"); }, now: () => 0 });
    expect(await cache.take({ companionId: "elli", voiceId: "v1" })).toEqual({ text: "", audio: null });
  });
});

describe("FaceTime pickup and goodbye are not scripted", () => {
  const source = readFileSync(resolve(__dirname, "../components/CompanionShowroom.tsx"), "utf8");

  it("has no canned pickup greeting or farewell table", () => {
    expect(source).not.toContain("resolveVideoCallPickupGreeting");
    expect(source).not.toContain("buildShowroomFarewellLine");
    expect(source).not.toContain("I was hoping you'd call");
    expect(source).not.toContain("Rematch soon?");
  });

  it("asks her to write both moments", () => {
    expect(source).toContain("callOpeningCacheRef");
    expect(source).toContain('moment: "goodbye"');
  });
});
