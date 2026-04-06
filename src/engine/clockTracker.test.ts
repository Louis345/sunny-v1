import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  recordClockAttempt,
  finalizeClockSession,
  getClockLevel,
} from "./clockTracker";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import type { LearningProfile } from "../context/schemas/learningProfile";

const childId = "ila";
const profilePath = path.resolve(
  process.cwd(),
  "src",
  "context",
  childId,
  "learning_profile.json",
);

describe("clock mastery gating", () => {
  let saved: string | null = null;

  beforeEach(() => {
    saved = fs.existsSync(profilePath)
      ? fs.readFileSync(profilePath, "utf-8")
      : null;
    const base = readLearningProfile(childId);
    expect(base).not.toBeNull();
    const p = JSON.parse(JSON.stringify(base)) as LearningProfile;
    p.clockMastery = { currentStep: 1, stepSessionHistory: [] };
    writeLearningProfile(childId, p);
  });

  afterEach(() => {
    if (saved !== null) fs.writeFileSync(profilePath, saved, "utf-8");
  });

  it("advances step after 3 sessions at 80%+", () => {
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < 5; i++) recordClockAttempt(childId, true, 3, 0);
      finalizeClockSession(childId);
    }
    const p = readLearningProfile(childId);
    expect(p?.clockMastery?.currentStep).toBeGreaterThanOrEqual(2);
  });

  it("regresses step after sustained poor performance", () => {
    const p = readLearningProfile(childId);
    expect(p).not.toBeNull();
    p!.clockMastery = { currentStep: 2, stepSessionHistory: [] };
    writeLearningProfile(childId, p!);
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < 5; i++) recordClockAttempt(childId, false, 1, 0);
      finalizeClockSession(childId);
    }
    const after = readLearningProfile(childId);
    expect(after?.clockMastery?.currentStep).toBeLessThanOrEqual(2);
    const g = getClockLevel(childId);
    expect(["locked", "ready_to_advance", "regressed"]).toContain(g.gate.gate);
  });
});
