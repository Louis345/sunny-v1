import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

// 2026-11-10, both audits: built games end with sendNodeComplete({completed: true}) and no time, so Sunny saved
// "completed in 0ms, no frustration" for a game that walled Ila for 15 minutes. Missing data was written as fact.
// The contract now measures the time itself when a game does not report it.
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("reports how long a built game was open when the game itself does not", () => {
  vi.useFakeTimers({ now: new Date("2026-11-10T12:00:00Z") });
  const posted: Array<Record<string, unknown>> = [];
  vi.spyOn(window.parent, "postMessage").mockImplementation(message => { posted.push(message as Record<string, unknown>); });
  window.history.replaceState({}, "", "/games/generated.html?childId=ila&sessionId=s1&nodeId=n1");
  delete (window as unknown as { GameBridge?: unknown }).GameBridge;
  window.eval(fs.readFileSync(path.join(process.cwd(), "public", "games", "_contract.js"), "utf8"));
  vi.setSystemTime(new Date("2026-11-10T12:15:00Z"));
  (window as unknown as { sendNodeComplete: (result: unknown) => void }).sendNodeComplete({ completed: true });
  const done = posted.find(message => message.type === "node_complete") as { result?: { timeSpent_ms?: number } } | undefined;
  expect(JSON.stringify(done)).toContain('"timeSpent_ms":900000');
});
