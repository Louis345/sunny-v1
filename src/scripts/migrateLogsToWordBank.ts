import "dotenv/config";
import fs from "fs";
import path from "path";
import type { WordEntry } from "../algorithms/types";
import type { WordBankFile } from "../context/schemas/wordBank";
import { createFreshSM2Track } from "../context/schemas/wordBank";
import { readWordBank, writeWordBank } from "../utils/wordBankIO";

interface LegacyAttempt {
  timestamp: string;
  word: string;
  correct: boolean;
}

interface LegacyMathAttempt {
  timestamp: string;
  operation: string;
  operandA: number;
  operandB: number;
  childAnswer: number;
  correct: boolean;
}

function loadNDJSON<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function migrateSpellingAttempts(childId: string): number {
  const logsDir = path.resolve(process.cwd(), "src", "logs");
  const fileName = `${childId}_attempts.json`;
  const filePath = path.resolve(logsDir, fileName);

  const attempts = loadNDJSON<LegacyAttempt>(filePath);
  if (attempts.length === 0) return 0;

  const bank = readWordBank(childId);
  const today = new Date().toISOString().slice(0, 10);
  let migrated = 0;

  const wordAttempts = new Map<string, LegacyAttempt[]>();
  for (const a of attempts) {
    const list = wordAttempts.get(a.word) || [];
    list.push(a);
    wordAttempts.set(a.word, list);
  }

  for (const [word, wordHistory] of wordAttempts) {
    let entry = bank.words.find((w) => w.word === word);
    if (!entry) {
      entry = {
        word,
        addedAt: wordHistory[0].timestamp,
        source: "migrated_from_logs",
        tracks: {},
      };
      bank.words.push(entry);
    }

    if (!entry.tracks.spelling) {
      const track = createFreshSM2Track(today);
      const correct = wordHistory.filter((a) => a.correct).length;
      const total = wordHistory.length;

      if (total >= 3 && correct / total >= 0.8) {
        track.easinessFactor = 2.5;
        track.interval = 7;
        track.repetition = 3;
        track.quality = 4;
      } else if (total >= 2 && correct / total >= 0.5) {
        track.easinessFactor = 2.3;
        track.interval = 4;
        track.repetition = 2;
        track.quality = 3;
      } else {
        track.easinessFactor = 2.1;
        track.interval = 1;
        track.repetition = 0;
        track.quality = 2;
      }

      track.nextReviewDate = today;
      track.lastReviewDate = wordHistory[wordHistory.length - 1].timestamp.slice(0, 10);
      track.history = wordHistory.slice(-20).map((a) => ({
        date: a.timestamp.slice(0, 10),
        quality: (a.correct ? 4 : 1) as 0 | 1 | 2 | 3 | 4 | 5,
        scaffoldLevel: 0 as const,
        correct: a.correct,
      }));

      entry.tracks.spelling = track;
      migrated++;
    }
  }

  writeWordBank(childId, bank);
  return migrated;
}

function migrateMathAttempts(childId: string): number {
  const logsDir = path.resolve(process.cwd(), "src", "logs");
  const fileName = `${childId}_math.json`;
  const filePath = path.resolve(logsDir, fileName);

  const attempts = loadNDJSON<LegacyMathAttempt>(filePath);
  if (attempts.length === 0) return 0;

  const bank = readWordBank(childId);
  const today = new Date().toISOString().slice(0, 10);
  let migrated = 0;

  const problemKeys = new Map<string, LegacyMathAttempt[]>();
  for (const a of attempts) {
    const key = `${a.operandA}${a.operation === "addition" ? "+" : "-"}${a.operandB}`;
    const list = problemKeys.get(key) || [];
    list.push(a);
    problemKeys.set(key, list);
  }

  for (const [key, history] of problemKeys) {
    let entry = bank.words.find((w) => w.word === key);
    if (!entry) {
      entry = {
        word: key,
        addedAt: history[0].timestamp,
        source: "migrated_from_logs",
        tags: ["math"],
        tracks: {},
      };
      bank.words.push(entry);
    }

    if (!entry.tracks.math) {
      const track = createFreshSM2Track(today);
      const correct = history.filter((a) => a.correct).length;
      const total = history.length;

      if (total >= 2 && correct / total >= 0.8) {
        track.interval = 7;
        track.repetition = 3;
        track.quality = 5;
      } else {
        track.interval = 1;
        track.repetition = 0;
        track.quality = 2;
      }

      track.nextReviewDate = today;
      track.lastReviewDate = history[history.length - 1].timestamp.slice(0, 10);
      entry.tracks.math = track;
      migrated++;
    }
  }

  writeWordBank(childId, bank);
  return migrated;
}

async function main() {
  console.log("\n  🔄 Migrating legacy logs to word banks...\n");

  const ilaSpelling = migrateSpellingAttempts("ila");
  console.log(`  ✅ Ila spelling: ${ilaSpelling} words migrated`);

  const reinaSpelling = migrateSpellingAttempts("reina");
  console.log(`  ✅ Reina spelling: ${reinaSpelling} words migrated`);

  const reinaMath = migrateMathAttempts("reina");
  console.log(`  ✅ Reina math: ${reinaMath} problems migrated`);

  console.log("\n  ✅ Migration complete. src/logs/ files kept for backward compatibility.\n");
}

main().catch(console.error);
