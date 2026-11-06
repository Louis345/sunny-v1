import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderHarnessReport, scoreRun, wallsFromConversations, wallsFromSavedConversations, type HarnessRun } from "../harness/plannerHarness";

// 2026-10-25 owner request: measure the Planner against what matters to Sunny (she wants to come back,
// then learning), so prompts and models can be compared before the girls see a change. These tests pin the
// $0 rules score and the walls report; outcomes come only from real sessions and are never invented here.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const stop = (over: Record<string, unknown> = {}) => ({ nodeId: "s1", title: "Glaze Mugs", theme: "The kiln opens at noon.", picture: "A potter's wheel", type: "word-radar", reused: false, notReady: undefined, ...over });
const run = (over: Partial<HarnessRun> = {}): HarnessRun => ({
  caseId: "pottery", planner: "recorded", aboutHer: "Loves pottery wheels",
  boards: [
    { kind: "teaching", published: true, choice: true, background: "world", stops: [stop(), stop({ nodeId: "s2", title: "Race", theme: "Race the clock.", type: "letter-rush" })] },
    { kind: "successor", published: true, choice: false, background: "/generated/direct-math/board-scene-1.jpeg", stops: [stop({ nodeId: "n1", reused: true }), stop({ nodeId: "n2", type: "spell-check" })] },
  ],
  prompts: { intake: "…Loves pottery wheels…", teaching: "…Loves pottery wheels…", nextBoard: "nothing about her", artist: "…Loves pottery wheels…" },
  conversations: [], ...over,
});

describe("the Planner harness rules score ($0)", () => {
  it("scores what code can check: playable, her voice, stories, pictures, variety, choice, background", () => {
    const score = scoreRun(run());
    expect(score.playable).toEqual({ value: 1, detail: "4 of 4 stops playable" });
    expect(score.herVoice).toEqual({ value: 0.75, detail: "her interests reached 3 of 4 Planner and artist prompts (missing: nextBoard)" });
    expect(score.stories.value).toBe(1);
    expect(score.pictures.value).toBe(1);
    expect(score.variety).toEqual({ value: 3, detail: "3 different games across both boards; 1 of 2 next-board stops are new, not replays" });
    expect(score.choice.value).toBe(0.5);
    expect(score.background.value).toBe(0.5);
    expect(score.outcomes).toEqual({ value: null, detail: "measured only in real sessions: does she come back, do her words stick" });
  });

  it("finds her interests in a prompt whether they arrive as text or JSON-encoded", () => {
    const aboutHer = "## Who She Is\nLoves pottery wheels and glazing mugs";
    const prompts = { intake: `chart ${JSON.stringify({ childVoice: { aboutHer } })}`, teaching: `plain ${aboutHer}` };
    expect(scoreRun(run({ aboutHer, prompts })).herVoice.value).toBe(1);
  });

  it("does not count a title or a default as a story, and counts a not-ready stop as unplayable", () => {
    const score = scoreRun(run({ boards: [{ kind: "teaching", published: true, choice: false, background: "world", stops: [stop({ theme: "Glaze Mugs" }), stop({ nodeId: "x", theme: "learning adventure", notReady: "activity_build_failed" })] }] }));
    expect(score.stories.value).toBe(0);
    expect(score.playable).toEqual({ value: 0.5, detail: "1 of 2 stops playable" });
  });
});

describe("the walls report", () => {
  it("counts the walls the Planner hit, once each, with ids taken out so the same wall groups together", () => {
    const conversation = { phase: "nextBoard", requests: [
      { messages: [{ role: "user", content: "hi" }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "act-8c60ae-3 cannot be re-run for just those words" }] }] },
      // The next turn repeats the history: the same tool_use_id is not counted twice.
      { messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "act-8c60ae-3 cannot be re-run for just those words" }, { type: "tool_result", tool_use_id: "t2", is_error: true, content: "act-11aa22-1 cannot be re-run for just those words" }, { type: "tool_result", tool_use_id: "t3", content: "{\"ok\":true}" }] }] },
    ] };
    expect(wallsFromConversations([conversation])).toEqual([{ wall: "<id> cannot be re-run for just those words", phase: "nextBoard", count: 2 }]);
  });

  it("reads saved Planner conversations from a context folder without changing them", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-walls-")); roots.push(root);
    const dir = path.join(root, "ila/homework/cycles/.planner/hw-1/batch/provider-diagnostics"); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "abc.attempt-1.request.json");
    const saved = JSON.stringify({ context: { messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "z", is_error: true, content: "no built-in word-radar:visible_read" }] }] } });
    fs.writeFileSync(file, saved);
    expect(wallsFromSavedConversations(root)).toEqual([{ wall: "no built-in word-radar:visible_read", phase: "hw-1", count: 1 }]);
    expect(fs.readFileSync(file, "utf8")).toBe(saved);
  });
});

describe("the harness page", () => {
  it("shows each run's scores, its boards and the walls, and says plainly what it cannot measure", () => {
    const html = renderHarnessReport({ title: "Planner harness", runs: [run()], walls: [{ wall: "<id> cannot be re-run", phase: "nextBoard", count: 2 }] });
    expect(html).toContain("<title>Planner harness</title>");
    expect(html).toContain("pottery");
    expect(html).toContain("4 of 4 stops playable");
    expect(html).toContain("The kiln opens at noon.");
    expect(html).toContain("&lt;id&gt; cannot be re-run");
    expect(html).toContain("measured only in real sessions");
  });
});
