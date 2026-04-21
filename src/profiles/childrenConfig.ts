import fs from "fs";
import path from "path";
import type { CompanionConfig } from "../shared/companionTypes";
import { COMPANION_DEFAULTS } from "../shared/companionTypes";

export type ChildProfileEntry = {
  ttsName?: string;
  /** Same-origin path for picker card image only (optional). */
  avatarImagePath?: string | null;
};

export type ChildrenConfigFile = {
  defaultCompanionId: string;
  childCompanionIds: Record<string, string>;
  /** Per-child picker avatar + TTS spelling (optional keys). */
  childProfiles?: Record<string, ChildProfileEntry>;
  companions: Record<
    string,
    {
      id: string;
      vrmUrl: string;
      expressions: Record<string, string>;
      faceCamera: { position: number[]; target: number[] };
      dopamineGames: string[];
      sensitivity?: Partial<CompanionConfig["sensitivity"]>;
      idleFrequency_ms?: number;
      randomMomentProbability?: number;
      toggledOff?: boolean;
    }
  >;
};

let cached: ChildrenConfigFile | null = null;

export function readChildrenConfig(): ChildrenConfigFile {
  if (cached) return cached;
  const file = path.join(process.cwd(), "children.config.json");
  if (!fs.existsSync(file)) {
    throw new Error(
      `children.config.json not found at ${file}. Add repo-root children.config.json (companion presets).`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as ChildrenConfigFile;
  if (!raw.companions || typeof raw.defaultCompanionId !== "string") {
    throw new Error("children.config.json: missing companions or defaultCompanionId");
  }
  cached = raw;
  return raw;
}

export function clearChildrenConfigCache(): void {
  cached = null;
}

function capitalizeChildIdForTts(childId: string): string {
  const id = childId.trim().toLowerCase();
  if (id === "creator") return "Creator";
  if (!id) return childId;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Phonetic / friendly name for TTS (from children.config.json childProfiles).
 */
export function getTtsNameForChildId(childIdRaw: string): string {
  const id = childIdRaw.trim().toLowerCase();
  const cfg = readChildrenConfig();
  const row = cfg.childProfiles?.[id];
  const custom = row?.ttsName?.trim();
  if (custom) return custom;
  return capitalizeChildIdForTts(id);
}

export function getTtsNameForSessionChild(
  childName: "Ila" | "Reina" | "creator",
): string {
  const id = childName === "creator" ? "creator" : childName.toLowerCase();
  return getTtsNameForChildId(id);
}

/** Build a full CompanionConfig from one preset block + default sensitivity. */
export function companionConfigFromPreset(
  presetId: string,
  block: ChildrenConfigFile["companions"][string],
): CompanionConfig {
  return {
    companionId: presetId,
    vrmUrl: block.vrmUrl,
    expressions: { ...block.expressions },
    faceCamera: {
      position: [...block.faceCamera.position] as [number, number, number],
      target: [...block.faceCamera.target] as [number, number, number],
    },
    dopamineGames: [...block.dopamineGames],
    sensitivity: {
      ...COMPANION_DEFAULTS.sensitivity,
      ...(block.sensitivity ?? {}),
    },
    idleFrequency_ms: block.idleFrequency_ms ?? COMPANION_DEFAULTS.idleFrequency_ms,
    randomMomentProbability:
      block.randomMomentProbability ?? COMPANION_DEFAULTS.randomMomentProbability,
    toggledOff: block.toggledOff ?? false,
  };
}
