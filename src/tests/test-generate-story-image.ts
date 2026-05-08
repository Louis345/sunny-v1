import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  generateStoryImage,
  resetStoryImageBudgetForTests,
} from "../utils/generateStoryImage";

describe("generateStoryImage", () => {
  const originalKey = process.env.GROK_API_KEY;
  const originalModel = process.env.GROK_IMAGE_MODEL;
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-story-image-"));
    process.env.SUNNY_IMAGE_CACHE_PATH = path.join(tempDir, "story-image-cache.json");
    process.env.SUNNY_IMAGE_GENERATION_MAX_PER_RUN = "20";
    process.env.SUNNY_PREVIEW_MODE = "";
    resetStoryImageBudgetForTests();
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
    if (originalKey === undefined) delete process.env.GROK_API_KEY;
    else process.env.GROK_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GROK_IMAGE_MODEL;
    else process.env.GROK_IMAGE_MODEL = originalModel;
    resetStoryImageBudgetForTests();
    fs.rmSync(tempDir, { recursive: true, force: true });
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

  it("asks Grok for a homework-relevant background and stronger foreground/background contrast", async () => {
    process.env.GROK_API_KEY = "test-key";
    await generateStoryImage("Reina studies erosion near a changing hill.", {
      useDirectScene: true,
    });
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.prompt).toMatch(/homework-relevant background/i);
    expect(body.prompt).toMatch(/foreground\/background contrast/i);
  });

  it("does not call Grok when SUNNY_MODE=diag", async () => {
    vi.stubEnv("SUNNY_MODE", "diag");
    process.env.GROK_API_KEY = "test-key";
    const url = await generateStoryImage("forest", { useDirectScene: true });
    expect(url).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("reuses cached images for the same prompt instead of spending another Grok call", async () => {
    process.env.GROK_API_KEY = "test-key";

    const first = await generateStoryImage("same spelling arcade background", {
      useDirectScene: true,
      purpose: "baseline-background",
    });
    const second = await generateStoryImage("same spelling arcade background", {
      useDirectScene: true,
      purpose: "baseline-background",
    });

    expect(first).toBe("https://example.com/i.png");
    expect(second).toBe("https://example.com/i.png");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("blocks new generations after the per-run image budget is exhausted", async () => {
    process.env.GROK_API_KEY = "test-key";
    process.env.SUNNY_IMAGE_GENERATION_MAX_PER_RUN = "1";

    const first = await generateStoryImage("first unique image", {
      useDirectScene: true,
    });
    const second = await generateStoryImage("second unique image", {
      useDirectScene: true,
    });

    expect(first).toBe("https://example.com/i.png");
    expect(second).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("opens a provider cooldown after a 429 so later calls do not keep burning requests", async () => {
    process.env.GROK_API_KEY = "test-key";
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve("monthly spending limit"),
    } as Response);

    const first = await generateStoryImage("expensive first image", {
      useDirectScene: true,
    });
    const second = await generateStoryImage("expensive second image", {
      useDirectScene: true,
    });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("does not generate new images in preview mode, but can still return cached art", async () => {
    process.env.GROK_API_KEY = "test-key";
    await generateStoryImage("cached preview art", { useDirectScene: true });
    vi.mocked(fetch).mockClear();
    process.env.SUNNY_PREVIEW_MODE = "free";

    const cached = await generateStoryImage("cached preview art", {
      useDirectScene: true,
    });
    const blocked = await generateStoryImage("uncached preview art", {
      useDirectScene: true,
    });

    expect(cached).toBe("https://example.com/i.png");
    expect(blocked).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
