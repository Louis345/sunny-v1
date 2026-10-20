import { dictionary as cmuDictionary } from "cmu-pronouncing-dictionary";
import { childIdFromName } from "../engine/learningEngine";
import type { ChildName } from "../companions/loader";

export type CurrentBoardSnapshot = {
  childId: string;
  sessionId: string;
  nodeId?: string;
  itemId?: string;
  launchToken?: string;
  activityId?: string;
  activityTitle?: string;
  learningFocus?: string;
  mechanic?: string;
  currentChallenge?: string;
  availableActions?: string[];
  activityIntentId?: string;
  targetSelectorId?: string;
  intentPurpose?: string;
  diagnosticQuestion?: string;
  game?: string;
  phase?: string;
  currentTarget?: string;
  /** Internal spelling truth; this is not permission to display the answer. */
  spellingTarget?: string;
  spellingSupportMode?: "stimulus_only" | "pronunciation_model";
  targetIsSpeakable: boolean;
  speechCaptureArmed?: boolean;
  answerVisibility: "hidden" | "visible" | "revealed" | "unknown";
  itemIndex?: number;
  totalItems?: number;
  allowedActivities: string[];
  score?: number;
  coins?: number;
  coinsEarned?: number;
  accuracy?: number;
  completed?: boolean;
  masteryEligible?: boolean;
  evidenceTier?: string;
  lastOutcome?: string;
  lastOutcomeWord?: string;
  questState?: string;
  bossState?: string;
  contaminatedTargets?: string[];
  missedWords?: string[];
  correctWords?: string[];
  boardState?: string;
  progress?: string;
  loading?: { screenText: string[]; elapsedLabel?: string; ready?: number; total?: number; remainingTimeKnown?: boolean };
  wheelValue?: string;
  updatedAt: string;
};

export type CompanionTurnTruth = CurrentBoardSnapshot;

type BuildSnapshotInput = {
  childId: string;
  sessionId: string;
  state: Record<string, unknown>;
  allowedActivities?: string[];
  now?: Date;
};

function asString(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : undefined;
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function normalizeAnswerVisibility(
  state: Record<string, unknown>,
): CurrentBoardSnapshot["answerVisibility"] {
  const explicit = asString(state.answerVisibility)?.toLowerCase();
  if (explicit === "hidden" || explicit === "visible" || explicit === "revealed") {
    return explicit;
  }

  const game = String(state.game ?? state.activityId ?? "").toLowerCase();
  const phase = String(state.phase ?? "").toLowerCase();
  if (game.includes("wheel")) {
    return phase === "won" || phase === "lost" || phase === "complete"
      ? "revealed"
      : "hidden";
  }
  return "visible";
}

export function buildCurrentBoardSnapshot(
  input: BuildSnapshotInput,
): CurrentBoardSnapshot {
  const state = input.state;
  const objectChallenge =
    state.currentChallenge &&
    typeof state.currentChallenge === "object" &&
    !Array.isArray(state.currentChallenge)
      ? (state.currentChallenge as Record<string, unknown>)
      : null;
  const currentChallenge =
    asString(state.currentChallenge) ?? asString(objectChallenge?.prompt);
  const answerVisibility = normalizeAnswerVisibility(state);
  const rawTarget =
    asString(state.currentTarget) ??
    asString(state.currentWord) ??
    asString(state.target) ??
    asString(state.word);
  const targetIsSpeakable =
    Boolean(rawTarget) && answerVisibility !== "hidden";
  const allowedActivities =
    input.allowedActivities?.length
      ? input.allowedActivities
      : asStringArray(state.allowedActivities);

  const snapshot: CurrentBoardSnapshot = {
    childId: input.childId,
    sessionId: input.sessionId,
    targetIsSpeakable,
    answerVisibility,
    allowedActivities,
    updatedAt: (input.now ?? new Date()).toISOString(),
  };

  const stringFields: Array<[keyof CurrentBoardSnapshot, unknown]> = [
    ["nodeId", state.nodeId],
    ["launchToken", state.launchToken],
    ["itemId", state.itemId ?? objectChallenge?.id],
    ["activityId", state.activityId],
    ["activityTitle", state.activityTitle],
    ["learningFocus", state.learningFocus],
    ["mechanic", state.mechanic],
    ["currentChallenge", currentChallenge],
    ["activityIntentId", state.activityIntentId],
    ["targetSelectorId", state.targetSelectorId],
    ["intentPurpose", state.intentPurpose ?? state.activityIntentPurpose],
    ["diagnosticQuestion", state.diagnosticQuestion],
    ["game", state.game],
    ["phase", state.phase],
    ["lastOutcome", state.lastOutcome ?? state.action ?? state.lastAction],
    ["lastOutcomeWord", state.lastOutcomeWord],
    ["evidenceTier", state.evidenceTier],
    ["questState", state.questState],
    ["bossState", state.bossState],
    ["boardState", state.boardState],
    ["progress", state.progress],
    ["wheelValue", state.wheelValue],
  ];
  for (const [key, value] of stringFields) {
    const text = asString(value);
    if (text) {
      (snapshot as Record<string, unknown>)[key] = text;
    }
  }

  if (state.game === "adventure-preparation") {
    snapshot.loading = { screenText: asStringArray(state.screenText),
      elapsedLabel: asString(state.elapsedLabel), ready: typeof state.ready === "number" ? asNumber(state.ready) : undefined,
      total: typeof state.total === "number" ? asNumber(state.total) : undefined,
      remainingTimeKnown: asBoolean(state.remainingTimeKnown) };
  }

  if (targetIsSpeakable && rawTarget) {
    snapshot.currentTarget = rawTarget;
  }

  // Only spelling instruments have a spoken stimulus distinct from the hidden
  // written response. Never project a hidden Wheel/math answer through this path.
  const spellingGames = new Set(["word-radar", "spell-check", "monster-stampede",
    "letter-rush", "word-builder", "speed-catcher", "pronunciation", "visual-explainer"]);
  const game = String(state.game ?? state.activityId ?? "").toLowerCase();
  if (rawTarget && spellingGames.has(game)) {
    snapshot.spellingTarget = rawTarget;
    // Display normalization is not permission to teach: absent/unknown facts
    // and independent measurement must retain the whole-stimulus boundary.
    const explicitVisibility = asString(state.answerVisibility)?.toLowerCase();
    snapshot.spellingSupportMode = state.assessmentMode !== true
      && state.evidenceTier !== "mastery_candidate"
      && (explicitVisibility === "visible" || explicitVisibility === "revealed")
      ? "pronunciation_model" : "stimulus_only";
  }

  for (const key of ["itemIndex", "totalItems", "score", "coins", "coinsEarned", "accuracy"] as const) {
    const n = asNumber(state[key]);
    if (typeof n === "number") snapshot[key] = n;
  }
  for (const key of ["completed", "masteryEligible", "speechCaptureArmed"] as const) {
    const b = asBoolean(state[key]);
    if (typeof b === "boolean") snapshot[key] = b;
  }
  const contaminatedTargets = asStringArray(state.contaminatedTargets);
  if (contaminatedTargets.length) snapshot.contaminatedTargets = contaminatedTargets;
  const missedWords = asStringArray(state.missedWords);
  if (missedWords.length) snapshot.missedWords = missedWords;
  const correctWords = asStringArray(state.correctWords);
  if (correctWords.length) snapshot.correctWords = correctWords;
  const availableActions = asStringArray(state.availableActions);
  if (availableActions.length) snapshot.availableActions = availableActions;

  return snapshot;
}

/** Keep private runtime truth out of model-facing text and tool state. */
export function redactProtectedSpellingText(text: string, snapshot: CurrentBoardSnapshot | null): string {
  if (snapshot?.spellingSupportMode !== "stimulus_only" || !snapshot.spellingTarget) return text;
  const escaped = snapshot.spellingTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), "[private stimulus]");
}

export function companionBoardSnapshot(snapshot: CurrentBoardSnapshot): CurrentBoardSnapshot {
  if (snapshot.spellingSupportMode !== "stimulus_only") return snapshot;
  const projected = { ...snapshot, currentTarget: undefined, spellingTarget: undefined, targetIsSpeakable: false };
  return redactProtectedSpellingValue(projected, snapshot);
}

/** For JSON tool results only; binary/image content must not pass through here. */
export function redactProtectedSpellingValue<T>(value: T, snapshot: CurrentBoardSnapshot | null): T {
  if (snapshot?.spellingSupportMode !== "stimulus_only") return value;
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "string"
    ? redactProtectedSpellingText(item, snapshot) : item));
}

export function buildCurrentBoardSnapshotContext(
  snapshot: CurrentBoardSnapshot | null,
  opts: { childSpeech?: string } = {},
): string {
  if (!snapshot) return "";
  const lines = [
    "[Internal live board state]",
    "This is board state, not child speech. Mention only activities, rewards, targets, and answers listed here.",
  ];
  const speech = asString(opts.childSpeech);
  if (speech) lines.push(`Child speech: "${speech}"`);
  if (snapshot.game) lines.push(`Current game: ${snapshot.game}`);
  if (snapshot.activityId) lines.push(`Current activity: ${snapshot.activityId}`);
  if (snapshot.activityTitle) lines.push(`Activity title: ${snapshot.activityTitle}`);
  if (snapshot.learningFocus) lines.push(`Learning focus: ${snapshot.learningFocus}`);
  if (snapshot.mechanic) lines.push(`Child interaction: ${snapshot.mechanic}`);
  if (snapshot.currentChallenge) lines.push(`Current challenge: ${snapshot.currentChallenge}`);
  if (snapshot.availableActions?.length) {
    lines.push(`Available child actions: ${snapshot.availableActions.join(" | ")}`);
  }
  if (snapshot.intentPurpose) lines.push(`Activity intent: ${snapshot.intentPurpose}`);
  if (snapshot.diagnosticQuestion) lines.push(`Diagnostic question: ${snapshot.diagnosticQuestion}`);
  if (snapshot.nodeId) lines.push(`Current node: ${snapshot.nodeId}`);
  if (snapshot.itemId) lines.push(`Current item: ${snapshot.itemId}`);
  if (snapshot.phase) lines.push(`Phase: ${snapshot.phase}`);
  if (snapshot.phase === "opening" || snapshot.phase === "document_loaded") {
    lines.push("Do not say the activity is ready until a live activity state arrives. You may say it is opening.");
  }
  if (snapshot.phase === "closed" && snapshot.boardState === "map") {
    lines.push("The child is back on the map. Do not describe the previous activity as open.");
  }
  lines.push(`Answer visibility: ${snapshot.answerVisibility}`);
  if (snapshot.currentTarget && snapshot.spellingSupportMode !== "stimulus_only") lines.push(`Current target: ${snapshot.currentTarget}`);
  if (snapshot.spellingTarget) {
    lines.push("[Spelling pronunciation support]",
      "Hidden written letters remain hidden. Pronunciation modeling is assistance, not an independent spelling result.");
    if (snapshot.spellingSupportMode === "stimulus_only") {
      lines.push("Use replayWord to request the activity’s own whole-word audio, or clarify the activity instructions. The private stimulus is held by the activity, not supplied in this context.",
        "Do not model syllables or reveal written letters during hidden assessment. Offer a pause or the activity's available help action when more support is needed.");
    } else {
      lines.push(`Authoritative spelling target (internal): ${snapshot.spellingTarget}`,
        "Do not replace this target with words from room conversation. If the activity context is missing, ask which item needs help instead of inventing a target.");
      const phones = cmuDictionary[snapshot.spellingTarget.normalize("NFC").toLowerCase()];
      if (typeof phones === "string" && phones) {
        const vowelNuclei = phones.split(/\s+/).filter(phone => /[012]$/.test(phone));
        lines.push("Pronunciation reference: CMU dictionary (US English; alternate pronunciations may exist).",
          `ARPABET: ${phones}`, `Syllable count: ${vowelNuclei.length}`,
          `Vowel stress (0=unstressed, 1=primary, 2=secondary): ${vowelNuclei.map(phone => phone.slice(-1)).join(" ")}`,
          "Model the whole word, then its spoken syllables, then blend when the child requests pronunciation help. Use natural speech, not ARPABET names or letter names.",
          "This reference supplies phonemes and vowel nuclei, not written syllable boundaries. Do not label spelling chunks as syllables unless they match the spoken syllables.",
          "Do not pronounce silent spelling letters as separate sounds. Use activity-authored sound cues when available; do not invent letter-to-sound mappings.",
          "After an unsuccessful hint, change the explanation or offer an available break/help action; do not repeat generic encouragement.");
      } else {
        lines.push("Pronunciation reference unavailable. Use the activity's authored narration or sound cues; do not invent a phoneme sequence or syllable breakdown.");
      }
      lines.push("Do not grade the child's pronunciation from transcript text. Specific pronunciation judgments require audio assessment evidence.");
    }
  }
  if (snapshot.loading) {
    lines.push(...snapshot.loading.screenText.map(text => `Displayed loading text: ${text}`));
    if (snapshot.loading.elapsedLabel) lines.push(`Elapsed: ${snapshot.loading.elapsedLabel}`);
    if (snapshot.loading.ready !== undefined && snapshot.loading.total !== undefined) {
      lines.push(`Activities ready: ${snapshot.loading.ready} of ${snapshot.loading.total}`);
    }
    if (snapshot.loading.remainingTimeKnown === false) lines.push("Remaining time is not known. Do not invent a completion estimate.");
  }
  if (snapshot.boardState) lines.push(`Board: ${snapshot.boardState}`);
  if (snapshot.evidenceTier) lines.push(`Evidence tier: ${snapshot.evidenceTier}`);
  if (typeof snapshot.masteryEligible === "boolean") {
    lines.push(`Mastery eligible: ${snapshot.masteryEligible ? "yes" : "no"}`);
  }
  if (typeof snapshot.accuracy === "number") {
    lines.push(`Latest activity accuracy: ${Math.round(snapshot.accuracy * 100)}%`);
  }
  if (typeof snapshot.completed === "boolean") {
    lines.push(`Completed: ${snapshot.completed ? "yes" : "no"}`);
  }
  if (snapshot.questState) lines.push(`Quest state: ${snapshot.questState}`);
  if (snapshot.bossState) lines.push(`Boss state: ${snapshot.bossState}`);
  if (snapshot.contaminatedTargets?.length) {
    lines.push(`Contaminated targets: ${snapshot.contaminatedTargets.join(", ")}`);
  }
  if (snapshot.missedWords?.length) {
    lines.push(`Missed words: ${snapshot.missedWords.join(", ")}`);
  }
  if (snapshot.correctWords?.length) {
    lines.push(`Correct words: ${snapshot.correctWords.join(", ")}`);
  }
  if (typeof snapshot.itemIndex === "number") {
    const total =
      typeof snapshot.totalItems === "number" ? String(snapshot.totalItems) : "?";
    lines.push(`Item ${snapshot.itemIndex + 1} of ${total}`);
  }
  if (snapshot.allowedActivities.length) {
    lines.push(`Allowed activities: ${snapshot.allowedActivities.join(", ")}`);
  }
  const hasReward =
    typeof snapshot.score === "number" ||
    typeof snapshot.coins === "number" ||
    typeof snapshot.coinsEarned === "number";
  if (!hasReward) {
    lines.push("No exact coin amount is available; do not state any coin total or reward amount.");
  }
  if (typeof snapshot.score === "number") lines.push(`Score: ${snapshot.score}`);
  if (typeof snapshot.coins === "number") lines.push(`Coins: ${snapshot.coins}`);
  if (typeof snapshot.coinsEarned === "number") {
    lines.push(`Coins earned: ${snapshot.coinsEarned}`);
  }
  if (snapshot.lastOutcome) lines.push(`Last outcome: ${snapshot.lastOutcome}`);
  if (snapshot.lastOutcomeWord) lines.push(`Last outcome word: ${snapshot.lastOutcomeWord}`);
  if (snapshot.wheelValue) lines.push(`Wheel landed on: ${snapshot.wheelValue}`);
  if (snapshot.progress) lines.push(`Progress: ${snapshot.progress}`);
  return redactProtectedSpellingText(lines.join("\n"), snapshot);
}

export function findCompanionTruthContradictions(
  response: string,
  snapshot: CurrentBoardSnapshot | null,
): string[] {
  if (!snapshot) return [];
  const text = response.toLowerCase();
  const contradictions: string[] = [];
  if (snapshot.spellingSupportMode === "stimulus_only" && snapshot.spellingTarget) {
    const target = snapshot.spellingTarget.toLowerCase().replace(/[^a-z]/g, "");
    // Whole spoken stimuli are allowed. Flag separated letter runs, including
    // partial disclosure such as n-i-g-h-t within tonight (the recorded failure).
    const letterRuns = text.match(/\b[a-z](?:[\s,–—-]+[a-z]\b)+/g) ?? [];
    const minimum = Math.min(3, target.length);
    const disclosed = minimum > 0 && letterRuns.some((run) => {
      const letters = run.replace(/[^a-z]/g, "");
      for (let offset = 0; offset <= target.length - minimum; offset += 1) {
        if (letters.includes(target.slice(offset, offset + minimum))) return true;
      }
      return false;
    });
    if (disclosed) contradictions.push("hidden_spelling_letters_disclosed");
  }
  const usesMasteryLanguage =
    /\b(100\s*%|100 percent|perfect|zero mistakes|crushed|mastered|mastery)\b/.test(text);
  const resultContradictsMastery =
    (typeof snapshot.accuracy === "number" && snapshot.accuracy < 0.95) ||
    snapshot.evidenceTier === "practice" ||
    snapshot.masteryEligible === false ||
    snapshot.contaminatedTargets?.length;
  if (usesMasteryLanguage && resultContradictsMastery) {
    contradictions.push("mastery_claim_contradicts_activity_result");
  }

  const claimsBossUnlocked = /\bboss\b[^\n.]{0,80}\b(unlocked|ready|waiting|open)\b/.test(text);
  const bossIsUnlocked = /unlocked|ready|open|complete|completed/.test(
    String(snapshot.bossState ?? "").toLowerCase(),
  );
  const questSupportsBoss = !snapshot.questState || /complete|completed|supported|ready/.test(
    String(snapshot.questState ?? "").toLowerCase(),
  );
  if (claimsBossUnlocked && (!bossIsUnlocked || !questSupportsBoss)) {
    contradictions.push("boss_unlock_claim_contradicts_board_state");
  }

  return contradictions;
}

export function childIdForBoardSnapshot(childName: ChildName): string {
  return childIdFromName(childName);
}
