import { describe, expect, it } from "vitest";
import {
  deliverInteractiveCompanionOpening,
  INDEPENDENT_EVALUATION_OPENING,
  buildContextStartGreeting,
  shouldEnableCompanionWakeGate,
  isIndependentEvaluationPlan,
  shouldActivateSpellingSession,
  assertHomeworkSessionAssignment,
} from "./session-bootstrap";

describe("homework context greeting", () => {
  it("gives an automatic board arrival a brief social purpose without scripting Elli's words", async () => {
    // Human catch: a single mount turn became a greeting, level display and
    // activity pitch. Healthy audio logs did not identify unwanted initiation;
    // earlier labs checked contextual accuracy but not the purpose of the turn.
    const greeting = buildContextStartGreeting({
      nodes: [{ locked: false, targetLane: "silent_letters" }],
    });
    const spokenContexts: string[] = [];
    await deliverInteractiveCompanionOpening({
      setCompanionPresence: () => {},
      runCompanionResponse: async (context: string) => { spokenContexts.push(context); },
    }, greeting);

    expect(spokenContexts).toHaveLength(1);
    expect(spokenContexts[0]).toContain("A brief hello is enough");
    expect(spokenContexts[0]).toContain("choose what to do next");
    expect(spokenContexts[0]).toContain("Silent Letters");
    expect(spokenContexts[0]).not.toMatch(/say ["“]|sentence limit|word limit/i);
  });

  it("supplies evaluation orientation facts without prescribing spoken wording", () => {
    expect(INDEPENDENT_EVALUATION_OPENING).toContain("Tap the speaker");
    expect(INDEPENDENT_EVALUATION_OPENING).toContain("Not sure");
    expect(INDEPENDENT_EVALUATION_OPENING).toContain("[Session opening context]");
  });
  it("speaks one answer-neutral orientation without summoning an independent-evaluation companion",async()=>{
    // Human catch: the audio stack was healthy, but the wake gate made the
    // opening completely silent, which looked exactly like another voice bug.
    const events:string[]=[];
    await deliverInteractiveCompanionOpening(
      {companionWakeGateEnabled:true,setCompanionPresence:()=>events.push("summoned"),runCompanionResponse:async(text:string)=>{events.push(`spoke:${text}`);}},
      "Give one warm direction without saying or spelling a target word.",
      { independentEvaluationOrientation: true },
    );
    expect(events).toEqual(["spoke:Give one warm direction without saying or spelling a target word."]);
  });
  it("opens conversational presence before delivering a companion-initiated greeting", async () => {
    const events: string[] = [];
    const session = {
      setCompanionPresence: (state: string, reason: string) => {
        events.push(`presence:${state}:${reason}`);
      },
      runCompanionResponse: async (text: string) => {
        events.push(`speech:${text}`);
      },
    };

    await deliverInteractiveCompanionOpening(session, "Want to try it?");

    expect(events).toEqual([
      "presence:summoned:voice",
      "speech:Want to try it?",
    ]);
  });

  it("supplies live homework facts rather than a spoken greeting", () => {
    const greeting = buildContextStartGreeting({
      nodes: [{ locked: false, targetLane: "multiplication_fluency", words: ["5 x 2"] }],
    });
    expect(greeting).toContain("Multiplication Fluency");
    expect(greeting).toContain("[Session opening context]");
    expect(greeting).not.toContain("Want to try it?");
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

  it("keeps a sparse board arrival factual with the same brief social purpose", () => {
    const greeting = buildContextStartGreeting({ nodes: [{ locked: false }] });
    expect(greeting).toContain("The board is available; no activity has been selected.");
    expect(greeting).toContain("A brief hello is enough");
  });
});

describe("homework subject mode", () => {
  it("refuses to bootstrap a different pending assignment after launch validation", () => {
    expect(() => assertHomeworkSessionAssignment({
      expectedHomeworkId: "hw-current",
      pendingHomeworkId: "hw-stale",
      activeHomeworkId: "hw-current",
      cycleHomeworkId: "hw-current",
    })).toThrow("homework_session_assignment_changed");

    expect(() => assertHomeworkSessionAssignment({
      expectedHomeworkId: "hw-current",
      pendingHomeworkId: "hw-current",
      activeHomeworkId: "hw-current",
      cycleHomeworkId: "hw-current",
    })).not.toThrow();
  });

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
    expect(isIndependentEvaluationPlan("probe-board:hw-math-1:cycle-r2")).toBe(true);
    expect(isIndependentEvaluationPlan("discovery:hw-spelling-1")).toBe(true);
    expect(isIndependentEvaluationPlan("targeted:hw-math-1")).toBe(false);
    // Human-caught 2026-10-07: after Discovery built a teaching board, stale
    // pending Discovery nodes caused the evaluation opener to play again. The
    // lab checked each source independently but never tested their conflict.
    expect(isIndependentEvaluationPlan("targeted:hw-spelling-1", [
      { targetLane: "independent_discovery" },
    ])).toBe(false);
    expect(isIndependentEvaluationPlan(undefined, [
      { targetLane: "independent_discovery" },
    ])).toBe(true);
    expect(shouldEnableCompanionWakeGate({ subject: "homework", explicitDomain: "spelling", discovery: true })).toBe(true);
    expect(shouldEnableCompanionWakeGate({
      subject: "homework",
      homeworkId: "hw-math-7ead7e33",
      explicitDomain: "math",
    })).toBe(true);
    // Human catch: ordinary room speech became Elli turns during Ila's live spelling
    // evaluation. The lab missed it because direct spelling sessions were explicitly
    // exempted from the wake gate and browser acceptance used silent, serialized audio.
    expect(shouldEnableCompanionWakeGate({
      subject: "spelling",
      homeworkId: "hw-spelling-1",
      explicitDomain: "spelling",
    })).toBe(true);
  });
});
