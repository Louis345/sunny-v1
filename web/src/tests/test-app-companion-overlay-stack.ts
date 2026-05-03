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

  it("local diag flow games register as active voice game node types", () => {
    expect(src).toContain("activeVoiceGameNodeType");
    expect(src).toMatch(/diagFlowGameOpen === "reading"[\s\S]{0,80}"karaoke"/);
    expect(src).toMatch(/registerMapNodeType\(activeVoiceGameNodeType\)/);
  });

  it("map karaoke and pronunciation use liveFlowStt instead of final-only gameTranscript", () => {
    expect(src).toContain("const liveFlowStt = state.interimTranscript || state.gameTranscript");
    expect(src).toMatch(/karaokeReadingForMapNode=\{\{[\s\S]{0,220}interimTranscript: liveFlowStt/);
    expect(src).toMatch(/<KaraokeReadingCanvas[\s\S]{0,220}interimTranscript=\{liveFlowStt\}/);
    expect(src).toMatch(/<PronunciationGameCanvas[\s\S]{0,220}interimTranscript=\{liveFlowStt\}/);
  });

  it("story karaoke keeps the companion visible as a muted portrait", () => {
    expect(src).toMatch(/voiceGameCompanionMicMuted[\s\S]{0,260}karaokeReadingActive/);
    expect(src).toMatch(/voiceGameCompanionMicMuted[\s\S]{0,260}mapSession\.launchedNode\?\.type === "karaoke"/);
    expect(src).not.toContain("karaokeShellCompanionOff");
    expect(src).toContain("toggledOff={false}");
    expect(src).toContain("micMuted={micMuted || voiceGameCompanionMicMuted}");
  });

  it("preselected adventure map child starts companion voice once", () => {
    expect(src).toContain("autoStartedAdventureVoiceRef");
    expect(src).toMatch(/startSession\(childNameFromId\(adventureChildId\)/);
  });
});
