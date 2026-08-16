import { describe, expect, it, vi } from "vitest";
import {
  resolveActivityFriction,
  verifyActivityFrictionProvenance,
  type ActivityFrictionResolutionContext,
} from "./activityFrictionResolution";

function context(overrides: Partial<ActivityFrictionResolutionContext> = {}): ActivityFrictionResolutionContext {
  return {
    childId: "lab-reina",
    companionId: "elli",
    sessionId: "session-1",
    homeworkId: "hw-lantern",
    nodeId: "ACT-SHARED-01",
    itemId: "lantern-factors-2",
    artifactHash: "artifact-hash",
    attemptId: "attempt-27",
    device: "desktop-keyboard",
    answerVisibility: "hidden",
    companionPresence: "summoned",
    runtimeMode: "real",
    frictionSignal: "response_rejected_by_activity_instrument",
    provenanceAuthority: "server_verified",
    ...overrides,
  };
}

describe("Elli activity-friction resolution", () => {
  it("replaces iframe provenance with the canonical active-cycle binding", () => {
    const result = verifyActivityFrictionProvenance({
      childId: "lab-reina",
      sessionId: "session-1",
      snapshot: {
        homeworkId: "hw-lantern",
        nodeId: "ACT-SHARED-01",
        itemId: "lantern-factors-2",
        artifactHash: "artifact-hash",
        latestAttemptId: "attempt-27",
        device: "desktop-keyboard",
        answerVisibility: "hidden",
        frictionSignal: "response_rejected_by_activity_instrument",
      },
      cycle: {
        homeworkId: "hw-lantern",
        domain: "math",
        nodes: [{
          nodeId: "ACT-SHARED-01",
          artifactBinding: {
            contractFingerprint: "contract-hash",
            creativeProvenance: { designArtifactHash: "artifact-hash" },
          },
        }],
      },
    });

    expect(result).toMatchObject({
      homeworkId: "hw-lantern",
      nodeId: "ACT-SHARED-01",
      artifactHash: "artifact-hash",
      provenanceAuthority: "server_verified",
    });

    expect(() => verifyActivityFrictionProvenance({
      childId: "lab-reina",
      sessionId: "session-1",
      snapshot: {
        homeworkId: "hw-other",
        nodeId: "ACT-SHARED-01",
        itemId: "lantern-factors-2",
        artifactHash: "artifact-hash",
        latestAttemptId: "attempt-27",
        device: "desktop-keyboard",
        answerVisibility: "hidden",
        frictionSignal: "response_rejected_by_activity_instrument",
      },
      cycle: {
        homeworkId: "hw-lantern",
        domain: "math",
        nodes: [],
      },
    })).toThrow("activity_friction_homework_binding_mismatch");
  });

  it("requires summoned Elli and complete server provenance", async () => {
    const send = vi.fn();
    await expect(resolveActivityFriction({
      context: context({ companionPresence: "collapsed" }),
      decision: {
        likelyCause: "response_mode",
        confidence: 0.82,
        action: "advance_current_item",
        rationale: "The response expressed the relationship but the text scorer rejected its wording.",
      },
      alreadyAdvanced: false,
    }, { sendAndConfirm: send, persist: vi.fn() })).rejects.toThrow("activity_friction_requires_summoned_companion");

    await expect(resolveActivityFriction({
      context: context({ artifactHash: "" }),
      decision: {
        likelyCause: "unknown",
        confidence: 0.4,
        action: "clarify",
        rationale: "More context is needed.",
      },
      alreadyAdvanced: false,
    }, { sendAndConfirm: send, persist: vi.fn() })).rejects.toThrow("activity_friction_missing_provenance:artifactHash");

    await expect(resolveActivityFriction({
      context: context({ frictionSignal: "" }),
      decision: {
        likelyCause: "unknown",
        confidence: 0.4,
        action: "clarify",
        rationale: "More context is needed.",
      },
      alreadyAdvanced: false,
    }, { sendAndConfirm: send, persist: vi.fn() })).rejects.toThrow("activity_friction_signal_required");

    await expect(resolveActivityFriction({
      context: context({ provenanceAuthority: "client_reported" as "server_verified" }),
      decision: {
        likelyCause: "unknown",
        confidence: 0.4,
        action: "clarify",
        rationale: "More context is needed.",
      },
      alreadyAdvanced: false,
    }, { sendAndConfirm: send, persist: vi.fn() })).rejects.toThrow("activity_friction_provenance_unverified");
    expect(send).not.toHaveBeenCalled();
  });

  it("advances exactly once without claiming correctness or mastery", async () => {
    const persist = vi.fn();
    const order: string[] = [];
    const sendAndConfirm = vi.fn(async () => { order.push("acknowledged"); });
    persist.mockImplementation(async () => { order.push("persisted"); });
    const decision = {
      likelyCause: "scoring_disagreement" as const,
      confidence: 0.86,
      action: "advance_current_item" as const,
      rationale: "The answer is meaningful but the response instrument cannot score it reliably.",
    };

    const result = await resolveActivityFriction({
      context: context(), decision, alreadyAdvanced: false,
    }, { sendAndConfirm, persist });

    expect(result).toMatchObject({ advanced: true, masteryEligible: false });
    expect(sendAndConfirm).toHaveBeenCalledOnce();
    expect(sendAndConfirm).toHaveBeenCalledWith(expect.objectContaining({
      type: "sunny_activity_resolution",
      action: "advance_current_item",
      nodeId: "ACT-SHARED-01",
      itemId: "lantern-factors-2",
    }));
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      observedErrorType: "instrument_ambiguous",
      assistance: "assisted",
      masteryEligible: false,
      correct: undefined,
    }));
    expect(order).toEqual(["persisted", "acknowledged"]);

    await expect(resolveActivityFriction({
      context: context(), decision, alreadyAdvanced: true,
    }, { sendAndConfirm, persist })).rejects.toThrow("activity_friction_already_advanced");
    expect(sendAndConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not misclassify conceptual uncertainty as an instrument defect", async () => {
    const persist = vi.fn();
    await resolveActivityFriction({
      context: context(),
      decision: {
        likelyCause: "conceptual",
        confidence: 0.75,
        action: "advance_current_item",
        rationale: "The child is not yet distinguishing the factor meanings.",
      },
      alreadyAdvanced: false,
    }, { sendAndConfirm: vi.fn(async () => undefined), persist });

    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      observedErrorType: "conceptual_uncertainty",
    }));
  });

  it("keeps clarification conversational so it does not consume the one advancement", async () => {
    const persist = vi.fn();
    const sendAndConfirm = vi.fn();
    const result = await resolveActivityFriction({
      context: context(),
      decision: {
        likelyCause: "prompt_ambiguity",
        confidence: 0.6,
        action: "clarify",
        rationale: "A shorter restatement may resolve the confusion.",
      },
      alreadyAdvanced: false,
    }, { sendAndConfirm, persist });

    expect(result).toMatchObject({ advanced: false, persisted: false });
    expect(persist).not.toHaveBeenCalled();
    expect(sendAndConfirm).not.toHaveBeenCalled();
  });

  it("lets preview exercise the command while writing nothing", async () => {
    const send = vi.fn();
    const persist = vi.fn();
    const result = await resolveActivityFriction({
      context: context({ runtimeMode: "preview" }),
      decision: {
        likelyCause: "prompt_ambiguity",
        confidence: 0.7,
        action: "advance_current_item",
        rationale: "The prompt demanded a wording distinction the child could not infer.",
      },
      alreadyAdvanced: false,
    }, { sendAndConfirm: send, persist });

    expect(result).toMatchObject({ advanced: true, persisted: false });
    expect(send).toHaveBeenCalledOnce();
    expect(persist).not.toHaveBeenCalled();
  });
});
