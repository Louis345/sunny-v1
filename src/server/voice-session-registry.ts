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
  voiceSessionManagerByChildAndSession.clear();
}

// ── SessionManager handle registry (GAME-EVENT-001) ─────────────────────────

/**
 * Minimal interface so voice-session-registry doesn't import SessionManager
 * (avoids circular deps). The concrete SessionManager satisfies this.
 */
export interface VoiceSessionManagerHandle {
  getSessionId?: () => string;
  getDiscoveryAttemptContext?: (homeworkId: string, itemId: string) => { nodeId?: string; support: { status: "unassisted" | "assisted" | "unknown"; scaffolds: string[] }; instrumentSignals: string[]; artifactHash: string; sessionId: string } | undefined;
  noteExternalEvent(event: unknown): void;
  speakGameNarration?: (
    text: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void> | void;
  recordGameTrace?: (state: Record<string, unknown>) => void;
  end?: () => Promise<void>;
}

const activeVoiceSessionManagerByChildId = new Map<string, VoiceSessionManagerHandle>();
const voiceSessionManagerByChildAndSession = new Map<string, VoiceSessionManagerHandle>();

function managerKey(childId: string, sessionId: string): string {
  return `${childId.trim().toLowerCase()}:${sessionId.trim()}`;
}

export function registerActiveVoiceSessionManager(
  childId: string,
  sm: VoiceSessionManagerHandle,
): void {
  const normalizedChildId = childId.trim().toLowerCase();
  activeVoiceSessionManagerByChildId.set(normalizedChildId, sm);
  const sessionId = sm.getSessionId?.().trim();
  if (sessionId) voiceSessionManagerByChildAndSession.set(managerKey(normalizedChildId, sessionId), sm);
}

export function unregisterActiveVoiceSessionManager(
  childId: string,
  sm: VoiceSessionManagerHandle,
): void {
  const k = childId.trim().toLowerCase();
  if (activeVoiceSessionManagerByChildId.get(k) === sm) {
    activeVoiceSessionManagerByChildId.delete(k);
  }
  const sessionId = sm.getSessionId?.().trim();
  if (sessionId && voiceSessionManagerByChildAndSession.get(managerKey(k, sessionId)) === sm) {
    voiceSessionManagerByChildAndSession.delete(managerKey(k, sessionId));
  }
}

export function getActiveVoiceSessionManagerForChild(
  childId: string,
): VoiceSessionManagerHandle | null {
  return activeVoiceSessionManagerByChildId.get(childId.trim().toLowerCase()) ?? null;
}

export function getVoiceSessionManagerForChildSession(
  childId: string,
  sessionId: string,
): VoiceSessionManagerHandle | null {
  if (!sessionId.trim()) return null;
  return voiceSessionManagerByChildAndSession.get(managerKey(childId, sessionId)) ?? null;
}

export async function endActiveVoiceSessions(): Promise<void> {
  const sessions = [...new Set(activeVoiceSessionManagerByChildId.values())];
  const results = await Promise.allSettled(
    sessions.map(async (session) => {
      if (typeof session.end !== "function") return;
      await session.end();
    }),
  );
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `  🔴 [session-end] shutdown finalizer failed index=${index}`,
        result.reason,
      );
    }
  });
}
