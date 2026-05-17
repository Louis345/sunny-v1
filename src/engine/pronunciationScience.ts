import fs from "fs";
import path from "path";
import { resolveChildContextDir } from "../utils/contextRoot";

export type PronunciationScienceProvider = "azure" | "speechace";

export type PronunciationSciencePhonemeScore = {
  phoneme: string;
  score: number | null;
  position?: "initial" | "medial" | "final";
  soundMostLike?: string;
};

export type PronunciationScienceSyllableScore = {
  syllable: string;
  score: number | null;
};

export type WilsonPronunciationSignal =
  | "initial_sound_confusion"
  | "medial_sound_confusion"
  | "final_sound_confusion"
  | "blending"
  | "segmentation"
  | "vowel_confusion"
  | "suffix_reading"
  | "high_frequency_word_recognition"
  | "auditory_discrimination"
  | "recovery_after_model";

export type PronunciationScienceFlowState = {
  timeOnTask_ms: number;
  bestStreak: number;
  heatReached: boolean;
  comboReached: boolean;
  retries: number;
  missToHitRecoveries: number;
  idleEvents: number;
  pauseRequests: number;
  replayRequests: number;
  powerBarSurvival_ms: number;
  abandoned: boolean;
};

export type PronunciationScienceResult = {
  targetWord: string;
  spokenTranscript: string;
  provider: PronunciationScienceProvider;
  wordScore: number | null;
  phonemeScores: PronunciationSciencePhonemeScore[];
  syllableScores: PronunciationScienceSyllableScore[];
  soundMostLike: string | null;
  omissions: string[];
  insertions: string[];
  substitutions: Array<{ expected: string; actual: string; position?: "initial" | "medial" | "final" }>;
  stressScore: number | null;
  fluencyScore: number | null;
  prosodyScore: number | null;
  wilsonSignals: WilsonPronunciationSignal[];
  confidence: number;
  audioClipId: string | null;
  sourcePath: string | null;
  createdAt: string;
  flowState?: PronunciationScienceFlowState;
};

export type PronunciationScienceEvidenceFile = {
  version: 1;
  childId: string;
  sessionId?: string;
  homeworkId?: string;
  createdAt: string;
  results: PronunciationScienceResult[];
};

export type PronunciationScienceSummary = {
  latestFilePath: string | null;
  resultCount: number;
  providers: PronunciationScienceProvider[];
  targetWords: string[];
  lowScoreTargets: string[];
  wilsonSignals: WilsonPronunciationSignal[];
  flowState: {
    averageBestStreak: number | null;
    totalMissToHitRecoveries: number;
    totalReplayRequests: number;
    abandonments: number;
  };
  summaries: string[];
};

export type PronunciationScienceProviderComparison = {
  targetWord: string;
  providers: PronunciationScienceProvider[];
  agreement: "agree" | "mixed" | "insufficient";
  clearestProvider: PronunciationScienceProvider | "both" | "neither";
  reason: string;
};

const VOWEL_PHONEMES = new Set([
  "aa",
  "ae",
  "ah",
  "ao",
  "aw",
  "ay",
  "eh",
  "er",
  "ey",
  "ih",
  "iy",
  "ow",
  "oy",
  "uh",
  "uw",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeWord(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function positionForIndex(index: number, length: number): "initial" | "medial" | "final" {
  if (index <= 0) return "initial";
  if (index >= length - 1) return "final";
  return "medial";
}

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function mapPronunciationToWilsonSignals(
  result: Pick<PronunciationScienceResult,
    | "targetWord"
    | "phonemeScores"
    | "omissions"
    | "insertions"
    | "substitutions"
    | "spokenTranscript"
    | "flowState"
  >,
): WilsonPronunciationSignal[] {
  const signals: WilsonPronunciationSignal[] = [];
  const substitutions = result.substitutions ?? [];
  const lowPhonemes = (result.phonemeScores ?? []).filter((score) =>
    typeof score.score === "number" && score.score < 65,
  );
  const hasVowelIssue = [...substitutions.map((item) => item.expected), ...lowPhonemes.map((item) => item.phoneme)]
    .some((phoneme) => VOWEL_PHONEMES.has(phoneme.toLowerCase()));

  if (substitutions.some((item) => item.position === "initial") || lowPhonemes.some((item) => item.position === "initial")) {
    signals.push("initial_sound_confusion");
  }
  if (substitutions.some((item) => item.position === "medial") || lowPhonemes.some((item) => item.position === "medial")) {
    signals.push("medial_sound_confusion");
  }
  if (substitutions.some((item) => item.position === "final") || lowPhonemes.some((item) => item.position === "final")) {
    signals.push("final_sound_confusion");
  }
  if ((result.omissions ?? []).length > 0) signals.push("segmentation");
  if ((result.insertions ?? []).length > 0) signals.push("blending");
  if (hasVowelIssue) signals.push("vowel_confusion");
  if (/(ed|ing|ly|y|s|es)$/i.test(result.targetWord)) signals.push("suffix_reading");
  if (normalizeWord(result.spokenTranscript) !== normalizeWord(result.targetWord)) {
    signals.push("auditory_discrimination");
  }
  if ((result.flowState?.missToHitRecoveries ?? 0) > 0) signals.push("recovery_after_model");
  if (normalizeWord(result.targetWord).length <= 5) signals.push("high_frequency_word_recognition");
  return uniq(signals);
}

export function normalizeAzurePronunciationPayload(opts: {
  targetWord: string;
  payload: unknown;
  audioClipId?: string;
  sourcePath?: string;
  createdAt?: string;
  flowState?: PronunciationScienceFlowState;
}): PronunciationScienceResult {
  const payload = asRecord(opts.payload);
  const nBest = Array.isArray(payload.NBest) ? asRecord(payload.NBest[0]) : {};
  const words = Array.isArray(nBest.Words) ? nBest.Words.map(asRecord) : [];
  const word = words[0] ?? {};
  const accuracy = asRecord(word.PronunciationAssessment ?? nBest.PronunciationAssessment);
  const phonemesRaw = Array.isArray(word.Phonemes) ? word.Phonemes.map(asRecord) : [];
  const phonemeScores = phonemesRaw.map((phoneme, index) => {
    const assessment = asRecord(phoneme.PronunciationAssessment);
    return {
      phoneme: stringOrEmpty(phoneme.Phoneme),
      score: numberOrNull(assessment.AccuracyScore),
      position: positionForIndex(index, phonemesRaw.length),
    };
  }).filter((score) => score.phoneme);
  const substitutions = phonemesRaw.flatMap((phoneme, index) => {
    const expected = stringOrEmpty(phoneme.Phoneme);
    const actual = stringOrEmpty(phoneme.ErrorType) === "Mispronunciation"
      ? stringOrEmpty(phoneme.Phoneme)
      : "";
    return actual ? [{ expected, actual, position: positionForIndex(index, phonemesRaw.length) }] : [];
  });
  const result: PronunciationScienceResult = {
    targetWord: opts.targetWord,
    spokenTranscript: stringOrEmpty(nBest.Display ?? word.Word ?? payload.DisplayText),
    provider: "azure",
    wordScore: numberOrNull(accuracy.AccuracyScore),
    phonemeScores,
    syllableScores: [],
    soundMostLike: null,
    omissions: phonemesRaw.filter((item) => stringOrEmpty(item.ErrorType) === "Omission").map((item) => stringOrEmpty(item.Phoneme)).filter(Boolean),
    insertions: phonemesRaw.filter((item) => stringOrEmpty(item.ErrorType) === "Insertion").map((item) => stringOrEmpty(item.Phoneme)).filter(Boolean),
    substitutions,
    stressScore: null,
    fluencyScore: numberOrNull(accuracy.FluencyScore),
    prosodyScore: numberOrNull(accuracy.ProsodyScore),
    wilsonSignals: [],
    confidence: Math.max(0, Math.min(1, (numberOrNull(accuracy.AccuracyScore) ?? 0) / 100)),
    audioClipId: opts.audioClipId ?? null,
    sourcePath: opts.sourcePath ?? null,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    ...(opts.flowState ? { flowState: opts.flowState } : {}),
  };
  return { ...result, wilsonSignals: mapPronunciationToWilsonSignals(result) };
}

export function normalizeSpeechacePronunciationPayload(opts: {
  targetWord: string;
  payload: unknown;
  audioClipId?: string;
  sourcePath?: string;
  createdAt?: string;
  flowState?: PronunciationScienceFlowState;
}): PronunciationScienceResult {
  const payload = asRecord(opts.payload);
  const textScore = asRecord(payload.text_score ?? payload);
  const ieltsScore = asRecord(textScore.ielts_score);
  const words = Array.isArray(textScore.word_score_list) ? textScore.word_score_list.map(asRecord) : [];
  const word = words[0] ?? {};
  const phonemesRaw = Array.isArray(word.phone_score_list) ? word.phone_score_list.map(asRecord) : [];
  const syllablesRaw = Array.isArray(word.syllable_score_list) ? word.syllable_score_list.map(asRecord) : [];
  const phonemeScores = phonemesRaw.map((phoneme, index) => ({
    phoneme: stringOrEmpty(phoneme.phone ?? phoneme.phoneme),
    score: numberOrNull(phoneme.quality_score ?? phoneme.score),
    position: positionForIndex(index, phonemesRaw.length),
    soundMostLike: typeof phoneme.sound_most_like === "string" ? phoneme.sound_most_like : undefined,
  })).filter((score) => score.phoneme);
  const substitutions = phonemeScores
    .filter((score) => score.soundMostLike && score.soundMostLike !== score.phoneme)
    .map((score) => ({ expected: score.phoneme, actual: score.soundMostLike ?? "", position: score.position }));
  const result: PronunciationScienceResult = {
    targetWord: opts.targetWord,
    spokenTranscript: stringOrEmpty(word.word ?? ieltsScore.transcript ?? payload.transcript),
    provider: "speechace",
    wordScore: numberOrNull(word.quality_score ?? textScore.quality_score),
    phonemeScores,
    syllableScores: syllablesRaw.map((syllable) => ({
      syllable: stringOrEmpty(syllable.letters ?? syllable.syllable),
      score: numberOrNull(syllable.quality_score ?? syllable.score),
    })).filter((score) => score.syllable),
    soundMostLike: phonemeScores.map((score) => score.soundMostLike).find(Boolean) ?? null,
    omissions: phonemeScores.filter((score) => score.score != null && score.score < 35).map((score) => score.phoneme),
    insertions: [],
    substitutions,
    stressScore: numberOrNull(word.stress_score ?? textScore.stress_score),
    fluencyScore: numberOrNull(textScore.fluency_score),
    prosodyScore: null,
    wilsonSignals: [],
    confidence: Math.max(0, Math.min(1, (numberOrNull(word.quality_score ?? textScore.quality_score) ?? 0) / 100)),
    audioClipId: opts.audioClipId ?? null,
    sourcePath: opts.sourcePath ?? null,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    ...(opts.flowState ? { flowState: opts.flowState } : {}),
  };
  return { ...result, wilsonSignals: mapPronunciationToWilsonSignals(result) };
}

function scienceDir(childId: string, opts: { rootDir?: string; contextRoot?: string } = {}): string {
  return path.join(resolveChildContextDir(childId, opts), "pronunciation_science");
}

export function writePronunciationScienceEvidence(
  childId: string,
  evidence: Omit<PronunciationScienceEvidenceFile, "version" | "childId" | "createdAt"> & { createdAt?: string },
  opts: { rootDir?: string; contextRoot?: string; now?: Date } = {},
): string {
  const dir = scienceDir(childId, opts);
  const createdAt = evidence.createdAt ?? (opts.now ?? new Date()).toISOString();
  const safeStamp = createdAt.replace(/[:.]/g, "-");
  const file = path.join(dir, `${safeStamp}.json`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    childId,
    sessionId: evidence.sessionId,
    homeworkId: evidence.homeworkId,
    createdAt,
    results: evidence.results,
  } satisfies PronunciationScienceEvidenceFile, null, 2), "utf8");
  console.log(`  🎮 [pronunciation-science] [write] child=${childId} results=${evidence.results.length}`);
  return file;
}

export function latestPronunciationScienceFile(
  childId: string,
  opts: { rootDir?: string; contextRoot?: string } = {},
): string | null {
  const dir = scienceDir(childId, opts);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(dir, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] ?? null;
}

export function readLatestPronunciationScienceSummary(
  childId: string,
  opts: { rootDir?: string; contextRoot?: string } = {},
): PronunciationScienceSummary {
  const latestFilePath = latestPronunciationScienceFile(childId, opts);
  if (!latestFilePath) {
    return {
      latestFilePath: null,
      resultCount: 0,
      providers: [],
      targetWords: [],
      lowScoreTargets: [],
      wilsonSignals: [],
      flowState: {
        averageBestStreak: null,
        totalMissToHitRecoveries: 0,
        totalReplayRequests: 0,
        abandonments: 0,
      },
      summaries: [],
    };
  }
  const file = JSON.parse(fs.readFileSync(latestFilePath, "utf8")) as PronunciationScienceEvidenceFile;
  const results = file.results ?? [];
  const flows = results.map((result) => result.flowState).filter((flow): flow is PronunciationScienceFlowState => Boolean(flow));
  const averageBestStreak = flows.length
    ? Math.round((flows.reduce((sum, flow) => sum + flow.bestStreak, 0) / flows.length) * 10) / 10
    : null;
  return {
    latestFilePath,
    resultCount: results.length,
    providers: uniq(results.map((result) => result.provider)),
    targetWords: uniq(results.map((result) => result.targetWord)).slice(0, 12),
    lowScoreTargets: uniq(results.filter((result) => (result.wordScore ?? 100) < 70).map((result) => result.targetWord)).slice(0, 12),
    wilsonSignals: uniq(results.flatMap((result) => result.wilsonSignals)).slice(0, 12),
    flowState: {
      averageBestStreak,
      totalMissToHitRecoveries: flows.reduce((sum, flow) => sum + flow.missToHitRecoveries, 0),
      totalReplayRequests: flows.reduce((sum, flow) => sum + flow.replayRequests, 0),
      abandonments: flows.reduce((sum, flow) => sum + (flow.abandoned ? 1 : 0), 0),
    },
    summaries: results.slice(0, 8).map((result) =>
      `${result.provider}:${result.targetWord} score=${result.wordScore ?? "unknown"} signals=${result.wilsonSignals.join(",") || "none"}`,
    ),
  };
}

export function comparePronunciationProviders(
  results: PronunciationScienceResult[],
): PronunciationScienceProviderComparison[] {
  const byTarget = new Map<string, PronunciationScienceResult[]>();
  for (const result of results) {
    byTarget.set(result.targetWord, [...(byTarget.get(result.targetWord) ?? []), result]);
  }
  return [...byTarget.entries()].map(([targetWord, rows]) => {
    const providers = uniq(rows.map((row) => row.provider));
    if (providers.length < 2) {
      return {
        targetWord,
        providers,
        agreement: "insufficient",
        clearestProvider: providers[0] ?? "neither",
        reason: "Only one provider result was available.",
      };
    }
    const signalSets = rows.map((row) => new Set(row.wilsonSignals));
    const allSignals = uniq(rows.flatMap((row) => row.wilsonSignals));
    const sharedSignals = allSignals.filter((signal) => signalSets.every((set) => set.has(signal)));
    const best = [...rows].sort((a, b) =>
      (b.phonemeScores.length + b.substitutions.length + b.omissions.length) -
      (a.phonemeScores.length + a.substitutions.length + a.omissions.length),
    )[0];
    const tied = rows.every((row) =>
      row.phonemeScores.length + row.substitutions.length + row.omissions.length ===
      best.phonemeScores.length + best.substitutions.length + best.omissions.length,
    );
    return {
      targetWord,
      providers,
      agreement: sharedSignals.length > 0 ? "agree" : "mixed",
      clearestProvider: tied ? "both" : best.provider,
      reason: sharedSignals.length > 0
        ? `Shared Wilson signals: ${sharedSignals.join(", ")}.`
        : "Providers disagreed on the Wilson signal.",
    };
  });
}

export function demoPronunciationScienceResults(createdAt = "2026-05-15T12:00:00.000Z"): PronunciationScienceResult[] {
  const flowState: PronunciationScienceFlowState = {
    timeOnTask_ms: 42_000,
    bestStreak: 6,
    heatReached: true,
    comboReached: false,
    retries: 3,
    missToHitRecoveries: 2,
    idleEvents: 0,
    pauseRequests: 1,
    replayRequests: 1,
    powerBarSurvival_ms: 42_000,
    abandoned: false,
  };
  return [
    normalizeAzurePronunciationPayload({
      targetWord: "ahead",
      createdAt,
      flowState,
      payload: {
        DisplayText: "ahead",
        NBest: [{
          Display: "ahead",
          PronunciationAssessment: { AccuracyScore: 62, FluencyScore: 78, ProsodyScore: 70 },
          Words: [{
            Word: "ahead",
            PronunciationAssessment: { AccuracyScore: 62 },
            Phonemes: [
              { Phoneme: "ah", PronunciationAssessment: { AccuracyScore: 92 } },
              { Phoneme: "h", PronunciationAssessment: { AccuracyScore: 28 }, ErrorType: "Omission" },
              { Phoneme: "eh", PronunciationAssessment: { AccuracyScore: 61 } },
              { Phoneme: "d", PronunciationAssessment: { AccuracyScore: 88 } },
            ],
          }],
        }],
      },
    }),
    normalizeSpeechacePronunciationPayload({
      targetWord: "ahead",
      createdAt,
      flowState,
      payload: {
        text_score: {
          word_score_list: [{
            word: "ahead",
            quality_score: 58,
            phone_score_list: [
              { phone: "ah", quality_score: 90 },
              { phone: "h", quality_score: 20, sound_most_like: "d" },
              { phone: "eh", quality_score: 64 },
              { phone: "d", quality_score: 88 },
            ],
          }],
        },
      },
    }),
  ];
}
