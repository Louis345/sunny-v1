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
}
