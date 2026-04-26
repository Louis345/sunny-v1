import type { WordEntry } from "./types";

type WordBankInput = {
  words?: Array<
    Pick<WordEntry, "word"> & {
      tracks?: Record<
        string,
        {
          interval?: number;
          easinessFactor?: number;
          nextReviewDate?: string;
        }
      >;
    }
  >;
};

type ProfileSm2Domain = "spelling" | "reading" | "math";

function isProfileSm2Domain(domain: string): domain is ProfileSm2Domain {
  return domain === "spelling" || domain === "reading" || domain === "math";
}

/**
 * ChildProfile output fields: `dueWords` and `sm2Stats`.
 */
export function sm2(wordBank: WordBankInput): {
  dueWords: string[];
  sm2Stats: Record<
    string,
    {
      interval: number;
      easeFactor: number;
      dueDate: string;
      domain: ProfileSm2Domain;
    }
  >;
} {
  const VALID_WORD = /^[a-z]{2,30}$/;
  const today = new Date().toISOString().slice(0, 10);
  const dueWords: string[] = [];
  const sm2Stats: Record<
    string,
    {
      interval: number;
      easeFactor: number;
      dueDate: string;
      domain: ProfileSm2Domain;
    }
  > = {};

  for (const entry of wordBank.words ?? []) {
    if (!VALID_WORD.test(entry.word.toLowerCase())) continue;
    const tracks = entry.tracks ?? {};
    for (const [domain, track] of Object.entries(tracks)) {
      if (!isProfileSm2Domain(domain)) continue;
      const dueDate = track.nextReviewDate ?? today;
      sm2Stats[entry.word] = {
        interval: track.interval ?? 0,
        easeFactor: track.easinessFactor ?? 2.5,
        dueDate,
        domain,
      };
      if (dueDate <= today && !dueWords.includes(entry.word)) {
        dueWords.push(entry.word);
      }
      break;
    }
  }

  return { dueWords, sm2Stats };
}
