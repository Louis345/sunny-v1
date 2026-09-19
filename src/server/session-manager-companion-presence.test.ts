import { describe, expect, it, vi } from "vitest";
import { SessionManager } from "./session-manager";

type PresenceHarness = {
  companionPresence: "collapsed" | "summoned";
  companionDispositionAfterSpeech: "standby_after_speech" | "await_child_response";
  companionInteractionMode: "activity_help" | "conversation";
  send: ReturnType<typeof vi.fn>;
  setCompanionPresence: SessionManager["setCompanionPresence"];
  resetCompanionDispositionAfterSpeech: SessionManager["resetCompanionDispositionAfterSpeech"];
  applyCompanionDispositionAfterSpeech: SessionManager["applyCompanionDispositionAfterSpeech"];
  requestInstructionReadAloud: SessionManager["requestInstructionReadAloud"];
  lastInstructionReadRequestKey: string | null;
  recordGameTrace: ReturnType<typeof vi.fn>;
  runCompanionResponse: ReturnType<typeof vi.fn>;
  handleCompanionTurn: ReturnType<typeof vi.fn>;
  turnSM: { getState: ReturnType<typeof vi.fn> };
  bargeIn: ReturnType<typeof vi.fn>;
};

function presenceHarness(): PresenceHarness {
  const session = Object.create(SessionManager.prototype) as PresenceHarness;
  session.companionPresence = "collapsed";
  session.companionDispositionAfterSpeech = "standby_after_speech";
  session.companionInteractionMode = "activity_help";
  session.send = vi.fn();
  session.lastInstructionReadRequestKey = null;
  session.recordGameTrace = vi.fn();
  session.runCompanionResponse = vi.fn().mockResolvedValue(undefined);
  session.handleCompanionTurn = vi.fn().mockResolvedValue(undefined);
  session.turnSM = { getState: vi.fn(() => "IDLE") };
  session.bargeIn = vi.fn();
  return session;
}

describe("SessionManager companion presence", () => {
  it("keeps a child-started conversation open until explicit dismissal", () => {
    const session = presenceHarness();

    session.setCompanionPresence("summoned", "voice");
    session.resetCompanionDispositionAfterSpeech();
    session.applyCompanionDispositionAfterSpeech();

    expect(session.send).not.toHaveBeenCalledWith(
      "companion_presence",
      expect.objectContaining({ state: "collapsed" }),
    );
  });

  it("returns one-shot read help to standby unless Elli explicitly awaits an answer", () => {
    const session = presenceHarness();

    session.setCompanionPresence("summoned", "read_instruction");
    session.resetCompanionDispositionAfterSpeech();
    session.applyCompanionDispositionAfterSpeech();

    expect(session.send).toHaveBeenLastCalledWith("companion_presence", {
      state: "collapsed",
      reason: "voice",
    });
  });

  it("uses Elli's live reasoning turn for activity support and clears stale pause disposition", async () => {
    const session = presenceHarness();
    session.companionDispositionAfterSpeech = "await_child_response";

    await session.requestInstructionReadAloud({
      nodeId: "clock-room",
      activityId: "clock-room",
      itemId: "clock-2",
      prompt: "Which hand shows the minutes?",
      requestCount: 1,
      answerVisibility: "hidden",
      measurementRole: "instruction",
      trigger: "guided_prompt",
    });

    expect(session.runCompanionResponse).toHaveBeenCalledOnce();
    expect(session.runCompanionResponse).toHaveBeenCalledWith(
      expect.stringMatching(/Which hand shows the minutes\?[\s\S]*do not reveal/i),
    );
    expect(session.handleCompanionTurn).not.toHaveBeenCalled();
    expect(session.companionDispositionAfterSpeech).toBe("standby_after_speech");
    expect(session.recordGameTrace).toHaveBeenCalledWith(expect.objectContaining({
      type: "instructional_companion_support",
      itemId: "clock-2",
      masteryEligible: false,
    }));
  });

  it("returns a one-shot activity to play even when Elli's provider turn fails", async () => {
    const session = presenceHarness();
    session.runCompanionResponse.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(session.requestInstructionReadAloud({
      nodeId: "clock-room",
      activityId: "clock-room",
      itemId: "clock-2",
      prompt: "Which hand shows the minutes?",
      requestCount: 1,
      answerVisibility: "hidden",
      measurementRole: "instruction",
      trigger: "guided_prompt",
    })).rejects.toThrow("provider unavailable");

    expect(session.send).toHaveBeenLastCalledWith("companion_presence", {
      state: "collapsed",
      reason: "voice",
    });
  });

  it("does not collapse a newer child-started conversation after one-shot support finishes", async () => {
    const session = presenceHarness();
    session.runCompanionResponse.mockImplementationOnce(async () => {
      session.setCompanionPresence("summoned", "voice");
      throw new Error("old support failed after a new conversation started");
    });

    await expect(session.requestInstructionReadAloud({
      nodeId: "clock-room",
      activityId: "clock-room",
      itemId: "clock-2",
      prompt: "Which hand shows the minutes?",
      requestCount: 1,
      answerVisibility: "hidden",
      measurementRole: "instruction",
      trigger: "guided_prompt",
    })).rejects.toThrow("old support failed");

    expect(session.companionInteractionMode).toBe("conversation");
    expect(session.send).not.toHaveBeenLastCalledWith("companion_presence", {
      state: "collapsed",
      reason: "voice",
    });
  });
});
