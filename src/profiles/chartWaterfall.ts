import fs from "fs";
import path from "path";
import type {
  ActiveSessionPlan,
  AIContentCatalogItem,
  HomeworkDomain,
  LearningExperiment,
  LearningProfile,
  PlanTheory,
  PlannedMeasurement,
} from "../context/schemas/learningProfile";
import { resolveChildContextDir } from "../utils/contextRoot";

export type WaterfallOptions = {
  rootDir?: string;
  now?: Date;
  slimProfile?: boolean;
};

export type WaterfallLinks = NonNullable<LearningProfile["chartLinks"]>;

export type WaterfallHomeworkFile = {
  version: 1;
  childId: string;
  selectedDomain?: HomeworkDomain;
  current: LearningProfile["pendingHomework"] | null;
  activeByDomain: NonNullable<LearningProfile["activeHomeworkByDomain"]>;
  updatedAt: string;
};

export type WaterfallSessionPlanFile = {
  version: 1;
  childId: string;
  selectedDomain?: HomeworkDomain;
  current: ActiveSessionPlan | null;
  activeByDomain: NonNullable<LearningProfile["activeSessionPlanByDomain"]>;
  updatedAt: string;
};

export type WaterfallCarePlanFile = {
  version: 1;
  childId: string;
  sourcePlanId?: string;
  theory?: PlanTheory;
  plannedMeasurements: PlannedMeasurement[];
  learningExperiments: LearningExperiment[];
  updatedAt: string;
};

export type WaterfallContentCatalogFile = {
  version: 1;
  childId: string;
  items: AIContentCatalogItem[];
  updatedAt: string;
};

export type DecisionTraceEvent = {
  traceId: string;
  eventType:
    | "activity_choice"
    | "config_change"
    | "activity_evidence"
    | "session_plan_write"
    | "quest_generation"
    | "boss_generation"
    | "content_catalog_update";
  evidenceRead: string[];
  theoryUsed?: string;
  changeSummary: string;
  reason: string;
  writesTo: string[];
  createdAt: string;
};

export type WaterfallMigrationResult = {
  childId: string;
  files: {
    currentHomework: string;
    currentSessionPlan: string;
    currentCarePlan: string;
    contentCatalog: string;
  };
};

const BULKY_PROFILE_MIRROR_KEYS = [
  "pendingHomework",
  "activeHomeworkByDomain",
  "activeSessionPlan",
  "activeSessionPlanByDomain",
  "aiContentCatalog",
  "learningExperiments",
] as const;

export function defaultWaterfallLinks(): Required<WaterfallLinks> {
  return {
    learningProfile: "learning_profile.json",
    wordBank: "word_bank.json",
    todayPlan: "todays_plan.json",
    currentCarePlan: "care_plan/current.json",
    currentHomework: "homework/current.json",
    homeworkLanes: "homework/lanes.json",
    currentSessionPlan: "plans/active_session_plan.json",
    sessionPlanLanes: "plans/session_plan_lanes.json",
    contentCatalog: "content_catalog.json",
    decisionTraces: "decision_traces/",
    homework: "homework/",
    attempts: "attempts/",
    ratings: "ratings/",
    vitals: "vitals/",
    sessionNotes: "session_notes/",
    companionCareDir: "companion_care/",
  };
}

function nowIso(opts: WaterfallOptions = {}): string {
  return (opts.now ?? new Date()).toISOString();
}

function childDir(childId: string, opts: WaterfallOptions = {}): string {
  return resolveChildContextDir(childId, { rootDir: opts.rootDir });
}

function resolveLinkedPath(baseDir: string, link: string): string {
  return path.isAbsolute(link) ? link : path.join(baseDir, link);
}

export function resolveWaterfallLinks(
  childId: string,
  links: WaterfallLinks = {},
  opts: WaterfallOptions = {},
): Required<WaterfallLinks> {
  const baseDir = childDir(childId, opts);
  const merged = { ...defaultWaterfallLinks(), ...links };
  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [
      key,
      resolveLinkedPath(baseDir, String(value)),
    ]),
  ) as Required<WaterfallLinks>;
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function readProfile(childId: string, opts: WaterfallOptions = {}): LearningProfile {
  const file = path.join(childDir(childId, opts), "learning_profile.json");
  const profile = readJson<LearningProfile>(file);
  if (!profile) throw new Error(`Learning profile not found for child: ${childId}`);
  return profile;
}

export function slimLearningProfileForDoorway(profile: LearningProfile): LearningProfile {
  if (!profile.chartLinks) return profile;
  const slim: LearningProfile = {
    ...profile,
    chartLinks: {
      ...defaultWaterfallLinks(),
      ...profile.chartLinks,
    },
  };
  for (const key of BULKY_PROFILE_MIRROR_KEYS) {
    delete (slim as Partial<LearningProfile>)[key];
  }
  return slim;
}

export function hydrateLearningProfileFromWaterfall(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): LearningProfile {
  const homework = readWaterfallHomework(childId, profile, opts);
  const sessionPlan = readWaterfallSessionPlan(childId, profile, opts);
  const catalog = readJson<WaterfallContentCatalogFile>(
    resolveWaterfallLinks(childId, profile.chartLinks, opts).contentCatalog,
  ) ?? buildWaterfallContentCatalogFile(childId, profile, opts);
  const carePlan = readWaterfallCarePlan(childId, profile, opts);
  return {
    ...profile,
    ...(profile.chartLinks
      ? {
          chartLinks: {
            ...defaultWaterfallLinks(),
            ...profile.chartLinks,
          },
        }
      : {}),
    pendingHomework: profile.pendingHomework ?? homework.current ?? undefined,
    activeHomeworkByDomain: profile.activeHomeworkByDomain ?? homework.activeByDomain,
    activeSessionPlan: profile.activeSessionPlan ?? sessionPlan.current ?? undefined,
    activeSessionPlanByDomain: profile.activeSessionPlanByDomain ?? sessionPlan.activeByDomain,
    aiContentCatalog: profile.aiContentCatalog ?? catalog.items,
    learningExperiments: profile.learningExperiments ?? carePlan.learningExperiments,
    selectedHomeworkDomain: profile.selectedHomeworkDomain ?? homework.selectedDomain,
  };
}

export function buildWaterfallHomeworkFile(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): WaterfallHomeworkFile {
  return {
    version: 1,
    childId,
    ...(profile.selectedHomeworkDomain ? { selectedDomain: profile.selectedHomeworkDomain } : {}),
    current: profile.pendingHomework ?? null,
    activeByDomain: profile.activeHomeworkByDomain ?? {},
    updatedAt: nowIso(opts),
  };
}

export function buildWaterfallSessionPlanFile(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): WaterfallSessionPlanFile {
  return {
    version: 1,
    childId,
    ...(profile.selectedHomeworkDomain ? { selectedDomain: profile.selectedHomeworkDomain } : {}),
    current: profile.activeSessionPlan ?? null,
    activeByDomain: profile.activeSessionPlanByDomain ?? {},
    updatedAt: nowIso(opts),
  };
}

export function buildWaterfallCarePlanFile(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): WaterfallCarePlanFile {
  return {
    version: 1,
    childId,
    ...(profile.activeSessionPlan?.planId ? { sourcePlanId: profile.activeSessionPlan.planId } : {}),
    ...(profile.activeSessionPlan?.planTheory ? { theory: profile.activeSessionPlan.planTheory } : {}),
    plannedMeasurements: profile.activeSessionPlan?.plannedMeasurements ?? [],
    learningExperiments: profile.learningExperiments ?? profile.activeSessionPlan?.learningExperiments ?? [],
    updatedAt: nowIso(opts),
  };
}

export function buildWaterfallContentCatalogFile(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): WaterfallContentCatalogFile {
  return {
    version: 1,
    childId,
    items: profile.aiContentCatalog ?? [],
    updatedAt: nowIso(opts),
  };
}

export function writeWaterfallSessionPlan(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): void {
  const links = resolveWaterfallLinks(childId, profile.chartLinks, opts);
  writeJson(links.currentSessionPlan, buildWaterfallSessionPlanFile(childId, profile, opts));
  writeJson(links.currentCarePlan, buildWaterfallCarePlanFile(childId, profile, opts));
}

export function writeWaterfallHomework(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): void {
  const links = resolveWaterfallLinks(childId, profile.chartLinks, opts);
  writeJson(links.currentHomework, buildWaterfallHomeworkFile(childId, profile, opts));
}

export function writeWaterfallContentCatalog(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): void {
  const links = resolveWaterfallLinks(childId, profile.chartLinks, opts);
  writeJson(links.contentCatalog, buildWaterfallContentCatalogFile(childId, profile, opts));
}

export function readWaterfallHomework(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): WaterfallHomeworkFile {
  const links = resolveWaterfallLinks(childId, profile.chartLinks, opts);
  return readJson<WaterfallHomeworkFile>(links.currentHomework) ??
    buildWaterfallHomeworkFile(childId, profile, opts);
}

export function readWaterfallSessionPlan(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): WaterfallSessionPlanFile {
  const links = resolveWaterfallLinks(childId, profile.chartLinks, opts);
  return readJson<WaterfallSessionPlanFile>(links.currentSessionPlan) ??
    buildWaterfallSessionPlanFile(childId, profile, opts);
}

export function readWaterfallCarePlan(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): WaterfallCarePlanFile {
  const links = resolveWaterfallLinks(childId, profile.chartLinks, opts);
  return readJson<WaterfallCarePlanFile>(links.currentCarePlan) ??
    buildWaterfallCarePlanFile(childId, profile, opts);
}

export function readWaterfallContentCatalog(
  childId: string,
  opts: WaterfallOptions = {},
): WaterfallContentCatalogFile {
  const profile = readProfile(childId, opts);
  const links = resolveWaterfallLinks(childId, profile.chartLinks, opts);
  return readJson<WaterfallContentCatalogFile>(links.contentCatalog) ??
    buildWaterfallContentCatalogFile(childId, profile, opts);
}

export function appendDecisionTrace(
  childId: string,
  event: DecisionTraceEvent,
  opts: WaterfallOptions = {},
): void {
  const profile = readProfile(childId, opts);
  const links = resolveWaterfallLinks(childId, profile.chartLinks, opts);
  const file = path.join(links.decisionTraces, `${event.createdAt.slice(0, 10)}.ndjson`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
}

export function readLatestDecisionTrace(
  childId: string,
  profile: LearningProfile,
  opts: WaterfallOptions = {},
): DecisionTraceEvent | null {
  const links = resolveWaterfallLinks(childId, profile.chartLinks, opts);
  if (!fs.existsSync(links.decisionTraces)) return null;
  const files = fs.readdirSync(links.decisionTraces)
    .filter((file) => file.endsWith(".ndjson"))
    .map((file) => path.join(links.decisionTraces, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").trim().split(/\n+/).filter(Boolean);
    for (const line of lines.reverse()) {
      try {
        return JSON.parse(line) as DecisionTraceEvent;
      } catch {
        // Ignore malformed historical trace rows.
      }
    }
  }
  return null;
}

export function migrateLearningProfileToWaterfall(
  childId: string,
  opts: WaterfallOptions = {},
): WaterfallMigrationResult {
  const profilePath = path.join(childDir(childId, opts), "learning_profile.json");
  const profile = readProfile(childId, opts);
  const chartLinks = {
    ...defaultWaterfallLinks(),
    ...(profile.chartLinks ?? {}),
  };
  const nextProfile: LearningProfile = {
    ...profile,
    chartLinks,
    lastUpdated: nowIso(opts),
  };
  const links = resolveWaterfallLinks(childId, chartLinks, opts);
  writeJson(links.currentHomework, buildWaterfallHomeworkFile(childId, nextProfile, opts));
  writeJson(links.currentSessionPlan, buildWaterfallSessionPlanFile(childId, nextProfile, opts));
  writeJson(links.currentCarePlan, buildWaterfallCarePlanFile(childId, nextProfile, opts));
  writeJson(links.contentCatalog, buildWaterfallContentCatalogFile(childId, nextProfile, opts));
  writeJson(profilePath, opts.slimProfile ? slimLearningProfileForDoorway(nextProfile) : nextProfile);
  return {
    childId,
    files: {
      currentHomework: links.currentHomework,
      currentSessionPlan: links.currentSessionPlan,
      currentCarePlan: links.currentCarePlan,
      contentCatalog: links.contentCatalog,
    },
  };
}
