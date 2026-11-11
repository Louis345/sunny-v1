import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { playedGamesOf } from "./learningCycleRuntime";
import { buildSessionTimeline, sessionGames } from "./sessionTimeline";

// 2026-11-10, both audits: math games read "0 right" in every retro and scorecard (the game logs never carry right
// or wrong for math; the server scores the answers after), and every built spelling game showed 0 answers in the
// Planner's played-games list (answers are saved as `activity:<game>:recall`, and the list matched only
// `...:<game>`). Introspection reasoned from both. Invariant: game counts come from the saved score, matched to
// their game the one way the runtime does.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const obs = (sourceId: string, correct: boolean, observedAt = "2026-11-10T12:05:00Z") => ({ observationId: `${sourceId}:${correct}:${Math.random()}`, sourceId, itemId: "p1", observedAt, result: { correct }, assistance: { status: "unassisted", scaffolds: [] }, provenance: "practice" });

it("counts a played spelling game's answers in the Planner's list, whatever form they were saved in", () => {
  const cycle = { childId: "counts-lab", homeworkId: "hw-none", decisionHistory: [], nodes: [{ nodeId: "hw:b7:step-2", title: "Lantern Beat Game", state: "completed", implementationType: "generated-game", artifactBinding: { localArtifactPath: "/x.html" } },
    { nodeId: "hw:b7:step-20", title: "Other", state: "ready", implementationType: "word-radar" }],
    observations: [obs("activity:hw:b7:step-2:recall", true), obs("activity:hw:b7:step-2:recall", false), obs("activity:play-9:hw:b7:step-2", true), obs("activity:hw:b7:step-20:recall", true)] } as never;
  expect(playedGamesOf(cycle, { rootDir: fs.mkdtempSync(path.join(os.tmpdir(), "sunny-counts-root-")) })).toEqual([{ nodeId: "hw:b7:step-2", title: "Lantern Beat Game", answers: 3, right: 2, minutesToFirstAnswer: null }]);
});

it("counts each game's right answers from the saved score when the game log has none (math)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-counts-")); roots.push(dir);
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({ startedAt: "2026-11-10T12:00:00Z" }));
  fs.writeFileSync(path.join(dir, "game-traces.ndjson"), [
    { ts: "2026-11-10T12:01:00Z", nodeId: "scout", activityTitle: "Sweater Table Scout", type: "game_state_update", phase: "opening" },
    { ts: "2026-11-10T12:02:00Z", nodeId: "scout", type: "attempt_event", target: "p10" },
    { ts: "2026-11-10T12:03:00Z", nodeId: "scout", type: "attempt_event", target: "p11" },
    { ts: "2026-11-10T12:04:00Z", nodeId: "scout", type: "game_complete" },
  ].map(row => JSON.stringify(row)).join("\n"));
  const cycle = { nodes: [{ nodeId: "scout" }], observations: [obs("activity:play-1:scout", true), obs("activity:play-1:scout", false), obs("activity:play-0:scout", true, "2026-11-09T12:00:00Z")] } as never;
  expect(sessionGames(dir)[0]).toMatchObject({ answers: 2, right: 0 });
  expect(sessionGames(dir, cycle)[0]).toMatchObject({ answers: 2, right: 1 });
  expect(buildSessionTimeline(dir, cycle)).toContain("2 answers, 1 right");
});

// 2026-11-10, rating Ila's 16 sessions: G5 read "retro 14 right, saved 23" and "retro 6, saved 12". Why the human
// caught it: the retro and the saved score disagreed on the same session. Why logs did not: each side logged its own
// count with no definition beside it; the rating's "retro" was the game log's right flags (first answers), while
// "saved" counted every saved row, retries (saved since bab8b619) and helped answers included. Why the lab missed
// it: lab sessions had one try per item and no help. Invariant: the retro states one defined number, right on her
// first try on her own (the learning measure), and the rating reads that number back from the written retro.
it("states right first tries on her own in the retro, and the rating reads the same number back", async () => {
  const { retroCountsLine } = await import("./sessionHandoff");
  const { retroRightOnHerOwn } = await import("./sessionRatingPacket");
  const row = (correct: boolean, status: string, confounds: string[] = []) => ({ ...obs("activity:play-1:scout", correct), assistance: { status, scaffolds: [] }, confounds });
  const cycle = { nodes: [{ nodeId: "scout" }], observations: [row(true, "unassisted", ["first_try"]), row(false, "unassisted", ["first_try"]), row(true, "unassisted", ["retry", "attempt:2"]),
    row(true, "assisted"), row(true, "unknown"), { ...row(true, "unassisted"), provenance: "graded_work" }, { ...row(true, "unassisted"), observedAt: "2026-11-09T12:00:00Z" }] } as never;
  const line = retroCountsLine(cycle, "2026-11-10T12:00:00Z");
  expect(line).toBe("- Right on her first try on her own (the learning measure): 1 of 2 first tries on her own; 4 right counting retries and help.");
  expect(retroRightOnHerOwn(`# Handoff\n\n**Games, counted by code:**\n${line}\n`)).toBe(1);
  expect(retroRightOnHerOwn("# Handoff written before 11/10\n- Game: 3 answers, 2 right")).toBeUndefined();
});
