import { useEffect, useState } from "react";
import { CompanionShowroom } from "./components/CompanionShowroom";
import { COMPANION_MANIFEST } from "./companion/companions.generated";

// Voice-showdown sample texts matching the pasted voice-showdown source.
// getText is intentionally naive here — in production, Claude streams text per companion.
function getText(companionId: string): string {
  const entry = COMPANION_MANIFEST.find((c) => c.id === companionId);
  return entry?.showroom?.scripts.en.intro
    ? entry.showroom.scripts.en.intro
    : entry
      ? `Hi! I'm ${entry.name}. ${entry.personality.join(", ")}. Pick me and we'll have so much fun learning together!`
    : "Hey! I'm so excited to meet you!";
}

function shouldUseGrokBackground(): boolean {
  if (typeof window !== "undefined") {
    const explicit = new URLSearchParams(window.location.search).get("grokBackground");
    if (explicit === "false") return false;
    if (explicit === "true") return true;
  }
  if (import.meta.env.VITE_COMPANION_SHOWROOM_GROK_BACKGROUND === "false") {
    return false;
  }
  if (import.meta.env.VITE_COMPANION_SHOWROOM_GROK_BACKGROUND === "true") {
    return true;
  }
  return true;
}

export function CompanionShowroomPage() {
  const [grokBackgroundUrl, setGrokBackgroundUrl] = useState<string | null>(null);
  const [grokBackgroundLoading, setGrokBackgroundLoading] = useState(false);
  const useGrokBackground = shouldUseGrokBackground();

  useEffect(() => {
    if (!useGrokBackground) {
      setGrokBackgroundUrl(null);
      setGrokBackgroundLoading(false);
      return;
    }

    let cancelled = false;
    setGrokBackgroundLoading(true);
    const prompt =
      "A magical school-play showroom backdrop for VR companion characters in a children's learning app, " +
      "empty stage with three soft spotlight pools ready for 3D VR avatars, warm theatrical lights, " +
      "deep purple curtains, storybook wonder, same rich purple and gold color vibe, no text, " +
      "no people, no animals, no mascots, no characters, no creatures, wide cinematic background.";

    fetch(`/api/grok-image?prompt=${encodeURIComponent(prompt)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Grok background ${res.status}`);
        }
        return res.json() as Promise<{ url?: string | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setGrokBackgroundUrl(data.url ?? null);
          setGrokBackgroundLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.warn(
            "[CompanionShowroom] Grok background unavailable:",
            err instanceof Error ? err.message : String(err),
          );
          setGrokBackgroundUrl(null);
          setGrokBackgroundLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [useGrokBackground]);

  return (
    <CompanionShowroom
      onSelect={(id) => {
        console.log("[CompanionShowroom] selected:", id);
        // In production, persist to profile API then navigate.
      }}
      getText={getText}
      useGeneratedBackground={useGrokBackground}
      generatedBackgroundUrl={grokBackgroundUrl}
      generatedBackgroundLoading={grokBackgroundLoading}
      enableBackgroundMusic
    />
  );
}
