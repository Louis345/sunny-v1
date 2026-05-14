import { beforeEach, describe, it, expect, vi } from "vitest";
import { PSYCHOLOGIST_CONTEXT } from "../agents/prompts";

describe("PSYCHOLOGIST_CONTEXT child lock", () => {
  it("names Reina as the sole session subject", () => {
    const prompt = PSYCHOLOGIST_CONTEXT(
      "Reina",
      "Some notes mentioning Ila by mistake.",
      "attempts",
      "curriculum",
    );
    expect(prompt).toContain("**Reina**");
    expect(prompt).toContain("SESSION SUBJECT");
    expect(prompt).toContain("ignore other names");
  });

  it("names Ila as the sole session subject", () => {
    const prompt = PSYCHOLOGIST_CONTEXT(
      "Ila",
      "ctx",
      "attempts",
      "curriculum",
    );
    expect(prompt).toContain("**Ila**");
    expect(prompt).toContain("tool results for Ila");
  });
});

const mockHomeworkPlan = {
  todaysPlan: [
    {
      activity: "Active homework plan",
      priority: 1,
      required: true,
      reason: "Use active homework cycle.",
      timeboxMinutes: 10,
    },
  ],
  childProfile: "Homework scoped.",
  stopAfter: "When homework evidence is captured.",
  rewardPolicy: "Use earned rewards.",
};

describe("runPsychologistSync planning scope", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../agents/psychologist/psychologist");
    vi.doUnmock("../agents/psychologist/today-plan");
  });

  it("keeps homework sync assignment-scoped instead of appending a global curriculum report", async () => {
    vi.doMock("../agents/psychologist/psychologist", () => ({
      runPsychologist: vi.fn(),
    }));
    vi.doMock("../agents/psychologist/today-plan", () => ({
      buildTodaysPlan: vi.fn().mockResolvedValue(mockHomeworkPlan),
    }));

    const { runPsychologistSync } = await import("../agents/psychologist/sync");
    const { runPsychologist } = await import("../agents/psychologist/psychologist");
    const { buildTodaysPlan } = await import("../agents/psychologist/today-plan");

    await runPsychologistSync("reina", { planningMode: "homework" });

    expect(runPsychologist).not.toHaveBeenCalled();
    expect(buildTodaysPlan).toHaveBeenCalledWith("Reina", {
      planningMode: "homework",
    });
  });

  it("still runs the full psychologist report for review sync", async () => {
    vi.doMock("../agents/psychologist/psychologist", () => ({
      runPsychologist: vi.fn(),
    }));
    vi.doMock("../agents/psychologist/today-plan", () => ({
      buildTodaysPlan: vi.fn().mockResolvedValue(mockHomeworkPlan),
    }));

    const { runPsychologistSync } = await import("../agents/psychologist/sync");
    const { runPsychologist } = await import("../agents/psychologist/psychologist");
    const { buildTodaysPlan } = await import("../agents/psychologist/today-plan");

    await runPsychologistSync("reina", { planningMode: "review" });

    expect(runPsychologist).toHaveBeenCalledWith("Reina", false);
    expect(buildTodaysPlan).toHaveBeenCalledWith("Reina", {
      planningMode: "review",
    });
  });
});
