import type { WordEntry, Domain, SM2Track } from "../../algorithms/types";

export interface WordBankFile {
  childId: string;
  version: number;
  lastUpdated: string;
  words: WordEntry[];
}

export function createEmptyWordBank(childId: string): WordBankFile {
  return {
    childId,
    version: 1,
    lastUpdated: new Date().toISOString(),
    words: [],
  };
}

export function createFreshSM2Track(today: string): SM2Track {
  return {
    quality: 0,
    easinessFactor: 2.5,
    interval: 0,
    repetition: 0,
    nextReviewDate: today,
    lastReviewDate: today,
    scaffoldLevel: 0,
    history: [],
    mastered: false,
    regressionCount: 0,
  };
}

export type { WordEntry, Domain, SM2Track };
