import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildSessionTimeline } from "./sessionTimeline";

// Owner 2026-11-09: the system runs its own retro of each session, what went well and what went wrong, from the
// facts. Ila spent 13.5 minutes before her first answer in Spelling Voice Gate, then loved it ("it makes so much
// sense"). The timeline is built by code from the session's game traces and conversation; judgment is the reader's.
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

it("lays out each game's opening, first answer, answers, progress and her words, in minutes from the start", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-")); dirs.push(dir);
  const t = (min: number) => new Date(Date.parse("2026-11-10T00:22:49.000Z") + min * 60_000).toISOString();
  const trace = (min: number, row: Record<string, unknown>) => JSON.stringify({ ts: t(min), nodeId: "n1", activityTitle: "Spelling Voice Gate", game: "generated-game", ...row });
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({ startedAt: t(0) }));
  fs.writeFileSync(path.join(dir, "game-traces.ndjson"), [
    trace(0.1, { type: "game_state_update", phase: "opening" }),
    trace(0.2, { type: "game_state_update", phase: "playing", progress: "Lantern 1 of 6" }),
    trace(5.6, { type: "game_state_update", phase: "playing", gameStep: "say", currentChallenge: "Go! Say each part. Tap a stone." }),
    trace(15.0, { type: "attempt_event", attemptedValue: "dormant", correct: true }),
    trace(15.3, { type: "game_state_update", phase: "playing", progress: "Lantern 2 of 6" }),
    trace(15.9, { type: "attempt_event", attemptedValue: "parton", correct: false }),
    trace(22.6, { type: "game_complete" }),
  ].join("\n"));
  fs.writeFileSync(path.join(dir, "transcript.md"), `### ${t(12.9)}\n\n**user:** How are you supposed to get this right?\n\n### ${t(13)}\n\n**assistant:** Type it in.\n\n### ${t(21.9)}\n\n**user:** Oh, I get it. It makes so much sense.\n`);
  const timeline = buildSessionTimeline(dir);
  expect(timeline).toContain(`Game "Spelling Voice Gate": opened at 0.1 min; first answer at 15.0 min (14.9 min after it opened); 2 answers, 1 right; finished at 22.6 min.`);
  expect(timeline).toContain(`  15.3 min: Lantern 2 of 6`);
  expect(timeline).toContain(`  5.6 min: step "say": Go! Say each part. Tap a stone.`);
  expect(timeline).toContain(`12.9 min, she said: "How are you supposed to get this right?"`);
  expect(timeline).toContain(`21.9 min, she said: "Oh, I get it. It makes so much sense."`);
  expect(timeline).not.toContain("Type it in.");
});
