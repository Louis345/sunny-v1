import { describe, expect, it } from "vitest";
import { rateSession, type SessionPacket } from "./sessionRating";

// Owner 2026-11-10: "I want to know if this is successful or not." The success criteria
// (docs/audits/2026-11-10-success-criteria.md) were fixed before any fix was built; this rating reads them from the
// session's own facts, so the verdict is the logs', not anyone's opinion. A line that cannot be read fails.
const start = "2026-11-10T12:10:00.000Z";
const at = (min: number) => new Date(Date.parse(start) + min * 60_000).toISOString();

function reinaMorning(): SessionPacket {
  return {
    childId: "reina", domain: "math", sessionId: "s1", startedAt: start, endedAt: at(35),
    traces: [
      { ts: at(0), nodeId: "scout", activityTitle: "Sweater Table Scout", type: "game_state_update", phase: "opening" },
      { ts: at(12.2), nodeId: "scout", type: "attempt_event", target: "p10" },
      { ts: at(13), nodeId: "scout", type: "attempt_event", target: "p11" },
      { ts: at(14), nodeId: "scout", type: "attempt_event", target: "p12" },
      { ts: at(14.1), nodeId: "scout", type: "game_complete" },
    ],
    events: [],
    transcript: [
      { ts: at(27), role: "child", text: "Can you count this as a bug because it says progress could not be saved?" },
      { ts: at(27.1), role: "companion", text: "That's a real glitch, not you. Your answers will count this time." },
    ],
    observations: [],
    evidence: [{ evidenceId: "s1:scout:completion:engagement", summary: "Sweater Table Scout completed in 0ms; won=unreported" }],
    productIssues: Array.from({ length: 10 }, (_, index) => ({ createdAt: at(27 + index * 0.01), source: "child_utterance", issueType: "bug_report", childUtterance: "progress could not be saved" })),
    handoffWritten: true,
    serverLog: [" 🎮 [session] [started] id=s1", " 🎮 [learning-cycle-route] [completion] [failed] Error: learning_board_topology_changed:hw:board:1"],
  };
}

describe("session rating against the pre-registered success criteria", () => {
  it("fails Reina's 11/10 morning on every must-never line", () => {
    const rating = rateSession(reinaMorning());
    const line = (id: string) => rating.lines.find(row => row.id === id)!;
    expect(line("N1")).toMatchObject({ pass: false, value: "3 given, 0 saved" });
    expect(line("N2")).toMatchObject({ pass: false });
    expect(line("N3")).toMatchObject({ pass: false });
    expect(line("N4")).toMatchObject({ pass: false, value: "no startup check line" });
    expect(line("G2")).toMatchObject({ pass: false, value: "10 tickets for 1 sentence" });
    expect(line("G7")).toMatchObject({ pass: false, value: "1 game recorded 0 ms" });
    expect(line("G17")).toMatchObject({ pass: false, value: "12.2 min (Sweater Table Scout)" });
    expect(rating.verdict).toBe("FAIL");
    expect(rating.text).toContain("| N1 |");
  });

  it("passes the must-never lines when every answer is saved, the start check ran and nothing failed", () => {
    const packet = reinaMorning();
    packet.observations = packet.traces.filter(row => row.type === "attempt_event").map((row, index) => ({ observedAt: row.ts!, itemId: String(row.target), childResponse: "1", result: { correct: index > 0 }, assistance: { status: "unassisted" }, provenance: "practice" }));
    packet.transcript = [{ ts: at(5), role: "companion", text: "Circle the two months first." }];
    packet.productIssues = [];
    packet.evidence = [{ evidenceId: "s1:scout:completion:engagement", summary: "Sweater Table Scout completed in 840000ms; won=true" }];
    packet.serverLog = [" 🎮 [startup-check] [passed] boards=3 save=ok", "session s1"];
    const rating = rateSession(packet);
    for (const id of ["N1", "N2", "N3", "N4", "G7"]) expect(rating.lines.find(row => row.id === id)!.pass, id).toBe(true);
  });

  it("fails a line it cannot measure yet, never passes it by default", () => {
    const rating = rateSession(reinaMorning());
    expect(rating.lines.find(row => row.id === "G20")).toMatchObject({ pass: false, value: expect.stringContaining("not measurable") });
  });

  // Found on the first real run (11/10): Ila was charged with Reina's failures from a log that did not cover her
  // session; Reina "passed" honest counts because nothing was saved; and games are keyed by their launch token.
  it("reads the server log only when it covers this session, and judges counts only on saved answers", () => {
    const ila = { ...reinaMorning(), childId: "ila", sessionId: "ila-session", transcript: [{ ts: at(3), role: "child" as const, text: "Is this a bug?" }] };
    expect(rateSession(ila).lines.find(row => row.id === "N2")).toMatchObject({ pass: true });
    const reina = rateSession(reinaMorning());
    expect(reina.lines.find(row => row.id === "G5")).toMatchObject({ pass: false, value: expect.stringContaining("not measurable") });
    const played = { ...reinaMorning(), traces: [...reinaMorning().traces.map(row => ({ ...row, launchToken: "play-1" }))], evidence: [{ evidenceId: "play-1:scout:completion:engagement", summary: "Scout completed in 0ms" }] };
    expect(rateSession(played).lines.find(row => row.id === "G7")).toMatchObject({ value: "1 game recorded 0 ms" });
  });

  it("counts a letter-tap fragment like \"ornm\" for ornament", () => {
    const packet = reinaMorning();
    packet.traces = [{ ts: at(1), nodeId: "stampede", type: "attempt_event" }];
    packet.observations = [{ observedAt: at(1), itemId: "w1", word: "ornament", childResponse: "ornm", result: { correct: false }, assistance: { status: "unknown" }, provenance: "practice" }];
    expect(rateSession(packet).lines.find(row => row.id === "G8")).toMatchObject({ pass: false, value: "1 fragment" });
  });
});
