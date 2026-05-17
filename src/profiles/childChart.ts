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
import {
  activeHomeworkByDomainView,
  activeSessionPlanByDomainView,
  selectedHomeworkDomain,
} from "../engine/homeworkLanes";
import type {
  CompanionCarePlan,
  CompanionCareView,
} from "../shared/companionCareTypes";
import { loadCompanionCarePlanForChart } from "./companionCarePlan";
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  defaultWaterfallLinks,
  hydrateLearningProfileFromWaterfall,
  readLatestDecisionTrace,
  readWaterfallCarePlan,
  readWaterfallContentCatalog,
  readWaterfallHomework,
  readWaterfallSessionPlan,
  resolveWaterfallLinks,
  type DecisionTraceEvent,
  type WaterfallCarePlanFile,
  type WaterfallContentCatalogFile,
  type WaterfallHomeworkFile,
  type WaterfallSessionPlanFile,
} from "./chartWaterfall";

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
  todayPlan: string;
  currentCarePlan: string;
  currentHomework: string;
  homeworkLanes: string;
  currentSessionPlan: string;
  sessionPlanLanes: string;
  contentCatalog: string;
  decisionTraces: string;
  homework: string;
  attempts: string;
  ratings: string;
  vitals: string;
  sessionNotes: string;
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
    activeByDomain: NonNullable<LearningProfile["activeHomeworkByDomain"]>;
    selectedDomain: LearningProfile["selectedHomeworkDomain"] | null;
    cyclesDir: string;
    currentFile: string;
    waterfall: WaterfallHomeworkFile;
  };
  plannerTrust: LearningProfile["plannerTrust"] | null;
  activeSessionPlan: LearningProfile["activeSessionPlan"] | null;
  sessionPlan: {
    filePath: string;
    existed: boolean;
    waterfall: WaterfallSessionPlanFile;
  };
  todayPlan: {
    filePath: string;
    existed: boolean;
    data: unknown | null;
  };
  carePlan: {
    filePath: string;
    existed: boolean;
    current: WaterfallCarePlanFile | null;
  };
  learningExperiments: LearningProfile["learningExperiments"];
  contentCatalog: {
    filePath: string;
    items: WaterfallContentCatalogFile["items"];
    summary: {
      total: number;
      reusable: number;
      needsRevision: number;
      retired: number;
      candidates: number;
    };
  };
  evidence: {
    links: {
      attempts: string;
      ratings: string;
      vitals: string;
      sessionNotes: string;
    };
    latestAttentionVitals: unknown | null;
  };
  decisionTrace: {
    dir: string;
    latest: DecisionTraceEvent | null;
  };
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
  return resolveChildContextDir(childId, { rootDir });
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
    ...defaultWaterfallLinks(),
    carePlans: "care_plans/",
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
  let links = Object.fromEntries(
    Object.entries(relativeLinks).map(([key, value]) => [
      key,
      resolveLinkedPath(baseDir, value),
    ]),
  ) as ChildChartLinks;
  const rawLearningProfile = readLearningProfileFromLink(childId, links);
  links = {
    ...links,
    ...resolveWaterfallLinks(childId, {
      ...relativeLinks,
      ...(rawLearningProfile.chartLinks ?? {}),
    }, { rootDir }),
  } as ChildChartLinks;
  const learningProfile = hydrateLearningProfileFromWaterfall(childId, rawLearningProfile, { rootDir });
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
  const homeworkWaterfall = readWaterfallHomework(childId, learningProfile, { rootDir });
  const sessionPlanWaterfall = readWaterfallSessionPlan(childId, learningProfile, { rootDir });
  const carePlanWaterfall = readWaterfallCarePlan(childId, learningProfile, { rootDir });
  const contentCatalogWaterfall = readWaterfallContentCatalog(childId, { rootDir });
  const todayPlan = readJson<unknown>(links.todayPlan);
  const latestDecisionTrace = readLatestDecisionTrace(childId, learningProfile, { rootDir });
  const homeworkSelectedDomain = homeworkWaterfall.selectedDomain ?? selectedHomeworkDomain(learningProfile);
  const homeworkActiveByDomain =
    Object.keys(homeworkWaterfall.activeByDomain).length > 0
      ? homeworkWaterfall.activeByDomain
      : activeHomeworkByDomainView(learningProfile);
  const selectedPendingHomework =
    homeworkWaterfall.current ??
    (homeworkSelectedDomain ? homeworkActiveByDomain[homeworkSelectedDomain] : undefined) ??
    learningProfile.pendingHomework ??
    null;
  const activeSessionPlanByDomain =
    Object.keys(sessionPlanWaterfall.activeByDomain).length > 0
      ? sessionPlanWaterfall.activeByDomain
      : activeSessionPlanByDomainView(learningProfile);
  const selectedActiveSessionPlan =
    sessionPlanWaterfall.current ??
    (homeworkSelectedDomain ? activeSessionPlanByDomain[homeworkSelectedDomain] : undefined) ??
    learningProfile.activeSessionPlan ??
    null;
  const catalogItems = contentCatalogWaterfall.items;
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
      pending: selectedPendingHomework,
      activeByDomain: homeworkActiveByDomain,
      selectedDomain: homeworkSelectedDomain ?? null,
      cyclesDir: path.join(links.homework, "cycles"),
      currentFile: links.currentHomework,
      waterfall: homeworkWaterfall,
    },
    plannerTrust: learningProfile.plannerTrust ?? null,
    activeSessionPlan: selectedActiveSessionPlan,
    sessionPlan: {
      filePath: links.currentSessionPlan,
      existed: fs.existsSync(links.currentSessionPlan),
      waterfall: sessionPlanWaterfall,
    },
    todayPlan: {
      filePath: links.todayPlan,
      existed: todayPlan != null,
      data: todayPlan,
    },
    carePlan: {
      filePath: links.currentCarePlan,
      existed: fs.existsSync(links.currentCarePlan),
      current: carePlanWaterfall,
    },
    learningExperiments: carePlanWaterfall.learningExperiments.length
      ? carePlanWaterfall.learningExperiments
      : learningProfile.learningExperiments ?? selectedActiveSessionPlan?.learningExperiments ?? [],
    contentCatalog: {
      filePath: links.contentCatalog,
      items: catalogItems,
      summary: {
        total: catalogItems.length,
        reusable: catalogItems.filter((item) => item.reuseStatus === "reuse").length,
        needsRevision: catalogItems.filter((item) => item.reuseStatus === "revise").length,
        retired: catalogItems.filter((item) => item.reuseStatus === "retire").length,
        candidates: catalogItems.filter((item) => item.reuseStatus === "candidate").length,
      },
    },
    evidence: {
      links: {
        attempts: links.attempts,
        ratings: links.ratings,
        vitals: links.vitals,
        sessionNotes: links.sessionNotes,
      },
      latestAttentionVitals: readLatestVitals(links.vitals),
    },
    decisionTrace: {
      dir: links.decisionTraces,
      latest: latestDecisionTrace,
    },
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
