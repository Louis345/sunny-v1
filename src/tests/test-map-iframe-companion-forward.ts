import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebSocket } from "ws";
import { sessionEventBus } from "../server/session-event-bus";
import {
  __resetAdventureMapSessionsForTests,
  companionTriggerToSessionEventType,
  handleMapSocketIframeCompanionEvent,
  registerMapSessionWebSocket,
} from "../server/map-coordinator";
import {
  getActiveVoiceSessionIdForChild,
  registerActiveVoiceSession,
  registerActiveVoiceSessionManager,
  unregisterActiveVoiceSessionIfCurrent,
  __resetVoiceSessionRegistryForTests,
} from "../server/voice-session-registry";

describe("map iframe → sessionEventBus (COMPANION-MAP-WS-001)", () => {
  beforeEach(() => {
    __resetVoiceSessionRegistryForTests();
    __resetAdventureMapSessionsForTests();
  });

  afterEach(() => {
    __resetVoiceSessionRegistryForTests();
    __resetAdventureMapSessionsForTests();
  });

  it("maps idle_too_long to idle_10s and drops session_start", () => {
    expect(companionTriggerToSessionEventType("idle_too_long")).toBe("idle_10s");
    expect(companionTriggerToSessionEventType("session_start")).toBeNull();
    expect(companionTriggerToSessionEventType("wrong_answer")).toBe("wrong_answer");
    expect(companionTriggerToSessionEventType("session_complete")).toBe(
      "session_complete",
    );
  });

  it("fires session_complete on bus when map socket forwards iframe event", () => {
    const fire = vi.spyOn(sessionEventBus, "fire");
    const ws = { once: vi.fn(), off: vi.fn() } as unknown as WebSocket;
    registerMapSessionWebSocket("ila", ws);
    registerActiveVoiceSession("ila", "voice-sid-sc");

    const ok = handleMapSocketIframeCompanionEvent(ws, {
      type: "map_iframe_companion_event",
      payload: {
        trigger: "session_complete",
        childId: "ila",
        timestamp: 7,
      },
    });
    expect(ok).toBe(true);
    expect(fire).toHaveBeenCalledWith({
      type: "session_complete",
      childId: "ila",
      sessionId: "voice-sid-sc",
      timestamp: 7,
    });
    fire.mockRestore();
    unregisterActiveVoiceSessionIfCurrent("ila", "voice-sid-sc");
  });

  it("fires wrong_answer on bus when map socket forwards iframe event", () => {
    const fire = vi.spyOn(sessionEventBus, "fire");
    const ws = { once: vi.fn(), off: vi.fn() } as unknown as WebSocket;
    registerMapSessionWebSocket("ila", ws);
    registerActiveVoiceSession("ila", "voice-sid-test");

    const ok = handleMapSocketIframeCompanionEvent(ws, {
      type: "map_iframe_companion_event",
      payload: {
        trigger: "wrong_answer",
        childId: "ila",
        timestamp: 42,
      },
    });
    expect(ok).toBe(true);
    expect(fire).toHaveBeenCalledWith({
      type: "wrong_answer",
      childId: "ila",
      sessionId: "voice-sid-test",
      timestamp: 42,
    });
    fire.mockRestore();
    unregisterActiveVoiceSessionIfCurrent("ila", "voice-sid-test");
  });

  it("routes narration_request to the active voice session without treating it as a companion trigger", () => {
    const fire = vi.spyOn(sessionEventBus, "fire");
    const warnSpy = vi.spyOn(console, "warn");
    const ws = { once: vi.fn(), off: vi.fn() } as unknown as WebSocket;
    const sm = {
      noteExternalEvent: vi.fn(),
      speakGameNarration: vi.fn(),
    };
    registerMapSessionWebSocket("reina", ws);
    registerActiveVoiceSessionManager("reina", sm);

    const ok = handleMapSocketIframeCompanionEvent(ws, {
      type: "map_iframe_companion_event",
      payload: {
        trigger: "narration_request",
        childId: "reina",
        timestamp: 123,
        word: "sunny",
        reason: "word_prompt",
        activityId: "letter-rush",
        nodeId: "n-letter-rush-baseline",
      },
    });

    expect(ok).toBe(true);
    expect(sm.speakGameNarration).toHaveBeenCalledWith(
      "sunny.",
      expect.objectContaining({
        activityId: "letter-rush",
        nodeId: "n-letter-rush-baseline",
        reason: "word_prompt",
        source: "map_iframe_companion_event",
      }),
    );
    expect(fire).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("invalid trigger"),
      "narration_request",
    );

    fire.mockRestore();
    warnSpy.mockRestore();
  });

  it("debounces duplicate iframe narration requests so one click cannot create two voices", () => {
    const ws = { once: vi.fn(), off: vi.fn() } as unknown as WebSocket;
    const sm = {
      noteExternalEvent: vi.fn(),
      speakGameNarration: vi.fn(),
    };
    registerMapSessionWebSocket("ila", ws);
    registerActiveVoiceSessionManager("ila", sm);

    const payload = {
      trigger: "narration_request",
      childId: "ila",
      timestamp: 123,
      word: "ago",
      text: "ago.",
      reason: "repeat_word",
      activityId: "monster-stampede",
      nodeId: "n-monster",
    };

    expect(handleMapSocketIframeCompanionEvent(ws, { type: "map_iframe_companion_event", payload })).toBe(true);
    expect(handleMapSocketIframeCompanionEvent(ws, { type: "map_iframe_companion_event", payload })).toBe(true);

    expect(sm.speakGameNarration).toHaveBeenCalledTimes(1);
  });

  it("uses empty voice session id when no active voice session", () => {
    const fire = vi.spyOn(sessionEventBus, "fire");
    const ws = { once: vi.fn(), off: vi.fn() } as unknown as WebSocket;
    registerMapSessionWebSocket("reina", ws);
    expect(getActiveVoiceSessionIdForChild("reina")).toBeUndefined();

    handleMapSocketIframeCompanionEvent(ws, {
      type: "map_iframe_companion_event",
      payload: {
        trigger: "correct_answer",
        childId: "reina",
        timestamp: 99,
      },
    });
    expect(fire).toHaveBeenCalledWith({
      type: "correct_answer",
      childId: "reina",
      sessionId: "",
      timestamp: 99,
    });
    fire.mockRestore();
  });

  it("returns false when socket was not map_session_attach", () => {
    const ws = { once: vi.fn(), off: vi.fn() } as unknown as WebSocket;
    const ok = handleMapSocketIframeCompanionEvent(ws, {
      type: "map_iframe_companion_event",
      payload: {
        trigger: "wrong_answer",
        childId: "ila",
        timestamp: 1,
      },
    });
    expect(ok).toBe(false);
  });

  it("BUG 6: emote-only companion events (no trigger) do not emit 'invalid trigger' warning", () => {
    const warnSpy = vi.spyOn(console, "warn");
    const ws = { once: vi.fn(), off: vi.fn() } as unknown as WebSocket;
    registerMapSessionWebSocket("ila", ws);

    handleMapSocketIframeCompanionEvent(ws, {
      type: "map_iframe_companion_event",
      payload: {
        emote: "celebrating",
        intensity: 0.85,
        childId: "ila",
        timestamp: Date.now(),
        metadata: { source: "quest_unlock_sequence" },
      },
    });

    const warnings = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(
      warnings.some((w) => w.includes("invalid trigger")),
    ).toBe(false);
    warnSpy.mockRestore();
  });
});
