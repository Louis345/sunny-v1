import express from "express";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../engine/pronunciationScienceProviders", () => ({
  comparePronunciationScienceProviders: vi.fn(),
}));

import { comparePronunciationScienceProviders } from "../engine/pronunciationScienceProviders";
import { setupRoutes } from "./routes";

const mockedCompare = vi.mocked(comparePronunciationScienceProviders);

describe("POST /api/pronunciation-science/compare", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    vi.clearAllMocks();
  });

  async function postJson(body: Record<string, unknown>) {
    const app = express();
    app.use(express.json({ limit: "6mb" }));
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/pronunciation-science/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      body: await res.json() as Record<string, unknown>,
    };
  }

  it("requires a target word and audio clip", async () => {
    const noTarget = await postJson({ audioBase64: "abc", mimeType: "audio/wav" });
    const noAudio = await postJson({ targetWord: "ahead", mimeType: "audio/wav" });

    expect(noTarget).toMatchObject({ status: 400, body: { ok: false, error: "targetWord required" } });
    expect(noAudio).toMatchObject({ status: 400, body: { ok: false, error: "audioBase64 required" } });
    expect(mockedCompare).not.toHaveBeenCalled();
  });

  it("returns normalized provider comparison without exposing API keys", async () => {
    mockedCompare.mockResolvedValue({
      targetWord: "ahead",
      results: [{
        targetWord: "ahead",
        spokenTranscript: "ahead",
        provider: "azure",
        wordScore: 62,
        phonemeScores: [],
        syllableScores: [],
        soundMostLike: null,
        omissions: [],
        insertions: [],
        substitutions: [],
        stressScore: null,
        fluencyScore: null,
        prosodyScore: null,
        wilsonSignals: ["segmentation"],
        confidence: 0.62,
        audioClipId: "clip-1",
        sourcePath: "storybook_live_compare",
        createdAt: "2026-05-15T12:00:00.000Z",
      }],
      comparisons: [{
        targetWord: "ahead",
        providers: ["azure"],
        agreement: "insufficient",
        clearestProvider: "azure",
        reason: "Only one provider result was available.",
      }],
      providerStatuses: [
        { provider: "azure", ok: true, status: "scored" },
        { provider: "speechace", ok: false, status: "missing_key", message: "SPEECHACE_API_KEY missing" },
      ],
    });

    const out = await postJson({
      targetWord: "ahead",
      audioBase64: "abc",
      mimeType: "audio/wav",
      audioClipId: "clip-1",
    });

    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(true);
    expect(JSON.stringify(out.body)).not.toContain("AZURE_SPEECH_KEY");
    expect(JSON.stringify(out.body)).not.toContain("SPEECHACE_API_KEY=");
    expect(mockedCompare).toHaveBeenCalledWith(expect.objectContaining({
      targetWord: "ahead",
      audioBase64: "abc",
      mimeType: "audio/wav",
      audioClipId: "clip-1",
      sourcePath: "storybook_live_compare",
    }));
  });
});
