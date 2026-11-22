/**
 * The first and last words of a FaceTime call are hers (owner 2026-11-22): the server asks the companion to write
 * them from live context. The opening for the companion she will most likely call is written while she is still on
 * the loading screen, so pickup adds no wait; any other pick is written on tap. Nothing here holds a fallback line:
 * a failed write is silence.
 */
export type WrittenCallLine = { text: string; audio: Blob | null };
export type CallLineKey = { companionId: string; voiceId: string };

const SILENCE: WrittenCallLine = { text: "", audio: null };
const DEFAULT_MAX_AGE_MS = 10 * 60_000;

export function createCallOpeningCache(input: {
  write: (key: CallLineKey) => Promise<WrittenCallLine>;
  now?: () => number;
  maxAgeMs?: number;
}) {
  const now = input.now ?? Date.now;
  const maxAgeMs = input.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const pending = new Map<string, { startedAt: number; line: Promise<WrittenCallLine> }>();
  const keyOf = (key: CallLineKey) => `${key.companionId}|${key.voiceId}`;
  const start = (key: CallLineKey) => {
    const line = input.write(key).catch((err: unknown) => {
      console.warn(` 🎮 [call-moment] [opening] [silent] companion=${key.companionId} reason=${err instanceof Error ? err.message : String(err)}`);
      return SILENCE;
    });
    const entry = { startedAt: now(), line };
    pending.set(keyOf(key), entry);
    return entry;
  };
  return {
    /** Start writing her opening now; a second call for the same companion and voice reuses the first. */
    prefetch(key: CallLineKey): void {
      const existing = pending.get(keyOf(key));
      if (existing && now() - existing.startedAt <= maxAgeMs) return;
      start(key);
      console.log(` 🎮 [call-moment] [opening] [prefetch] companion=${key.companionId}`);
    },
    /** Her opening for this pickup: the prefetched one when fresh, else written now. Each opening is used once. */
    take(key: CallLineKey): Promise<WrittenCallLine> {
      const existing = pending.get(keyOf(key));
      pending.delete(keyOf(key));
      const fresh = existing && now() - existing.startedAt <= maxAgeMs;
      console.log(` 🎮 [call-moment] [opening] [take] companion=${key.companionId} prefetched=${fresh ? "yes" : "no"}`);
      return fresh ? existing.line : start(key).line.finally(() => pending.delete(keyOf(key)));
    },
  };
}

/** Ask the companion to write one call moment, then voice it. Empty text means she stays quiet. */
export async function writeCallMoment(input: {
  companionId: string;
  voiceId: string;
  moment: "opening" | "goodbye";
  childId: string;
  callSource?: string;
  relationshipState?: string;
  showroomTheme?: string;
  recentLines?: string[];
  signal?: AbortSignal;
}): Promise<WrittenCallLine> {
  const id = encodeURIComponent(input.companionId);
  const written = await fetch(`/api/companions/${id}/call-moment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      moment: input.moment,
      childId: input.childId,
      callSource: input.callSource,
      relationshipState: input.relationshipState,
      showroomTheme: input.showroomTheme,
      recentLines: input.recentLines,
    }),
  });
  if (!written.ok) throw new Error(`call_moment_${written.status}`);
  const text = String(((await written.json()) as { text?: unknown }).text ?? "").trim();
  if (!text || !input.voiceId) return { text, audio: null };
  const voiced = await fetch(`/api/companions/${id}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      line: "intro",
      language: "en",
      voiceId: input.voiceId,
      source: input.moment === "opening" ? "video_call_greeting" : "video_call_farewell",
      text,
    }),
  });
  if (!voiced.ok) throw new Error(`call_moment_voice_${voiced.status}`);
  return { text, audio: await voiced.blob() };
}
