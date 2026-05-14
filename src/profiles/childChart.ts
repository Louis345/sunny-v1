import fs from "fs";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { WordBankFile } from "../context/schemas/wordBank";
import { createEmptyWordBank } from "../context/schemas/wordBank";
import type { ChildProfileEntry, ChildrenConfigFile } from "./childrenConfig";
import { companionConfigFromPreset } from "./childrenConfig";
import type { CompanionConfig } from "../shared/companionTypes";
import { COMPANION_DEFAULTS, mergeCompanionPresetWithLearningProfile } from "../shared/companionTypes";
import { resolveAttentionModel, type ResolvedAttentionModel } from "../engine/attentionModel";
import { companionCareToView } from "../engine/companionCareEngine";
import type {
  CompanionCarePlan,
  CompanionCareView,
} from "../shared/companionCareTypes";
import { loadCompanionCarePlanForChart } from "./companionCarePlan";

export type ChildProfileManifest = {
  childId: string;
  identity?: {
    displayName?: string;
    ttsName?: string;
    avatarImagePath?: string | null;
  };
  demographics?: Partial<LearningProfile["demographics"]>;
  companion?: {
    companionId?: string;
  };
  economy?: {
    coinBalance?: number;
  };
  links?: Partial<ChildChartLinks>;
};

export type ChildChartLinks = {
  learningProfile: string;
  wordBank: string;
  homework: string;
  attempts: string;
  vitals: string;
  carePlans: string;
  companionCareDir: string;
};

export type ChildChart = {
  childId: string;
  rootDir: string;
  manifestSource: "manifest" | "fallback";
  manifest: ChildProfileManifest;
  identity: {
    displayName: string;
    ttsName: string;
    avatarImagePath?: string | null;
  };
  demographics: LearningProfile["demographics"];
  links: ChildChartLinks;
  learningProfile: LearningProfile;
  wordBank: WordBankFile;
  wordBankSummary: {
    totalWords: number;
    dueWords: number;
  };
  homework: {
    pending: LearningProfile["pendingHomework"] | null;
    cyclesDir: string;
  };
  plannerTrust: LearningProfile["plannerTrust"] | null;
  activeSessionPlan: LearningProfile["activeSessionPlan"] | null;
  attention: ResolvedAttentionModel;
  latestAttentionVitals: unknown | null;
  economy: {
    coinBalance: number;
  };
  childContext: string;
  childMeta?: ChildProfileEntry;
  companion: {
    presetId: string;
    config: CompanionConfig;
    displayName: string;
  };
  companionCare: {
    plan: CompanionCarePlan;
    view: CompanionCareView;
    filePath: string;
    existed: boolean;
  };
};

export type ChildChartOptions = {
  rootDir?: string;
};

function normalizeChildId(raw: string): string {
  return raw.trim().toLowerCase();
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function contextDir(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId);
}

function resolveLinkedPath(baseDir: string, link: string): string {
  return path.isAbsolute(link) ? link : path.join(baseDir, link);
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function readChildrenConfigFromRoot(rootDir: string): ChildrenConfigFile | null {
  return readJson<ChildrenConfigFile>(path.join(rootDir, "children.config.json"));
}

function defaultLinks(): ChildChartLinks {
  return {
    learningProfile: "learning_profile.json",
    wordBank: "word_bank.json",
    homework: "homework/",
    attempts: "attempts/",
    vitals: "vitals/",
    carePlans: "care_plans/",
    companionCareDir: "companion_care/",
  };
}

function readLearningProfileFromLink(childId: string, links: ChildChartLinks): LearningProfile {
  const profile = readJson<LearningProfile>(links.learningProfile);
  if (!profile) {
    throw new Error(`Learning profile not found for child: ${childId}`);
  }
  return profile;
}

function readWordBankFromLink(childId: string, links: ChildChartLinks): WordBankFile {
  return readJson<WordBankFile>(links.wordBank) ?? createEmptyWordBank(childId);
}

function countDueWords(wordBank: WordBankFile, today: string): number {
  return wordBank.words.filter((entry) =>
    Object.values(entry.tracks ?? {}).some((track) => track && track.nextReviewDate <= today),
  ).length;
}

function readChildContext(rootDir: string, childId: string): string {
  const file = path.join(contextDir(rootDir, childId), `${childId}_context.md`);
  if (!fs.existsSync(file)) return "";
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function latestJsonLikeFile(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json") || file.endsWith(".ndjson"))
    .map((file) => path.join(dir, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] ?? null;
}

function readLatestVitals(vitalsDir: string): unknown | null {
  const file = latestJsonLikeFile(vitalsDir);
  if (!file) return null;
  if (file.endsWith(".json")) return readJson<unknown>(file);
  try {
    const lines = fs.readFileSync(file, "utf8").trim().split(/\n+/).filter(Boolean);
    return lines.length ? JSON.parse(lines[lines.length - 1]!) : null;
  } catch {
    return null;
  }
}

function fallbackCompanionConfig(presetId: string): CompanionConfig {
  return {
    companionId: presetId,
    vrmUrl: "",
    expressions: {},
    faceCamera: { position: [0, 1.4, 2.2], target: [0, 1.2, 0] },
    dopamineGames: [],
    sensitivity: { ...COMPANION_DEFAULTS.sensitivity },
    idleFrequency_ms: 45_000,
    randomMomentProbability: 0,
    toggledOff: false,
  };
}

export function getChildChart(childIdRaw: string, opts: ChildChartOptions = {}): ChildChart {
  const rootDir = opts.rootDir ?? process.cwd();
  const childId = normalizeChildId(childIdRaw);
  const baseDir = contextDir(rootDir, childId);
  const manifestFile = path.join(baseDir, "child_profile.json");
  const manifestFromFile = readJson<ChildProfileManifest>(manifestFile);
  const manifestSource: ChildChart["manifestSource"] = manifestFromFile
    ? "manifest"
    : "fallback";
  const cfg = readChildrenConfigFromRoot(rootDir);
  const childMeta = cfg?.childProfiles?.[childId];
  const manifest: ChildProfileManifest = manifestFromFile ?? {
    childId,
    identity: {
      displayName: capitalize(childId),
      ttsName: childMeta?.ttsName ?? capitalize(childId),
      avatarImagePath: childMeta?.avatarImagePath,
    },
    companion: {
      companionId: cfg?.childCompanionIds?.[childId] ?? cfg?.defaultCompanionId,
    },
    links: defaultLinks(),
  };

  const relativeLinks = { ...defaultLinks(), ...(manifest.links ?? {}) };
  const links = Object.fromEntries(
    Object.entries(relativeLinks).map(([key, value]) => [
      key,
      resolveLinkedPath(baseDir, value),
    ]),
  ) as ChildChartLinks;
  const learningProfile = readLearningProfileFromLink(childId, links);
  const wordBank = readWordBankFromLink(childId, links);
  const demographics: LearningProfile["demographics"] = {
    ...learningProfile.demographics,
    ...(manifest.demographics ?? {}),
  };
  const displayName = manifest.identity?.displayName ?? capitalize(childId);
  const ttsName = manifest.identity?.ttsName ?? childMeta?.ttsName ?? displayName;
  const coinBalance = Math.max(
    0,
    Math.floor(Number(manifest.economy?.coinBalance ?? learningProfile.companionCurrency ?? 0)),
  );
  const presetId =
    manifest.companion?.companionId ??
    learningProfile.companion?.companionId ??
    cfg?.childCompanionIds?.[childId] ??
    cfg?.defaultCompanionId ??
    "elli";
  const presetBlock = cfg?.companions?.[presetId];
  if (cfg && !presetBlock) {
    throw new Error(
      `children.config.json: unknown companion preset "${presetId}" for child "${childId}"`,
    );
  }
  const presetConfig = presetBlock
    ? companionConfigFromPreset(presetId, presetBlock)
    : fallbackCompanionConfig(presetId);
  const companionConfig = mergeCompanionPresetWithLearningProfile(
    presetConfig,
    learningProfile.companion,
  );
  const companion = {
    presetId,
    config: companionConfig,
    displayName: capitalize(presetId),
  };
  const today = new Date().toISOString().slice(0, 10);
  const chartBase = {
    childId,
    rootDir,
    manifestSource,
    manifest,
    identity: {
      displayName,
      ttsName,
      avatarImagePath: manifest.identity?.avatarImagePath ?? childMeta?.avatarImagePath,
    },
    demographics,
    links,
    learningProfile,
    wordBank,
    wordBankSummary: {
      totalWords: wordBank.words.length,
      dueWords: countDueWords(wordBank, today),
    },
    homework: {
      pending: learningProfile.pendingHomework ?? null,
      cyclesDir: path.join(links.homework, "cycles"),
    },
    plannerTrust: learningProfile.plannerTrust ?? null,
    activeSessionPlan: learningProfile.activeSessionPlan ?? null,
    attention: resolveAttentionModel({ ...learningProfile, demographics }),
    latestAttentionVitals: readLatestVitals(links.vitals),
    economy: {
      coinBalance,
    },
    childContext: readChildContext(rootDir, childId),
    childMeta,
    companion,
  };
  const companionCareLoaded = loadCompanionCarePlanForChart(chartBase, {
    persistOnCreate: false,
  });

  return {
    ...chartBase,
    companionCare: {
      plan: companionCareLoaded.plan,
      view: companionCareToView(companionCareLoaded.plan, companion.displayName),
      filePath: companionCareLoaded.filePath,
      existed: !companionCareLoaded.created,
    },
  };
}
