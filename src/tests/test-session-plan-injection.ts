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
    expect(prompt).toContain("## Today's Care Plan");
    expect(prompt).toContain("Compound spelling");
    expect(prompt).toContain(samplePlan.childProfile);
  });

  it("with carePlan null, no care plan section and no throw", async () => {
    const prompt = await buildSessionPrompt("Ila", companionIla, "", [], "free", {
      carePlan: null,
    });
    expect(prompt).not.toContain("## Today's Care Plan");
    expect(prompt.length).toBeGreaterThan(100);
  });
});

describe("Suite 2 — Care plan language", () => {
  let section: string;
  beforeEach(() => {
    section = buildCarePlanSection(samplePlan);
  });

  it("contains discretion phrases", () => {
    expect(section.toLowerCase()).toContain("hold loosely");
    expect(section.toLowerCase()).toContain("you read the child");
    expect(section.toLowerCase()).toContain("you are the tutor");
    expect(section.toLowerCase()).toContain("the plan bends");
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

  it("assertCarePlanSectionLanguage rejects forbidden copy", () => {
    const bad = `${buildCarePlanSection(samplePlan)}\n\nThis task is mandatory.`;
    expect(() => assertCarePlanSectionLanguage(bad)).toThrow(/mandatory/);
  });
});

describe("Suite 3 — Required vs discretionary visible", () => {
  it("marks required and optional; shows skip conditions", () => {
    const s = buildCarePlanSection(samplePlan);
    expect(s).toContain("⚠️ Required");
    expect(s).toContain("○ Use judgment");
    expect(s).toContain("Skip if: tired, time running short");
    expect(s).toContain("Method: Break into parts (Natalie style)");
    expect(s).toContain("Validated by: Natalie session 2025-03");
    expect(s).toContain("Words: sun, flower");
    expect(s).toContain("Probe: repeat → use in sentence");
  });
});

describe("Suite 4 — childProfile before activities", () => {
  it("childProfile appears before activity list", () => {
    const s = buildCarePlanSection(samplePlan);
    const profileIdx = s.indexOf(samplePlan.childProfile);
    const actIdx = s.indexOf("**1. Compound spelling**");
    expect(profileIdx).toBeGreaterThan(-1);
    expect(actIdx).toBeGreaterThan(-1);
    expect(profileIdx).toBeLessThan(actIdx);
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
    expect(s).toContain("## Today's Care Plan");
    expect(s).toContain("hold loosely");
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
    expect(s).toContain("## Today's Care Plan");
    expect(s).toContain("Compound spelling");
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
