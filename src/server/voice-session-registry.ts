/**
 * Tracks the active voice WebSocket session id per child so map / iframe paths
 * can correlate events with RewardEngine + sessionEventBus (COMPANION-MAP-WS-001).
 */

const activeVoiceSessionIdByChildId = new Map<string, string>();

export function registerActiveVoiceSession(
  childId: string,
  sessionId: string,
): void {
  activeVoiceSessionIdByChildId.set(childId.trim().toLowerCase(), sessionId);
}

export function unregisterActiveVoiceSessionIfCurrent(
  childId: string,
  sessionId: string,
): void {
  const k = childId.trim().toLowerCase();
  if (activeVoiceSessionIdByChildId.get(k) === sessionId) {
    activeVoiceSessionIdByChildId.delete(k);
  }
}

export function getActiveVoiceSessionIdForChild(
  childId: string,
): string | undefined {
  return activeVoiceSessionIdByChildId.get(childId.trim().toLowerCase());
}

export function __resetVoiceSessionRegistryForTests(): void {
  activeVoiceSessionIdByChildId.clear();
  activeVoiceSessionManagerByChildId.clear();
}

// ── SessionManager handle registry (GAME-EVENT-001) ─────────────────────────

/**
 * Minimal interface so voice-session-registry doesn't import SessionManager
 * (avoids circular deps). The concrete SessionManager satisfies this.
 */
export interface VoiceSessionManagerHandle {
  noteExternalEvent(event: unknown): void;
}

const activeVoiceSessionManagerByChildId = new Map<string, VoiceSessionManagerHandle>();

export function registerActiveVoiceSessionManager(
  childId: string,
  sm: VoiceSessionManagerHandle,
): void {
  activeVoiceSessionManagerByChildId.set(childId.trim().toLowerCase(), sm);
}

export function unregisterActiveVoiceSessionManager(
  childId: string,
  sm: VoiceSessionManagerHandle,
): void {
  const k = childId.trim().toLowerCase();
  if (activeVoiceSessionManagerByChildId.get(k) === sm) {
    activeVoiceSessionManagerByChildId.delete(k);
  }
}

export function getActiveVoiceSessionManagerForChild(
  childId: string,
): VoiceSessionManagerHandle | null {
  return activeVoiceSessionManagerByChildId.get(childId.trim().toLowerCase()) ?? null;
}
