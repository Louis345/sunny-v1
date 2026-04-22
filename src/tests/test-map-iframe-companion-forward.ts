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
});
