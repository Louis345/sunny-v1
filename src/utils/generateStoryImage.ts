/**
 * Optional Grok image generation after reading/karaoke complete or explicit diag request.
 * No key or API failure → returns null; callers must still clear UI loading state.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { isDiagMapMode } from "./runtimeMode";
import { sunnyPreviewBlocksPersistence } from "./runtimeMode";

const GROK_IMAGE_ENDPOINT = "https://api.x.ai/v1/images/generations";

let grokStoryImageConfigLogged = false;
let generatedThisRun = 0;
let providerCooldownUntil = 0;

type StoryImageCacheEntry = {
  url: string;
  promptHash: string;
  promptPreview: string;
  purpose: string;
  createdAt: string;
};

type StoryImageCacheFile = {
  version: 1;
  providerCooldownUntil?: string;
  entries: Record<string, StoryImageCacheEntry>;
};

export type GenerateStoryImageOptions = {
  useDirectScene?: boolean;
  sessionType?: string;
  purpose?: string;
  cacheKeyParts?: string[];
  forceGenerateInPreview?: boolean;
};

function logGrokImageConfigOnce(model: string | null): void {
  if (grokStoryImageConfigLogged) return;
  grokStoryImageConfigLogged = true;
  const key = process.env.GROK_API_KEY?.trim();
  if (!key) {
    console.log("  [story-image] No API key — image generation disabled");
    return;
  }
  console.log(`  [story-image] GROK_API_KEY set — using model: ${model}`);
}

function cachePath(): string {
  return (
    process.env.SUNNY_IMAGE_CACHE_PATH?.trim() ||
    path.join(process.cwd(), ".prompt-cache", "story-image-cache.json")
  );
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function imageGenerationMaxPerRun(): number {
  return readPositiveInteger(process.env.SUNNY_IMAGE_GENERATION_MAX_PER_RUN, 1);
}

function cooldownMs(): number {
  return readPositiveInteger(process.env.SUNNY_IMAGE_COOLDOWN_MINUTES, 60) * 60 * 1000;
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 24);
}

function readCache(): StoryImageCacheFile {
  const file = cachePath();
  try {
    if (!fs.existsSync(file)) return { version: 1, entries: {} };
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<StoryImageCacheFile>;
    const cooldown = parsed.providerCooldownUntil
      ? Date.parse(parsed.providerCooldownUntil)
      : NaN;
    if (Number.isFinite(cooldown)) providerCooldownUntil = Math.max(providerCooldownUntil, cooldown);
    return {
      version: 1,
      providerCooldownUntil: parsed.providerCooldownUntil,
      entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {},
    };
  } catch (err) {
    console.warn(
      "  🎮 [story-image] [cache] [read-failed]",
      err instanceof Error ? err.message : String(err),
    );
    return { version: 1, entries: {} };
  }
}

function writeCache(cache: StoryImageCacheFile): void {
  const file = cachePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(cache, null, 2)}\n`);
  } catch (err) {
    console.warn(
      "  🎮 [story-image] [cache] [write-failed]",
      err instanceof Error ? err.message : String(err),
    );
  }
}

function cacheKeyFor(prompt: string, options?: GenerateStoryImageOptions): string {
  const parts = options?.cacheKeyParts?.filter((part) => part.trim().length > 0) ?? [];
  const basis = parts.length ? parts.join("::") : prompt;
  return hashText(basis);
}

function lookupCachedImage(prompt: string, options?: GenerateStoryImageOptions): string | null {
  const cache = readCache();
  const key = cacheKeyFor(prompt, options);
  const entry = cache.entries[key];
  if (!entry?.url) return null;
  console.log(`  🎮 [story-image] [cache] [hit] key=${key} purpose=${entry.purpose}`);
  return entry.url;
}

function saveCachedImage(
  prompt: string,
  url: string,
  options?: GenerateStoryImageOptions,
): void {
  const cache = readCache();
  const key = cacheKeyFor(prompt, options);
  cache.entries[key] = {
    url,
    promptHash: hashText(prompt),
    promptPreview: prompt.slice(0, 180),
    purpose: options?.purpose ?? "story-image",
    createdAt: new Date().toISOString(),
  };
  writeCache(cache);
  console.log(`  🎮 [story-image] [cache] [saved] key=${key} purpose=${cache.entries[key].purpose}`);
}

function openProviderCooldown(): void {
  providerCooldownUntil = Date.now() + cooldownMs();
  const cache = readCache();
  cache.providerCooldownUntil = new Date(providerCooldownUntil).toISOString();
  writeCache(cache);
  console.warn(
    `  🎮 [story-image] [provider] [cooldown] until=${cache.providerCooldownUntil}`,
  );
}

function canGenerateNewImage(options?: GenerateStoryImageOptions): boolean {
  readCache();
  if (process.env.SUNNY_IMAGE_GENERATION?.trim().toLowerCase() === "off") {
    console.log("  🎮 [story-image] [budget] [disabled]");
    return false;
  }
  if (sunnyPreviewBlocksPersistence() && !options?.forceGenerateInPreview) {
    console.log("  🎮 [story-image] [budget] [preview-blocked]");
    return false;
  }
  if (providerCooldownUntil > Date.now()) {
    console.log(
      `  🎮 [story-image] [provider] [cooldown-active] until=${new Date(providerCooldownUntil).toISOString()}`,
    );
    return false;
  }
  const maxPerRun = imageGenerationMaxPerRun();
  if (generatedThisRun >= maxPerRun) {
    console.log(
      `  🎮 [story-image] [budget] [blocked] generated=${generatedThisRun} max=${maxPerRun}`,
    );
    return false;
  }
  generatedThisRun += 1;
  console.log(
    `  🎮 [story-image] [budget] [reserved] generated=${generatedThisRun} max=${maxPerRun} purpose=${options?.purpose ?? "story-image"}`,
  );
  return true;
}

export function resetStoryImageBudgetForTests(): void {
  grokStoryImageConfigLogged = false;
  generatedThisRun = 0;
  providerCooldownUntil = 0;
}

export async function generateStoryImage(
  storyText: string,
  options?: GenerateStoryImageOptions,
): Promise<string | null> {
  if (isDiagMapMode() || options?.sessionType === "diag") {
    return null;
  }

  const apiKey = process.env.GROK_API_KEY;
  const model =
    process.env.GROK_IMAGE_MODEL?.trim() || "grok-imagine-image";

  if (!apiKey?.trim()) {
    logGrokImageConfigOnce(null);
    return null;
  }
  logGrokImageConfigOnce(model);

  let scene: string;
  if (options?.useDirectScene) {
    scene = storyText.trim();
  } else {
    const sentences = storyText
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);
    scene = sentences.slice(-2).join(". ").trim();
  }
  if (!scene) {
    console.log("  🎮 [story-image] No usable scene from story — skipping");
    return null;
  }

  const prompt = `Children's book illustration,
    Pixar 3D animation quality,
    warm vibrant colors, soft lighting.
    Scene: ${scene}.
    Use a homework-relevant background that reinforces the concept in the scene.
    Keep the child or main subject as the clear focal point with strong foreground/background contrast.
    Style: joyful, age 7, no text in image,
    wide cinematic composition,
    magical storybook feeling.`;

  const cached = lookupCachedImage(prompt, options);
  if (cached) return cached;

  if (!canGenerateNewImage(options)) return null;

  try {
    const res = await fetch(GROK_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[story-image] API error:", res.status, body);
      if (res.status === 429) openProviderCooldown();
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ url?: string }> };
    const url = json.data?.[0]?.url ?? null;
    if (url) saveCachedImage(prompt, url, options);
    console.log(
      url
        ? "  🎮 [story-image] ✅ generated"
        : "  🎮 [story-image] ❌ no url",
    );
    return url;
  } catch (err) {
    console.error(
      "  🎮 [story-image] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
