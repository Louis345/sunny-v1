import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

const { stream } = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: stream,
  stepCountIs: () => () => false,
}));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => "model" }));
vi.mock("../agents/elli/tools/generateToolDocs", () => ({ ALL_TOOLS: {} }));

import { runCompanionResponseForSession } from "./companion-response-runner";
import { createSessionContext } from "./session-context";
import { SessionManager } from "./session-manager";

function speaking(chunks: string[]) {
  stream.mockReturnValue({
    fullStream: (async function* () {
      for (const text of chunks) yield { type: "text-delta", text };
    })(),
    finishReason: Promise.resolve("stop"),
  });
}

function fakeSession() {
  return {
    sessionId: "expression",
    companion: { name: "Elli", systemPrompt: "Live persona" },
    conversationHistory: [] as Array<{ role: string; content: string }>,
    gamePendingRevision: null,
    turnSM: {
      getState: () => "IDLE",
      onStartCompanionFromIdle: vi.fn(),
      onToken: vi.fn(),
      onAgentComplete: vi.fn(),
    },
    companionBridge: { expressCompanion: vi.fn(async () => ({ ok: true })) },
    buildAgentToolkit: () => ({}),
    send: vi.fn(),
    flushPendingRoundComplete: vi.fn(),
    end: vi.fn(),
    recordDebugEvent: vi.fn(),
  };
}

describe("Elli's inline expressions", () => {
  afterEach(() => stream.mockReset());

  it("shows Elli's smile from an inline tag and never speaks the tag", async () => {
    speaking(["[sm", "ile] Hey Ila! Good to see you."]);
    const session = fakeSession();

    await runCompanionResponseForSession(session, "Hey, Ellie.");

    expect(session.companionBridge.expressCompanion).toHaveBeenCalledWith({ emote: "happy" });
    const spoken = session.turnSM.onToken.mock.calls.map((c) => c[0]).join("");
    expect(spoken).toBe("Hey Ila! Good to see you.");
    const shown = session.send.mock.calls
      .filter((c) => c[0] === "response_text")
      .map((c) => (c[1] as { chunk: string }).chunk)
      .join("");
    expect(shown).not.toContain("[");
    expect(session.conversationHistory.at(-1)?.content).toBe("Hey Ila! Good to see you.");
  });

  it("logs every expression it shows so a session log proves the smile fired (Law 5)", async () => {
    // Human catch (Oct 20 PR #21 session): no way to tell from the logs whether
    // Elli ever smiled.
    speaking(["[smile] Hi there!"]);
    const log = vi.spyOn(console, "log");
    await runCompanionResponseForSession(fakeSession(), "Hey, Ellie.");
    expect(log.mock.calls.map((c) => String(c[0]))).toContain(" 🎮 [companion] [expression] [shown] emote=happy");
    log.mockRestore();
  });

  it("tells Elli how to use expression tags in her instructions", async () => {
    speaking(["Hi!"]);
    await runCompanionResponseForSession(fakeSession(), "Hey, Ellie.");
    const system = stream.mock.calls.at(-1)?.[0].messages[0].content as string;
    expect(system).toContain("Live persona");
    expect(system).toContain("[smile]");
    expect(system).toMatch(/one or two short sentences/i);
  });
});

describe("Elli's voice toolkit", () => {
  function mockWs(): WebSocket {
    return { readyState: WebSocket.OPEN, OPEN: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  }

  it.each(["spelling", "reading"] as const)(
    "no longer offers the expressCompanion tool (%s), so a smile never costs a Claude round trip",
    (sessionType) => {
      vi.stubEnv("ADVENTURE_MAP", "true");
      const sm = new SessionManager(mockWs(), "Ila");
      (sm as unknown as { isSpellingSession: boolean }).isSpellingSession = sessionType === "spelling";
      (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx = createSessionContext({
        childName: "Ila",
        sessionType,
      });
      const keys = Object.keys(sm.buildAgentToolkit());
      expect(keys).not.toContain("expressCompanion");
      expect(keys).toContain("companionAct");
      vi.unstubAllEnvs();
    },
  );
});
