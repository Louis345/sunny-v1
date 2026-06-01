import { describe, expect, it } from "vitest";
import {
  ACTIVITY_EVIDENCE_EVENT_TYPE,
  createActivityEvidenceEvent,
  isActivityEvidenceEvent,
} from "../shared/activityEvidence";

const baseContext = {
  activityId: "word-radar",
  childId: "reina",
  sessionId: "session-1",
  planId: "plan-1",
  nodeId: "node-1",
  targetLane: "silent_letters",
};

describe("activityEvidence", () => {
  it("builds canonical activity evidence events with stable context", () => {
    const event = createActivityEvidenceEvent("target_presented", baseContext, {
      target: "knock",
      itemIndex: 0,
      visibleState: {
        wordVisible: false,
        slotsVisible: true,
        scaffold: "partial_visual_recall",
      },
    });

    expect(event).toMatchObject({
      type: ACTIVITY_EVIDENCE_EVENT_TYPE,
      eventName: "target_presented",
      activityId: "word-radar",
      childId: "reina",
      sessionId: "session-1",
      planId: "plan-1",
      nodeId: "node-1",
      targetLane: "silent_letters",
      target: "knock",
      itemIndex: 0,
      visibleState: {
        wordVisible: false,
        slotsVisible: true,
        scaffold: "partial_visual_recall",
      },
    });
    expect(event.ts).toEqual(expect.any(String));
    expect(isActivityEvidenceEvent(event)).toBe(true);
  });

  it("rejects events missing canonical identity fields", () => {
    expect(() =>
      createActivityEvidenceEvent(
        "attempt_recorded",
        { ...baseContext, activityId: "" },
        { target: "knock", correct: true },
      ),
    ).toThrow(/activityId/);
    expect(() =>
      createActivityEvidenceEvent("attempt_recorded", baseContext, {
        target: "",
        correct: true,
      }),
    ).toThrow(/target/);
  });
});
