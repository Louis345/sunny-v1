import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("map button audit", () => {
  it("adventure mode does not render an app-level Back button to the child picker", () => {
    const src = read("src/App.tsx");
    const adventureBranch = src.slice(
      src.indexOf("main = ("),
      src.indexOf("<AdventureMap"),
    );
    expect(adventureBranch).not.toContain("resetToPicker()");
    expect(adventureBranch).not.toContain("setSelectedChildName(null)");
    expect(adventureBranch).not.toContain("{mapSession.launchedNode ? \"Back to map\" : \"Back\"}");
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

  it("AdventureMap listens for iframe map_back messages", () => {
    const src = read("src/components/AdventureMap.tsx");
    expect(src).toContain('if (t === "map_back")');
    expect(src).toContain("setLaunchedUrl(null)");
  });

  it("AdventureMap forwards direct iframe narration requests for preview-safe Say It audio", () => {
    const src = read("src/components/AdventureMap.tsx");
    expect(src).toContain('if (t === "narration_request")');
    expect(src).toContain('trigger: "narration_request"');
    expect(src).toContain("forwardMapIframeCompanionEvent");
  });

  it("pronunciation completion includes an explicit Back to map exit", () => {
    const mapSrc = read("src/components/AdventureMap.tsx");
    const pronunciationSrc = read("src/components/PronunciationGameCanvas.tsx");
    expect(pronunciationSrc).toContain("onExit?: () => void");
    expect(pronunciationSrc).toContain("Back to map");
    expect(mapSrc).toContain("onExit={() => clearLaunchedNode()}");
  });

  it("map-owned pronunciation completion records a node result without closing the overlay", () => {
    const src = read("src/components/AdventureMap.tsx");
    const start = src.indexOf("<PronunciationGameCanvas");
    const block = src.slice(start, start + 2600);
    expect(block).toContain("sendNodeResult");
    expect(block).toContain('activityId: "pronunciation"');
    expect(block).toContain("wordsAttempted: result.wordsAttempted");
    expect(src).toContain("{ keepLaunchedNode: true }");
    expect(src).toContain("pronunciationNodeCompletionRecordedRef");
    expect(block).not.toContain(
      "}).then(() => {\n                clearLaunchedNode();\n              });",
    );
  });

  it("adapts pronunciation words from story words the child skipped or flagged", () => {
    const src = read("src/components/AdventureMap.tsx");
    expect(src).toContain("adaptiveStoryPracticeWords");
    expect(src).toContain("practiceWordsFromReadingComplete");
    expect(src).toContain("pronunciationWordsForNode");
  });

  it("adventure voice prompt reminds the companion about earned digital food", () => {
    const src = read("../src/agents/prompts.ts");
    expect(src).toContain("digital food");
    expect(src).toContain("Bookbag");
  });
});
