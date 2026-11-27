// Owner, 2026-11-25: each companion keeps a small toolkit — no more than 5 tools at any moment.
// Saori logs (11/18–11/25) showed 6 of 11 tools ever called; the rest were noise in every turn.
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { SessionManager } from "./session-manager";
import { createSessionContext } from "./session-context";
import { generateAdventureMapVoiceToolDocs } from "../agents/elli/tools/generateToolDocs";

vi.mock("../agents/elli/run", () => ({ runAgent: vi.fn().mockResolvedValue(""), buildAgentTools: vi.fn(() => ({})) }));

const MAX_COMPANION_TOOLS = 5;

function mockWs(): WebSocket {
  return { readyState: WebSocket.OPEN, OPEN: WebSocket.OPEN, send: vi.fn(), close: vi.fn(), on: vi.fn(), removeAllListeners: vi.fn() } as unknown as WebSocket;
}

function kioskToolkit(sessionType: "spelling" | "math" | "homework" | null, snapshot?: Record<string, unknown>): Record<string, unknown> {
  vi.stubEnv("ADVENTURE_MAP", "true");
  const sm = new SessionManager(mockWs(), "Ila") as unknown as Record<string, unknown> & { buildAgentToolkit(): Record<string, unknown> };
  sm.isSpellingSession = sessionType === "spelling";
  sm.ctx = createSessionContext({ childName: "Ila", sessionType: sessionType as never });
  sm.ttsBridge = { setSpeechRate: vi.fn(async (speed: number) => ({ speed })), getSpeechRate: () => 1 };
  if (snapshot) sm.currentBoardSnapshot = snapshot;
  return sm.buildAgentToolkit();
}

const spellingCheck = { nodeId: "n1", itemId: "i1", launchToken: "t1", itemIndex: 0, phase: "response", spellingTarget: "night", spellingSupportMode: "stimulus_only" };

describe("companion tool budget", () => {
  afterEach(() => vi.unstubAllEnvs());

  for (const sessionType of ["spelling", "math", "homework", null] as const) {
    it(`gives the kiosk companion at most ${MAX_COMPANION_TOOLS} tools (${sessionType ?? "no session type"})`, () => {
      const keys = Object.keys(kioskToolkit(sessionType));
      expect(keys.length, keys.join(",")).toBeLessThanOrEqual(MAX_COMPANION_TOOLS);
      expect(keys).toEqual(expect.arrayContaining(["companionAct", "recordProductIssue", "recordChildSignal", "setSpeechRate"]));
    });
  }

  it("stays within the budget during a spelling check, where spelling help is one tool", () => {
    const keys = Object.keys(kioskToolkit("spelling", spellingCheck));
    expect(keys.length, keys.join(",")).toBeLessThanOrEqual(MAX_COMPANION_TOOLS);
    expect(keys).toContain("spellingHelp");
    expect(keys).not.toContain("replayWord");
    expect(keys).not.toContain("teachWord");
  });

  it("describes only tools the companion actually has", () => {
    const toolkit = kioskToolkit("spelling", spellingCheck);
    const described = [...generateAdventureMapVoiceToolDocs().matchAll(/^### (\w+)/gm)].map((m) => m[1]);
    for (const name of described) expect(Object.keys(toolkit)).toContain(name);
  });
});
