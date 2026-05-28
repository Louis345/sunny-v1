import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("map button audit", () => {
  it("new homework board mode does not render the legacy AdventureMap", () => {
    const src = read("src/App.tsx");
    expect(src).toContain("AdventureBoardExperience");
    expect(src).not.toContain("<AdventureMap");
    expect(src).not.toContain("./components/AdventureMap");
  });

  it("iframe game Back to map buttons post to the parent instead of using browser history", () => {
    for (const rel of [
      "public/games/attention-bubble-pop.html",
      "public/games/attention-target-blaster.html",
      "public/games/attention-hero-shield.html",
      "public/games/attention-fish-flanker.html",
    ]) {
      const src = read(rel);
      expect(src).not.toContain("history.back()");
      expect(src).toContain("map_back");
    }
  });

  it("pronunciation completion includes an explicit Back to map exit", () => {
    const pronunciationSrc = read("src/components/PronunciationGameCanvas.tsx");
    const appSrc = read("src/App.tsx");
    expect(pronunciationSrc).toContain("onExit?: () => void");
    expect(pronunciationSrc).toContain("Back to map");
    expect(appSrc).toContain("onExit={closePlannerBoardLaunch}");
  });

  it("new board pronunciation records post-activity engagement without closing before the child chooses", () => {
    const src = read("src/App.tsx");
    const start = src.indexOf('plannerBoardLaunch?.node.type === "pronunciation"');
    const block = src.slice(start, start + 2600);
    expect(block).toContain("onPostActivityAction");
    expect(block).toContain("recordPlannerBoardPostActivityAction");
    expect(block).toContain("wordsAttempted: result.wordsAttempted");
  });

  it("passes an extended pronunciation pool so harder replay can grow the streak run", () => {
    const src = read("src/App.tsx");
    expect(src).toContain("replayWords={plannerBoardLaunch.node.words ?? []}");
  });

  it("adventure voice prompt reminds the companion about earned digital food", () => {
    const src = read("../src/agents/prompts.ts");
    expect(src).toContain("digital food");
    expect(src).toContain("Bookbag");
  });
});
