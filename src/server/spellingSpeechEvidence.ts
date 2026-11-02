import type { CurrentBoardSnapshot } from "./currentBoardSnapshot";
import type { SpellingAssessmentState } from "./game-event-handler";
import { recordPresentedAudio, withOriginalSpellingChart } from "../chart/spelling/originalResponses";

/** Help binds to the actual item; practice can receive teaching before response entry. */
export function snapshotOnSpellingItem(assessment: SpellingAssessmentState, snapshot: CurrentBoardSnapshot | null): boolean {
  return snapshot?.itemId === assessment.itemId
    && (snapshot.phase === "response" || assessment.instrument === "practice" && ["flash", "presentation", "playing", "feedback"].includes(snapshot.phase ?? ""));
}

/**
 * True when Elli's reply gives the word's spelling: spelled letters ("n, i, g"),
 * chunks that rebuild it ("Li... ght"), a letter it starts or ends with, or a
 * part of it ("rain" in raincoat). Saying the whole word is a replay, not help.
 */
export function replyGivesSpelling(reply: string, word: string): boolean {
  const target = word.normalize("NFC").toLowerCase().replace(/[^a-z]/g, "");
  const tokens = reply.normalize("NFC").toLowerCase().match(/[a-z]+/g) ?? [];
  if (!target) return false;
  for (let start = 0; start < tokens.length; start++) {
    let joined = tokens[start]!;
    for (let end = start + 1; end < tokens.length && joined.length < target.length; end++) {
      joined += tokens[end];
      if (joined === target) return true;
    }
  }
  for (let start = 0; start < tokens.length; start++) {
    let run = "";
    for (let end = start; end < tokens.length && tokens[end]!.length === 1; end++) run += tokens[end];
    if (run.length >= 2 && !/^[ai]+$/.test(run) && target.includes(run)) return true;
  }
  return tokens.some((token, index) =>
    (token.length >= 3 && token !== target && target.includes(token))
    || (token.length === 1 && ["with", "letter"].includes(tokens[index - 1] ?? "") && (target.startsWith(token) || target.endsWith(token))));
}

export function markCurrentSpellingSupport(assessment: SpellingAssessmentState | undefined, snapshot: CurrentBoardSnapshot | null): boolean {
  const matches = Boolean(assessment && snapshotOnSpellingItem(assessment, snapshot));
  if (matches && assessment && !assessment.supportIds.length) {
    assessment.supportIds.push(`support:${snapshot!.sessionId}:${assessment.itemId}`);
    console.log(` 🎮 [spelling-assessment] [support] [recorded] item=${assessment.itemId}`);
  }
  return matches;
}

/** Typed audio receipt is separate from responses, engagement and academic conclusions. */
export function recordSpellingAudio(childId: string, sessionId: string, assessment: SpellingAssessmentState, playbackId: string, rates: unknown, delivered: boolean): void {
  if (delivered) assessment.lastStimulusRates = Array.isArray(rates) && rates.length ? [...rates] as number[] : null;
  if (!assessment.chartItemId) { console.log(" 🎮 [spelling-audio] [record] [unavailable] reason=typed_presentation_unavailable"); return; }
  try {
  const recorded = withOriginalSpellingChart(childId, db => recordPresentedAudio(db, {
    sessionId, itemId: assessment.chartItemId!, playbackId, delivered,
    speechRates: Array.isArray(rates) && rates.length ? rates as number[] : null,
  }));
  if (!recorded) console.log(" 🎮 [spelling-audio] [record] [unavailable] reason=typed_chart_inactive");
  } catch(error) { console.error(" 🎮 [spelling-audio] [record] [failed]",error); }
}
