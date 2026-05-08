import fs from "fs";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { readWordBank, writeWordBank } from "../utils/wordBankIO";
import { createFreshSM2Track } from "../context/schemas/wordBank";
import { buildHomeworkNodes, buildPendingHomeworkPayload, normalizeHomeworkType } from "./ingestHomework";
import {
  buildCapturedHomeworkContent,
  normalizeContentProfile,
  type CapturedHomeworkContent,
  type ContentProfile,
  type HomeworkType,
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
  });
  return buildPendingHomeworkPayload({
    weekOf: cycle.ingestedAt,
    testDate: cycle.testDate,
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
