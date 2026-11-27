import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveChildContextDir } from "../utils/contextRoot";
import { classroomLessons, libraryGameForStep, libraryGameHtml, libraryGameOffer } from "./libraryGames";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";

// Owner 2026-11-27: "the whole point of this was to test the classroom." Ila had been quizzed on rounding all week
// and never taught it; the Classroom lesson built for her (Mitsu on the Snowy Road) lived only in the lab, so no
// board could offer it. Owner approved (Math Prompt Chain Boundary) putting it on the Planner's menu through the
// one existing reveal path, the library games: a "teach" library game on an ordinary step, with the lesson content
// kept in her own context folder (child data never in git), and her answers recorded by the same bridge as practice.

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

/** A lab root with Sunny's real Classroom engine page and one lesson saved for the child. */
function labWithLesson(childId = "lab-ila"): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "classroom-teach-"));
  roots.push(rootDir);
  const games = path.join(rootDir, "web", "public", "games", "cookoff");
  fs.mkdirSync(path.join(games, "elli-classroom"), { recursive: true });
  fs.copyFileSync(path.join(process.cwd(), "web", "public", "games", "cookoff", "elli-classroom", "index.html"), path.join(games, "elli-classroom", "index.html"));
  fs.copyFileSync(path.join(process.cwd(), "web", "public", "games", "cookoff", "_library.js"), path.join(games, "_library.js"));
  const lesson = path.join(resolveChildContextDir(childId, { rootDir }), "classroom", "mitsu-snowy-road");
  fs.mkdirSync(path.join(lesson, "voice"), { recursive: true });
  fs.mkdirSync(path.join(lesson, "clips"), { recursive: true });
  fs.writeFileSync(path.join(lesson, "voice", "a1.mp3"), "mp3");
  fs.writeFileSync(path.join(lesson, "clips", "road.mp4"), "mp4");
  fs.writeFileSync(path.join(lesson, "meta.json"), JSON.stringify({ title: "Mitsu on the Snowy Road", subject: "math", concept: "rounding to the nearest ten and hundred", madeOn: "2026-11-26", madeBy: "lab (Fable 5.1), from her record" }));
  fs.writeFileSync(path.join(lesson, "lesson.json"), JSON.stringify({
    steps: [["say", "Hi Ila!", "warm"], ["playClip", "road"], ["askNumber", "Which village is behind Mitsu?", 60]],
    voice: { "Hi Ila!": "voice/a1.mp3" }, clips: { road: "clips/road.mp4" }, pieces: {} }));
  return rootDir;
}

const items = [
  { itemId: "hw-r-1", prompt: "Round 41 to the nearest ten.", answer: "40" },
  { itemId: "hw-r-2", prompt: "Round 382 to the nearest hundred.", answer: "400" },
];

describe("Elli's Classroom on the Planner's menu", () => {
  it("is offered for math only to a child who has a lesson saved, even when this stage offers no Quest or Boss", () => {
    const rootDir = labWithLesson();
    expect(classroomLessons("lab-ila", "math", { rootDir }).map(row => row.title)).toEqual(["Mitsu on the Snowy Road"]);
    const offer = libraryGameOffer({ subject: "math", encounterOffered: false, childId: "lab-ila", rootDir });
    expect(offer.games.map(game => game.id)).toContain("elli-classroom");
    expect(offer.games.find(game => game.id === "elli-classroom")?.role).toBe("teach");
    expect(offer.line).toContain("Mitsu on the Snowy Road");
    expect(offer.line).toContain("library_game");
    // A child with no lesson is never offered an empty classroom.
    const other = libraryGameOffer({ subject: "math", encounterOffered: true, childId: "lab-reina", rootDir });
    expect(other.games.map(game => game.id)).not.toContain("elli-classroom");
  });

  it("serves the lesson inside the page with its voice and clips at her homework's own file route, and reports what to copy", () => {
    const rootDir = labWithLesson();
    const out = libraryGameHtml({ id: "elli-classroom", childId: "lab-ila", homeworkId: "hw-math-x", nodeId: "n1", items, rootDir });
    expect(out.matchedItemIds).toEqual(["hw-r-1", "hw-r-2"]);
    expect(out.html).toContain('id="classroom-lesson"');
    expect(out.html).toContain("/api/homework/game/lab-ila/hw-math-x/classroom-mitsu-snowy-road-a1.mp3");
    expect(out.html).toContain("/api/homework/game/lab-ila/hw-math-x/classroom-mitsu-snowy-road-road.mp4");
    expect(out.html).not.toContain('"voice/a1.mp3"');
    expect(out.assets.map(asset => asset.name).sort()).toEqual(["classroom-mitsu-snowy-road-a1.mp3", "classroom-mitsu-snowy-road-road.mp4"]);
    expect(out.html).toContain("Hi Ila!");
  });

  it("keeps a teach game only on an ordinary step, and a Quest or Boss game only on its encounter", () => {
    expect(libraryGameForStep("elli-classroom", "baseline")).toBe("elli-classroom");
    expect(libraryGameForStep("elli-classroom", "quest")).toBeUndefined();
    expect(libraryGameForStep("opus-reina", "quest")).toBe("opus-reina");
    expect(libraryGameForStep("opus-reina", "baseline")).toBeUndefined();
    expect(libraryGameForStep(undefined, "baseline")).toBeUndefined();
  });
});

describe("the Planner places the Classroom with its step tools", () => {
  const problem = (id: string, prompt: string, expected: number) => ({ id, prompt, response: { mode: "numeric", expected, acceptedForms: [String(expected)] },
    lineage: { exposure: "unseen", measurementRole: "practice" } }) as never;
  const facts = (allowedActions: string[]): SuccessorFacts => ({
    builtIns: [], activities: [{ id: "generated-game", checkpoint: false, setup: { type: "generated-game" } }], rerunnable: () => true,
    evaluationIds: [], allowedActions, idPrefix: "next",
    problems: [problem("hw-r-1", "Round 41 to the nearest ten.", 40), problem("hw-r-2", "Round 382 to the nearest hundred.", 400)],
    libraryGames: { games: [{ id: "elli-classroom", title: "Elli's Classroom", role: "teach" }, { id: "opus-reina", title: "Squad Gym", role: "quest" }] },
  });
  const addStep = (allowedActions: string[]) => spellingSuccessorToolkit(facts(allowedActions)).tools.find(tool => tool.name === "add_step")!;
  const step = (extra: Record<string, unknown>) => ({ built_in: "generated-game", problems: ["hw-r-1"], check_first: false, title: "Mitsu's Road", purpose: "Teach what rounding means.",
    story: "Mitsu walks to the closer village.", picture: "A fox on a snowy road", ...extra });

  it("puts the Classroom on a practice step even on a board that offers no Quest or Boss", () => {
    const tool = addStep(["generate_support"]);
    const state = { next: 0, steps: [] } as never;
    const parsed = tool.schema.parse(step({ library_game: "elli-classroom" }));
    const out = tool.run(state, parsed);
    expect(out.ok).toBe(true);
    expect((state as { steps: Array<{ libraryGame?: string }> }).steps[0].libraryGame).toBe("elli-classroom");
  });

  it("refuses the Classroom on a step that checks her on her own: a lesson teaches, it never measures", () => {
    const tool = addStep(["generate_support"]);
    const out = tool.run({ next: 0, steps: [] } as never, tool.schema.parse(step({ library_game: "elli-classroom", check_first: true })));
    expect(out.ok).toBe(false);
    expect(out.ok ? "" : out.error).toMatch(/teach/i);
  });
});
