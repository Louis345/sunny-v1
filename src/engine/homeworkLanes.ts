import fs from "fs";
import path from "path";
import type {
  ActiveSessionPlan,
  HomeworkDomain,
  LearningProfile,
} from "../context/schemas/learningProfile";
import {
  hydrateLearningProfileFromWaterfall,
  slimLearningProfileForDoorway,
  writeWaterfallHomework,
} from "../profiles/chartWaterfall";
import { resolveChildContextDir } from "../utils/contextRoot";

export type PendingHomework = NonNullable<LearningProfile["pendingHomework"]>;

export type HomeworkLaneWriteOptions = {
  rootDir?: string;
  select?: boolean;
};

const HOMEWORK_DOMAINS: HomeworkDomain[] = ["spelling", "reading", "math", "science"];

function profilePath(rootDir: string, childId: string): string {
  return path.join(resolveChildContextDir(childId, { rootDir }), "learning_profile.json");
}

function readProfile(rootDir: string, childId: string): LearningProfile {
  const profile = JSON.parse(fs.readFileSync(profilePath(rootDir, childId), "utf8")) as LearningProfile;
  return hydrateLearningProfileFromWaterfall(childId, profile, { rootDir });
}

export function normalizeHomeworkDomain(value: unknown): HomeworkDomain | undefined {
  const raw = String(value ?? "").trim().toLowerCase();
  if (HOMEWORK_DOMAINS.includes(raw as HomeworkDomain)) return raw as HomeworkDomain;
  if (raw === "spelling_test" || raw === "spell_from_memory") return "spelling";
  if (raw === "language_arts" || raw === "read_fluently") return "reading";
  return undefined;
}

export function inferHomeworkDomainFromPending(
  pending: LearningProfile["pendingHomework"] | null | undefined,
): HomeworkDomain | undefined {
  if (!pending) return undefined;
  const practice =
    pending.contentProfile?.practiceDomain ??
    pending.capturedContent?.contentProfile?.practiceDomain;
  const content =
    pending.contentProfile?.contentDomain ??
    pending.capturedContent?.contentProfile?.contentDomain;
  return (
    normalizeHomeworkDomain(practice) ??
    normalizeHomeworkDomain(content) ??
    normalizeHomeworkDomain(pending.capturedContent?.type) ??
    (String(pending.homeworkId ?? "").includes("spelling") ? "spelling" : undefined)
  );
}

export function selectedHomeworkDomain(profile: LearningProfile): HomeworkDomain | undefined {
  return (
    normalizeHomeworkDomain(profile.selectedHomeworkDomain) ??
    inferHomeworkDomainFromPending(profile.pendingHomework) ??
    normalizeHomeworkDomain(profile.activeSessionPlan?.domain)
  );
}

export function activeHomeworkByDomainView(
  profile: LearningProfile,
): Partial<Record<HomeworkDomain, PendingHomework>> {
  const lanes: Partial<Record<HomeworkDomain, PendingHomework>> = {
    ...(profile.activeHomeworkByDomain ?? {}),
  };
  const legacyDomain = inferHomeworkDomainFromPending(profile.pendingHomework);
  if (legacyDomain && profile.pendingHomework && !lanes[legacyDomain]) {
    lanes[legacyDomain] = profile.pendingHomework;
  }
  return lanes;
}

export function activeSessionPlanByDomainView(
  profile: LearningProfile,
): Partial<Record<HomeworkDomain, ActiveSessionPlan>> {
  const lanes: Partial<Record<HomeworkDomain, ActiveSessionPlan>> = {
    ...(profile.activeSessionPlanByDomain ?? {}),
  };
  const legacyDomain = normalizeHomeworkDomain(profile.activeSessionPlan?.domain);
  if (legacyDomain && profile.activeSessionPlan && !lanes[legacyDomain]) {
    lanes[legacyDomain] = profile.activeSessionPlan;
  }
  return lanes;
}

export function getActiveHomeworkLane(
  profile: LearningProfile,
  domain: HomeworkDomain | undefined,
): PendingHomework | undefined {
  if (!domain) return profile.pendingHomework;
  return activeHomeworkByDomainView(profile)[domain];
}

export function selectHomeworkLaneProfile(
  profile: LearningProfile,
  domain: HomeworkDomain,
): LearningProfile {
  const homeworkLanes = activeHomeworkByDomainView(profile);
  const planLanes = activeSessionPlanByDomainView(profile);
  return {
    ...profile,
    selectedHomeworkDomain: domain,
    activeHomeworkByDomain: homeworkLanes,
    activeSessionPlanByDomain: planLanes,
    pendingHomework: homeworkLanes[domain] ?? profile.pendingHomework,
    activeSessionPlan: planLanes[domain],
  };
}

export function withActiveHomeworkLane(
  profile: LearningProfile,
  domain: HomeworkDomain,
  pending: PendingHomework,
  opts: { select?: boolean } = {},
): LearningProfile {
  const homeworkLanes = {
    ...activeHomeworkByDomainView(profile),
    [domain]: pending,
  };
  const selected = opts.select === false
    ? selectedHomeworkDomain(profile)
    : domain;
  return {
    ...profile,
    selectedHomeworkDomain: selected,
    activeHomeworkByDomain: homeworkLanes,
    pendingHomework: selected === domain ? pending : profile.pendingHomework,
  };
}

export function patchActiveHomeworkLaneProfile(
  profile: LearningProfile,
  domain: HomeworkDomain,
  updater: (pending: PendingHomework) => PendingHomework,
): LearningProfile {
  const current = getActiveHomeworkLane(profile, domain);
  if (!current) return profile;
  const next = updater(current);
  const selected = selectedHomeworkDomain(profile);
  return withActiveHomeworkLane(profile, domain, next, {
    select: selected === domain,
  });
}

export function withActiveSessionPlanLane(
  profile: LearningProfile,
  plan: ActiveSessionPlan,
): LearningProfile {
  const domain = normalizeHomeworkDomain(plan.domain);
  if (!domain) {
    return {
      ...profile,
      activeSessionPlan: plan,
    };
  }
  const planLanes = {
    ...activeSessionPlanByDomainView(profile),
    [domain]: plan,
  };
  const selected = selectedHomeworkDomain(profile);
  return {
    ...profile,
    activeSessionPlanByDomain: planLanes,
    activeSessionPlan: selected === domain || !selected ? plan : profile.activeSessionPlan,
    selectedHomeworkDomain: selected ?? domain,
  };
}

export function writeActiveHomeworkLane(
  childId: string,
  domain: HomeworkDomain,
  pending: PendingHomework,
  opts: HomeworkLaneWriteOptions = {},
): LearningProfile {
  const rootDir = opts.rootDir ?? process.cwd();
  const file = profilePath(rootDir, childId);
  const profile = readProfile(rootDir, childId);
  const next = withActiveHomeworkLane(profile, domain, pending, { select: opts.select ?? true });
  next.lastUpdated = new Date().toISOString();
  writeWaterfallHomework(childId, next, opts);
  fs.writeFileSync(file, JSON.stringify(slimLearningProfileForDoorway(next), null, 2), "utf8");
  return next;
}

export function patchActiveHomeworkLane(
  childId: string,
  domain: HomeworkDomain,
  updater: (pending: PendingHomework) => PendingHomework,
  opts: { rootDir?: string } = {},
): LearningProfile | null {
  const rootDir = opts.rootDir ?? process.cwd();
  const file = profilePath(rootDir, childId);
  const profile = readProfile(rootDir, childId);
  const current = getActiveHomeworkLane(profile, domain);
  if (!current) return null;
  const selected = selectedHomeworkDomain(profile);
  const next = withActiveHomeworkLane(profile, domain, updater(current), {
    select: selected === domain,
  });
  next.lastUpdated = new Date().toISOString();
  writeWaterfallHomework(childId, next, opts);
  fs.writeFileSync(file, JSON.stringify(slimLearningProfileForDoorway(next), null, 2), "utf8");
  return next;
}

export function selectHomeworkDomain(
  childId: string,
  domain: HomeworkDomain,
  opts: { rootDir?: string } = {},
): LearningProfile {
  const rootDir = opts.rootDir ?? process.cwd();
  const file = profilePath(rootDir, childId);
  const profile = readProfile(rootDir, childId);
  const next = selectHomeworkLaneProfile(profile, domain);
  next.lastUpdated = new Date().toISOString();
  writeWaterfallHomework(childId, next, opts);
  fs.writeFileSync(file, JSON.stringify(slimLearningProfileForDoorway(next), null, 2), "utf8");
  return next;
}
