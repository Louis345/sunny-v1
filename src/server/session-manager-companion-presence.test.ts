import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./urgentLearningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./urgentLearningSupport")>();
  return {
    ...actual,
    recordActivityCompanionHelp: vi.fn(() => "support:session-1:N1:item-1:1"),
    markActivityCompanionHelpResumed: vi.fn(() => true),
  };
});

import { SessionManager } from "./session-manager";
import {
  markActivityCompanionHelpResumed,
  recordActivityCompanionHelp,
} from "./urgentLearningSupport";

type PresenceHarness = {
  companionPresence: "collapsed" | "summoned";
  companionDispositionAfterSpeech: "standby_after_speech" | "await_child_response";
  companionInteractionMode: "activity_help" | "conversation";
  send: ReturnType<typeof vi.fn>;
  setCompanionPresence: SessionManager["setCompanionPresence"];
  resetCompanionDispositionAfterSpeech: SessionManager["resetCompanionDispositionAfterSpeech"];
  applyCompanionDispositionAfterSpeech: SessionManager["applyCompanionDispositionAfterSpeech"];
};

type CompanionSupportHarness = {
  currentBoardSnapshot: Record<string, unknown>;
  pendingCompanionSupportEvidenceId: string | null;
  companionPresence?: "collapsed" | "summoned";
  companion?: { name: string };
  chartChildId: string;
  recordCompanionHelpTurn: (
    childText: string,
    assistantText: string,
  ) => void;
  markPendingCompanionSupportResumed: (input: {
    nodeId?: string;
    itemId?: string;
    resumedIndependently: boolean;
  }) => void;
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("retains one pending support observation until the child resumes the same activity", () => {
    const session = Object.create(
      SessionManager.prototype,
    ) as unknown as CompanionSupportHarness;
    session.currentBoardSnapshot = {
      homeworkId: "hw-math-1",
      sessionId: "session-1",
      nodeId: "N1",
      itemId: "item-1",
      artifactHash: "artifact-hash-1",
    };
    session.pendingCompanionSupportEvidenceId = null;
    session.companionPresence = "summoned";
    session.companion = { name: "Elli" };
    Object.defineProperty(session, "chartChildId", { value: "reina" });

    session.recordCompanionHelpTurn(
      "Can you explain this?",
      "Compare the size of one equal part.",
    );

    expect(recordActivityCompanionHelp).toHaveBeenCalled();
    expect(session.pendingCompanionSupportEvidenceId).toBe(
      "support:session-1:N1:item-1:1",
    );

    session.markPendingCompanionSupportResumed({
      nodeId: "N1",
      itemId: "item-1",
      resumedIndependently: true,
    });

    expect(markActivityCompanionHelpResumed).toHaveBeenCalledWith({
      childId: "reina",
      homeworkId: "hw-math-1",
      evidenceId: "support:session-1:N1:item-1:1",
      resumedIndependently: true,
    });
    expect(session.pendingCompanionSupportEvidenceId).toBeNull();
  });

  it("does not close pending support from an attempt in a different node", () => {
    const session = Object.create(
      SessionManager.prototype,
    ) as unknown as CompanionSupportHarness;
    session.currentBoardSnapshot = {
      homeworkId: "hw-math-1",
      nodeId: "N1",
      itemId: "item-1",
    };
    session.pendingCompanionSupportEvidenceId = "support:session-1:N1:item-1:1";
    Object.defineProperty(session, "chartChildId", { value: "reina" });

    session.markPendingCompanionSupportResumed({
      nodeId: "N2",
      itemId: "item-2",
      resumedIndependently: true,
    });

    expect(markActivityCompanionHelpResumed).not.toHaveBeenCalled();
    expect(session.pendingCompanionSupportEvidenceId).toBe(
      "support:session-1:N1:item-1:1",
    );
  });
});
