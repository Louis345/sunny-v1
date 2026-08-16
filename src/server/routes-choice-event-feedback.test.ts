import express from "express";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../engine/choiceEvents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/choiceEvents")>();
  return {
    ...actual,
    recordChoiceEvent: vi.fn((input: unknown) => actual.normalizeChoiceEvent(input as never)),
    findChoiceEventById: vi.fn(),
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
    nodes: [{ nodeId: "array-forge", state: "active" }],
    pendingSessionNodeIds: ["array-forge"],
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
  transitionLearningCycle: vi.fn((_childId: string, _homeworkId: string, _revision: number, event: { type?: string }) => ({
    childId: "demo-pashley",
    homeworkId: "hw-math",
    lifecycle: event.type === "session_finalized" ? "baseline_evaluating" : "baseline_active",
    revision: 3,
    routeSelection: { selectedRouteId: "choice-route-a" },
    ...(event.type === "session_finalized" ? { evaluationSessionFinalizationId: "finalized" } : {}),
  })),
}));

import { appendContentFeedbackLesson } from "../engine/contentFeedbackMemory";
import { applyChoiceEventPreference, findChoiceEventById } from "../engine/choiceEvents";
import { getLearningCycle, transitionLearningCycle } from "../engine/learningCycleRepository";
import { interpretDirectExperienceOutcome } from "../engine/directExperienceFeedback";
import { advanceCanonicalCycleFromEvidence, recordCanonicalNodeCompletion } from "../engine/learningCycleRuntime";
import { generateCanonicalProgressionArtifact } from "../engine/canonicalProgressionGenerator";
import { setupRoutes } from "./routes";

const mockedAppendLesson = vi.mocked(appendContentFeedbackLesson);
const mockedTransitionLearningCycle = vi.mocked(transitionLearningCycle);
const mockedGetLearningCycle = vi.mocked(getLearningCycle);
const mockedInterpretOutcome = vi.mocked(interpretDirectExperienceOutcome);
const mockedApplyChoiceEventPreference = vi.mocked(applyChoiceEventPreference);
const mockedFindChoiceEventById = vi.mocked(findChoiceEventById);

describe("choice-event route feedback lessons", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    vi.clearAllMocks();
    mockedFindChoiceEventById.mockReset();
    mockedFindChoiceEventById.mockReturnValue(undefined);
    mockedGetLearningCycle.mockReset();
    mockedGetLearningCycle.mockReturnValue({
      childId: "demo-pashley",
      homeworkId: "hw-math",
      lifecycle: "baseline_evaluating",
      revision: 2,
      nodes: [{ nodeId: "array-forge", state: "active" }],
      pendingSessionNodeIds: ["array-forge"],
    } as never);
    mockedTransitionLearningCycle.mockReset();
    mockedTransitionLearningCycle.mockImplementation((_childId, _homeworkId, _revision, event) => ({
      childId: "demo-pashley",
      homeworkId: "hw-math",
      lifecycle: event.type === "session_finalized" ? "baseline_evaluating" : "baseline_active",
      revision: 3,
      routeSelection: { selectedRouteId: "choice-route-a" },
      ...(event.type === "session_finalized" ? { evaluationSessionFinalizationId: "finalized" } : {}),
    } as never));
    vi.mocked(advanceCanonicalCycleFromEvidence).mockReset();
    vi.mocked(advanceCanonicalCycleFromEvidence).mockResolvedValue({
      childId: "demo-pashley",
      homeworkId: "hw-math",
      lifecycle: "quest_generating",
      revision: 3,
    } as never);
    vi.mocked(generateCanonicalProgressionArtifact).mockReset();
    vi.mocked(generateCanonicalProgressionArtifact).mockResolvedValue({
      childId: "demo-pashley",
      homeworkId: "hw-math",
      lifecycle: "quest_ready",
      revision: 4,
    } as never);
    delete process.env.SUNNY_MODE;
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
    homeworkId: "hw-math",
    cycleRevision: 2,
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

  it("requires math modal evidence to name its homework and preserves its displayed cycle revision", async () => {
    const missing = await postChoiceEvent({
      ...routeChoicePayload,
      homeworkId: undefined,
      context: "homework_required",
      eventName: "activity_completed",
      nodeId: "array-forge",
      completed: true,
      funRating: 5,
    });
    expect(missing.status).toBe(409);
    expect(missing.body.error).toBe("choice_event_homework_identity_required");

    const bound = await postChoiceEvent({
      ...routeChoicePayload,
      homeworkId: "hw-math",
      cycleRevision: 1,
      context: "homework_required",
      eventName: "activity_completed",
      nodeId: "array-forge",
      completed: true,
      funRating: 5,
    });
    expect(mockedGetLearningCycle).toHaveBeenCalledWith("demo-pashley", "hw-math");
    const { recordChoiceEvent } = await import("../engine/choiceEvents");
    expect(bound.status).toBe(409);
    expect(bound.body.error).toBe("choice_event_cycle_revision_stale");
    expect(vi.mocked(recordChoiceEvent)).not.toHaveBeenCalled();

    const current = await postChoiceEvent({
      ...routeChoicePayload,
      homeworkId: "hw-math",
      cycleRevision: 2,
      context: "homework_required",
      eventName: "activity_completed",
      nodeId: "array-forge",
      completed: true,
      funRating: 5,
    });
    expect(current.status).toBe(200);
    expect(vi.mocked(recordChoiceEvent)).toHaveBeenLastCalledWith(
      expect.objectContaining({ homeworkId: "hw-math", cycleRevision: 2 }),
    );
  });

  it("acknowledges a retried modal event without applying its preference twice", async () => {
    const payload = {
      ...routeChoicePayload,
      choiceEventId: "choice_event_retry_same",
      context: "homework_required",
      eventName: "activity_completed",
      nodeId: "array-forge",
      completed: true,
      funRating: 5,
    };

    mockedFindChoiceEventById
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ choiceEventId: "choice_event_retry_same" } as never);
    const first = await postChoiceEvent(payload);
    const second = await postChoiceEvent(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ ok: true, duplicate: true });
    expect(mockedApplyChoiceEventPreference).toHaveBeenCalledTimes(1);
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

  it("waits for the completion modal before starting the next-chapter decision", async () => {
    const out = await postNodeCompletion();

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ lifecycle: "baseline_evaluating", revision: 2 });
    expect(advanceCanonicalCycleFromEvidence).not.toHaveBeenCalled();
    expect(generateCanonicalProgressionArtifact).not.toHaveBeenCalled();
  });

  it("records an intermediate node modal without starting a progression decision", async () => {
    const activeCycle = {
      childId: "demo-pashley",
      homeworkId: "hw-math",
      lifecycle: "baseline_active",
      revision: 2,
      nodes: [{ nodeId: "array-forge", state: "completed" }],
      pendingSessionNodeIds: ["array-forge"],
      sessionFinalizations: [],
    };
    mockedGetLearningCycle.mockReturnValueOnce(activeCycle as never).mockReturnValueOnce(activeCycle as never);
    mockedTransitionLearningCycle.mockReturnValueOnce({
      childId: "demo-pashley",
      homeworkId: "hw-math",
      lifecycle: "baseline_active",
      revision: 3,
    } as never);

    const out = await postChoiceEvent({
      ...routeChoicePayload,
      choiceEventId: "modal-intermediate",
      eventName: "activity_completed",
      choiceSetId: "post_activity:plan:array-forge",
      context: "homework_required",
      nodeId: "array-forge",
      completed: true,
      funRating: 5,
      postActivityAction: "back_to_map",
    });

    expect(out.status).toBe(200);
    expect(mockedTransitionLearningCycle).toHaveBeenCalledWith(
      "demo-pashley",
      "hw-math",
      2,
      expect.objectContaining({ type: "session_finalized", choiceEventId: "modal-intermediate" }),
    );
    expect(advanceCanonicalCycleFromEvidence).not.toHaveBeenCalled();
  });

  it("finalizes rating evidence canonically before starting exactly one next-chapter decision", async () => {
    const out = await postChoiceEvent({
      ...routeChoicePayload,
      choiceEventId: "modal-finalized-rating",
      eventName: "activity_completed",
      choiceSetId: "post_activity:plan:array-forge",
      context: "homework_required",
      nodeId: "array-forge",
      completed: true,
      accuracy: 0.8,
      funRating: 2,
      replayRequested: false,
      frustrationScore: 0.4,
      demoRequested: true,
      invalidActionCount: 3,
      postActivityAction: "back_to_map",
    });

    expect(out.status).toBe(200);
    expect(mockedTransitionLearningCycle).toHaveBeenCalledWith(
      "demo-pashley",
      "hw-math",
      2,
      expect.objectContaining({
        type: "session_finalized",
        nodeId: "array-forge",
        choiceEventId: "modal-finalized-rating",
        engagement: expect.objectContaining({
          funRating: 2,
          replayRequested: false,
          frustrationScore: 0.4,
          demoRequested: true,
          invalidActionCount: 3,
          postActivityAction: "back_to_map",
        }),
      }),
    );
    await vi.waitFor(() => {
      expect(advanceCanonicalCycleFromEvidence).toHaveBeenCalledTimes(1);
      expect(generateCanonicalProgressionArtifact).toHaveBeenCalledTimes(1);
    });
  });

  it("treats Skip as finalized evidence without inventing a neutral rating", async () => {
    const out = await postChoiceEvent({
      ...routeChoicePayload,
      choiceEventId: "modal-finalized-skip",
      eventName: "activity_completed",
      choiceSetId: "post_activity:plan:array-forge",
      context: "homework_required",
      nodeId: "array-forge",
      completed: true,
      accuracy: 0.8,
      postActivityAction: "back_to_map",
    });

    expect(out.status).toBe(200);
    expect(mockedTransitionLearningCycle).toHaveBeenCalledWith(
      "demo-pashley",
      "hw-math",
      2,
      expect.objectContaining({
        type: "session_finalized",
        engagement: expect.not.objectContaining({ funRating: expect.anything() }),
      }),
    );
    await vi.waitFor(() => expect(advanceCanonicalCycleFromEvidence).toHaveBeenCalledTimes(1));
  });

  it("finalizes Replay before starting the next-chapter decision", async () => {
    const out = await postChoiceEvent({
      ...routeChoicePayload,
      choiceEventId: "modal-finalized-replay",
      eventName: "replay_requested",
      choiceSetId: "post_activity:plan:array-forge",
      context: "homework_required",
      nodeId: "array-forge",
      completed: true,
      replayRequested: true,
      postActivityAction: "replay_same",
    });

    expect(out.status).toBe(200);
    expect(mockedTransitionLearningCycle).toHaveBeenCalledWith(
      "demo-pashley",
      "hw-math",
      2,
      expect.objectContaining({
        type: "session_finalized",
        engagement: expect.objectContaining({ replayRequested: true, postActivityAction: "replay_same" }),
      }),
    );
    await vi.waitFor(() => expect(advanceCanonicalCycleFromEvidence).toHaveBeenCalledTimes(1));
  });

  it("records explicit abandonment without pretending the node completed or starting progression", async () => {
    const activeCycle = {
      childId: "demo-pashley",
      homeworkId: "hw-math",
      lifecycle: "baseline_active",
      revision: 2,
      nodes: [{ nodeId: "array-forge", state: "active" }],
      pendingSessionNodeIds: [],
      sessionFinalizations: [],
    };
    mockedGetLearningCycle.mockReturnValueOnce(activeCycle as never).mockReturnValueOnce(activeCycle as never);
    mockedTransitionLearningCycle.mockReturnValueOnce({ ...activeCycle, revision: 3 } as never);

    const out = await postChoiceEvent({
      ...routeChoicePayload,
      choiceEventId: "modal-finalized-abandon",
      eventName: "activity_completed",
      choiceSetId: "post_activity:plan:array-forge",
      context: "homework_required",
      nodeId: "array-forge",
      completed: false,
      postActivityAction: "abandon",
    });

    expect(out.status).toBe(200);
    expect(mockedTransitionLearningCycle).toHaveBeenCalledWith(
      "demo-pashley",
      "hw-math",
      2,
      expect.objectContaining({
        type: "session_finalized",
        engagement: expect.objectContaining({ completed: false, postActivityAction: "abandon" }),
      }),
    );
    expect(advanceCanonicalCycleFromEvidence).not.toHaveBeenCalled();
  });

  it("ignores abandonment for a locked node that was never launchable", async () => {
    const lockedCycle = {
      childId: "demo-pashley",
      homeworkId: "hw-math",
      lifecycle: "baseline_active",
      revision: 2,
      nodes: [{ nodeId: "quest", role: "quest", state: "locked" }],
      pendingSessionNodeIds: [],
      sessionFinalizations: [],
    };
    mockedGetLearningCycle.mockReturnValueOnce(lockedCycle as never);

    const out = await postChoiceEvent({
      ...routeChoicePayload,
      choiceEventId: "modal-locked-abandon",
      eventName: "activity_completed",
      choiceSetId: "post_activity:plan:quest",
      context: "quest",
      nodeId: "quest",
      completed: false,
      postActivityAction: "abandon",
    });

    expect(out.status).toBe(200);
    expect(mockedTransitionLearningCycle).not.toHaveBeenCalled();
    expect(advanceCanonicalCycleFromEvidence).not.toHaveBeenCalled();
  });

  it("does not start a second decision when the finalized modal event is retried", async () => {
    const payload = {
      ...routeChoicePayload,
      choiceEventId: "modal-finalized-once",
      eventName: "activity_completed",
      choiceSetId: "post_activity:plan:array-forge",
      context: "homework_required",
      nodeId: "array-forge",
      completed: true,
      accuracy: 0.8,
      funRating: 4,
      postActivityAction: "back_to_map",
    };
    mockedFindChoiceEventById
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ choiceEventId: "modal-finalized-once" } as never);

    await postChoiceEvent(payload);
    await vi.waitFor(() => expect(advanceCanonicalCycleFromEvidence).toHaveBeenCalledTimes(1));
    const duplicate = await postChoiceEvent(payload);

    expect(duplicate.body).toMatchObject({ ok: true, duplicate: true });
    expect(advanceCanonicalCycleFromEvidence).toHaveBeenCalledTimes(1);
  });

  it("retries one preserved finalized packet after a provider decision failure", async () => {
    const storedEvent = {
      type: "choice_event",
      version: 1,
      choiceEventId: "modal-provider-retry",
      choiceSetId: "post_activity:plan:array-forge",
      childId: "demo-pashley",
      homeworkId: "hw-math",
      nodeId: "array-forge",
      context: "homework_required",
      domain: "math",
      shownOptions: routeChoicePayload.shownOptions,
      skippedOptionIds: [],
      source: "child_choice",
      eventName: "activity_completed",
      completed: true,
      postActivityAction: "back_to_map",
      createdAt: "2026-08-07T12:00:00.000Z",
    } as const;
    mockedFindChoiceEventById.mockReturnValue(storedEvent as never);
    mockedGetLearningCycle.mockReturnValue({
      childId: "demo-pashley",
      homeworkId: "hw-math",
      lifecycle: "baseline_evaluating",
      revision: 3,
      nodes: [{ nodeId: "array-forge", state: "completed" }],
      sessionFinalizations: [{ choiceEventId: "modal-provider-retry", nodeId: "array-forge" }],
      evaluationSessionFinalizationId: "modal-provider-retry",
    } as never);
    vi.mocked(advanceCanonicalCycleFromEvidence)
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({
        childId: "demo-pashley",
        homeworkId: "hw-math",
        lifecycle: "quest_generating",
        revision: 4,
      } as never);

    await postChoiceEvent(storedEvent);
    await vi.waitFor(() => expect(advanceCanonicalCycleFromEvidence).toHaveBeenCalledTimes(1));
    await new Promise<void>((resolve) => setImmediate(resolve));

    await postChoiceEvent(storedEvent);
    await vi.waitFor(() => expect(advanceCanonicalCycleFromEvidence).toHaveBeenCalledTimes(2));
  });

  it("returns a retryable failure and resumes only generation after the Planner decision was saved", async () => {
    const storedEvent = {
      type: "choice_event",
      version: 1,
      choiceEventId: "modal-generation-retry",
      choiceSetId: "post_activity:plan:array-forge",
      childId: "demo-pashley",
      homeworkId: "hw-math",
      nodeId: "array-forge",
      context: "homework_required",
      domain: "math",
      shownOptions: routeChoicePayload.shownOptions,
      skippedOptionIds: [],
      source: "child_choice",
      eventName: "activity_completed",
      completed: true,
      postActivityAction: "back_to_map",
      createdAt: "2026-08-07T12:00:00.000Z",
    } as const;
    mockedFindChoiceEventById.mockReturnValue(storedEvent as never);
    mockedGetLearningCycle.mockReturnValue({
      childId: "demo-pashley",
      homeworkId: "hw-math",
      lifecycle: "quest_generating",
      revision: 4,
      nodes: [{ nodeId: "array-forge", state: "completed" }],
      sessionFinalizations: [{ choiceEventId: "modal-generation-retry", nodeId: "array-forge" }],
      pendingSessionNodeIds: [],
    } as never);
    vi.mocked(advanceCanonicalCycleFromEvidence).mockResolvedValue({
      childId: "demo-pashley", homeworkId: "hw-math", lifecycle: "quest_generating", revision: 4,
    } as never);
    vi.mocked(generateCanonicalProgressionArtifact)
      .mockRejectedValueOnce(new Error("builder provider unavailable"))
      .mockResolvedValueOnce({
        childId: "demo-pashley", homeworkId: "hw-math", lifecycle: "quest_ready", revision: 5,
      } as never);

    const first = await postChoiceEvent(storedEvent);
    expect(first.status).toBe(500);
    const second = await postChoiceEvent(storedEvent);
    expect(second.status).toBe(200);
    expect(advanceCanonicalCycleFromEvidence).not.toHaveBeenCalled();
    expect(generateCanonicalProgressionArtifact).toHaveBeenCalledTimes(2);
  });

  it("blocks every canonical learning write when the server runtime is as-child", async () => {
    process.env.SUNNY_MODE = "as-child";

    const choice = await postChoiceEvent(routeChoicePayload);
    const completion = await postNodeCompletion();

    expect(choice.status).toBe(200);
    expect(choice.body).toMatchObject({ ok: true, skippedPersistence: true });
    expect(completion.status).toBe(200);
    expect(completion.body).toMatchObject({ skippedPersistence: true });
    expect(mockedTransitionLearningCycle).not.toHaveBeenCalled();
    expect(recordCanonicalNodeCompletion).not.toHaveBeenCalled();
    expect(mockedInterpretOutcome).not.toHaveBeenCalled();
  });
});
