/**
 * Karaoke reading metrics — pure functions for progress accuracy and phrase-restart detection.
 * Used by web Canvas and covered by root vitest.
 */

/** Progress through the story: wordIndex / totalWords (1.0 when complete). */
export function karaokeProgressAccuracy(
  wordIndex: number,
  totalWords: number,
): number {
  if (totalWords <= 0) return 1;
  return Math.min(1, wordIndex / totalWords);
}

/** True when trimmed interim length dropped — treated as a new STT phrase / abandoned attempt. */
export function isInterimPhraseRestart(
  prevTrimmedLength: number,
  currTrimmedLength: number,
): boolean {
  return currTrimmedLength < prevTrimmedLength && prevTrimmedLength > 0;
}

export type KaraokeReadingProgressEvent = "progress" | "complete";

/** Shape sent over the wire as `reading_progress` from the browser. */
export function buildKaraokeReadingProgressPayload(args: {
  wordIndex: number;
  totalWords: number;
  hesitations: number;
  flaggedWords: string[];
  /** Words the child skipped via tap — agency, no penalty; not hesitations. */
  skippedWords: string[];
  spelledWords: string[];
  event: KaraokeReadingProgressEvent;
}): Record<string, unknown> {
  return {
    wordIndex: args.wordIndex,
    totalWords: args.totalWords,
    accuracy: karaokeProgressAccuracy(args.wordIndex, args.totalWords),
    hesitations: args.hesitations,
    flaggedWords: args.flaggedWords,
    skippedWords: args.skippedWords,
    spelledWords: args.spelledWords,
    event: args.event,
  };
}
