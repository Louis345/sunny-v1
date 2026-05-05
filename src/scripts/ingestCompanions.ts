import fs from "node:fs";
import path from "node:path";
import { ANIMATION_IDS } from "../shared/companions/animations.generated";
import {
  mergeCompanionConfigWithDefaults,
  type CompanionConfig as SharedCompanionConfig,
} from "../shared/companionTypes";
import {
  companionConfigFromPreset,
  readChildrenConfig,
  type ChildrenConfigFile,
} from "../profiles/childrenConfig";

type PromptCompanionConfig = {
  name?: unknown;
  voiceId?: unknown;
  voiceModelId?: unknown;
  ttsName?: unknown;
  unlockCost?: unknown;
  vrmPath?: unknown;
  displayScale?: unknown;
  showInShowroom?: unknown;
  defaultFor?: unknown;
  /** When true, excluded from CompanionRegistry; still listed in intro showroom manifest. */
  introOnly?: unknown;
};

type ShowroomScripts = Record<
  string,
  {
    intro?: unknown;
    plead?: unknown;
  }
>;

type ShowroomConfig = {
  modelName?: unknown;
  sourceUrl?: unknown;
  recommendedNames?: unknown;
  ageImage?: unknown;
  personality?: unknown;
  personalityTags?: unknown;
  likes?: unknown;
  dislikes?: unknown;
  catchphrases?: unknown;
  specialSkills?: unknown;
  role?: unknown;
  outfitChangeEffect?: unknown;
  signatureMove?: unknown;
  gestureProfile?: unknown;
  voices?: unknown;
  scripts?: unknown;
};

type ShowroomSignatureMove = {
  id: string;
  name: string;
  trait: string;
  animation?: string;
  visibleLevels: string[];
  voiceLine: string;
  audioUrl?: string;
  vfx: string[];
  sfx: string[];
};

export type ShowroomVoiceOption = {
  id: string;
  label: string;
  language: string;
  default?: boolean;
};

type CompanionManifestEntry = {
  id: string;
  name: string;
  vrmUrl: string;
  personality: string[];
  unlockCost: number;
  voiceAvailable: boolean;
  voices: ShowroomVoiceOption[];
  companionConfig: SharedCompanionConfig;
  defaultFor?: string | string[];
  /** Intro showroom only — not in CompanionRegistry or children.config presets. */
  introOnly?: boolean;
  showroom?: {
    modelName?: string;
    sourceUrl?: string;
    recommendedNames: string[];
    ageImage?: string;
    personality: string;
    likes: string[];
    dislikes: string[];
    catchphrases: string[];
    specialSkills: string[];
    role?: string;
    outfitChangeEffect?: string;
    signatureMove?: ShowroomSignatureMove;
    gestureProfile: {
      meet: string;
      intro: string[];
      plead: string[];
      specialDance: string;
    };
    scripts: {
      en: {
        intro: string;
        plead: string;
      };
      ja?: {
        intro?: string;
        plead?: string;
      };
    };
  };
};

type CompanionManifestShowroom = NonNullable<CompanionManifestEntry["showroom"]>;

const repoRoot = process.cwd();
const companionsDir = path.join(repoRoot, "web", "public", "companions");
const promptCompanionsDir = path.join(repoRoot, "src", "prompts", "companions");
const outputPath = path.join(
  repoRoot,
  "web",
  "src",
  "companion",
  "companions.generated.ts",
);

const defaultPersonality = ["friendly", "curious", "loves learning"];
const animationIds = new Set<string>(ANIMATION_IDS);

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
}

function asDefaultFor(value: unknown): string | string[] | undefined {
  const single = asString(value);
  if (single) return single;
  const arr = asStringArray(value);
  return arr.length > 0 ? arr : undefined;
}

export function asGestureProfile(value: unknown): CompanionManifestShowroom["gestureProfile"] {
  const obj =
    value && typeof value === "object"
      ? (value as { meet?: unknown; intro?: unknown; plead?: unknown; specialDance?: unknown })
      : {};
  const meet = asString(obj.meet) ?? "wave";
  const intro = asStringArray(obj.intro);
  const plead = asStringArray(obj.plead);
  const specialDanceRaw = asString(obj.specialDance);
  const specialDance =
    specialDanceRaw && animationIds.has(specialDanceRaw)
      ? specialDanceRaw
      : "dance_victory";
  return {
    meet,
    intro: intro.length > 0 ? intro : ["wave", "think"],
    plead: plead.length > 0 ? plead : ["dance_victory", "wave"],
    specialDance,
  };
}

function asSignatureMove(value: unknown): ShowroomSignatureMove | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const id = asString(obj.id);
  const name = asString(obj.name);
  const trait = asString(obj.trait);
  const animation = asString(obj.animation);
  const voiceLine = asString(obj.voiceLine);
  const audioUrl = asString(obj.audioUrl);
  const visibleLevels = asStringArray(obj.visibleLevels);
  const vfx = asStringArray(obj.vfx);
  const sfx = asStringArray(obj.sfx);
  if (!id || !name || !trait || !voiceLine) return undefined;
  return {
    id,
    name,
    trait,
    ...(animation ? { animation } : {}),
    visibleLevels,
    voiceLine,
    ...(audioUrl ? { audioUrl } : {}),
    vfx,
    sfx,
  };
}

export function asVoiceOptions(
  showroom: Pick<ShowroomConfig, "voices"> | null,
  config: Pick<PromptCompanionConfig, "voiceId"> | null,
  companionName: string,
): ShowroomVoiceOption[] {
  const rawVoices =
    showroom?.voices && Array.isArray(showroom.voices) ? showroom.voices : [];
  const parsed = rawVoices
    .map((voice): ShowroomVoiceOption | null => {
      if (!voice || typeof voice !== "object") return null;
      const v = voice as Record<string, unknown>;
      const id = asString(v.id);
      if (!id) return null;
      return {
        id,
        label: asString(v.label) ?? `${companionName} Voice`,
        language: asString(v.language) ?? "en",
        ...(v.default === true ? { default: true } : {}),
      };
    })
    .filter((voice): voice is ShowroomVoiceOption => voice != null);

  if (parsed.length > 0) {
    const hasDefault = parsed.some((voice) => voice.default === true);
    return hasDefault ? parsed : parsed.map((voice, i) => ({ ...voice, default: i === 0 || undefined }));
  }

  const fallbackVoiceId = asString(config?.voiceId);
  return fallbackVoiceId
    ? [
        {
          id: fallbackVoiceId,
          label: `${companionName} Voice`,
          language: "en",
          default: true,
        },
      ]
    : [];
}

export function buildManifestCompanionConfig(
  companionId: string,
  showroomVrmUrl: string,
  configOrChildren:
    | PromptCompanionConfig
    | Pick<ChildrenConfigFile, "companions"> = {},
  childrenConfigArg?: Pick<ChildrenConfigFile, "companions">,
): SharedCompanionConfig {
  const config =
    "companions" in configOrChildren
      ? {}
      : (configOrChildren as PromptCompanionConfig);
  const childrenConfig =
    "companions" in configOrChildren
      ? configOrChildren
      : childrenConfigArg ?? readChildrenConfig();
  const preset = childrenConfig.companions[companionId];
  if (preset) {
    return companionConfigFromPreset(companionId, preset);
  }
  const displayScale =
    typeof config.displayScale === "number" && Number.isFinite(config.displayScale)
      ? config.displayScale
      : undefined;
  return mergeCompanionConfigWithDefaults({
    companionId,
    vrmUrl: showroomVrmUrl,
    ...(displayScale === undefined ? {} : { displayScale }),
  });
}

function normalizeVrmPath(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const file = path.basename(raw);
  if (!file.toLowerCase().endsWith(".vrm")) return null;
  const publicPath = path.join(companionsDir, file);
  return fs.existsSync(publicPath) ? `/companions/${file}` : null;
}

function resolveScripts(
  companionName: string,
  showroom: ShowroomConfig | null,
): CompanionManifestShowroom["scripts"] {
  const scripts = showroom?.scripts as ShowroomScripts | undefined;
  const en = scripts?.en ?? {};
  const intro =
    asString(en.intro) ??
    `Hi! I'm ${companionName}. I'm so excited to meet you.`;
  const plead =
    asString(en.plead) ??
    `Please pick me! I think we could have so much fun learning together.`;
  const ja = scripts?.ja;
  const jaIntro = ja ? asString(ja.intro) : undefined;
  const jaPlead = ja ? asString(ja.plead) : undefined;
  return {
    en: { intro, plead },
    ...(jaIntro || jaPlead ? { ja: { intro: jaIntro, plead: jaPlead } } : {}),
  };
}

function buildShowroom(
  companionName: string,
  showroom: ShowroomConfig | null,
): CompanionManifestShowroom {
  const personality =
    asString(showroom?.personality) ??
    `${companionName} is friendly, curious, and loves learning.`;
  const recommendedNames = asStringArray(showroom?.recommendedNames);
  return {
    modelName: asString(showroom?.modelName),
    sourceUrl: asString(showroom?.sourceUrl),
    recommendedNames: recommendedNames.length > 0 ? recommendedNames : [companionName],
    ageImage: asString(showroom?.ageImage),
    personality,
    likes: asStringArray(showroom?.likes),
    dislikes: asStringArray(showroom?.dislikes),
    catchphrases: asStringArray(showroom?.catchphrases),
    specialSkills: asStringArray(showroom?.specialSkills),
    role: asString(showroom?.role),
    outfitChangeEffect: asString(showroom?.outfitChangeEffect),
    signatureMove: asSignatureMove(showroom?.signatureMove),
    gestureProfile: asGestureProfile(showroom?.gestureProfile),
    scripts: resolveScripts(companionName, showroom),
  };
}

function renderProgress(done: number, total: number): void {
  const width = 10;
  const filled = total === 0 ? 0 : Math.round((done / total) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  process.stdout.write(`\rScanning companions... [${bar}] ${done}/${total}`);
}

function renderManifest(entries: CompanionManifestEntry[]): string {
  return `// AUTO-GENERATED by src/scripts/ingestCompanions.ts — do not edit by hand.

import type { CompanionConfig } from "../../../src/shared/companionTypes";

export type ShowroomVoiceOption = {
  id: string;
  label: string;
  language: string;
  default?: boolean;
};

export type CompanionManifestEntry = {
  id: string;
  name: string;
  vrmUrl: string;
  /** 3-5 adjectives an 8-year-old can understand, e.g. "super funny", "really patient" */
  personality: string[];
  unlockCost: number;
  voiceAvailable: boolean;
  voices: ShowroomVoiceOption[];
  companionConfig: CompanionConfig;
  defaultFor?: string | string[];
  /** Intro showroom only — not in CompanionRegistry. */
  introOnly?: boolean;
  showroom?: {
    modelName?: string;
    sourceUrl?: string;
    recommendedNames: string[];
    ageImage?: string;
    personality: string;
    likes: string[];
    dislikes: string[];
    catchphrases: string[];
    specialSkills: string[];
    role?: string;
    outfitChangeEffect?: string;
    signatureMove?: {
      id: string;
      name: string;
      trait: string;
      animation?: string;
      visibleLevels: string[];
      voiceLine: string;
      audioUrl?: string;
      vfx: string[];
      sfx: string[];
    };
    gestureProfile: {
      meet: string;
      intro: string[];
      plead: string[];
      specialDance: string;
    };
    scripts: {
      en: {
        intro: string;
        plead: string;
      };
      ja?: {
        intro?: string;
        plead?: string;
      };
    };
  };
};

export const COMPANION_MANIFEST: CompanionManifestEntry[] = ${JSON.stringify(entries, null, 2)};
`;
}

export function main(): void {
  if (!fs.existsSync(companionsDir)) {
    console.error(`Companions directory does not exist: ${companionsDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(promptCompanionsDir)) {
    console.error(`Prompt companions directory does not exist: ${promptCompanionsDir}`);
    process.exit(1);
  }

  const companionFolders = fs
    .readdirSync(promptCompanionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  renderProgress(0, companionFolders.length);

  const entries: CompanionManifestEntry[] = [];
  const skipped: string[] = [];

  companionFolders.forEach((dir, index) => {
    const base = path.join(promptCompanionsDir, dir.name);
    const config = readJson<PromptCompanionConfig>(path.join(base, "companion.json"));
    const personalityPath = path.join(base, "personality.md");
    if (!config || !fs.existsSync(personalityPath)) {
      skipped.push(`${dir.name} (missing companion.json or personality.md)`);
      renderProgress(index + 1, companionFolders.length);
      return;
    }

    if (config.showInShowroom === false) {
      skipped.push(`${dir.name} (showInShowroom=false)`);
      renderProgress(index + 1, companionFolders.length);
      return;
    }

    const vrmUrl = normalizeVrmPath(config.vrmPath);
    if (!vrmUrl) {
      skipped.push(`${dir.name} (missing VRM: ${String(config.vrmPath ?? "")})`);
      renderProgress(index + 1, companionFolders.length);
      return;
    }

    const name = asString(config.name) ?? dir.name;
    const showroom = readJson<ShowroomConfig>(path.join(base, "showroom.json"));
    const tags = asStringArray(showroom?.personalityTags);
    const unlockCost =
      typeof config.unlockCost === "number" && Number.isFinite(config.unlockCost)
        ? config.unlockCost
        : 0;
    const voices = asVoiceOptions(showroom, config, name);

    entries.push({
      id: dir.name,
      name,
      vrmUrl,
      personality: tags.length > 0 ? tags : defaultPersonality,
      unlockCost,
      voiceAvailable: voices.length > 0,
      voices,
      companionConfig: buildManifestCompanionConfig(dir.name, vrmUrl, config),
      defaultFor: asDefaultFor(config.defaultFor),
      ...(config.introOnly === true ? { introOnly: true as const } : {}),
      showroom: buildShowroom(name, showroom),
    });
    renderProgress(index + 1, companionFolders.length);
  });

  process.stdout.write("\n");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderManifest(entries), "utf8");
  console.log(`✅ Companion manifest written — ${entries.length} companions found.`);
  if (skipped.length > 0) {
    console.warn(`⚠️  Skipped companions: ${skipped.join(", ")}`);
  }
}

const shouldRunIngestCompanionsCli = /(?:^|[\\/])scripts[\\/]ingestCompanions\.ts$/.test(
  path.normalize(process.argv[1] ?? "").replace(/\\/g, "/"),
);

if (shouldRunIngestCompanionsCli) {
  main();
}
