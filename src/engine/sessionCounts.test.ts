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
