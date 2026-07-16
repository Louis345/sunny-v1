import express from "express";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../engine/choiceEvents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/choiceEvents")>();
  return {
    ...actual,
    recordChoiceEvent: vi.fn((input: unknown) => actual.normalizeChoiceEvent(input as never)),
    applyChoiceEventPreference: vi.fn(async () => ({ applied: true, reason: "preference_applied" })),
  };
});

vi.mock("../engine/contentFeedbackMemory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/contentFeedbackMemory")>();
  return {
    ...actual,
    appendContentFeedbackLesson: vi.fn(),
  };
});

vi.mock("../engine/directExperienceFeedback", () => ({
  interpretDirectExperienceOutcome: vi.fn(() => new Promise(() => {})),
}));

import { appendContentFeedbackLesson } from "../engine/contentFeedbackMemory";
import { interpretDirectExperienceOutcome } from "../engine/directExperienceFeedback";
import { setupRoutes } from "./routes";

const mockedAppendLesson = vi.mocked(appendContentFeedbackLesson);
const mockedInterpretOutcome = vi.mocked(interpretDirectExperienceOutcome);

describe("choice-event route feedback lessons", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    vi.clearAllMocks();
  });

  async function postChoiceEvent(payload: Record<string, unknown>) {
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/child/demo-pashley/choice-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    return { status: res.status, body: await res.json() as Record<string, unknown> };
  }

  const routeChoicePayload = {
    eventName: "option_selected",
    choiceSetId: "baseline-route-options",
    context: "baseline_route",
    domain: "math",
    source: "child_choice",
    selectedOptionId: "choice-route-a",
    skippedOptionIds: ["choice-route-b"],
    shownOptions: [
      {
        optionId: "choice-route-a",
        activityId: "generated-baseline",
        label: "Fraction Forge",
        purposeLabel: "practice",
        preferenceTraits: ["challenge", "visual"],
        domain: "math",
      },
      {
        optionId: "choice-route-b",
        activityId: "generated-baseline",
        label: "Puzzle Path",
        purposeLabel: "practice",
        preferenceTraits: ["puzzle", "calm"],
        domain: "math",
      },
    ],
  };

  it("appends a child_choice feedback lesson when a baseline route is picked", async () => {
    const out = await postChoiceEvent(routeChoicePayload);

    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(true);
    expect(mockedAppendLesson).toHaveBeenCalledTimes(1);
    const [, childId, lesson] = mockedAppendLesson.mock.calls[0]!;
    expect(childId).toBe("demo-pashley");
    expect(lesson).toMatchObject({
      mechanic: "Fraction Forge",
      decision: "approve",
      source: "child_choice",
    });
    expect(String(lesson.reason)).toContain("Puzzle Path");
  });

  it("does not append a lesson for mystery choices", async () => {
    const out = await postChoiceEvent({
      ...routeChoicePayload,
      context: "mystery",
      choiceSetId: "node-mystery-options",
    });

    expect(out.status).toBe(200);
    expect(mockedAppendLesson).not.toHaveBeenCalled();
  });

  it("returns immediately while direct-experience interpretation continues in the background", async () => {
    const out = await postChoiceEvent({
      ...routeChoicePayload,
      eventName: "activity_completed",
      choiceSetId: "post_activity:plan:array-forge",
      context: "homework_required",
      nodeId: "array-forge",
      completed: true,
      funRating: 3,
      demoRequested: true,
    });

    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(true);
    expect(mockedInterpretOutcome).toHaveBeenCalledTimes(1);
  });
});
