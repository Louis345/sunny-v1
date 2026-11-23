import { describe, expect, it } from "vitest";
import { buildShowroomTalkSystemPrompt } from "./companionShowroomTalk";

// Reina, 2026-11-22: her whole 60-second earned call was "we've got about a minute left… thirty coins for five more
// minutes". Why the human caught it: the call was a sales pitch, not a friend. Why logs missed it: each clock line was
// logged as an ordinary reply. Why the lab missed it: the prompt told her to mention the clock and sell another board.
// The on-screen clock shows the time; she mentions time only when it is up, in her own words, with no pitch.
const clockLines = (prompt: string) => {
  const without = new Set(buildShowroomTalkSystemPrompt(base).split("\n"));
  return prompt.split("\n").filter(line => !without.has(line)).join("\n");
};
const base = { companionId: "matilda", companionName: "Matilda", showroomTheme: "garden", personality: "warm", mode: "video_call" as const };

describe("call clock: no coin pitch", () => {
  it("time up: the facts, with no coins, boards or spending pressure", () => {
    for (const coins of [10, 90]) {
      const prompt = clockLines(buildShowroomTalkSystemPrompt({ ...base, callClock: { event: "time_up", minutesLeft: 0, coins, price: 30, minutes: 5 } }));
      expect(prompt).toContain("call time is up");
      expect(prompt).not.toMatch(/coins|another board|5 more minutes cost|afford/i);
      expect(prompt).toContain("Buying more time, prices and homework are hers to choose, with no pressure from you.");
    }
  });

  it("minute left and minutes bought: the screen shows the time, with no coin pitch", () => {
    for (const event of ["minute_left", "minutes_bought"] as const) {
      const prompt = clockLines(buildShowroomTalkSystemPrompt({ ...base, callClock: { event, minutesLeft: 1, coins: 90, price: 30, minutes: 5 } }));
      expect(prompt).not.toMatch(/coins|another board|Mention it/i);
      expect(prompt).toContain("Live call clock: the clock is on her screen.");
    }
  });

});
