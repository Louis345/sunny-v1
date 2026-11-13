import fs from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";

// 2026-11-09 Ila (handoff caught it): "Ellie, can you help me?" at 21:02, then the game said "carnivore", which
// barged in and cancelled Elli's answer; she waited two minutes. Logs showed reason=barge_in; the lab tested
// barge-in for child speech, never for the game's own word during a help answer. While her companion answers
// her help request, the game's word waits and plays when the answer ends; nothing is dropped.
it("holds the game's word during a help answer and plays the latest one when the turn ends", async () => {
  const { NarrationGate } = await import("./narrationGate");
  vi.spyOn(console, "log").mockImplementation(() => {});
  const gate = new NarrationGate();
  expect(gate.shouldHold("SPEAKING")).toBe(false);
  gate.helpAnswerStarted();
  expect(gate.shouldHold("PROCESSING")).toBe(true);
  gate.hold("carnivore.", { word: "carnivore" });
  gate.hold("carton.", { word: "carton" });
  expect(gate.turnEnded()).toEqual({ text: "carton.", metadata: { word: "carton" } });
  expect(gate.turnEnded()).toBeUndefined();
  expect(gate.shouldHold("SPEAKING")).toBe(false);
  const source = fs.readFileSync(path.join(process.cwd(), "src/server/session-manager.ts"), "utf8");
  expect(source).toContain("this.narrationGate?.helpAnswerStarted()");
  expect(source).toContain("this.narrationGate?.shouldHold(");
  expect(source).toContain("this.narrationGate?.turnEnded()");
});
