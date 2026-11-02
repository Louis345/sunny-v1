import { beforeEach, expect, it, vi } from "vitest";
import WebSocket from "ws";

vi.mock("../agents/elli/run", () => ({ runAgent: vi.fn() }));

import { runAgent } from "../agents/elli/run";
import { SessionManager } from "./session-manager";

// Nov 2 human catch: the children said Elli was not responding. Nov 1 logged
// 229 ambient-ignored lines (all "collapsed without wake phrase") and kept no
// words, so the logs could not show what she missed; the lab only ever tested
// the wake word. Owner rule: Elli can always be reached, and she decides.
type Harness = {
  companionPresence: "collapsed" | "summoned";
  handleEndOfTurn: (text: string) => Promise<void>;
  lastPlaybackEndedAt: number;
};

function session(): Harness {
  const ws = { readyState: WebSocket.OPEN, OPEN: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  const s = new SessionManager(ws, "Ila") as unknown as Harness;
  s.companionPresence = "collapsed";
  return s;
}

beforeEach(() => vi.mocked(runAgent).mockReset());

it("gives Elli a turn for a short line heard while collapsed, with the choice to stay quiet", async () => {
  let seen: { userMessage: string; tools: Record<string, { execute?: (input: object) => Promise<unknown> }> } | undefined;
  vi.mocked(runAgent).mockImplementation(async (input?: any) => {
    if (!input) return undefined as never; // session warm-up call
    seen = input;
    await input.tools.stayQuiet.execute({});
    return undefined as never;
  });
  const s = session();
  await s.handleEndOfTurn("can you say it again?");
  expect(seen?.userMessage).toContain("[Overheard speech]");
  expect(seen?.tools.stayQuiet).toBeDefined();
  expect(s.companionPresence).toBe("collapsed");
});

it("does not send speech heard during or just after playback to Elli", async () => {
  const s = session();
  s.lastPlaybackEndedAt = Date.now();
  await s.handleEndOfTurn("can you say it again?");
  expect(vi.mocked(runAgent).mock.calls.filter(call => call[0])).toHaveLength(0);
  expect(s.companionPresence).toBe("collapsed");
});
