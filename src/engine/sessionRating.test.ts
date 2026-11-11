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
    expect(line("N4")).toMatchObject({ pass: false, value: "no startup check for reina before the session" });
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

  // Owner 2026-11-10: the rating should show learning vs play minutes beside the verdict (facts, not a criterion).
  it("shows where the session's minutes went beside the verdict", () => {
    const packet = { ...reinaMorning(), minutes: { learning: 14, play: 3, call: 5, waiting: 6, map: 4, other: 3, unmeasured: 0, total: 35 } };
    expect(rateSession(packet).text).toContain("Time: learning games 14 min, play (Mystery/arcade) 3 min, call 5 min, waiting/loading 6 min, map 4 min");
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

  // The lines the batch fixed must be measurable from Sunny's own records, or they fail by default.
  it("measures the batch's lines from Sunny's records, with vacuous passes named as such", async () => {
    const { measureRecordLines } = await import("./sessionRating");
    const lines = measureRecordLines({ domain: "math", serverFailures: 1, alertsInSession: 1, datedLogForDay: true, testDates: ["2026-11-12"], helpTurnsInGames: 2, helpedSaved: 0,
      playedGames: [{ title: "Gate", answers: 0, savedAnswers: 3 }], decisions: [{ hasOwnRetro: true, hasCalls: true, questionChars: 50_000, tools: ["add_problem"] }],
      gamesWithNotes: 1, playedCount: 2, diagnoses: 0, builtSinceBatch: [{ hasStep: true }], gamesOpened: ["a", "b"], paceLogged: ["a"], newProblems: 1, trackRecordGames: 2 });
    expect(lines.G1).toMatchObject({ pass: true });
    expect(lines.G6).toMatchObject({ pass: false });
    expect(lines.G9).toMatchObject({ pass: false, value: expect.stringContaining("Gate") });
    expect(lines.G11).toMatchObject({ pass: true });
    expect(lines.G14).toMatchObject({ pass: true });
    expect(lines.G15).toMatchObject({ pass: false });
    expect(lines.G19).toMatchObject({ pass: false, value: "pace facts in 1 of 2 games" });
    expect(lines.G20).toMatchObject({ pass: true });
    expect(lines.G21).toMatchObject({ pass: true });
    const quiet = measureRecordLines({ domain: "spelling", serverFailures: 0, alertsInSession: 0, datedLogForDay: false, testDates: [], helpTurnsInGames: 0, helpedSaved: 0, playedGames: [], decisions: [],
      gamesWithNotes: 0, playedCount: 0, diagnoses: 2, builtSinceBatch: [], gamesOpened: [], paceLogged: [], newProblems: 0, trackRecordGames: 0 });
    expect(quiet.G11).toMatchObject({ pass: true, value: expect.stringContaining("no decision") });
    expect(quiet.G3).toMatchObject({ pass: false });
  });
});


// 2026-11-10, rating all 16 of Ila's sessions: every short session where she never played (a reopened screen, a
// FaceTime-only call) failed N4 "no startup check line" and G17 "no game answered". Why the human caught it: the
// must-never verdict said the kiosk opened unchecked on a day it had checked itself once at start. Why logs did not:
// the startup check is logged once per kiosk start, before any session exists, so it never names a session. Why the
// lab missed it: lab packets put the check line and the session id in the same small log, and always played a game.
describe("sessions where she never played", () => {
  const quiet = (serverLog: string[]): SessionPacket => ({ ...reinaMorning(), childId: "ila", sessionId: "ila-quiet", traces: [], observations: [], evidence: [], productIssues: [],
    transcript: [{ ts: at(1), role: "child", text: "Hi Elli!" }], handoffWritten: false, serverLog });

  it("finds the startup check of the kiosk run the session belongs to, even when it does not name the session", () => {
    const log = ["2026-11-10T08:00:00.000Z  🎮 [startup-check] [passed] child=ila homework=hw boards=2", "2026-11-10T08:00:00.000Z  🎮 [startup-check] [passed] child=reina homework=hw boards=1",
      "2026-11-10T11:00:00.000Z  🎮 [session] [started] id=an-earlier-session"];
    expect(rateSession(quiet(log)).lines.find(row => row.id === "N4")).toMatchObject({ pass: true, value: expect.stringContaining("[startup-check] [passed] child=ila") });
    // The latest check for her before the session start decides: a later failed restart before her session fails it.
    const restarted = [...log, "2026-11-10T12:05:00.000Z  🎮 [startup-check] [failed] child=ila problem=board_broken"];
    expect(rateSession(quiet(restarted)).lines.find(row => row.id === "N4")).toMatchObject({ pass: false, value: expect.stringContaining("[failed]") });
    // A check after her session started, or only for her sister, is not hers.
    const after = ["2026-11-10T08:00:00.000Z  🎮 [startup-check] [passed] child=reina boards=1", "2026-11-10T12:30:00.000Z  🎮 [startup-check] [passed] child=ila boards=2"];
    expect(rateSession(quiet(after)).lines.find(row => row.id === "N4")).toMatchObject({ pass: false, value: "no startup check for ila before the session" });
    // Earlier kiosk days count: the kiosk keeps running overnight.
    expect(rateSession({ ...quiet([]), startupLog: ["2026-11-09T07:00:00.000Z  🎮 [startup-check] [passed] child=ila boards=2"] }).lines.find(row => row.id === "N4")).toMatchObject({ pass: true });
  });

  it("marks G17 N/A when no game was opened, and still fails a game opened but never answered", () => {
    const none = rateSession(quiet([]));
    expect(none.lines.find(row => row.id === "G17")).toMatchObject({ value: "no game this session" });
    expect(none.text).toMatch(/\| G17 \|.*\| N\/A \|/);
    const opened = rateSession({ ...quiet([]), traces: [{ ts: at(2), nodeId: "radar", activityTitle: "Word Radar", type: "game_state_update", phase: "opening" }] });
    expect(opened.lines.find(row => row.id === "G17")).toMatchObject({ pass: false, value: "1 game opened, none answered (Word Radar)" });
  });
});
