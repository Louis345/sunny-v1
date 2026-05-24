import { classifyKaraokeWordMatch } from "./karaokeMatchWord";

export type PronunciationContaminationReason =
  | "background_speech"
  | "companion_chatter"
  | "target_not_tail"
  | "transcript_tail";

export interface PronunciationTranscriptWindowInput {
  target: string;
  rawTranscript: string;
  acceptedPrefix?: string[];
}

export interface PronunciationTranscriptWindow {
  rawTranscript: string;
  heardTail: string;
  scoringText: string;
  contaminated: boolean;
  reasons: PronunciationContaminationReason[];
  orthographicAmbiguity: boolean;
}

function cleanWord(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function transcriptWords(value: string): string[] {
  return value
    .toLowerCase()
    .match(/[a-z0-9]+/g)?.filter(Boolean) ?? [];
}

function latestTranscriptSegment(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const segments = trimmed
    .split(/[.!?\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.at(-1) ?? trimmed;
}

function containsCompanionChatter(value: string): boolean {
  return /\b(elli|ellie|you'?re there|are you there|not answering|hello elli|hello ellie)\b/i.test(
    value,
  );
}

function containsBackgroundSpeechCue(value: string): boolean {
  return /\b(dad|mom|parent|adult|background|behind me|someone|talking|says|said)\b/i.test(
    value,
  );
}

function matchesPronunciation(heard: string, target: string): boolean {
  return classifyKaraokeWordMatch(heard, target, { mode: "pronunciation" }) === "match";
}

function allTokensMatchTarget(tokens: string[], target: string): boolean {
  return tokens.length > 0 && tokens.every((token) => matchesPronunciation(token, target));
}

function matchesAcceptedPrefix(tokens: string[], acceptedPrefix: string[], target: string): boolean {
  if (tokens.length < 2 || acceptedPrefix.length === 0) return false;
  if (!matchesPronunciation(tokens.at(-1) ?? "", target)) return false;
  const prefixTokens = tokens.slice(0, -1);
  const expectedPrefix = acceptedPrefix.slice(-prefixTokens.length);
  if (expectedPrefix.length !== prefixTokens.length) return false;
  return prefixTokens.every((token, index) =>
    matchesPronunciation(token, expectedPrefix[index] ?? ""),
  );
}

function addReason(
  reasons: Set<PronunciationContaminationReason>,
  reason: PronunciationContaminationReason,
): void {
  reasons.add(reason);
}

function tailScoringPhrase(
  rawTranscript: string,
  tokens: string[],
  target: string,
  acceptedPrefix: string[],
): string {
  if (matchesAcceptedPrefix(tokens, acceptedPrefix, target)) {
    return rawTranscript;
  }
  const rawTokens = rawTranscript.trim().split(/\s+/).filter(Boolean);
  const targetTokenCount = target.split(/\s+/).filter(Boolean).length;
  return rawTokens.slice(-Math.max(1, targetTokenCount)).join(" ");
}

export function buildPronunciationTranscriptWindow(
  input: PronunciationTranscriptWindowInput,
): PronunciationTranscriptWindow {
  const target = input.target.trim();
  const acceptedPrefix = input.acceptedPrefix ?? [];
  const rawTranscript = latestTranscriptSegment(input.rawTranscript);
  const tokens = transcriptWords(rawTranscript);
  const reasons = new Set<PronunciationContaminationReason>();
  const targetClean = cleanWord(target);
  const heardTail = tokens.slice(-3).join(" ");

  if (!rawTranscript || !targetClean) {
    return {
      rawTranscript,
      heardTail,
      scoringText: rawTranscript,
      contaminated: false,
      reasons: [],
      orthographicAmbiguity: false,
    };
  }

  if (containsCompanionChatter(rawTranscript)) {
    addReason(reasons, "companion_chatter");
  }
  if (containsBackgroundSpeechCue(rawTranscript)) {
    addReason(reasons, "background_speech");
  }

  const compactTranscript = tokens.join("");
  const wholeTranscriptMatches = matchesPronunciation(rawTranscript, target);
  const compactTranscriptMatches =
    tokens.length <= 3 && matchesPronunciation(compactTranscript, target);
  const targetTokenIndexes = tokens
    .map((token, index) => (matchesPronunciation(token, target) ? index : -1))
    .filter((index) => index >= 0);
  const targetAppears = targetTokenIndexes.length > 0 || wholeTranscriptMatches || compactTranscriptMatches;
  const targetAtTail =
    targetTokenIndexes.includes(tokens.length - 1) || wholeTranscriptMatches || compactTranscriptMatches;

  if (targetAppears && !targetAtTail) {
    addReason(reasons, "target_not_tail");
  }

  const cleanExactSpeech =
    tokens.length === 1 ||
    compactTranscriptMatches ||
    allTokensMatchTarget(tokens, target) ||
    matchesAcceptedPrefix(tokens, acceptedPrefix, target);
  if (targetAppears && !cleanExactSpeech) {
    addReason(reasons, "transcript_tail");
    if (tokens.length > 1) addReason(reasons, "background_speech");
  }
  if (!targetAppears && tokens.length > 3) {
    addReason(reasons, "background_speech");
    addReason(reasons, "transcript_tail");
  }

  const targetTokenCount = target.split(/\s+/).filter(Boolean).length;
  const tailTokens = tokens.slice(-Math.max(1, targetTokenCount));
  const tailPhrase = tailTokens.join(" ");
  const tailMatchesTarget =
    targetTokenCount > 1
      ? matchesPronunciation(tailPhrase, target)
      : Boolean(tailTokens.at(-1) && matchesPronunciation(tailTokens.at(-1) ?? "", target));
  const recoverableTailMatch =
    targetAtTail &&
    tailMatchesTarget &&
    !reasons.has("companion_chatter") &&
    !reasons.has("target_not_tail");

  const contaminated = reasons.size > 0;
  const scoringText = recoverableTailMatch
    ? tailScoringPhrase(rawTranscript, tokens, target, acceptedPrefix)
    : contaminated
      ? ""
      : compactTranscriptMatches
        ? rawTranscript
        : tokens.length === 1 || matchesAcceptedPrefix(tokens, acceptedPrefix, target)
          ? rawTranscript
          : tokens.slice(-1).join(" ");
  const scoringClean = cleanWord(scoringText);
  const orthographicAmbiguity =
    Boolean(scoringClean && targetClean && scoringClean !== targetClean) &&
    matchesPronunciation(scoringText, target);

  return {
    rawTranscript,
    heardTail,
    scoringText,
    contaminated,
    reasons: [...reasons],
    orthographicAmbiguity,
  };
}
