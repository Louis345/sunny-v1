import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ChoiceEvent } from "./choiceEvents";
import {
  interpretDirectExperienceOutcome,
  interpretPendingDirectExperienceOutcomes,
  readDirectFeedbackContext,
} from "./directExperienceFeedback";

function directRecord(rootDir: string) {
  const file = path.join(rootDir, "src/context/reina/homework/direct_experience_plan.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    childId: "reina",
    homeworkId: "hw-math-1",
    plannerPlan: {
      activities: [{
        id: "array-forge",
        designPrediction: "Reina will begin within ten seconds.",
        preserve: ["large math target"],
        change: [],
        explore: ["optional demonstration"],
        avoid: ["hidden drag"],
        measurementKeys: ["interaction.timeToFirstValidActionMs"],
      }],
    },
    feedbackObservations: [],
    feedbackDecisions: [],
  }, null, 2));
  return file;
}

function event(): ChoiceEvent {
  return {
    type: "choice_event",
    version: 1,
    choiceEventId: "event-1",
    eventName: "activity_completed",
    choiceSetId: "post_activity:plan:array-forge",
    childId: "reina",
    nodeId: "array-forge",
    context: "homework_required",
    domain: "math",
    shownOptions: [{ optionId: "array-forge:generated-baseline", activityId: "generated-baseline", label: "Array Forge", purposeLabel: "back_to_map" }],
    selectedOptionId: "array-forge:generated-baseline",
    skippedOptionIds: [],
    source: "child_choice",
    completed: true,
    accuracy: 1,
    funRating: 2,
    demoRequested: true,
    demoReplayCount: 1,
    timeToFirstValidActionMs: 18_000,
    invalidActionCount: 3,
    soundMuted: false,
    createdAt: "2026-07-16T20:00:00.000Z",
  };
}

describe("direct experience feedback", () => {
  it("writes one idempotent Planner interpretation while preserving factual evidence separately", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-direct-feedback-"));
    directRecord(rootDir);
    const interpret = vi.fn(async () => ({
      outcome: "revised" as const,
      preserve: ["large math target"],
      change: ["demonstrate the first action sooner"],
      explore: ["tap-first interaction"],
      avoid: ["hidden drag"],
      evidenceIds: ["event-1"],
      nextPromptDirectives: ["Keep math performance separate from interface hesitation."],
    }));

    await interpretDirectExperienceOutcome(event(), { rootDir, interpret });
    await interpretDirectExperienceOutcome(event(), { rootDir, interpret });

    expect(interpret).toHaveBeenCalledTimes(1);
    const context = readDirectFeedbackContext("reina", { rootDir });
    expect(context.decisions).toHaveLength(1);
    expect(context.decisions[0]).toMatchObject({
      outcome: "revised",
      evidenceIds: ["event-1"],
      designPrediction: "Reina will begin within ten seconds.",
    });
    expect(context.observations[0]).toMatchObject({
      choiceEventId: "event-1",
      academic: { accuracy: 1, completed: true },
      interaction: { demoRequested: true, invalidActionCount: 3, soundMuted: false },
      engagement: { funRating: 2 },
    });
  });

  it("preserves raw facts when background interpretation fails", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-direct-feedback-"));
    directRecord(rootDir);
    await expect(interpretDirectExperienceOutcome(event(), {
      rootDir,
      interpret: async () => { throw new Error("provider_overloaded"); },
    })).rejects.toThrow("provider_overloaded");
    const context = readDirectFeedbackContext("reina", { rootDir });
    expect(context.observations).toHaveLength(1);
    expect(context.decisions).toHaveLength(0);
  });

  it("retries an uninterpreted factual outcome before the next ingestion", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-direct-feedback-"));
    directRecord(rootDir);
    const result = await interpretPendingDirectExperienceOutcomes("reina", {
      rootDir,
      events: [event()],
      interpret: async () => ({
        outcome: "supported",
        preserve: ["optional demonstration"],
        change: [],
        explore: ["new visual world"],
        avoid: [],
        evidenceIds: ["event-1"],
        nextPromptDirectives: ["Preserve the demonstration and vary the theme."],
      }),
    });
    expect(result).toEqual({ interpreted: 1, deferred: 0 });
    expect(readDirectFeedbackContext("reina", { rootDir }).decisions).toHaveLength(1);
  });
});
