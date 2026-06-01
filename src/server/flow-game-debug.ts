type CompactFields = Record<string, unknown>;

function finiteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function accuracyPct(value: unknown): number {
  const n = finiteNumber(value, 0);
  if (n >= 0 && n <= 1) return Math.round(n * 100);
  return Math.round(n);
}

function addNumber(out: CompactFields, key: string, value: unknown): void {
  const n = Number(value);
  if (Number.isFinite(n)) out[key] = n;
}

function addString(out: CompactFields, key: string, value: unknown): void {
  if (typeof value === "string" && value.trim()) out[key] = value;
}

export function buildReadingProgressFields(payload: Record<string, unknown>): CompactFields {
  const flaggedWords = stringArray(payload.flaggedWords);
  const skippedWords = stringArray(payload.skippedWords);
  const spelledWords = stringArray(payload.spelledWords);
  const out: CompactFields = {
    game: "karaoke-reading",
    event: typeof payload.event === "string" ? payload.event : "progress",
    wordIndex: finiteNumber(payload.wordIndex),
    totalWords: finiteNumber(payload.totalWords),
    accuracyPct: accuracyPct(payload.accuracy),
    hesitations: finiteNumber(payload.hesitations),
    flaggedCount: flaggedWords.length,
    skippedCount: skippedWords.length,
    spelledCount: spelledWords.length,
  };
  if (flaggedWords.length) out.flaggedWords = flaggedWords;
  if (skippedWords.length) out.skippedWords = skippedWords;
  if (spelledWords.length) out.spelledWords = spelledWords;
  return out;
}

export function buildPronunciationCompleteFields(msg: Record<string, unknown>): CompactFields {
  const out: CompactFields = {
    game: "pronunciation",
    totalWords: finiteNumber(msg.totalWords),
    correctCount: finiteNumber(msg.correctCount),
    accuracyPct: accuracyPct(msg.accuracy),
  };
  addNumber(out, "wordsAttempted", msg.wordsAttempted);
  addNumber(out, "wordsHit", msg.wordsHit);
  addNumber(out, "xpEarned", msg.xpEarned);
  addNumber(out, "bestStreak", msg.bestStreak);
  return out;
}

export function buildFlowGameEventFields(event: Record<string, unknown>): CompactFields {
  const out: CompactFields = {
    game: typeof event.game === "string" ? event.game : "unknown",
    type: typeof event.type === "string" ? event.type : "unknown",
  };
  addString(out, "activityId", event.activityId);
  addString(out, "childId", event.childId);
  addString(out, "companionId", event.companionId);
  addString(out, "surface", event.surface);
  addNumber(out, "streak", event.streak);
  addNumber(out, "square", event.square);
  addString(out, "mark", event.mark);
  addString(out, "callSource", event.callSource);
  addString(out, "relationshipState", event.relationshipState);
  addString(out, "word", event.word);
  addString(out, "bonusWord", event.bonusWord);
  addNumber(out, "bonusMultiplier", event.bonusMultiplier);
  addString(out, "difficulty", event.difficulty);
  addString(out, "reason", event.reason);
  addNumber(out, "wordIndex", event.wordIndex);
  addNumber(out, "attempt", event.attempt);
  return out;
}
