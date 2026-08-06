import fs from "fs";
import path from "path";
import { computeSM2 } from "../algorithms/spacedRepetition";
import type { FactBankFile, FactEntry } from "../context/schemas/factBank";
import { createEmptyFactBank, normalizeFactId } from "../context/schemas/factBank";
import { getChildChart } from "../profiles/childChart";
import { resolveChildContextDir } from "../utils/contextRoot";

export type FactAttemptInput = {
  childId: string;
  prompt: string;
  answer: string;
  correct: boolean;
  quality?: number;
  domain?: "math" | "reading" | "spelling";
};

function factBankPath(rootDir: string, childId: string): string {
  const chart = getChildChart(childId, { rootDir });
  const relative = chart.links.factBank ?? "fact_bank.json";
  return path.isAbsolute(relative)
    ? relative
    : path.join(resolveChildContextDir(childId, { rootDir }), relative);
}

function readFactBank(rootDir: string, childId: string): FactBankFile {
  const filePath = factBankPath(rootDir, childId);
  if (!fs.existsSync(filePath)) {
    return createEmptyFactBank(childId);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as FactBankFile;
}

function writeFactBank(rootDir: string, bank: FactBankFile): void {
  const filePath = factBankPath(rootDir, bank.childId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  bank.lastUpdated = new Date().toISOString();
  fs.writeFileSync(filePath, `${JSON.stringify(bank, null, 2)}\n`, "utf8");
}

function parseMathFact(target: string): { prompt: string; answer: string } | null {
  const trimmed = target.trim();
  const eqMatch = /^(.+?)\s*=\s*(.+)$/.exec(trimmed);
  if (eqMatch) {
    return { prompt: eqMatch[1]!.trim(), answer: eqMatch[2]!.trim() };
  }
  const mulMatch = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(trimmed);
  if (mulMatch) {
    const a = Number(mulMatch[1]);
    const b = Number(mulMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { prompt: `${a} x ${b}`, answer: String(a * b) };
    }
  }
  return { prompt: trimmed, answer: trimmed };
}

export function recordFactAttempt(
  input: FactAttemptInput,
  opts: { rootDir?: string } = {},
): { factId: string; skipped: boolean } {
  const rootDir = opts.rootDir ?? process.cwd();
  const childId = input.childId.trim().toLowerCase();
  const domain = input.domain ?? "math";
  const parsed = parseMathFact(input.prompt);
  const prompt = parsed?.prompt ?? input.prompt.trim();
  const answer = input.answer.trim() || parsed?.answer || prompt;
  const factId = normalizeFactId(prompt, answer);
  const bank = readFactBank(rootDir, childId);
  const today = new Date().toISOString().slice(0, 10);
  const quality = Math.max(0, Math.min(5, Number.isFinite(input.quality) ? Number(input.quality) : input.correct ? 5 : 1));

  let entry = bank.facts.find((fact) => fact.factId === factId);
  if (!entry) {
    entry = {
      factId,
      prompt,
      answer,
      domain,
      tracks: {},
    };
    bank.facts.push(entry);
  }

  const previous = entry.tracks[domain];
  const trackBase = {
    interval: previous?.interval ?? 0,
    easinessFactor: previous?.easinessFactor ?? 2.5,
    nextReviewDate: previous?.nextReviewDate ?? today,
    repetition: previous?.repetition ?? 0,
    history: [] as [],
    mastered: previous?.mastered ?? false,
    quality: (previous?.quality ?? 0) as 0 | 1 | 2 | 3 | 4 | 5,
    lastReviewDate: previous?.lastReviewDate ?? today,
    scaffoldLevel: 0 as const,
    regressionCount: 0,
  };
  const updated = computeSM2(trackBase, quality as 0 | 1 | 2 | 3 | 4 | 5, {
      defaultEasinessFactor: 2.5,
      minEasinessFactor: 1.3,
      intervalModifier: 1.0,
      maxNewWordsPerSession: 5,
      maxReviewWordsPerSession: 12,
    },
  );
  entry.tracks[domain] = {
    interval: updated.interval,
    easinessFactor: updated.easinessFactor,
    nextReviewDate: updated.nextReviewDate,
    repetition: updated.repetition,
    quality,
    lastReviewDate: today,
    mastered: updated.mastered,
  };
  writeFactBank(rootDir, bank);
  console.log(
    `  🎮 [fact-bank] recorded ${domain}:${factId} ${input.correct ? "correct" : "incorrect"} due=${updated.nextReviewDate}`,
  );
  return { factId, skipped: false };
}

export function listDueFactsFromBank(
  childId: string,
  opts: { rootDir?: string; limit?: number } = {},
): FactEntry[] {
  const rootDir = opts.rootDir ?? process.cwd();
  const bank = readFactBank(rootDir, childId);
  const today = new Date().toISOString().slice(0, 10);
  return bank.facts
    .filter((entry) => {
      const track = entry.tracks.math ?? entry.tracks[entry.domain];
      return track && (track.nextReviewDate ?? today) <= today;
    })
    .slice(0, opts.limit ?? 8);
}
