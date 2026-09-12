import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  selectMysteryGame,
  getMysteryDopaminePoolForChild,
  HOMEWORK_QUEST_SPELLING_SLUGS,
} from "../server/map-coordinator";
import { getDopamineGameSlugsForChild, readChildrenConfig } from "../profiles/childrenConfig";
import {
  finalizeSession,
  planSession,
  recordAttempt,
  registerMysteryGameForSessionFinalize,
} from "../engine/learningEngine";
import {
  initializeLearningProfile,
  readLearningProfile,
  writeLearningProfile,
} from "../utils/learningProfileIO";
import fs from "fs";
import os from "os";
import path from "path";

describe("getDopamineGameSlugsForChild (children.config.json)", () => {
  it("ila pool matches companion preset dopamineGames (launchable only)", () => {
    const cfg = readChildrenConfig();
    const preset = cfg.childCompanionIds["ila"] ?? cfg.defaultCompanionId;
    const allowed = new Set(
      cfg.companions[preset].dopamineGames.map((s) =>
        String(s).trim().toLowerCase(),
      ),
    );
    const got = getDopamineGameSlugsForChild("ila");
    expect(got.length).toBeGreaterThan(0);
    for (const g of got) {
      expect(allowed.has(g)).toBe(true);
    }
  });

  it("getMysteryDopaminePoolForChild is the same helper", () => {
    expect(getMysteryDopaminePoolForChild("reina")).toEqual(
      getDopamineGameSlugsForChild("reina"),
    );
  });
});

describe("selectMysteryGame (homework mystery = child dopamine pool)", () => {
  it("every pick is in that child's dopamine pool", () => {
    const pool = getDopamineGameSlugsForChild("ila");
    for (let i = 0; i < 80; i++) {
      expect(pool).toContain(selectMysteryGame("ila"));
    }
  });

  it("many independent draws are not stuck on one game", () => {
    const out = new Set<string>();
    for (let i = 0; i < 120; i++) {
      out.add(selectMysteryGame("ila"));
    }
    expect(out.size).toBeGreaterThanOrEqual(2);
  });

  it("many draws cover several games when pool has enough entries", () => {
    const pool = getDopamineGameSlugsForChild("reina");
    if (pool.length < 4) return;
    const out = new Set<string>();
    for (let i = 0; i < 250; i++) {
      out.add(selectMysteryGame("reina"));
    }
    expect(out.size).toBeGreaterThanOrEqual(4);
  });

  it("every pool slug for ila has a public HTML file", () => {
    for (const slug of getDopamineGameSlugsForChild("ila")) {
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

describe("HOMEWORK_QUEST_SPELLING_SLUGS (quest node, non-generated)", () => {
  it("is exactly monster-stampede and speed-catcher", () => {
    expect([...HOMEWORK_QUEST_SPELLING_SLUGS].sort()).toEqual(
      ["monster-stampede", "speed-catcher"].sort(),
    );
  });

  it("each slug has a launchable HTML file", () => {
    for (const slug of HOMEWORK_QUEST_SPELLING_SLUGS) {
      const filePath = path.resolve(
        process.cwd(),
        "web",
        "public",
        "games",
        `${slug}.html`,
      );
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });
});

describe("finalizeSession + lastMysteryGame", () => {
  const childId = "ila";
  let isolatedContextRoot = "";
  let ctxRoot = "";

  beforeAll(() => {
    isolatedContextRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "sunny-mystery-finalization-"),
    );
    vi.stubEnv("SUNNY_CONTEXT_ROOT", isolatedContextRoot);
    vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
    ctxRoot = path.join(isolatedContextRoot, childId);
    writeLearningProfile(
      childId,
      initializeLearningProfile({
        childId,
        age: 9,
        grade: 3,
        diagnoses: [],
        learningGoals: ["spelling"],
      }),
    );
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    if (isolatedContextRoot) {
      fs.rmSync(isolatedContextRoot, { recursive: true, force: true });
    }
  });

  it("never points the mystery-finalization test at canonical family data", () => {
    expect(ctxRoot).not.toBe(
      path.resolve(process.cwd(), "src", "context", childId),
    );
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
