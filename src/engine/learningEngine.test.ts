import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  planSession,
  recordAttempt,
  finalizeSession,
  getSessionRewardState,
} from "./learningEngine";
import { readWordBank } from "../utils/wordBankIO";
import { readLearningProfile } from "../utils/learningProfileIO";

const childId = "ila";
const ctxRoot = path.resolve(process.cwd(), "src", "context", childId);
const wordBankPath = path.join(ctxRoot, "word_bank.json");
const profilePath = path.join(ctxRoot, "learning_profile.json");
const today = () => new Date().toISOString().slice(0, 10);
const sessionNotePath = () =>
  path.join(ctxRoot, "session_notes", `${today()}.md`);

let savedWordBank: string | null = null;
let savedProfile: string | null = null;
let savedSessionNote: string | null = null;

describe("Priority 1 — recordAttempt updates SM-2", () => {
  beforeEach(() => {
    savedWordBank = fs.existsSync(wordBankPath)
      ? fs.readFileSync(wordBankPath, "utf-8")
      : null;
    savedProfile = fs.existsSync(profilePath)
      ? fs.readFileSync(profilePath, "utf-8")
      : null;
    const np = sessionNotePath();
    savedSessionNote = fs.existsSync(np) ? fs.readFileSync(np, "utf-8") : null;
    if (fs.existsSync(wordBankPath)) fs.unlinkSync(wordBankPath);
    if (fs.existsSync(np)) fs.unlinkSync(np);
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
    const np = sessionNotePath();
    if (savedSessionNote !== null) {
      fs.mkdirSync(path.dirname(np), { recursive: true });
      fs.writeFileSync(np, savedSessionNote, "utf-8");
    } else if (fs.existsSync(np)) {
      fs.unlinkSync(np);
    }
  });

  it("creates word bank entry and updates SM-2 track on correct attempt", () => {
    planSession(childId, "spelling");
    recordAttempt(childId, {
      word: "railroad",
      domain: "spelling",
      correct: true,
      quality: 5,
      scaffoldLevel: 0,
    });
    const bank = readWordBank(childId);
    const entry = bank.words.find((w) => w.word === "railroad");
    expect(entry).toBeDefined();
    const track = entry?.tracks.spelling;
    expect(track).toBeDefined();
    expect(track!.repetition).toBeGreaterThanOrEqual(1);
    expect(track!.interval).toBeGreaterThanOrEqual(1);
  });

  it("shortens interval on incorrect attempt", () => {
    planSession(childId, "spelling");
    recordAttempt(childId, {
      word: "shortint",
      domain: "spelling",
      correct: true,
      quality: 5,
      scaffoldLevel: 0,
    });
    const afterGood = readWordBank(childId);
    const goodInterval =
      afterGood.words.find((w) => w.word === "shortint")?.tracks.spelling
        ?.interval ?? 0;
    expect(goodInterval).toBeGreaterThanOrEqual(1);

    recordAttempt(childId, {
      word: "shortint",
      domain: "spelling",
      correct: false,
      quality: 0,
      scaffoldLevel: 0,
    });
    const afterBad = readWordBank(childId);
    const badTrack = afterBad.words.find((w) => w.word === "shortint")
      ?.tracks.spelling;
    expect(badTrack?.interval).toBe(1);
  });

  it("updates difficulty signal after multiple attempts", () => {
    planSession(childId, "spelling");
    let lastZone: string | undefined;
    for (let i = 0; i < 6; i++) {
      const r = recordAttempt(childId, {
        word: `diffw${i}`,
        domain: "spelling",
        correct: i % 2 === 0,
        quality: i % 2 === 0 ? 5 : 0,
        scaffoldLevel: 0,
      });
      lastZone = r.difficultySignal.zone;
    }
    expect(lastZone).toBeDefined();
    expect(
      ["too_easy", "optimal", "too_hard", "break_needed"].includes(
        lastZone as string,
      ),
    ).toBe(true);
  });
});

describe("Priority 2 — finalizeSession writes notes and profile", () => {
  beforeEach(() => {
    savedWordBank = fs.existsSync(wordBankPath)
      ? fs.readFileSync(wordBankPath, "utf-8")
      : null;
    savedProfile = fs.existsSync(profilePath)
      ? fs.readFileSync(profilePath, "utf-8")
      : null;
    const np = sessionNotePath();
    savedSessionNote = fs.existsSync(np) ? fs.readFileSync(np, "utf-8") : null;
    if (fs.existsSync(wordBankPath)) fs.unlinkSync(wordBankPath);
    if (fs.existsSync(np)) fs.unlinkSync(np);
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
    const np = sessionNotePath();
    if (savedSessionNote !== null) {
      fs.mkdirSync(path.dirname(np), { recursive: true });
      fs.writeFileSync(np, savedSessionNote, "utf-8");
    } else if (fs.existsSync(np)) {
      fs.unlinkSync(np);
    }
  });

  it("writes session note and updates learning profile", () => {
    const profileBefore = readLearningProfile(childId);
    expect(profileBefore).not.toBeNull();
    const sessionsBefore = profileBefore!.sessionStats.totalSessions;

    planSession(childId, "spelling");
    recordAttempt(childId, {
      word: "finword",
      domain: "spelling",
      correct: true,
      quality: 5,
      scaffoldLevel: 0,
    });
    recordAttempt(childId, {
      word: "finword2",
      domain: "spelling",
      correct: false,
      quality: 0,
      scaffoldLevel: 0,
    });

    const summary = finalizeSession(childId);
    expect(summary.totalAttempts).toBe(2);
    expect(summary.accuracy).toBe(0.5);

    const np = sessionNotePath();
    expect(fs.existsSync(np)).toBe(true);
    const note = fs.readFileSync(np, "utf-8");
    expect(note).toContain("Session Note");
    expect(note).toMatch(/50%/);

    const profileAfter = readLearningProfile(childId);
    expect(profileAfter!.sessionStats.totalSessions).toBe(sessionsBefore + 1);
  });

  it("clears in-memory session state after finalize", () => {
    planSession(childId, "spelling");
    recordAttempt(childId, {
      word: "memclr",
      domain: "spelling",
      correct: true,
      quality: 5,
      scaffoldLevel: 0,
    });
    finalizeSession(childId);
    expect(getSessionRewardState(childId)).toBeNull();
  });

  it("spelling SessionPlan sets focusWords as new then review (≤5)", () => {
    const plan = planSession(childId, "spelling");
    expect(plan.mode).toBe("spelling");
    expect(plan.focusWords.length).toBeLessThanOrEqual(5);
    expect(plan.focusWords).toEqual([
      ...plan.newWords,
      ...plan.reviewWords,
    ].slice(0, 5));
  });
});

describe("Priority 3 — reading flaggedWords recorded as attempts", () => {
  beforeEach(() => {
    savedWordBank = fs.existsSync(wordBankPath)
      ? fs.readFileSync(wordBankPath, "utf-8")
      : null;
    savedProfile = fs.existsSync(profilePath)
      ? fs.readFileSync(profilePath, "utf-8")
      : null;
    const np = sessionNotePath();
    savedSessionNote = fs.existsSync(np) ? fs.readFileSync(np, "utf-8") : null;
    if (fs.existsSync(wordBankPath)) fs.unlinkSync(wordBankPath);
    if (fs.existsSync(np)) fs.unlinkSync(np);
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
    const np = sessionNotePath();
    if (savedSessionNote !== null) {
      fs.mkdirSync(path.dirname(np), { recursive: true });
      fs.writeFileSync(np, savedSessionNote, "utf-8");
    } else if (fs.existsSync(np)) {
      fs.unlinkSync(np);
    }
  });

  it("records flagged reading word with short review interval", () => {
    planSession(childId, "reading");
    recordAttempt(childId, {
      word: "flaggedxyz",
      domain: "reading",
      correct: false,
      quality: 1,
      scaffoldLevel: 0,
    });
    const bank = readWordBank(childId);
    const track = bank.words.find((w) => w.word === "flaggedxyz")?.tracks
      .reading;
    expect(track).toBeDefined();
    expect(track!.interval).toBe(1);
  });

  it("records spelled reading words as correct attempts", () => {
    planSession(childId, "reading");
    recordAttempt(childId, {
      word: "sunlight",
      domain: "reading",
      correct: true,
      quality: 5,
      scaffoldLevel: 0,
    });
    const bank = readWordBank(childId);
    const track = bank.words.find((w) => w.word === "sunlight")?.tracks.reading;
    expect(track).toBeDefined();
    expect(track!.repetition).toBeGreaterThanOrEqual(1);
  });

  it("reading SessionPlan sets focusWords as deduped subset of review and new (≤5)", () => {
    const plan = planSession(childId, "reading");
    expect(plan.mode).toBe("reading");
    const pool = new Set([...plan.reviewWords, ...plan.newWords]);
    expect(plan.focusWords.length).toBeLessThanOrEqual(5);
    for (const w of plan.focusWords) {
      expect(pool.has(w)).toBe(true);
    }
    expect(new Set(plan.focusWords).size).toBe(plan.focusWords.length);
  });
});
