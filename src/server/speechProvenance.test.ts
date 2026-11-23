import { afterEach, describe, expect, it, vi } from "vitest";
import { speechProvenance } from "./urgentLearningSupport";
import { persistUrgentLearningEvidence } from "./urgentLearningRuntime";

// Human-caught 11/23 (~02:20-02:23 UTC, Ila's math board 12): the parents' conversation by the kiosk ("…ice cream
// book. Uh-huh. … Uh-huh.") was saved three times as Ila's help_needed signal, confidence 0.9. Seen in Saori's log: her
// own turns that night had a median of 9 words; these were 133, 456 and 456 words with 7-12 back-channels ("Uh-huh"), and
// each later one repeated the earlier text (the pending transcript grew across barge-ins). Why the human caught it: the
// owner read her record. Why the logs did not: each was logged as an ordinary "[child-signal] [recorded]". Why the lab
// missed it: every lab transcript is one short child turn. Code owns provenance: speech that is not plausibly her turn
// is never her evidence; her turn still gets its reply.
const PARENTS = "But they strip out the ice cream book. Uh-huh. And then she gets so excited to keep going. Uh-huh. Because she likes ice cream. Uh-huh. So the whole point is she talks to the pain. Yeah. And then he says, hey.";

afterEach(() => vi.restoreAllMocks());

describe("speech provenance: only plausibly her own turn becomes her evidence", () => {
  it("a short child turn is hers; a room conversation with back-channels is not attributed", () => {
    expect(speechProvenance("I don't understand the concept.")).toMatchObject({ herTurn: true });
    expect(speechProvenance("Can you help me? I don't get it.")).toMatchObject({ herTurn: true });
    expect(speechProvenance(PARENTS)).toMatchObject({ herTurn: false, reason: "back_channels" });
    expect(speechProvenance(Array(90).fill("word").join(" "))).toMatchObject({ herTurn: false, reason: "too_long_for_one_turn" });
  });

  it("the 11/23 room talk is logged as unattributed, never saved as her help request, and a grown repeat is not saved twice", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const saved: unknown[] = [];
    const record = async (row: unknown) => { saved.push(row); return {}; };
    const base = { intent: { type: "help_request" } as never, context: { childId: "ila", activityId: "kappa_s-check-hop", nodeId: "n" } as never, sessionId: "s1", hostRecordChildSignal: record, hostRecordProductIssue: record };
    await persistUrgentLearningEvidence({ ...base, transcript: PARENTS });
    expect(saved).toEqual([]);
    expect(log.mock.calls.flat().join("\n")).toMatch(/🎮 \[child-signal\] \[unattributed\] \[not-saved\] reason=back_channels words=\d+ activity=kappa_s-check-hop/);
    await persistUrgentLearningEvidence({ ...base, transcript: "Can you help me?" });
    await persistUrgentLearningEvidence({ ...base, transcript: "Can you help me? Can you help me?" });
    expect(saved).toHaveLength(1);
    // A bug reported in a room conversation (11/23 01:55, "it showed me the answer") stays a product fact, as observed.
    await persistUrgentLearningEvidence({ ...base, intent: { type: "bug_report" } as never, transcript: `It showed me the answer. Uh-huh. ${PARENTS}` });
    expect(saved.at(-1)).toMatchObject({ source: "observed_behavior", confidence: 0.4 });
    expect(log.mock.calls.flat().join("\n")).toMatch(/\[child-signal\] \[repeat\] \[not-saved\]/);
  });
});
