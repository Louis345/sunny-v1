import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const letterRushPath = join(root, "public/games/letter-rush.html");

function extractInlineGameScript(html: string): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline = scripts.at(-1)?.[1];
  if (!inline) throw new Error("Letter Rush inline script not found");
  return inline;
}

function loadLetterRushHarness(options?: { config?: string; fetchedConfig?: unknown }) {
  const html = readFileSync(letterRushPath, "utf8");
  const body = html.match(/<body>([\s\S]*?)<script>/)?.[1];
  if (!body) throw new Error("Letter Rush body not found");

  document.body.innerHTML = body;

  const posts: unknown[] = [];
  const completes: unknown[] = [];
  let heartbeatExtras: (() => Record<string, unknown>) | null = null;

  Object.assign(window, {
    GAME_PARAMS: {
      config: options?.config ?? "sample-mastery",
      childId: "ila",
      nodeId: "n-letter-rush-sample",
      difficulty: "1",
      preview: "go-live",
    },
    GameBridge: {
      reportState: vi.fn(),
      fireEvent: vi.fn(),
      startHeartbeat: vi.fn((_getState: unknown, getExtras?: () => Record<string, unknown>) => {
        heartbeatExtras = getExtras ?? null;
        return 1;
      }),
    },
    fireAttemptEvent: vi.fn(),
    sendNodeComplete: vi.fn((payload: unknown) => completes.push(payload)),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    postMessage: vi.fn((payload: unknown) => posts.push(payload)),
  });
  if (options?.fetchedConfig) {
    vi.spyOn(window, "fetch").mockResolvedValue({
      ok: true,
      json: async () => options.fetchedConfig,
    } as Response);
  }

  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  window.eval(extractInlineGameScript(html));

  function useWrongLetterSpawn() {
    const values = [0.99, 0, 0.5];
    vi.spyOn(Math, "random").mockImplementation(() => values.shift() ?? 0.5);
  }

  function clickStart() {
    document.querySelector<HTMLButtonElement>("#startBtn")?.click();
  }

  async function missCurrentWordOnce() {
    useWrongLetterSpawn();
    await vi.advanceTimersByTimeAsync(2200);
    const falling = document.querySelector<HTMLButtonElement>(".falling");
    expect(falling, "expected a falling wrong-letter button").toBeTruthy();
    falling?.click();
  }

  return {
    posts,
    completes,
    clickStart,
    missCurrentWordOnce,
    getHeartbeatExtras: () => heartbeatExtras?.(),
  };
}

describe("Letter Rush Mastery Run behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("keeps a mastery word active after early misses and writes evaluator evidence only after lives are exhausted", async () => {
    const harness = loadLetterRushHarness();

    harness.clickStart();

    await harness.missCurrentWordOnce();
    expect(document.querySelector("#masteryLives")?.getAttribute("aria-label")).toBe("2 of 3 lives left");
    expect(harness.posts.filter((event) => (event as { type?: string }).type === "activity_target_result")).toHaveLength(0);
    expect(harness.completes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(700);
    expect(document.querySelector("#definition")?.textContent).toContain("A person who grows food");

    await harness.missCurrentWordOnce();
    expect(document.querySelector("#masteryLives")?.getAttribute("aria-label")).toBe("1 of 3 lives left");
    expect(harness.posts.filter((event) => (event as { type?: string }).type === "activity_target_result")).toHaveLength(0);
    expect(harness.completes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(700);
    await harness.missCurrentWordOnce();
    await vi.advanceTimersByTimeAsync(700);

    const targetResults = harness.posts.filter((event) => (event as { type?: string }).type === "activity_target_result");
    expect(targetResults).toHaveLength(1);
    expect(targetResults[0]).toMatchObject({
      activityId: "letter-rush",
      target: "farmer",
      correct: false,
      mode: "mastery-run",
      masteryEligible: true,
      scaffoldLevel: 0,
    });

    const completeEvents = harness.posts.filter((event) => (event as { type?: string }).type === "activity_complete");
    expect(completeEvents).toHaveLength(1);
    expect(completeEvents[0]).toMatchObject({
      activityId: "letter-rush",
      accuracy: 0,
      mode: "mastery-run",
      masteryEligible: true,
    });
    expect(harness.completes).toHaveLength(1);
  });

  it("does not reveal the spelling word in typed evaluator prompts", async () => {
    const harness = loadLetterRushHarness({
      config: "/letter-rush-hidden-recall.json",
      fetchedConfig: {
        schemaVersion: 1,
        activityId: "letter-rush",
        mode: "type-and-spell",
        topic: "Week 5 spelling",
        domain: "spelling",
        learningGoal: "Check spelling recall without visible answers.",
        gradeBand: "early_elementary",
        scaffolds: {
          showWord: false,
          letterBank: false,
          allowRetryBeforeScore: false,
          companionHints: false,
        },
        words: [
          {
            id: "lucky",
            text: "lucky",
            definition: "Spell lucky.",
            sentence: "Listen for lucky, then type it.",
          },
        ],
        evidencePolicy: {
          writesPracticeEvidence: true,
          writesMasteryEvidence: true,
          requiresPerTargetResult: true,
          allowedEvidence: ["practice", "mastery"],
        },
      },
    });

    await vi.runAllTimersAsync();
    harness.clickStart();

    expect(document.querySelector("#definition")?.textContent?.toLowerCase()).not.toContain("lucky");
    expect(document.querySelector("#definition")?.textContent).toContain("Spell the word you hear");
  });

  it("does not leak hidden evaluator targets to companion game state", async () => {
    const harness = loadLetterRushHarness();

    await vi.runAllTimersAsync();
    harness.clickStart();

    expect(harness.getHeartbeatExtras?.()).toMatchObject({
      activityId: "letter-rush",
      mode: "mastery-run",
      currentWord: "",
    });
  });

  it("keeps hitbox and streak SFX behavior behind shared helpers for every mode", () => {
    const html = readFileSync(letterRushPath, "utf8");

    expect(html).toContain("function tapTargetSettings");
    expect(html).toContain("function applyTapTargetClass");
    expect(html).toContain("function addCorrectStreak");
    expect(html).toContain("triggerComboBreakerMilestone");
    expect(html).toContain("state.streak % milestoneEvery === 0");
    expect(html).toContain("comboMilestones");
  });

  it("routes repeatable SFX events through the config event map", () => {
    const html = readFileSync(letterRushPath, "utf8");

    expect(html).toContain("function sfxEventSettings");
    expect(html).toContain("function playConfiguredSfxEvent");
    expect(html).toContain("eventMap");
    expect(html).toContain('playConfiguredSfxEvent("prompt")');
    expect(html).toContain('playConfiguredSfxEvent("start")');
    expect(html).toContain('playConfiguredSfxEvent("correct")');
    expect(html).toContain('playConfiguredSfxEvent("wordClear")');
    expect(html).not.toContain('playSfx("prompt-chime")');
    expect(html).not.toContain('playSfx("start")');
    expect(html).not.toContain('playSfx("word-clear")');
  });

  it("applies the shared hitbox class to spawned falling targets", async () => {
    const harness = loadLetterRushHarness();

    harness.clickStart();
    await vi.advanceTimersByTimeAsync(2200);

    const falling = document.querySelector<HTMLButtonElement>(".falling");
    expect(falling?.dataset.hitbox).toBe("tap-target-default");
    expect(falling?.classList.contains("tap-target-default")).toBe(true);
  });
});
