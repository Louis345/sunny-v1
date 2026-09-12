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

  it("planner board launch triggers portrait mode (activity overlay)", () => {
    expect(src).toContain("state.companionPresence");
    expect(src).toContain('"collapsed"');
    expect(src).toContain('"portrait"');
    expect(src).toContain("setCompanionPresence");
  });

  it("keeps one host-owned companion across both Word Radar launch paths", () => {
    // Component-only tests omitted companion props. The full journey exposed
    // the second portrait only after summoning the host-owned companion.
    const wordRadarLaunches = [...src.matchAll(/<WordRadar\b[\s\S]*?\/>/g)].map(match => match[0]);
    expect(wordRadarLaunches).toHaveLength(2);
    for (const launch of wordRadarLaunches) expect(launch).not.toMatch(/\bcompanion\s*=/);
    expect(src.match(/<CompanionLayerWithCare\b/g)).toHaveLength(1);
    expect(src).toContain("onSummon={");
    expect(src).toContain("onDismiss={");
  });

  it("reserves a host-owned safe area while the companion is summoned over a generated activity", () => {
    expect(src).toContain('data-testid="generated-activity-safe-area"');
    expect(src).toContain('data-testid="generated-activity-frame"');
    expect(src).toMatch(/data-testid="generated-activity-safe-area"[\s\S]{0,220}inset:\s*0/);
    expect(src).toContain('state.companionPresence === "summoned" ? 220 : 0');
  });

  it("lets parent preview launch locked baseline nodes without opening Quest or Boss", () => {
    expect(src).toContain("parentPreviewActive");
    expect(src).toContain("inspectableBaselineNode");
    expect(src).toContain("allowLocked: inspectableBaselineNode");
    expect(src).toMatch(/boardNode\.kind !== "quest"[\s\S]{0,160}boardNode\.kind !== "boss"/);
  });

  it("keeps the shared balance in the companion bag instead of beneath the companion", () => {
    expect(src).not.toContain("<CompanionCurrencyHud");
    expect(src).toContain("companionCurrency={props.balance}");
  });

  it("shares the launched AI-authored activity context with Elli", () => {
    expect(src).toContain("buildPlannerBoardCompanionContext(node)");
    expect(src).toMatch(/type:\s*"game_state_update"[\s\S]{0,300}companionContext/);
  });

  it("routes generated-math semantic sound through the host without forwarding it as learning evidence", () => {
    expect(src).toContain('data.type === "sunny_sfx"');
    expect(src).toContain('data.type === "sunny_sound_toggle"');
    expect(src).toContain("playGeneratedMathSfx");
    expect(src).not.toMatch(/sendMessage\([\s\S]{0,120}sunny_sfx/);
  });

  it("plays a board-owned motif for node launch without creating learning evidence", () => {
    expect(src).toContain("playAdventureBoardSfx");
    expect(src).toContain('playAdventureBoardSfx("locked")');
    expect(src).toContain('playAdventureBoardSfx(boardNode.state === "completed" ? "replay" : "launch")');
    expect(src).not.toMatch(/sendMessage\([\s\S]{0,120}adventureBoardSfx/);
  });

  it("karaokeReadingActive triggers portrait mode (story/karaoke canvas)", () => {
    expect(src).toMatch(/companionPortraitMode[\s\S]{0,200}karaokeReadingActive/);
  });

  it("canvas.mode === 'pronunciation' triggers portrait mode", () => {
    expect(src).toMatch(/companionPortraitMode[\s\S]{0,200}canvas\.mode.*pronunciation/);
  });

  it("local diag flow games register as active voice game node types", () => {
    expect(src).toContain("activeVoiceGameNodeType");
    expect(src).toMatch(/diagFlowGameOpen === "reading"[\s\S]{0,80}"karaoke"/);
    expect(src).toMatch(/registerMapNodeType\(activeVoiceGameNodeType\)/);
  });

  it("new board karaoke/pronunciation paths use liveFlowStt instead of final-only gameTranscript", () => {
    expect(src).toContain("const liveFlowStt = state.interimTranscript || state.gameTranscript");
    expect(src).toMatch(/plannerBoardLaunch\?\.node\.type === "word-radar"[\s\S]{0,1200}interimTranscript=\{liveFlowStt\}/);
    expect(src).toMatch(/plannerBoardLaunch\?\.node\.type === "pronunciation"[\s\S]{0,1200}interimTranscript=\{liveFlowStt\}/);
  });

  it("story karaoke keeps the companion visible as a muted portrait", () => {
    expect(src).toMatch(/voiceGameCompanionMicMuted[\s\S]{0,260}karaokeReadingActive/);
    expect(src).not.toContain("karaokeShellCompanionOff");
    expect(src).toContain("toggledOff={homeworkSessionFinished}");
    expect(src).toContain("micMuted={micMuted || voiceGameCompanionMicMuted}");
  });

  it("preselected homework board child starts companion voice exactly once", () => {
    expect(src).toContain("autoStartedAdventureVoiceRef");
    expect(src).not.toMatch(
      /if \(plannerBoardRuntimeRequested\)\s*\{[\s\S]{0,220}return;/,
    );
    expect(src).toMatch(
      /autoStartedAdventureVoiceRef\.current = adventureChildId;[\s\S]{0,220}startSession\(childNameFromId\(adventureChildId\)/,
    );
    expect(src).toMatch(/startSession\(childNameFromId\(adventureChildId\)/);
  });
});
