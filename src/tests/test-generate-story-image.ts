import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { generateStoryImage } from "../utils/generateStoryImage";

describe("generateStoryImage", () => {
  const originalKey = process.env.GROK_API_KEY;
  const originalModel = process.env.GROK_IMAGE_MODEL;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [{ url: "https://example.com/i.png" }] }),
        } as Response),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    process.env.GROK_API_KEY = originalKey;
    process.env.GROK_IMAGE_MODEL = originalModel;
  });

  it("POSTs to xAI /v1/images/generations with default model", async () => {
    process.env.GROK_API_KEY = "test-key";
    delete process.env.GROK_IMAGE_MODEL;

    const url = await generateStoryImage("The cat sat. The dog ran fast.", {
      useDirectScene: false,
    });

    expect(url).toBe("https://example.com/i.png");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.x.ai/v1/images/generations",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.model).toBe("grok-imagine-image");
    expect(body.prompt).toContain("dog ran fast");
  });

  it("useDirectScene sends full string as scene without sentence split requirement", async () => {
    process.env.GROK_API_KEY = "test-key";
    const url = await generateStoryImage("forest", { useDirectScene: true });
    expect(url).toBe("https://example.com/i.png");
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.prompt).toContain("Scene: forest");
  });

  it("does not call Grok when SUNNY_MODE=diag", async () => {
    vi.stubEnv("SUNNY_MODE", "diag");
    process.env.GROK_API_KEY = "test-key";
    const url = await generateStoryImage("forest", { useDirectScene: true });
    expect(url).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
