import type { FactBankFile } from "../context/schemas/factBank";

export function sm2Facts(factBank: FactBankFile): {
  dueFacts: Array<{ factId: string; prompt: string; answer: string }>;
  sm2Stats: Record<
    string,
    {
      interval: number;
      easeFactor: number;
      dueDate: string;
      domain: "math" | "reading" | "spelling";
    }
  >;
} {
  const today = new Date().toISOString().slice(0, 10);
  const dueFacts: Array<{ factId: string; prompt: string; answer: string }> = [];
  const sm2Stats: Record<
    string,
    {
      interval: number;
      easeFactor: number;
      dueDate: string;
      domain: "math" | "reading" | "spelling";
    }
  > = {};

  for (const entry of factBank.facts ?? []) {
    const tracks = entry.tracks ?? {};
    for (const [domain, track] of Object.entries(tracks)) {
      if (domain !== "math" && domain !== "reading" && domain !== "spelling") continue;
      const dueDate = track.nextReviewDate ?? today;
      sm2Stats[entry.factId] = {
        interval: track.interval ?? 0,
        easeFactor: track.easinessFactor ?? 2.5,
        dueDate,
        domain,
      };
      if (dueDate <= today) {
        dueFacts.push({ factId: entry.factId, prompt: entry.prompt, answer: entry.answer });
      }
      break;
    }
  }

  return { dueFacts, sm2Stats };
}
