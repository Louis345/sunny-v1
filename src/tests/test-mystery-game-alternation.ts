import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import * as profileIo from "../utils/learningProfileIO";
import { selectMysteryGame } from "../server/map-coordinator";
import {
  finalizeSession,
  planSession,
  recordAttempt,
  registerMysteryGameForSessionFinalize,
} from "../engine/learningEngine";
import { readLearningProfile } from "../utils/learningProfileIO";
import fs from "fs";
import path from "path";
import { MYSTERY_GAME_SLUGS } from "../server/map-coordinator";

describe("selectMysteryGame", () => {
  beforeEach(() => {
    vi.spyOn(profileIo, "readLearningProfile");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no prior lastMysteryGame → random pick, either slug is valid", () => {
    vi.mocked(profileIo.readLearningProfile).mockReturnValue({
      childId: "test",
      version: 1,
      createdAt: "",
      lastUpdated: "",
      demographics: {} as never,
      algorithmParams: {} as never,
      bondPatterns: {} as never,
      moodHistory: [],
      rewardPreferences: {} as never,
    } as unknown as LearningProfile);

    const out = new Set<string>();
    for (let i = 0; i < 50; i++) {
      out.add(selectMysteryGame("ila"));
    }
    expect(out.has("monster-stampede")).toBe(true);
    expect(out.has("speed-catcher")).toBe(true);
    for (const g of out) {
      expect(["monster-stampede", "speed-catcher"]).toContain(g);
    }
  });

  it("session 2 → opposite of session 1 lastMysteryGame", () => {
    vi.mocked(profileIo.readLearningProfile).mockReturnValue({
      childId: "test",
      lastMysteryGame: "monster-stampede",
    } as unknown as LearningProfile);
    expect(selectMysteryGame("ila")).toBe("speed-catcher");
  });

  it("session 3 → opposite of session 2 lastMysteryGame", () => {
    vi.mocked(profileIo.readLearningProfile).mockReturnValue({
      childId: "test",
      lastMysteryGame: "speed-catcher",
    } as unknown as LearningProfile);
    expect(selectMysteryGame("ila")).toBe("monster-stampede");
  });

  it("unknown last slug → random valid game", () => {
    vi.mocked(profileIo.readLearningProfile).mockReturnValue({
      childId: "test",
      lastMysteryGame: "space-invaders",
    } as unknown as LearningProfile);
    const g = selectMysteryGame("ila");
    expect(["monster-stampede", "speed-catcher"]).toContain(g);
  });

  it("every selected mystery game slug has a launchable public HTML file", () => {
    for (const slug of MYSTERY_GAME_SLUGS) {
      const filePath = path.resolve(
        process.cwd(),
        "web",
        "public",
        "games",
        `${slug}.html`,
      );
      expect(fs.existsSync(filePath), `${slug}.html should exist`).toBe(true);
    }
  });
});

describe("finalizeSession + lastMysteryGame", () => {
  const childId = "ila";
  const ctxRoot = path.resolve(process.cwd(), "src", "context", childId);
  const profilePath = path.join(ctxRoot, "learning_profile.json");
  const wordBankPath = path.join(ctxRoot, "word_bank.json");
  let savedProfile: string | null = null;
  let savedWordBank: string | null = null;

  beforeEach(() => {
    savedProfile = fs.existsSync(profilePath)
      ? fs.readFileSync(profilePath, "utf-8")
      : null;
    savedWordBank = fs.existsSync(wordBankPath)
      ? fs.readFileSync(wordBankPath, "utf-8")
      : null;
    if (fs.existsSync(wordBankPath)) fs.unlinkSync(wordBankPath);
  });

  afterEach(() => {
    if (savedWordBank !== null) {
      fs.mkdirSync(path.dirname(wordBankPath), { recursive: true });
      fs.writeFileSync(wordBankPath, savedWordBank, "utf-8");
    } else if (fs.existsSync(wordBankPath)) {
      fs.unlinkSync(wordBankPath);
    }
    if (savedProfile !== null) {
      fs.writeFileSync(profilePath, savedProfile, "utf-8");
    }
  });

  it("writes profile.lastMysteryGame after finalize when registerMysteryGameForSessionFinalize ran", () => {
    const before = readLearningProfile(childId);
    expect(before).not.toBeNull();

    planSession(childId, "spelling");
    registerMysteryGameForSessionFinalize(childId, "monster-stampede");
    recordAttempt(childId, {
      word: "mysteryfinalize",
      domain: "spelling",
      correct: true,
      quality: 5,
      scaffoldLevel: 0,
    });
    finalizeSession(childId);

    const after = readLearningProfile(childId);
    expect(after?.lastMysteryGame).toBe("monster-stampede");
  });
});
