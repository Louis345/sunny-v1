/**
 * Optional Grok video generation for story reward movies.
 * No key, diag mode, timeout, or API failure -> null; callers should not spend coins.
 */

import { isDiagMapMode } from "./runtimeMode";

const GROK_VIDEO_GENERATE_ENDPOINT = "https://api.x.ai/v1/videos/generations";
const GROK_VIDEO_STATUS_ENDPOINT = "https://api.x.ai/v1/videos";

let grokStoryVideoConfigLogged = false;

function logGrokVideoConfigOnce(model: string | null): void {
  if (grokStoryVideoConfigLogged) return;
  grokStoryVideoConfigLogged = true;
  const key = process.env.GROK_API_KEY?.trim() || process.env.XAI_API_KEY?.trim();
  if (!key) {
    console.log("  [story-movie] No API key — video generation disabled");
    return;
  }
  console.log(`  [story-movie] GROK/XAI key set — using model: ${model}`);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateStoryVideo(input: {
  imageUrl: string;
  prompt: string;
  durationSeconds?: number;
  pollDelayMs?: number;
  maxPolls?: number;
}): Promise<string | null> {
  if (isDiagMapMode()) return null;

  const apiKey = process.env.GROK_API_KEY?.trim() || process.env.XAI_API_KEY?.trim();
  const model = process.env.GROK_VIDEO_MODEL?.trim() || "grok-imagine-video";
  if (!apiKey) {
    logGrokVideoConfigOnce(null);
    return null;
  }
  logGrokVideoConfigOnce(model);

  const imageUrl = input.imageUrl.trim();
  const scenePrompt = input.prompt.trim();
  if (!imageUrl || !scenePrompt) return null;

  const prompt = [
    scenePrompt,
    "Animate this as a short children's learning movie.",
    "Use meaningful motion that teaches the concept, not just camera zoom.",
    "Show cause and effect clearly with child-friendly pacing.",
    "No text overlays.",
  ].join(" ");

  try {
    const create = await fetch(GROK_VIDEO_GENERATE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        image: { url: imageUrl },
        duration: input.durationSeconds ?? 6,
        aspect_ratio: "16:9",
        resolution: "480p",
      }),
    });
    if (!create.ok) {
      const body = await create.text();
      console.error("[story-movie] API error:", create.status, body);
      return null;
    }
    const createJson = (await create.json()) as { request_id?: string };
    const requestId = createJson.request_id;
    if (!requestId) return null;

    const maxPolls = input.maxPolls ?? 36;
    const pollDelayMs = input.pollDelayMs ?? 5000;
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      if (attempt > 0) await sleep(pollDelayMs);
      const status = await fetch(`${GROK_VIDEO_STATUS_ENDPOINT}/${encodeURIComponent(requestId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!status.ok) {
        const body = await status.text();
        console.error("[story-movie] poll error:", status.status, body);
        return null;
      }
      const data = (await status.json()) as {
        status?: string;
        video?: { url?: string };
      };
      if (data.status === "done") {
        const url = data.video?.url ?? null;
        console.log(url ? "  🎮 [story-movie] ✅ generated" : "  🎮 [story-movie] ❌ no url");
        return url;
      }
      if (data.status === "expired" || data.status === "failed") {
        console.error("[story-movie] generation ended:", data.status);
        return null;
      }
    }
    console.error("[story-movie] generation timed out");
    return null;
  } catch (err) {
    console.error(
      "  🎮 [story-movie] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
