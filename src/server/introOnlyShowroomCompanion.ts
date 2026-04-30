import fs from "node:fs";
import path from "node:path";

/** Minimal companion row for POST /api/companions/:id/speak when id is intro-only (not in CompanionRegistry). */
export type IntroOnlyShowroomSpeakMeta = {
  id: string;
  name: string;
  voiceId: string;
  voiceModelId?: string;
};

/**
 * Load `companion.json` for an intro-only showroom character (registry excludes these).
 * Returns null if missing, not intro-only, or no voice id.
 */
export function tryLoadIntroOnlyShowroomCompanion(
  companionId: string,
): IntroOnlyShowroomSpeakMeta | null {
  const id = companionId.trim();
  if (!id) return null;
  const base = path.join(process.cwd(), "src", "prompts", "companions", id);
  const cfgPath = path.join(base, "companion.json");
  if (!fs.existsSync(cfgPath)) return null;
  const raw = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as Record<string, unknown>;
  if (raw.introOnly !== true) return null;
  const name =
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id;
  const voiceId = typeof raw.voiceId === "string" ? raw.voiceId.trim() : "";
  if (!voiceId) return null;
  const voiceModelId =
    typeof raw.voiceModelId === "string" && raw.voiceModelId.trim()
      ? raw.voiceModelId.trim()
      : undefined;
  return { id, name, voiceId, voiceModelId };
}
