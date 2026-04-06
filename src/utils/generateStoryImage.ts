/**
 * Optional Grok image generation after reading/karaoke complete or explicit diag request.
 * No key or API failure → returns null; callers must still clear UI loading state.
 */

const GROK_IMAGE_ENDPOINT = "https://api.x.ai/v1/images/generations";

let grokStoryImageConfigLogged = false;

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

export async function generateStoryImage(
  storyText: string,
  options?: { useDirectScene?: boolean },
): Promise<string | null> {
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
    Style: joyful, age 7, no text in image,
    wide cinematic composition,
    magical storybook feeling.`;

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
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ url?: string }> };
    const url = json.data?.[0]?.url ?? null;
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
