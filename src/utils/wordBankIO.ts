import fs from "fs";
import path from "path";
import type { WordEntry, Domain, SM2Track } from "../algorithms/types";
import type { WordBankFile } from "../context/schemas/wordBank";
import { createEmptyWordBank, createFreshSM2Track } from "../context/schemas/wordBank";

export function resolveWordBankPath(childId: string): string {
  return path.resolve(process.cwd(), "src", "context", childId, "word_bank.json");
}

export function readWordBank(childId: string): WordBankFile {
  const filePath = resolveWordBankPath(childId);
  if (!fs.existsSync(filePath)) {
    return createEmptyWordBank(childId);
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as WordBankFile;
    return raw;
  } catch {
    return createEmptyWordBank(childId);
  }
}

export function writeWordBank(childId: string, data: WordBankFile): void {
  const filePath = resolveWordBankPath(childId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function addWordToBank(
  childId: string,
  word: string,
  source: string,
  wilsonStep?: number,
  tags?: string[],
): void {
  const bank = readWordBank(childId);
  if (bank.words.some((w) => w.word === word)) return;
  const entry: WordEntry = {
    word,
    addedAt: new Date().toISOString(),
    source,
    wilsonStep,
    tags,
    tracks: {},
  };
  bank.words.push(entry);
  writeWordBank(childId, bank);
}

export function updateWordTrack(
  childId: string,
  word: string,
  domain: Domain,
  track: SM2Track,
): void {
  const bank = readWordBank(childId);
  const entry = bank.words.find((w) => w.word === word);
  if (!entry) return;
  entry.tracks[domain] = track;
  writeWordBank(childId, bank);
}

export function getWordsDue(childId: string, domain: Domain, today: string): WordEntry[] {
  const bank = readWordBank(childId);
  return bank.words.filter((entry) => {
    const track = entry.tracks[domain];
    if (!track) return false;
    return track.nextReviewDate <= today;
  });
}

export function ensureWordInBank(
  childId: string,
  word: string,
  domain: Domain,
  source: string,
): void {
  const bank = readWordBank(childId);
  let entry = bank.words.find((w) => w.word === word);
  if (!entry) {
    entry = {
      word,
      addedAt: new Date().toISOString(),
      source,
      tracks: {},
    };
    bank.words.push(entry);
  }
  if (!entry.tracks[domain]) {
    entry.tracks[domain] = createFreshSM2Track(new Date().toISOString().slice(0, 10));
  }
  writeWordBank(childId, bank);
}

export { createFreshSM2Track };
