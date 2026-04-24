import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  formatTodaysPlanInjection,
  getTodaysPlanInjectionSuffix,
  appendPlanSuffixToSessionPrompt,
} from "../utils/sessionPlanInjection";
import {
  readPersistedTodaysPlan,
  writePersistedTodaysPlan,
} from "../agents/psychologist/today-plan";
import type { PsychologistStructuredOutput } from "../agents/psychologist/today-plan";
import { buildSessionPrompt } from "../agents/prompts";
import {
  buildCarePlanSection,
  assertCarePlanSectionLanguage,
} from "../agents/prompts/buildCarePlanSection";

const repoRoot = path.resolve(__dirname, "../..");
const companionIla = path.join(repoRoot, "src/companions/elli.md");
const companionReina = path.join(repoRoot, "src/companions/matilda.md");

const samplePlan: PsychologistStructuredOutput = {
  todaysPlan: [
    {
      activity: "Compound spelling",
      priority: 1,
      required: true,
      reason: "Priority target",
      timeboxMinutes: 12,
      method: "Break into parts (Natalie style)",
      source: "Natalie session 2025-03",
      words: ["sun", "flower"],
      probeSequence: ["repeat", "use in sentence"],
    },
    {
      activity: "Reward break",
      priority: 2,
      required: false,
      reason: "Energy",
      timeboxMinutes: 5,
      skipConditions: ["tired", "time running short"],
    },
  ],
  childProfile: "Needs visual anchors; short bursts.",
  stopAfter: "One solid success or 25 minutes.",
  rewardPolicy: "Game after 3 correct attempts.",
};

describe("Suite 1 — Plan injection (buildSessionPrompt)", () => {
  it("with todaysPlan, prompt contains care plan section", async () => {
    const prompt = await buildSessionPrompt(
      "Ila",
      companionIla,
      "",
      [],
      "free",
      { carePlan: samplePlan },
    );
    expect(prompt).toContain("## What Elli knows about today");
    expect(prompt).toContain("flower, sun");
    expect(prompt).toContain(samplePlan.childProfile);
  });

  it("with carePlan null, no care plan section and no throw", async () => {
    const prompt = await buildSessionPrompt("Ila", companionIla, "", [], "free", {
      carePlan: null,
    });
    expect(prompt).not.toContain("## What Elli knows about today");
    expect(prompt.length).toBeGreaterThan(100);
  });
});

describe("Suite 2 — Care plan language", () => {
  let section: string;
  beforeEach(() => {
    section = buildCarePlanSection(samplePlan);
  });

  it("contains context-only framing", () => {
    const n = section.toLowerCase();
    expect(n).toContain("what elli knows about today");
    expect(n).toContain("context only — not a checklist");
    expect(n).toContain("follow the child");
  });

  it("avoids tutor-classroom vocabulary in built section", () => {
    const n = section.toLowerCase();
    expect(n).not.toMatch(/\btutor(ing)?\b/);
    expect(n).not.toMatch(/\bpractice\b/);
    expect(n).not.toMatch(/\blesson\b/);
    expect(n).not.toMatch(/\bcurriculum\b/);
    expect(n).not.toContain("work through");
    expect(n).not.toMatch(/\bcanvas\b/);
    expect(n).not.toMatch(/\bloading\b/);
    expect(n).not.toMatch(/\bready\b/);
  });

  it("does not contain rigid checklist phrases", () => {
    const n = section.toLowerCase();
    expect(n).not.toContain("complete in order");
    expect(n).not.toContain("complete activities in order");
    expect(n).not.toContain("do not proceed until");
    expect(n).not.toContain("must finish");
    expect(n).not.toContain("finish before moving on");
    expect(n).not.toContain("mandatory");
  });

  it("does not leak activity scripts or tool commands", () => {
    expect(section).not.toContain("Method:");
    expect(section).not.toContain("Probe:");
    expect(section).not.toContain("sessionLog");
    expect(section).not.toContain("⚠️ Required");
    expect(section).not.toContain("Compound spelling");
    expect(section).not.toContain(samplePlan.rewardPolicy);
  });

  it("assertCarePlanSectionLanguage rejects forbidden copy", () => {
    const bad = `${buildCarePlanSection(samplePlan)}\n\nThis task is mandatory.`;
    expect(() => assertCarePlanSectionLanguage(bad)).toThrow(/mandatory/);
  });
});

describe("Suite 3 — Focus words and observation", () => {
  it("lists words only and includes psychologist one-liner", () => {
    const s = buildCarePlanSection(samplePlan);
    expect(s).toContain("Words on the map today (names only): flower, sun.");
    expect(s).toContain("Psychologist note (one line, for context): Priority target");
    expect(s).toContain("Needs visual anchors");
  });
});

describe("Suite 4 — childProfile in observation block", () => {
  it("observation contains profile text", () => {
    const s = buildCarePlanSection(samplePlan);
    expect(s).toContain("What we know about them (observation, not instructions):");
    expect(s).toContain(samplePlan.childProfile.split(";")[0].trim());
  });
});

describe("Suite 5 — Child-agnostic", () => {
  it("buildCarePlanSection output does not depend on child name", () => {
    expect(buildCarePlanSection(samplePlan)).toBe(buildCarePlanSection(samplePlan));
  });

  it("same care plan string embedded for Ila vs Reina when same plan", async () => {
    const care = buildCarePlanSection(samplePlan);
    const pIla = await buildSessionPrompt("Ila", companionIla, "", [], "free", {
      carePlan: samplePlan,
    });
    const pReina = await buildSessionPrompt("Reina", companionReina, "", [], "free", {
      carePlan: samplePlan,
    });
    expect(pIla).toContain(care);
    expect(pReina).toContain(care);
  });

  it("buildCarePlanSection source has no Ila-only branches", () => {
    const src = fs.readFileSync(
      path.join(repoRoot, "src/agents/prompts/buildCarePlanSection.ts"),
      "utf-8",
    );
    expect(src).not.toMatch(/childName\s*===\s*["']Ila["']/);
  });
});

describe("formatTodaysPlanInjection (compat)", () => {
  it("delegates to care plan section shape", () => {
    const s = formatTodaysPlanInjection(samplePlan, "Ila");
    expect(s).toContain("## What Elli knows about today");
    expect(s.toLowerCase()).toContain("context only — not a checklist");
  });
});

describe("readPersistedTodaysPlan / writePersistedTodaysPlan", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `plan-${Date.now()}.json`);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
  });

  it("round-trips valid JSON", () => {
    writePersistedTodaysPlan("Ila", samplePlan, tmp);
    const got = readPersistedTodaysPlan("Ila", tmp);
    expect(got?.todaysPlan.length).toBe(2);
    expect(got?.childProfile).toBe(samplePlan.childProfile);
  });

  it("returns null for invalid JSON", () => {
    fs.writeFileSync(tmp, "{ not json", "utf-8");
    expect(readPersistedTodaysPlan("Ila", tmp)).toBeNull();
  });
});

describe("getTodaysPlanInjectionSuffix", () => {
  let tmp: string;
  const prev = process.env.SUNNY_STATELESS;

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `plan-suffix-${Date.now()}.json`);
    delete process.env.SUNNY_STATELESS;
  });

  afterEach(() => {
    fs.rmSync(tmp, { force: true });
    if (prev === undefined) delete process.env.SUNNY_STATELESS;
    else process.env.SUNNY_STATELESS = prev;
  });

  it("returns empty string when stateless", () => {
    process.env.SUNNY_STATELESS = "true";
    expect(getTodaysPlanInjectionSuffix("Ila")).toBe("");
  });

  it("returns formatted plan when file exists and not stateless", () => {
    writePersistedTodaysPlan("Ila", samplePlan, tmp);
    const s = getTodaysPlanInjectionSuffix("Ila", tmp);
    expect(s.length).toBeGreaterThan(0);
    expect(s).toContain("## What Elli knows about today");
    expect(s).toContain("flower, sun");
  });
});

describe("appendPlanSuffixToSessionPrompt", () => {
  it("appends suffix when non-empty", () => {
    const out = appendPlanSuffixToSessionPrompt("base", "EXTRA");
    expect(out).toContain("base");
    expect(out).toContain("EXTRA");
  });

  it("returns base when suffix empty", () => {
    expect(appendPlanSuffixToSessionPrompt("base", "")).toBe("base");
  });
});

describe("character counts: care plan injection", () => {
  it("reports longer prompt when care plan present vs null", async () => {
    const without = await buildSessionPrompt("Ila", companionIla, "", [], "free", {
      carePlan: null,
    });
    const withPlan = await buildSessionPrompt("Ila", companionIla, "", [], "free", {
      carePlan: samplePlan,
    });
    expect(withPlan.length).toBeGreaterThan(without.length);
    expect(withPlan.length - without.length).toBeGreaterThan(
      buildCarePlanSection(samplePlan).length * 0.9,
    );
  });
});
