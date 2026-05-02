import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const adventureMapTsx = join(
  dirname(fileURLToPath(import.meta.url)),
  "../components/AdventureMap.tsx",
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

  it("keeps a visible finale when story image generation returns no URL", () => {
    const src = readFileSync(adventureMapTsx, "utf8");
    expect(src).toContain("failed={storyImageFinaleState.failed}");
    expect(src).toContain("failed: props.storyImageFailed === true");
    expect(src).toContain("Story complete. Image unavailable");
    expect(src).toMatch(
      /props\.storyImageLoading\s*\|\|\s*props\.storyImageUrl\s*\|\|\s*props\.storyImageFailed/,
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

  it("keeps preview-only troubleshooting controls out of live mode", () => {
    const mapSrc = readFileSync(adventureMapTsx, "utf8");
    const sessionSrc = readFileSync(useSessionTs, "utf8");
    expect(mapSrc).toContain('previewFinishEnabled={props.previewMode === "free"}');
    expect(mapSrc).toContain("function startPreviewStoryImageFinale");
    expect(mapSrc).toContain('if (props.previewMode !== "free") return;');
    expect(mapSrc).toContain("/api/grok-image?prompt=");
    expect(mapSrc).toContain("onComplete={handleKaraokeComplete}");
    expect(sessionSrc).toContain("function storyImageWatchdogMs()");
    expect(sessionSrc).toContain('preview === "free"');
    expect(sessionSrc).toContain("return 20000");
    expect(sessionSrc).toContain("return 75000");
  });
});
