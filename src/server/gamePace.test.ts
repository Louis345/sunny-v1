import { expect, it } from "vitest";
import { gamePaceFacts, noteGamePace } from "./gamePace";

// 2026-11-10, both audits: the companion only learned how long Ila had been stuck when she spoke, and the
// frustration check ran only in five named games (never in built games, never in math). Every game now gives her
// companion the same plain facts on every turn; what they mean for this child is the companion's judgment.
it("tells her companion, in any game, how long she has been in it, her answers so far, and her last answer", () => {
  const t0 = Date.parse("2026-11-10T12:00:00Z");
  noteGamePace("ila", "voice-gate", "state", t0);
  expect(gamePaceFacts("ila", "voice-gate", t0 + 9 * 60_000)).toBe("This game: open 9 minutes; no answer yet; help asked 0 times.");
  noteGamePace("ila", "voice-gate", "help", t0 + 9.5 * 60_000);
  noteGamePace("ila", "voice-gate", "answer", t0 + 10 * 60_000);
  noteGamePace("ila", "voice-gate", "answer", t0 + 11 * 60_000);
  expect(gamePaceFacts("ila", "voice-gate", t0 + 15 * 60_000)).toBe("This game: open 15 minutes; 2 answers so far, the last one 4 minutes ago; help asked 1 time.");
  expect(gamePaceFacts("ila", "other", t0)).toBe("");
});
