import type { CurrentBoardSnapshot } from "./currentBoardSnapshot";
import type { SpellingAssessmentState } from "./game-event-handler";
import { recordPresentedAudio, withOriginalSpellingChart } from "../chart/spelling/originalResponses";

/** Help binds to the actual item; practice can receive teaching before response entry. */
export function markCurrentSpellingSupport(assessment: SpellingAssessmentState | undefined, snapshot: CurrentBoardSnapshot | null): boolean {
  const matches = Boolean(assessment && snapshot?.itemId === assessment.itemId
    && (snapshot.phase === "response" || assessment.instrument === "practice" && ["flash", "presentation", "feedback"].includes(snapshot.phase ?? "")));
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
