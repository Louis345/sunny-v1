import { describe, expect, it } from "vitest";
import { callCompanionIndex } from "../utils/callCompanion";

// Seen 2026-11-08: Ila's earned call greeted her as Matilda (Reina's companion). The call address named the
// child but not her companion, so the call opened on the first companion in the list.
describe("the earned call opens on her own companion", () => {
  const entries = [{ id: "matilda" }, { id: "elli" }];
  it("picks the companion the call address names", () => {
    expect(callCompanionIndex(entries, "?child=ila&callSource=game_reward&companion=elli")).toBe(1);
    expect(callCompanionIndex(entries, "?child=reina&companion=matilda")).toBe(0);
  });
  it("keeps the first companion when none or an unknown one is named", () => {
    expect(callCompanionIndex(entries, "?child=ila")).toBe(0);
    expect(callCompanionIndex(entries, "?companion=zorro")).toBe(0);
  });
});

// Owner 2026-11-08: the call is the reward for finishing a board. It is offered at the end of a completed board
// and during the next-board wait, and does not carry over once the next board is up.
import { offerableCallTicket } from "../utils/callCompanion";
describe("the earned call does not carry over", () => {
  const tickets = [
    { homeworkId: "hw", earnedAt: "2026-11-08T19:30:00Z" },
    { homeworkId: "hw", earnedAt: "2026-11-08T20:02:00Z", openedAt: "2026-11-08T20:02:10Z" },
    { homeworkId: "hw", earnedAt: "2026-11-08T21:00:00Z" },
  ];
  it("offers the call earned on the board she just finished, while the next one builds", () => {
    expect(offerableCallTicket(tickets, "hw", "2026-11-08T20:30:00Z")?.earnedAt).toBe("2026-11-08T21:00:00Z");
  });
  it("offers nothing once the next board is published", () => {
    expect(offerableCallTicket(tickets, "hw", "2026-11-08T21:05:00Z")).toBeUndefined();
  });
  it("never offers a call earned on an earlier board", () => {
    expect(offerableCallTicket(tickets.slice(0, 1), "hw", "2026-11-08T20:00:00Z")).toBeUndefined();
  });
});
