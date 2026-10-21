import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn(),
}));

import { runAgent } from "../agents/elli/run";
import { SessionManager } from "./session-manager";

type Harness = {
  companionPresence: "collapsed" | "summoned";
  handleFluxEndOfTurn: (text: string, source: "eager" | "final") => void;
  handleEndOfTurn: (text: string) => Promise<void>;
  bargeIn: () => void;
};

function mockBrowserWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function latencyLines(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map((args: unknown[]) => String(args[0]))
    .filter((line: string) => line.startsWith(" 🎮 [latency]"));
}

describe("SessionManager voice turn latency wiring", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log");
    vi.mocked(runAgent).mockReset();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("logs a cancelled turn on barge-in and records the held eager lead for companion conversation", () => {
    const session = new SessionManager(mockBrowserWs(), "Reina");
    const harness = session as unknown as Harness;
    harness.companionPresence = "summoned";
    vi.spyOn(harness, "handleEndOfTurn").mockResolvedValue();

    harness.handleFluxEndOfTurn("Matilda, how's your", "eager");
    harness.handleFluxEndOfTurn("Matilda, how's your day going?", "final");
    harness.bargeIn();

    const lines = latencyLines(logSpy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[turn_cancelled]");
    expect(lines[0]).toContain("source=final");
    expect(lines[0]).toContain("reason=barge_in");
    expect(lines[0]).toMatch(/held_eager_lead=\d+ms/);
  });

  it("closes the timing turn when Sunny ignores the speech, so later audio is not credited to it", async () => {
    // Human catch (Oct 20 PR #21 session): ambient speech while Elli was
    // collapsed left a turn open for 17s until an unrelated reply claimed it.
    const session = new SessionManager(mockBrowserWs(), "Ila");
    const harness = session as unknown as Harness;
    harness.companionPresence = "collapsed";

    harness.handleFluxEndOfTurn("I think we should go outside later", "final");

    await vi.waitFor(() => {
      const lines = latencyLines(logSpy);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("[turn_cancelled]");
      expect(lines[0]).toContain("reason=ignored");
    });
  });

  it("starts the turn from an eager end-of-turn outside companion conversation", () => {
    const session = new SessionManager(mockBrowserWs(), "Ila");
    const harness = session as unknown as Harness;
    vi.spyOn(harness, "handleEndOfTurn").mockResolvedValue();

    harness.handleFluxEndOfTurn("what is seven times eight", "eager");
    harness.bargeIn();

    const lines = latencyLines(logSpy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("source=eager");
  });

  it("labels a held companion eager transcript that is promoted after the final timeout", async () => {
    vi.useFakeTimers();
    try {
      const session = new SessionManager(mockBrowserWs(), "Reina");
      const harness = session as unknown as Harness;
      harness.companionPresence = "summoned";
      vi.spyOn(harness, "handleEndOfTurn").mockResolvedValue();

      harness.handleFluxEndOfTurn("Yukari, what is your favorite color", "eager");
      await vi.advanceTimersByTimeAsync(800);
      harness.bargeIn();

      const lines = latencyLines(logSpy);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("source=eager_promoted");
      expect(lines[0]).toMatch(/held_eager_lead=\d+ms/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("times an Elli response that no child end-of-turn started (session opening / activity start) as a system turn", async () => {
    vi.mocked(runAgent).mockImplementation(async (opts: { onToken?: (c: string) => void }) => {
      opts.onToken?.("Hi Ila! ");
      return "Hi Ila! ";
    });
    const session = new SessionManager(mockBrowserWs(), "Ila");
    const harness = session as unknown as Harness & {
      runCompanionResponse: (message: string) => Promise<void>;
    };

    await harness.runCompanionResponse("[Session opening context] The adventure board is available.");
    harness.bargeIn();

    // Only this session's system turn (an earlier test's session may still log under load).
    const lines = latencyLines(logSpy).filter((line) => line.includes("source=system"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/response_start=0ms/);
    expect(lines[0]).toMatch(/model_request=\d+ms/);
    expect(lines[0]).toMatch(/model_first_token=\d+ms/);
  });

  it("counts tool steps Elli takes before her first spoken word", async () => {
    vi.mocked(runAgent).mockImplementation(async (opts) => {
      await opts.onStepFinish?.({
        finishReason: "tool-calls",
        toolCalls: [{ toolName: "sessionLog", args: { message: "warming up" } }],
        toolResults: [{}],
      });
      opts.onToken?.("Let's spell! ");
      return "Let's spell! ";
    });
    const session = new SessionManager(mockBrowserWs(), "Ila");
    const harness = session as unknown as Harness & {
      runCompanionResponse: (message: string) => Promise<void>;
    };

    await harness.runCompanionResponse("[Session opening context] The adventure board is available.");
    harness.bargeIn();

    const lines = latencyLines(logSpy);
    expect(lines[0]).toContain("tool_steps=1");
  });

  it("stamps the Claude request and first token on the child's own turn", async () => {
    vi.mocked(runAgent).mockImplementation(async (opts: { onToken?: (c: string) => void }) => {
      opts.onToken?.("Fifty-six! ");
      return "Fifty-six! ";
    });
    const session = new SessionManager(mockBrowserWs(), "Ila");
    const harness = session as unknown as Harness & {
      runCompanionResponse: (message: string) => Promise<void>;
    };
    vi.spyOn(harness, "handleEndOfTurn").mockImplementation((text: string) =>
      harness.runCompanionResponse(text),
    );

    harness.handleFluxEndOfTurn("what is seven times eight", "final");
    await vi.waitFor(() => {
      expect(runAgent).toHaveBeenCalled();
    });
    harness.bargeIn();

    const lines = latencyLines(logSpy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("source=final");
    expect(lines[0]).toMatch(/response_start=\d+ms/);
    expect(lines[0]).toMatch(/model_request=\d+ms/);
    expect(lines[0]).toMatch(/model_first_token=\d+ms/);
  });
});
