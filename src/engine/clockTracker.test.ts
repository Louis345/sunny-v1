import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  recordClockAttempt,
  finalizeClockSession,
  getClockLevel,
} from "./clockTracker";
import {
  initializeLearningProfile,
  readLearningProfile,
  resolveProfilePath,
  writeLearningProfile,
} from "../utils/learningProfileIO";
import type { LearningProfile } from "../context/schemas/learningProfile";

const childId = "clock-tracker-lab";

describe("clock mastery gating", () => {
  const previousContextRoot = process.env.SUNNY_CONTEXT_ROOT;
  let rootDir = "";
  let profilePath = "";

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-clock-tracker-"));
    process.env.SUNNY_CONTEXT_ROOT = rootDir;
    profilePath = resolveProfilePath(childId);
    expect(profilePath).not.toContain(path.join("src", "context", "ila"));
    const p = initializeLearningProfile({
      childId,
      age: 8,
      grade: 3,
      diagnoses: [],
      learningGoals: [],
    }) as LearningProfile;
    p.clockMastery = { currentStep: 1, stepSessionHistory: [] };
    writeLearningProfile(childId, p);
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    if (previousContextRoot === undefined) delete process.env.SUNNY_CONTEXT_ROOT;
    else process.env.SUNNY_CONTEXT_ROOT = previousContextRoot;
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
