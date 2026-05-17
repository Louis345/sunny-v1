import {
  comparePronunciationProviders,
  normalizeAzurePronunciationPayload,
  normalizeSpeechacePronunciationPayload,
  type PronunciationScienceProvider,
  type PronunciationScienceProviderComparison,
  type PronunciationScienceResult,
} from "./pronunciationScience";

export type PronunciationScienceProviderStatus = {
  provider: PronunciationScienceProvider;
  ok: boolean;
  status: "scored" | "missing_key" | "provider_error" | "unsupported_audio";
  message?: string;
};

export type PronunciationScienceCompareInput = {
  targetWord: string;
  audioBase64: string;
  mimeType: string;
  audioClipId?: string;
  sourcePath?: string;
  createdAt?: string;
};

export type PronunciationScienceCompareOutput = {
  targetWord: string;
  results: PronunciationScienceResult[];
  comparisons: PronunciationScienceProviderComparison[];
  providerStatuses: PronunciationScienceProviderStatus[];
};

type FetchLike = typeof fetch;

function cleanTargetWord(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function audioBytes(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64"));
}

function isWavMime(mimeType: string): boolean {
  return /audio\/(wav|wave|x-wav)/i.test(mimeType);
}

async function scoreWithAzure(
  input: PronunciationScienceCompareInput,
  env: Partial<Record<string, string | undefined>>,
  fetchImpl: FetchLike,
): Promise<{ result?: PronunciationScienceResult; status: PronunciationScienceProviderStatus }> {
  const key = env.AZURE_SPEECH_KEY?.trim();
  const region = env.AZURE_SPEECH_REGION?.trim();
  if (!key || !region) {
    return { status: { provider: "azure", ok: false, status: "missing_key", message: "AZURE_SPEECH_KEY or AZURE_SPEECH_REGION missing" } };
  }
  if (!isWavMime(input.mimeType)) {
    return { status: { provider: "azure", ok: false, status: "unsupported_audio", message: "Azure comparison currently expects WAV audio from Storybook" } };
  }

  const assessment = Buffer.from(JSON.stringify({
    ReferenceText: input.targetWord,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    EnableMiscue: true,
  })).toString("base64");
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Pronunciation-Assessment": assessment,
      },
      body: audioBytes(input.audioBase64),
    });
    if (!response.ok) {
      return { status: { provider: "azure", ok: false, status: "provider_error", message: `Azure ${response.status}` } };
    }
    const payload = await response.json() as unknown;
    return {
      result: normalizeAzurePronunciationPayload({
        targetWord: input.targetWord,
        payload,
        audioClipId: input.audioClipId,
        sourcePath: input.sourcePath,
        createdAt: input.createdAt,
      }),
      status: { provider: "azure", ok: true, status: "scored" },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: { provider: "azure", ok: false, status: "provider_error", message } };
  }
}

async function scoreWithSpeechace(
  input: PronunciationScienceCompareInput,
  env: Partial<Record<string, string | undefined>>,
  fetchImpl: FetchLike,
): Promise<{ result?: PronunciationScienceResult; status: PronunciationScienceProviderStatus }> {
  const key = env.SPEECHACE_API_KEY?.trim();
  if (!key) {
    return { status: { provider: "speechace", ok: false, status: "missing_key", message: "SPEECHACE_API_KEY missing" } };
  }
  try {
    const params = new URLSearchParams({
      key,
      dialect: "en-us",
      user_id: "sunny-storybook",
      text: input.targetWord,
    });
    const form = new FormData();
    const blob = new Blob([audioBytes(input.audioBase64)], { type: input.mimeType || "audio/wav" });
    form.append("user_audio_file", blob, "sunny-pronunciation.wav");
    const response = await fetchImpl(`https://api.speechace.co/api/scoring/text/v9/json?${params.toString()}`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      return { status: { provider: "speechace", ok: false, status: "provider_error", message: `Speechace ${response.status}` } };
    }
    const payload = await response.json() as unknown;
    return {
      result: normalizeSpeechacePronunciationPayload({
        targetWord: input.targetWord,
        payload,
        audioClipId: input.audioClipId,
        sourcePath: input.sourcePath,
        createdAt: input.createdAt,
      }),
      status: { provider: "speechace", ok: true, status: "scored" },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: { provider: "speechace", ok: false, status: "provider_error", message } };
  }
}

export async function comparePronunciationScienceProviders(
  rawInput: PronunciationScienceCompareInput,
  opts: {
    env?: Partial<Record<string, string | undefined>>;
    fetchImpl?: FetchLike;
    createdAt?: string;
  } = {},
): Promise<PronunciationScienceCompareOutput> {
  const targetWord = cleanTargetWord(rawInput.targetWord);
  if (!targetWord) throw new Error("targetWord required");
  if (!rawInput.audioBase64.trim()) throw new Error("audioBase64 required");
  const input: PronunciationScienceCompareInput = {
    ...rawInput,
    targetWord,
    mimeType: rawInput.mimeType || "audio/wav",
    createdAt: rawInput.createdAt ?? opts.createdAt ?? new Date().toISOString(),
  };
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const [azure, speechace] = await Promise.all([
    scoreWithAzure(input, env, fetchImpl),
    scoreWithSpeechace(input, env, fetchImpl),
  ]);
  const results = [azure.result, speechace.result].filter((result): result is PronunciationScienceResult => Boolean(result));
  return {
    targetWord,
    results,
    comparisons: comparePronunciationProviders(results),
    providerStatuses: [azure.status, speechace.status],
  };
}
