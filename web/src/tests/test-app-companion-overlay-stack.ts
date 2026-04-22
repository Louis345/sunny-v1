import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appTsx = join(dirname(fileURLToPath(import.meta.url)), "../App.tsx");

/**
 * CompanionLayer uses mode="portrait" / mode="full" instead of a visibility:hidden gate.
 * CompanionBridge is deleted — no iframe injection.
 *
 * Each condition in companionPortraitMode must appear in the source so that the
 * companion shifts to the portrait circle for every game/canvas scenario.
 */
describe("App companion overlay stack", () => {
  let src: string;
  beforeAll(() => {
    src = readFileSync(appTsx, "utf8");
  });

  it("uses mode prop on CompanionLayer — no visibility:hidden gate, no CompanionBridge", () => {
    expect(src).toContain('mode={');
    expect(src).toContain('"portrait"');
    expect(src).not.toContain('visibility: mapGameOverlay.active ? "hidden"');
    expect(src).not.toContain("CompanionBridge");
  });

  it("mapGameOverlay.active triggers portrait mode (iframe game overlay)", () => {
    // CompanionLayer must switch to portrait when a game iframe is open.
    expect(src).toMatch(/companionPortraitMode[\s\S]{0,200}mapGameOverlay\.active/);
  });

  it("karaokeReadingActive triggers portrait mode (story/karaoke canvas)", () => {
    expect(src).toMatch(/companionPortraitMode[\s\S]{0,200}karaokeReadingActive/);
  });

  it("canvas.mode === 'pronunciation' triggers portrait mode", () => {
    expect(src).toMatch(/companionPortraitMode[\s\S]{0,200}canvas\.mode.*pronunciation/);
  });

  it("mapSession launchedNode karaoke triggers portrait mode", () => {
    expect(src).toMatch(/companionPortraitMode[\s\S]{0,350}launchedNode.*karaoke/);
  });

  it("mapSession launchedNode pronunciation triggers portrait mode", () => {
    expect(src).toMatch(/companionPortraitMode[\s\S]{0,350}launchedNode.*pronunciation/);
  });
});
