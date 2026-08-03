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
};

function presenceHarness(): PresenceHarness {
  const session = Object.create(SessionManager.prototype) as PresenceHarness;
  session.companionPresence = "collapsed";
  session.companionDispositionAfterSpeech = "standby_after_speech";
  session.companionInteractionMode = "activity_help";
  session.send = vi.fn();
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
});
