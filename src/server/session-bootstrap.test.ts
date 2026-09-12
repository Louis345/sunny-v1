import { describe, expect, it } from "vitest";
import {
  deliverInteractiveCompanionOpening,
  buildContextStartGreeting,
  shouldEnableCompanionWakeGate,
  shouldActivateSpellingSession,
} from "./session-bootstrap";

describe("homework context greeting", () => {
  it("never summons a child-invoked math companion to deliver an opening",async()=>{
    const events:string[]=[];
    await deliverInteractiveCompanionOpening({companionWakeGateEnabled:true,setCompanionPresence:()=>events.push("summoned"),handleCompanionTurn:async()=>{events.push("spoke");}},"Stale Discovery greeting");
    expect(events).toEqual([]);
  });
  it("opens conversational presence before delivering a companion-initiated greeting", async () => {
    const events: string[] = [];
    const session = {
      setCompanionPresence: (state: string, reason: string) => {
        events.push(`presence:${state}:${reason}`);
      },
      handleCompanionTurn: async (text: string) => {
        events.push(`speech:${text}`);
      },
    };

    await deliverInteractiveCompanionOpening(session, "Want to try it?");

    expect(events).toEqual([
      "presence:summoned:voice",
      "speech:Want to try it?",
    ]);
  });

  it("uses live homework context and stays concise", () => {
    const greeting = buildContextStartGreeting({
      nodes: [{ locked: false, targetLane: "multiplication_fluency", words: ["5 x 2"] }],
    });
    expect(greeting).toContain("Multiplication Fluency");
    expect(greeting.split(/\s+/).length).toBeLessThanOrEqual(12);
  });

  it("uses the canonical active board after reload instead of stale pending Discovery", () => {
    const greeting = buildContextStartGreeting({
      pendingHomework: {
        homeworkId: "hw-spelling",
        nodes: [{ id: "discovery", locked: false, targetLane: "independent_discovery" }],
      },
      activeSessionPlan: {
        activeHomeworkId: "hw-spelling",
        nodePlan: [
          { id: "silent-practice", locked: false, targetLane: "silent_letters", targets: ["sign"] },
        ],
        adventureBoard: { progress: { completedNodeIds: ["start", "discovery"] } },
      },
    });
    expect(greeting).toContain("Silent Letters");
    expect(greeting).not.toContain("Independent Discovery");
  });

  it("does not combine an active board with a different pending assignment", () => {
    const greeting = buildContextStartGreeting({
      pendingHomework: {
        homeworkId: "hw-spelling-old",
        nodes: [{ id: "discovery", locked: false, targetLane: "independent_discovery" }],
      },
      activeSessionPlan: {
        activeHomeworkId: "hw-spelling-new",
        nodePlan: [
          { id: "silent-practice", locked: false, targetLane: "silent_letters", targets: ["sign"] },
        ],
      },
    });
    expect(greeting).toContain("Independent Discovery");
    expect(greeting).not.toContain("Silent Letters");
  });

  it("falls back to the first challenge when context is sparse", () => {
    expect(buildContextStartGreeting({ nodes: [{ locked: false }] })).toBe(
      "Your first challenge is ready. Want to try it?",
    );
  });
});

describe("homework subject mode", () => {
  it("does not label a generic math homework session as spelling", () => {
    expect(shouldActivateSpellingSession({
      subject: "homework",
      wordList: [],
    })).toBe(false);
    expect(shouldActivateSpellingSession({
      subject: "homework",
      wordList: ["third", "fourth"],
      explicitDomain: "math",
    })).toBe(false);
  });

  it("keeps real spelling homework in spelling mode", () => {
    expect(shouldActivateSpellingSession({
      subject: "spelling",
      wordList: ["because"],
    })).toBe(true);
    expect(shouldActivateSpellingSession({
      subject: "homework",
      wordList: ["because"],
      explicitDomain: "spelling",
    })).toBe(true);
  });

  it("enables wake-only companion routing for direct math before a node opens", () => {
    expect(shouldEnableCompanionWakeGate({ subject: "homework", explicitDomain: "spelling", discovery: true })).toBe(true);
    expect(shouldEnableCompanionWakeGate({
      subject: "homework",
      homeworkId: "hw-math-7ead7e33",
      explicitDomain: "math",
    })).toBe(true);
    expect(shouldEnableCompanionWakeGate({
      subject: "spelling",
      homeworkId: "hw-spelling-1",
      explicitDomain: "spelling",
    })).toBe(false);
  });
});
