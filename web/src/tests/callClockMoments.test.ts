import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { companionSpeaksAtClockMoment } from "../components/callClockMoments";

// Reina, 2026-11-22: her one-minute call was spent on "about a minute left… thirty coins for five more minutes". The
// clock is on her screen; her companion gets a turn about time only when it is up (server prompt:
// src/server/companionCallClockPrompt.test.ts).
it("the kiosk starts a companion turn only when call time is up", () => {
  expect(companionSpeaksAtClockMoment("time_up")).toBe(true);
  expect(companionSpeaksAtClockMoment("minute_left")).toBe(false);
  expect(companionSpeaksAtClockMoment("minutes_bought")).toBe(false);
  const showroom = fs.readFileSync(path.resolve(__dirname, "../components/CompanionShowroom.tsx"), "utf8");
  expect(showroom).toMatch(/if \(companionSpeaksAtClockMoment\(moment\)\) void submitShowroomTalkQuestion\("\(call clock\)"/);
});
