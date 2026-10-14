import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createActionOutbox } from "../utils/actionOutbox";

// Saori kiosk 2026-10-14: "really" spoke at 2:39 PM, then later "Hear word" taps never reached the
// server. The browser silently discarded any message while its connection was reconnecting, and
// had already marked "waiting for the word", so the session froze. Tests mocked sendMessage and
// never tapped while the real connection was down.
afterEach(() => vi.restoreAllMocks());
const tap = (itemId: string) => ({ event: { type: "narration_request", payload: { itemId, word: itemId, text: `${itemId}.` } } });

describe("actions while the connection to Sunny is down", () => {
  it("sends straight away when connected", () => {
    const sent: unknown[] = [];
    const outbox = createActionOutbox({ now: () => 0 });
    expect(outbox.deliver("game_event", tap("sheep"), true, message => sent.push(message))).toBe("sent");
    expect(sent).toHaveLength(1);
  });
  it("holds a Hear word tap while reconnecting and resends it once, after the session is back", () => {
    let clock = 0;
    const outbox = createActionOutbox({ now: () => clock });
    const sent: Array<{ type: string }> = [];
    expect(outbox.deliver("game_event", tap("sheep"), false, message => sent.push(message as { type: string }))).toBe("queued");
    expect(sent).toHaveLength(0);
    clock = 3_000;
    expect(outbox.take()).toMatchObject({ type: "game_event", payload: tap("sheep") });
    expect(outbox.take()).toBeUndefined();
  });
  it("keeps only the latest tap, and lets a tap that waited too long expire", () => {
    let clock = 0;
    const outbox = createActionOutbox({ now: () => clock, maxAgeMs: 8_000 });
    outbox.deliver("game_event", tap("sheep"), false, () => undefined);
    outbox.deliver("game_event", tap("beach"), false, () => undefined);
    expect(outbox.take()?.payload).toEqual(tap("beach"));
    outbox.deliver("game_event", tap("sheep"), false, () => undefined);
    clock = 8_001;
    expect(outbox.take()).toBeUndefined();
  });
  it("never drops anything silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const outbox = createActionOutbox({ now: () => 0 });
    expect(outbox.deliver("spelling_answer", { word: "sheep" }, false, () => undefined)).toBe("dropped");
    expect(outbox.deliver("game_event", tap("sheep"), false, () => undefined)).toBe("queued");
    const lines = warn.mock.calls.map(call => String(call[0]));
    expect(lines.some(line => line.includes("[session-link] [action] [dropped] type=spelling_answer"))).toBe(true);
    expect(lines.some(line => line.includes("[session-link] [action] [queued] type=game_event"))).toBe(true);
  });
  it("is wired so the browser only waits for a word it actually asked for, and resends after reconnecting", () => {
    const source = readFileSync(`${process.cwd()}/src/hooks/useSession.ts`, "utf8");
    const send = source.slice(source.indexOf("const sendMessage = useCallback"), source.indexOf("sendMessageRef.current = sendMessage;"));
    expect(send).toContain("actionOutboxRef.current.deliver(");
    expect(send).toContain('=== "sent"');
    expect(send.indexOf("activityNarrationPendingRef.current = true")).toBeGreaterThan(send.indexOf("actionOutboxRef.current.deliver("));
    const started = source.slice(source.indexOf('case "session_started": {'));
    expect(started.slice(0, 1200)).toContain("actionOutboxRef.current.take()");
  });
});
