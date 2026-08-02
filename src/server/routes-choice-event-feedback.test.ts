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

vi.mock("../engine/learningCycleRuntime", () => ({
  recordCanonicalNodeCompletion: vi.fn(() => ({
    childId: "demo-pashley",
    homeworkId: "hw-math",
    lifecycle: "baseline_evaluating",
    revision: 2,
  })),
  advanceCanonicalCycleFromEvidence: vi.fn(async () => ({
    childId: "demo-pashley",
    homeworkId: "hw-math",
    lifecycle: "quest_generating",
    revision: 3,
  })),
}));

vi.mock("../engine/canonicalProgressionGenerator", () => ({
  generateCanonicalProgressionArtifact: vi.fn(async () => ({
    childId: "demo-pashley",
    homeworkId: "hw-math",
    lifecycle: "quest_ready",
    revision: 4,
  })),
}));

vi.mock("../engine/learningCycleRepository", () => ({
  getLearningCycle: vi.fn(() => ({
    childId: "demo-pashley",
    homeworkId: "hw-math",
    lifecycle: "baseline_evaluating",
    revision: 2,
  })),
  getLatestLearningCycle: vi.fn(() => ({
    childId: "demo-pashley",
    homeworkId: "hw-math",
    lifecycle: "baseline_active",
    revision: 2,
    agencyExperiment: {
      experimentId: "agency-1",
      sharedNodeIds: ["teach"],
      routes: [
        { routeId: "choice-route-a", nodeIds: ["route-a"] },
        { routeId: "choice-route-b", nodeIds: ["route-b"] },
      ],
    },
  })),
  transitionLearningCycle: vi.fn(() => ({
    childId: "demo-pashley",
    homeworkId: "hw-math",
    lifecycle: "baseline_active",
    revision: 3,
    routeSelection: { selectedRouteId: "choice-route-a" },
  })),
}));

import { appendContentFeedbackLesson } from "../engine/contentFeedbackMemory";
import { transitionLearningCycle } from "../engine/learningCycleRepository";
import { interpretDirectExperienceOutcome } from "../engine/directExperienceFeedback";
import { advanceCanonicalCycleFromEvidence } from "../engine/learningCycleRuntime";
import { generateCanonicalProgressionArtifact } from "../engine/canonicalProgressionGenerator";
import { setupRoutes } from "./routes";

const mockedAppendLesson = vi.mocked(appendContentFeedbackLesson);
const mockedTransitionLearningCycle = vi.mocked(transitionLearningCycle);
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

  async function postNodeCompletion() {
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/learning-cycle/node-complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        childId: "demo-pashley",
        homeworkId: "hw-math",
        nodeId: "array-forge",
        result: { completed: true, accuracy: 0.8, sessionId: "session-1" },
      }),
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

  it("records a canonical route selection without approving the chosen mechanic", async () => {
    const out = await postChoiceEvent(routeChoicePayload);

    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(true);
    expect(mockedAppendLesson).not.toHaveBeenCalled();
    expect(mockedTransitionLearningCycle).toHaveBeenCalledWith(
      "demo-pashley",
      "hw-math",
      2,
      expect.objectContaining({
        type: "route_selected",
        experimentId: "agency-1",
        routeId: "choice-route-a",
      }),
    );
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

  it("starts exactly one next-chapter decision from the canonical completion endpoint", async () => {
    const out = await postNodeCompletion();

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ lifecycle: "baseline_evaluating", revision: 2 });
    await vi.waitFor(() => {
      expect(advanceCanonicalCycleFromEvidence).toHaveBeenCalledTimes(1);
      expect(generateCanonicalProgressionArtifact).toHaveBeenCalledTimes(1);
    });
  });
});
