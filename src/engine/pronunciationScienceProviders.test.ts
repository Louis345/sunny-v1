import { describe, expect, it, vi } from "vitest";
import { comparePronunciationScienceProviders } from "./pronunciationScienceProviders";

function jsonResponse(value: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => value,
  } as Response;
}

describe("pronunciation science providers", () => {
  const audioBase64 = Buffer.from("RIFF fake wav").toString("base64");

  it("reports missing keys without calling provider APIs", async () => {
    const fetchImpl = vi.fn();

    const out = await comparePronunciationScienceProviders({
      targetWord: "ahead",
      audioBase64,
      mimeType: "audio/wav",
    }, {
      env: {},
      fetchImpl: fetchImpl as never,
      createdAt: "2026-05-15T12:00:00.000Z",
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.results).toHaveLength(0);
    expect(out.providerStatuses).toEqual([
      expect.objectContaining({ provider: "azure", status: "missing_key" }),
      expect.objectContaining({ provider: "speechace", status: "missing_key" }),
    ]);
  });

  it("calls Azure and Speechace with the same audio and returns normalized comparison", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
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
      }))
      .mockResolvedValueOnce(jsonResponse({
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
      }));

    const out = await comparePronunciationScienceProviders({
      targetWord: " ahead ",
      audioBase64,
      mimeType: "audio/wav",
    }, {
      env: {
        AZURE_SPEECH_KEY: "azure-key",
        AZURE_SPEECH_REGION: "eastus",
        SPEECHACE_API_KEY: "speechace-key",
      },
      fetchImpl: fetchImpl as never,
      createdAt: "2026-05-15T12:00:00.000Z",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("eastus.stt.speech.microsoft.com");
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("api.speechace.co");
    expect(out.targetWord).toBe("ahead");
    expect(out.results.map((result) => result.provider)).toEqual(["azure", "speechace"]);
    expect(out.comparisons[0]).toEqual(expect.objectContaining({
      targetWord: "ahead",
      agreement: "agree",
    }));
    expect(out.providerStatuses.every((status) => status.ok)).toBe(true);
  });

  it("keeps Speechace available when Azure cannot score non-WAV audio", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({
      text_score: {
        word_score_list: [{
          word: "ahead",
          quality_score: 80,
          phone_score_list: [{ phone: "ah", quality_score: 80 }],
        }],
      },
    }));

    const out = await comparePronunciationScienceProviders({
      targetWord: "ahead",
      audioBase64,
      mimeType: "audio/webm",
    }, {
      env: {
        AZURE_SPEECH_KEY: "azure-key",
        AZURE_SPEECH_REGION: "eastus",
        SPEECHACE_API_KEY: "speechace-key",
      },
      fetchImpl: fetchImpl as never,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out.providerStatuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "azure", status: "unsupported_audio" }),
      expect.objectContaining({ provider: "speechace", status: "scored" }),
    ]));
  });
});
