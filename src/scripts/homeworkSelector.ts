import fs from "fs";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { readWordBank, writeWordBank } from "../utils/wordBankIO";
import { createFreshSM2Track } from "../context/schemas/wordBank";
import {
  buildHomeworkNodes,
  buildHomeworkReturnTag,
  buildPendingHomeworkPayload,
  normalizeHomeworkType,
} from "./ingestHomework";
import {
  buildCapturedHomeworkContent,
  normalizeContentProfile,
  type CapturedHomeworkContent,
  type ContentProfile,
  type HomeworkType,
  type HomeworkWordGroup,
} from "./contentAwareHomeworkPlanner";

export type HomeworkDomainFilter = "spelling" | "science" | "reading" | "math";

function cyclesDir(childId: string): string {
  return path.join(process.cwd(), "src", "context", childId, "homework", "cycles");
}

export function readHomeworkCycles(childId: string): HomeworkCycle[] {
  const dir = cyclesDir(childId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as HomeworkCycle;
      } catch {
        return null;
      }
    })
    .filter((cycle): cycle is HomeworkCycle => cycle != null);
}

function cyclePracticeDomain(cycle: HomeworkCycle): string {
  return String(cycle.contentProfile?.practiceDomain ?? cycle.subject ?? "").toLowerCase();
}

function cycleContentDomain(cycle: HomeworkCycle): string {
  return String(cycle.contentProfile?.contentDomain ?? "").toLowerCase();
}

function matchesDomain(cycle: HomeworkCycle, domain?: HomeworkDomainFilter): boolean {
  if (!domain) return true;
  const subject = String(cycle.subject ?? "").toLowerCase();
  const practiceDomain = cyclePracticeDomain(cycle);
  const contentDomain = cycleContentDomain(cycle);
  if (domain === "spelling") {
    return subject === "spelling_test" || practiceDomain === "spelling";
  }
  if (domain === "science") {
    return contentDomain === "science";
  }
  if (domain === "reading") {
    return practiceDomain === "reading";
  }
  return subject === domain || practiceDomain === domain || contentDomain === domain;
}

function dueTime(cycle: HomeworkCycle): number {
  if (!cycle.testDate) return Number.POSITIVE_INFINITY;
  const time = new Date(cycle.testDate).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function todayStartTime(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function isExpired(cycle: HomeworkCycle): boolean {
  const due = dueTime(cycle);
  if (!Number.isFinite(due)) return false;
  return due < todayStartTime();
}

function activeCycleForPending(
  cycles: HomeworkCycle[],
  pendingHomeworkId: string,
): HomeworkCycle | null {
  if (!pendingHomeworkId) return null;
  return cycles.find((cycle) => cycle.homeworkId === pendingHomeworkId) ?? null;
}

function withCycleMetadata(
  childId: string,
  pendingHomework: NonNullable<LearningProfile["pendingHomework"]>,
  cycle: HomeworkCycle,
): NonNullable<LearningProfile["pendingHomework"]> {
  return {
    ...pendingHomework,
    testDateSource: pendingHomework.testDateSource ?? cycle.testDateSource,
    testDateConfirmed: pendingHomework.testDateConfirmed ?? cycle.testDateConfirmed,
    returnTag:
      pendingHomework.returnTag ??
      cycle.returnTag ??
      buildHomeworkReturnTag(childId, cycle.homeworkId),
  };
}

function pendingNodeSignature(
  pendingHomework: NonNullable<LearningProfile["pendingHomework"]>,
): string {
  return JSON.stringify(
    (pendingHomework.nodes ?? []).map((node) => ({
      id: node.id,
      type: node.type,
      words: node.words ?? [],
      wordRadarItems: node.wordRadarItems ?? [],
      gameFile: node.gameFile ?? null,
      storyFile: node.storyFile ?? null,
      activityConfigPath: node.activityConfigPath ?? null,
    })),
  );
}

function ingestedTime(cycle: HomeworkCycle): number {
  const time = new Date(cycle.ingestedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function selectHomeworkCycle(
  childId: string,
  opts: { domain?: HomeworkDomainFilter } = {},
): HomeworkCycle | null {
  let candidates = readHomeworkCycles(childId).filter((cycle) => matchesDomain(cycle, opts.domain));
  if (!opts.domain) {
    const nonSpellingCandidates = candidates.filter((cycle) => !matchesDomain(cycle, "spelling"));
    if (nonSpellingCandidates.length > 0) {
      candidates = nonSpellingCandidates;
    }
  }
  const allExpired = candidates.length > 0 && candidates.every((cycle) => isExpired(cycle));
  const activeCandidates =
    opts.domain || allExpired
      ? candidates
      : candidates.filter((cycle) => !isExpired(cycle));
  activeCandidates.sort((a, b) =>
    opts.domain
      ? ingestedTime(b) - ingestedTime(a) || dueTime(a) - dueTime(b)
      : allExpired
        ? dueTime(b) - dueTime(a) || ingestedTime(b) - ingestedTime(a)
      : dueTime(a) - dueTime(b) || ingestedTime(b) - ingestedTime(a),
  );
  return activeCandidates[0] ?? null;
}

function homeworkTypeForCycle(cycle: HomeworkCycle): HomeworkType {
  return normalizeHomeworkType(cycle.subject);
}

function contentProfileForCycle(cycle: HomeworkCycle): ContentProfile | null {
  if (!cycle.contentProfile) return null;
  return normalizeContentProfile({
    title: cycle.capturedContent?.title ?? cycle.homeworkId,
    type: homeworkTypeForCycle(cycle),
    words: cycle.wordList,
    questions: cycle.capturedContent?.questions ?? [],
    contentProfile: cycle.contentProfile as Partial<ContentProfile>,
  });
}

function capturedContentForCycle(
  cycle: HomeworkCycle,
  contentProfile: ContentProfile | null,
): CapturedHomeworkContent | null {
  if (!cycle.capturedContent || !contentProfile) return null;
  return buildCapturedHomeworkContent({
    title: cycle.capturedContent.title,
    type: homeworkTypeForCycle(cycle),
    rawText: cycle.capturedContent.rawText,
    words: cycle.capturedContent.words,
    questions: cycle.capturedContent.questions,
    wordGroups: cycle.capturedContent.wordGroups as HomeworkWordGroup[] | undefined,
    sourceDocuments: cycle.capturedContent.sourceDocuments,
    contentProfile,
  });
}

function updateHomeworkPriorityWords(childId: string, cycle: HomeworkCycle): void {
  const today = new Date().toISOString().slice(0, 10);
  const wordBank = readWordBank(childId);
  for (const entry of wordBank.words) {
    entry.homeworkPriority = false;
  }
  for (const raw of cycle.wordList) {
    const word = String(raw ?? "").trim();
    if (!word) continue;
    const lower = word.toLowerCase();
    let entry = wordBank.words.find((item) => item.word.toLowerCase() === lower);
    if (!entry) {
      entry = {
        word,
        addedAt: new Date().toISOString(),
        source: "homework",
        tracks: {},
      };
      wordBank.words.push(entry);
    }
    entry.homeworkPriority = true;
    if (cycle.testDate) entry.testDate = cycle.testDate;
    if (!entry.tracks.spelling) {
      entry.tracks.spelling = createFreshSM2Track(today);
    }
    if (entry.tracks.spelling.nextReviewDate > today) {
      entry.tracks.spelling.nextReviewDate = today;
    }
  }
  writeWordBank(childId, wordBank);
}

export function pendingHomeworkFromCycle(
  childId: string,
  cycle: HomeworkCycle,
): NonNullable<LearningProfile["pendingHomework"]> {
  const type = homeworkTypeForCycle(cycle);
  const contentProfile = contentProfileForCycle(cycle);
  const capturedContent = capturedContentForCycle(cycle, contentProfile);
  const nodes = buildHomeworkNodes({
    type,
    words: cycle.wordList,
    homeworkId: cycle.homeworkId,
    childId,
    testDate: cycle.testDate,
    contentProfile,
    capturedContent: capturedContent ?? undefined,
  });
  return buildPendingHomeworkPayload({
    weekOf: cycle.ingestedAt,
    testDate: cycle.testDate,
    testDateSource: cycle.testDateSource,
    testDateConfirmed: cycle.testDateConfirmed,
    returnTag: cycle.returnTag ?? buildHomeworkReturnTag(childId, cycle.homeworkId),
    wordList: cycle.wordList,
    homeworkId: cycle.homeworkId,
    nodes,
    contentProfile,
    capturedContent,
  });
}

export function hydratePendingHomeworkFromCycle(
  childId: string,
  opts: { domain?: HomeworkDomainFilter } = {},
): NonNullable<LearningProfile["pendingHomework"]> & { homeworkId?: string } {
  const profile = readLearningProfile(childId);
  if (!profile) {
    throw new Error(`Could not read learning_profile.json for child: ${childId}`);
  }
  const pendingHomeworkId = String(profile.pendingHomework?.homeworkId ?? "").trim();
  if (!opts.domain && pendingHomeworkId) {
    const activeCycle = activeCycleForPending(readHomeworkCycles(childId), pendingHomeworkId);
    if (activeCycle && !isExpired(activeCycle)) {
      const pendingHomework = withCycleMetadata(
        childId,
        profile.pendingHomework as NonNullable<LearningProfile["pendingHomework"]>,
        activeCycle,
      );
      if (
        pendingHomework.returnTag !== profile.pendingHomework?.returnTag ||
        pendingHomework.testDateSource !== profile.pendingHomework?.testDateSource ||
        pendingHomework.testDateConfirmed !== profile.pendingHomework?.testDateConfirmed
      ) {
        writeLearningProfile(childId, { ...profile, pendingHomework });
      }
      console.log(
        `🎮 [homeworkSelector] keep-active ${activeCycle.homeworkId} (${activeCycle.subject})`,
      );
      return pendingHomework;
    }
  }
  const cycle = selectHomeworkCycle(childId, opts);
  if (!cycle) {
    throw new Error(
      opts.domain
        ? `No ${opts.domain} homework cycle found for ${childId}`
        : `No homework cycle found for ${childId}`,
    );
  }
  const pendingHomework = pendingHomeworkFromCycle(childId, cycle);
  writeLearningProfile(childId, {
    ...profile,
    pendingHomework,
  });
  updateHomeworkPriorityWords(childId, cycle);
  console.log(
    `🎮 [homeworkSelector] hydrate ${cycle.homeworkId} (${cycle.subject})`,
  );
  return pendingHomework;
}

export function ensureFreshPendingHomework(
  childId: string,
  opts: { domain?: HomeworkDomainFilter } = {},
): NonNullable<LearningProfile["pendingHomework"]> & { homeworkId?: string } {
  const profile = readLearningProfile(childId);
  if (!profile) {
    throw new Error(`Could not read learning_profile.json for child: ${childId}`);
  }
  const cycles = readHomeworkCycles(childId);
  const pendingHomeworkId = String(profile.pendingHomework?.homeworkId ?? "").trim();
  const activeCycle = activeCycleForPending(cycles, pendingHomeworkId);
  const domainMismatch = activeCycle ? !matchesDomain(activeCycle, opts.domain) : Boolean(opts.domain);
  const stale = !activeCycle || isExpired(activeCycle) || domainMismatch;

  if (!stale && profile.pendingHomework) {
    const pendingHomework = withCycleMetadata(childId, profile.pendingHomework, activeCycle);
    const rebuilt = withCycleMetadata(
      childId,
      pendingHomeworkFromCycle(childId, activeCycle),
      activeCycle,
    );
    const hasStarted =
      (pendingHomework.completedAdventureNodeIds?.length ?? 0) > 0;
    if (!hasStarted && pendingNodeSignature(pendingHomework) !== pendingNodeSignature(rebuilt)) {
      const refreshed = {
        ...rebuilt,
        reinforceWords: pendingHomework.reinforceWords,
        completedAdventureNodeIds: pendingHomework.completedAdventureNodeIds,
      };
      writeLearningProfile(childId, { ...profile, pendingHomework: refreshed });
      updateHomeworkPriorityWords(childId, activeCycle);
      console.log(
        `🎮 [homeworkSelector] repaired-active ${activeCycle.homeworkId} (${activeCycle.subject})`,
      );
      return refreshed;
    }
    if (
      pendingHomework.returnTag !== profile.pendingHomework.returnTag ||
      pendingHomework.testDateSource !== profile.pendingHomework.testDateSource ||
      pendingHomework.testDateConfirmed !== profile.pendingHomework.testDateConfirmed
    ) {
      writeLearningProfile(childId, { ...profile, pendingHomework });
    }
    console.log(
      `🎮 [homeworkSelector] fresh ${activeCycle.homeworkId} (${activeCycle.subject})`,
    );
    return pendingHomework;
  }

  const reason = !activeCycle
    ? "missing"
    : isExpired(activeCycle)
      ? "expired"
      : "domain-mismatch";
  console.log(
    `🎮 [homeworkSelector] refresh-active reason=${reason} current=${pendingHomeworkId || "none"}`,
  );
  return hydratePendingHomeworkFromCycle(childId, opts);
}
