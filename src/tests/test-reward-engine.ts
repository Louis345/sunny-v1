import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sessionEventBus } from "../server/session-event-bus";
import { RewardEngine } from "../server/reward-engine";
import { handleDiagTriggerReward } from "../server/routes";
import * as learningEngine from "../engine/learningEngine";
import * as learningProfileIO from "../utils/learningProfileIO";
import * as progression from "../engine/progression";

describe("RewardEngine", () => {
  it("tracks streak on correct_answer", () => {
    const sent: string[] = [];
    const engine = new RewardEngine();
    engine.attach((type) => sent.push(type), "Ila", "ila", "sid");
    sessionEventBus.fire({
      type: "correct_answer",
      sessionId: "sid",
      childId: "ila",
      timestamp: Date.now(),
    });
    sessionEventBus.fire({
      type: "correct_answer",
      sessionId: "sid",
      childId: "ila",
      timestamp: Date.now(),
    });
    expect(engine.getCorrectStreak()).toBe(2);
    sessionEventBus.fire({
      type: "wrong_answer",
      sessionId: "sid",
      childId: "ila",
      timestamp: Date.now(),
    });
    expect(engine.getCorrectStreak()).toBe(0);
    expect(sent.some((t) => t === "reward")).toBe(true);
    engine.detach();
  });
});

describe("handleDiagTriggerReward", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 403 when SUNNY_MODE is not diag", () => {
    const r = handleDiagTriggerReward(
      { type: "correct_attempt", childId: "ila" },
      { ...process.env, SUNNY_MODE: "real" },
    );
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ ok: false });
  });

  it("returns 400 for unknown type in diag mode", () => {
    const r = handleDiagTriggerReward(
      { type: "not_a_real_trigger", childId: "ila" },
      { ...process.env, SUNNY_MODE: "diag" },
    );
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ ok: false, error: "unknown_type" });
  });

  it("returns 200 for correct_attempt in diag mode", () => {
    vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue({
      childId: "ila",
    } as never);
    vi.spyOn(learningEngine, "recordAttempt").mockReturnValue({
      quality: 4,
      updatedTrack: {} as never,
      difficultySignal: {} as never,
      rewards: [],
    });
    vi.spyOn(progression, "computeProgression").mockReturnValue({
      level: 2,
      currentXP: 10,
      xpToNextLevel: 90,
      totalXP: 110,
      wordsMastered: 0,
      totalWords: 1,
      streakRecord: 0,
      recentTrend: "stable",
    });

    const r = handleDiagTriggerReward(
      { type: "correct_attempt", childId: "ila" },
      { ...process.env, SUNNY_MODE: "diag" },
    );

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      ok: true,
      event: {
        type: "progression",
        payload: expect.objectContaining({ childId: "ila", totalXP: 110 }),
      },
    });
    expect(learningEngine.recordAttempt).toHaveBeenCalled();
  });
});

describe("progression message contract", () => {
  it("scopes both live progression messages to the canonical child", () => {
    const root = path.resolve(__dirname, "..");
    const bootstrap = fs.readFileSync(path.join(root, "server", "session-bootstrap.ts"), "utf8");
    const manager = fs.readFileSync(path.join(root, "server", "session-manager.ts"), "utf8");

    expect(bootstrap).toMatch(/session\.send\("progression",\s*\{\s*childId:\s*progressionChildId,/s);
    expect(manager).toMatch(/this\.send\("progression_end",\s*\{\s*childId,/s);
    expect(manager).not.toContain("catch {\n          // Silent\n        }");
  });
});
