import type { CallClockMoment } from "./CallClock";

/**
 * The clock on her screen shows the time; her companion speaks of it only when call time is up (owner 2026-11-22:
 * Reina's whole one-minute call was spent on "about a minute left… thirty coins for five more minutes").
 */
export function companionSpeaksAtClockMoment(moment: CallClockMoment): boolean {
  return moment === "time_up";
}
