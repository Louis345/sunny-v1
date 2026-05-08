import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { generateStoryVideo } from "../utils/generateStoryVideo";

describe("generateStoryVideo", () => {
  const originalKey = process.env.GROK_API_KEY;
  const originalModel = process.env.GROK_VIDEO_MODEL;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    process.env.GROK_API_KEY = originalKey;
    process.env.GROK_VIDEO_MODEL = originalModel;
  });

  it("animates the story image through xAI video generations and polls for the video URL", async () => {
    process.env.GROK_API_KEY = "test-key";
    delete process.env.GROK_VIDEO_MODEL;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ request_id: "vid_123" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "done", video: { url: "https://example.com/m.mp4" } }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const url = await generateStoryVideo({
      imageUrl: "https://example.com/erosion.png",
      prompt: "Animate Reina learning erosion.",
      pollDelayMs: 1,
      maxPolls: 2,
    });

    expect(url).toBe("https://example.com/m.mp4");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.x.ai/v1/videos/generations",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: "grok-imagine-video",
      prompt: expect.stringContaining("Animate Reina learning erosion."),
      image: { url: "https://example.com/erosion.png" },
      duration: 6,
      aspect_ratio: "16:9",
      resolution: "480p",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.x.ai/v1/videos/vid_123",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("does not call Grok video when SUNNY_MODE=diag", async () => {
    vi.stubEnv("SUNNY_MODE", "diag");
    process.env.GROK_API_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const url = await generateStoryVideo({
      imageUrl: "https://example.com/erosion.png",
      prompt: "Animate this.",
      pollDelayMs: 1,
      maxPolls: 1,
    });

    expect(url).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
