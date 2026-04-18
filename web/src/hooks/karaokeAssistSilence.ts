/**
 * When true, assistant PCM and browser TTS are suppressed so the reader can focus.
 * Kept in a tiny module so unit tests do not import `useSession` (react-pdf / DOM).
 */
export interface KaraokeAssistSilenceInput {
  phase: "picker" | "connecting" | "active" | "ended";
  canvas: { mode: string; karaokeWords?: string[] };
  karaokeStoryComplete: boolean;
}

export function isKaraokeReadingAssistSilence(
  s: KaraokeAssistSilenceInput,
): boolean {
  return (
    s.phase === "active" &&
    s.canvas.mode === "karaoke" &&
    (s.canvas.karaokeWords?.length ?? 0) > 0 &&
    !s.karaokeStoryComplete
  );
}
