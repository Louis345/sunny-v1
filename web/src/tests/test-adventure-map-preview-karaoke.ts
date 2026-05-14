import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const adventureMapTsx = join(
  dirname(fileURLToPath(import.meta.url)),
  "../components/AdventureMap.tsx",
);
const storyImageFinaleTsx = join(
  dirname(fileURLToPath(import.meta.url)),
  "../components/StoryImageFinale.tsx",
);
const useSessionTs = join(
  dirname(fileURLToPath(import.meta.url)),
  "../hooks/useSession.ts",
);

describe("AdventureMap free preview karaoke", () => {
  it("does not replace karaoke sendMessage with a no-op in free preview", () => {
    const src = readFileSync(adventureMapTsx, "utf8");
    expect(src).not.toMatch(
      /previewMode\s*===\s*"free"[\s\S]{0,120}\(_type:\s*string[\s\S]{0,120}free preview:\s*no voice WebSocket/,
    );
  });

  it("map karaoke renders storyText punctuation and story image finale state", () => {
    const src = readFileSync(adventureMapTsx, "utf8");
    expect(src).toContain("storyText={launchedNode.storyText}");
    expect(src).toContain("storyImageLoading");
    expect(src).toContain("storyImageUrl");
    expect(src).toContain("storyImageFailed");
    expect(src).toContain("StoryImageFinale");
  });

  it("uses child display name, not TTS pronunciation, for story finale labels", () => {
    const src = readFileSync(adventureMapTsx, "utf8");
    expect(src).toContain("function displayNameFromChildId");
    expect(src).toContain("displayNameFromChildId(childId)");
    expect(src).not.toMatch(/childName\s*=[\s\S]{0,120}p\?\.ttsName/);
  });

  it("keeps a visible finale when story image generation returns no URL", () => {
    const mapSrc = readFileSync(adventureMapTsx, "utf8");
    const finaleSrc = readFileSync(storyImageFinaleTsx, "utf8");
    expect(mapSrc).toContain("failed={storyImageFinaleState.failed}");
    expect(mapSrc).toMatch(
      /props\.storyImageLoading\s*\|\|\s*props\.storyImageUrl\s*\|\|\s*props\.storyImageFailed/,
    );
    expect(finaleSrc).toContain("Story complete. Image unavailable");
    expect(finaleSrc).toContain("data-testid=\"story-movie-purchase-sheet\"");
  });

  it("keeps Back routing inside the adventure map instead of the child picker", () => {
    const appSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../App.tsx"),
      "utf8",
    );
    const adventureStart = appSrc.indexOf("if (adventureMapEnabled && adventureChildId)");
    const adventureEnd = appSrc.indexOf('} else if (state.phase === "picker")');
    const adventureBranch = appSrc.slice(adventureStart, adventureEnd);
    const mapSrc = readFileSync(adventureMapTsx, "utf8");

    expect(adventureBranch).not.toContain("resetToPicker()");
    expect(adventureBranch).not.toContain("setSelectedChildName(null)");
    expect(mapSrc).toContain('if (t === "map_back")');
    expect(mapSrc).toContain("clearLaunchedNode()");
    expect(mapSrc).toContain("setLaunchedUrl(null)");
  });

  it("renders pronunciation map nodes in live sessions, not only free preview", () => {
    const mapSrc = readFileSync(adventureMapTsx, "utf8");
    const pronunciationGateIndex = mapSrc.indexOf(
      'launchedNode != null &&\n      (launchedNode.type as string) === "pronunciation"',
    );
    expect(pronunciationGateIndex).toBeGreaterThan(0);

    const gatePrefix = mapSrc.slice(
      Math.max(0, pronunciationGateIndex - 120),
      pronunciationGateIndex,
    );
    expect(gatePrefix).not.toContain('props.previewMode === "free"');
  });

  it("pads retargeted pronunciation nodes from care-plan target words", () => {
    const mapSrc = readFileSync(adventureMapTsx, "utf8");
    const pronunciationWordsStart = mapSrc.indexOf("const pronunciationSeedWordsForNode =");
    const pronunciationWordsEnd = mapSrc.indexOf("if (resolved && !mapState)");
    const block = mapSrc.slice(pronunciationWordsStart, pronunciationWordsEnd);

    expect(block).toContain("nodeTargetWords(launchedNode)");
    expect(block).toContain("pronunciationReplayWordsForNode");
    expect(block.indexOf("adaptiveStoryPracticeWords")).toBeLessThan(
      block.indexOf("nodeTargetWords(launchedNode)"),
    );
  });

  it("does not treat microphone denial as fatal in preview mode", () => {
    const src = readFileSync(useSessionTs, "utf8");
    expect(src).toContain("function micDeniedCanContinue()");
    expect(src).toContain('preview === "free" || preview === "go-live"');
    expect(src).toContain("Microphone unavailable in preview; continuing without recording.");
  });

  it("shows image finale loading immediately when reading completes", () => {
    const src = readFileSync(useSessionTs, "utf8");
    expect(src).toContain('payload.event === "complete"');
    expect(src).toContain("storyImageLoading: true");
    expect(src).toContain("storyImageWatchdogRef");
  });

  it("keeps troubleshooting controls preview-only while allowing story image fallback in live mode", () => {
    const mapSrc = readFileSync(adventureMapTsx, "utf8");
    const sessionSrc = readFileSync(useSessionTs, "utf8");
    expect(mapSrc).toContain('previewFinishEnabled={props.previewMode === "free"}');
    expect(mapSrc).toContain("function startStoryImageFinale");
    expect(mapSrc).not.toContain('if (props.previewMode !== "free") return;');
    expect(mapSrc).toContain("/api/grok-image?prompt=");
    expect(mapSrc).toContain("onComplete={handleKaraokeComplete}");
    expect(mapSrc).toContain("void sendNodeResult(");
    expect(sessionSrc).toContain("function storyImageWatchdogMs()");
    expect(sessionSrc).toContain('preview === "free"');
    expect(sessionSrc).toContain("return 20000");
    expect(sessionSrc).toContain("return 75000");
  });
});
