/**
 * Contract: When a child earns a reward but doesn't play it (session timeout,
 * disconnect), the reward is persisted to disk. Next session, getSessionStatus
 * returns pendingRewardFromLastSession so Claude can offer it immediately.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  saveEarnedReward,
  loadEarnedReward,
  clearEarnedReward,
  REWARD_STATE_DIR,
  createWorksheetSession,
} from "../server/worksheet-tools";

const TEST_CHILD = "TestChild";
const rewardFile = path.join(
  REWARD_STATE_DIR,
  `${TEST_CHILD.toLowerCase()}_pending_reward.json`,
);

describe("cross-session reward persistence", () => {
  beforeEach(() => {
    if (fs.existsSync(rewardFile)) fs.unlinkSync(rewardFile);
  });

  afterEach(() => {
    if (fs.existsSync(rewardFile)) fs.unlinkSync(rewardFile);
  });

  it("saves earned reward to disk", () => {
    saveEarnedReward(TEST_CHILD, "space-invaders");
    expect(fs.existsSync(rewardFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(rewardFile, "utf-8"));
    expect(data.game).toBe("space-invaders");
    expect(data.childName).toBe(TEST_CHILD);
    expect(data.earned).toBe(true);
    expect(data.timestamp).toBeDefined();
  });

  it("loads earned reward from disk", () => {
    saveEarnedReward(TEST_CHILD, "space-invaders");
    const reward = loadEarnedReward(TEST_CHILD);
    expect(reward).not.toBeNull();
    expect(reward!.game).toBe("space-invaders");
  });

  it("returns null when no reward is pending", () => {
    const reward = loadEarnedReward(TEST_CHILD);
    expect(reward).toBeNull();
  });

  it("clearEarnedReward removes the file", () => {
    saveEarnedReward(TEST_CHILD, "space-invaders");
    expect(loadEarnedReward(TEST_CHILD)).not.toBeNull();

    clearEarnedReward(TEST_CHILD);
    expect(loadEarnedReward(TEST_CHILD)).toBeNull();
    expect(fs.existsSync(rewardFile)).toBe(false);
  });

  it("getSessionStatus includes pending reward from last session", () => {
    saveEarnedReward("Reina", "space-invaders");

    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: [
        {
          id: "1",
          question: "Q1",
          canonicalAnswer: "A1",
          hint: "H1",
          facts: { leftCents: 10, rightCents: 20 },
        },
      ],
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });

    const status = session.getSessionStatus();
    expect(status.pendingRewardFromLastSession).toBe("space-invaders");

    clearEarnedReward("Reina");
  });
});
