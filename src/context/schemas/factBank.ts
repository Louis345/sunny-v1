export type FactEntry = {
  factId: string;
  prompt: string;
  answer: string;
  domain: "math" | "reading" | "spelling";
  tracks: Record<
    string,
    {
      interval?: number;
      easinessFactor?: number;
      nextReviewDate?: string;
      repetition?: number;
      quality?: number;
      lastReviewDate?: string;
      mastered?: boolean;
    }
  >;
};

export type FactBankFile = {
  childId: string;
  version: number;
  lastUpdated: string;
  facts: FactEntry[];
};

export function createEmptyFactBank(childId: string): FactBankFile {
  return {
    childId,
    version: 1,
    lastUpdated: new Date().toISOString(),
    facts: [],
  };
}

export function normalizeFactId(prompt: string, answer: string): string {
  return `${prompt.trim().toLowerCase()}::${answer.trim().toLowerCase()}`.replace(/\s+/g, "_");
}
