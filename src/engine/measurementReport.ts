import fs from "fs";
import path from "path";
import type { StepSessionRecord } from "../algorithms/types";
import { evaluateMasteryGate } from "../algorithms/masteryGating";
import { readWordBank } from "../utils/wordBankIO";
import { readLearningProfile } from "../utils/learningProfileIO";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseSessionNoteAccuracy(md: string): number | null {
  const m = md.match(/Accuracy:\s*(\d+)%/);
  if (!m) return null;
  return Number(m[1]) / 100;
}

function listRecentSessionNotes(childId: string, max: number): { name: string; acc: number; attempts: number }[] {
  const dir = path.resolve(process.cwd(), "src", "context", childId, "session_notes");
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { f, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, max);
  const out: { name: string; acc: number; attempts: number }[] = [];
  for (const { f } of files) {
    try {
      const body = fs.readFileSync(path.join(dir, f), "utf-8");
      const acc = parseSessionNoteAccuracy(body);
      const am = body.match(/\((\d+)\/(\d+)\)/);
      const attempts = am ? Number(am[2]) : 0;
      if (acc !== null) {
        out.push({ name: f.replace(/\.md$/, ""), acc, attempts });
      }
    } catch {
      // skip
    }
  }
  return out.reverse();
}

function trendLabel(
  rows: { acc: number }[],
): "improving" | "stable" | "declining" {
  if (rows.length < 2) return "stable";
  const first = rows[0].acc;
  const last = rows[rows.length - 1].acc;
  if (last > first + 0.05) return "improving";
  if (last < first - 0.05) return "declining";
  return "stable";
}

export function buildMeasurementReport(childId: string): string {
  try {
    const bank = readWordBank(childId);
    const profile = readLearningProfile(childId);
    const noteRows = listRecentSessionNotes(childId, 5);

    const spellingWords = bank.words.filter((w) => w.tracks.spelling);
    const readingWords = bank.words.filter((w) => w.tracks.reading);
    const hasAnyData =
      bank.words.length > 0 ||
      (profile?.sessionStats.totalSessions ?? 0) > 0 ||
      noteRows.length > 0 ||
      (profile?.moodHistory?.length ?? 0) > 0;

    if (!hasAnyData) return "";

    const t = today();
    const masteredSpell = spellingWords.filter((w) => w.tracks.spelling?.mastered).length;
    const spellDue = spellingWords.filter(
      (w) => (w.tracks.spelling?.nextReviewDate ?? "9999") <= t,
    ).length;
    const regressedSpell = spellingWords.filter(
      (w) => (w.tracks.spelling?.regressionCount ?? 0) > 0,
    ).map((w) => w.word);
    const avgEase =
      spellingWords.length > 0
        ? spellingWords.reduce(
            (s, w) => s + (w.tracks.spelling?.easinessFactor ?? 2.5),
            0,
          ) / spellingWords.length
        : 2.5;

    const readingDue = readingWords.filter(
      (w) => (w.tracks.reading?.nextReviewDate ?? "9999") <= t,
    ).length;

    const mood = profile?.moodHistory ?? [];
    const last5Mood = mood.slice(-5);
    const sessionLines = last5Mood.map((m, i) => {
      const pct = Math.round(m.sessionAccuracy * 100);
      return `    - Session ${i + 1}: ${pct}% (mood log)`;
    });

    const noteLines = noteRows.map((r, i) => {
      const pct = Math.round(r.acc * 100);
      return `    - Session ${i + 1}: ${pct}% (${r.attempts} attempts)`;
    });

    const crossLines =
      noteRows.length >= 2
        ? noteLines
        : sessionLines.length > 0
          ? sessionLines
          : noteLines;

    const trendSource =
      noteRows.length >= 2 ? noteRows.map((r) => ({ acc: r.acc })) : last5Mood.map((m) => ({ acc: m.sessionAccuracy }));
    const trend = trendLabel(trendSource);

    const stepHistory: StepSessionRecord[] = mood.slice(-12).map((m) => ({
      sessionDate: m.date.slice(0, 10),
      wordsAttempted: 10,
      wordsCorrect: Math.round(m.sessionAccuracy * 10),
      accuracy: m.sessionAccuracy,
    }));

    const wilsonStep = profile?.sessionStats.currentWilsonStep ?? 1;
    const masteryParams =
      profile?.algorithmParams.mastery ?? {
        gateAccuracy: 0.8,
        gateSessions: 3,
        regressionThreshold: 0.6,
        regressionSessions: 2,
      };
    const gate =
      stepHistory.length > 0
        ? evaluateMasteryGate({
            currentStep: wilsonStep,
            stepSessionHistory: stepHistory,
            params: masteryParams,
          })
        : {
            gate: "locked" as const,
            currentStep: wilsonStep,
            sessionsAtThreshold: 0,
            requiredSessions: masteryParams.gateSessions,
          };

    const lines: string[] = [];
    lines.push("## Latest Session Algorithm Data");
    lines.push("");
    lines.push("### Word Bank Summary (spelling)");
    lines.push(`    - Total words tracked: ${spellingWords.length}`);
    lines.push(
      `    - Mastered: ${masteredSpell} (${spellingWords.length ? Math.round((masteredSpell / spellingWords.length) * 100) : 0}%)`,
    );
    lines.push(`    - Due for review today: ${spellDue}`);
    lines.push(
      `    - Regressed: ${regressedSpell.length} (${regressedSpell.length ? regressedSpell.join(", ") : "none"})`,
    );
    lines.push(`    - Average ease factor: ${avgEase.toFixed(1)}`);
    lines.push("");
    lines.push("### Word Bank Summary (reading)");
    lines.push(`    - Total words tracked: ${readingWords.length}`);
    lines.push(`    - Flagged from reading: ${readingWords.length}`);
    lines.push(`    - Due for review: ${readingDue}`);
    lines.push("");
    lines.push("### Cross-Session Accuracy (last 5 sessions)");
    if (crossLines.length === 0) {
      lines.push("    - (no session history yet)");
    } else {
      lines.push(...crossLines);
    }
    lines.push(`    - Trend: ${trend}`);
    lines.push("");
    lines.push("### Wilson Step Status");
    lines.push(`    - Current step: ${gate.currentStep}`);
    lines.push(
      `    - Sessions at gate: ${gate.sessionsAtThreshold} of ${gate.requiredSessions} required`,
    );
    lines.push(`    - Gate: ${gate.gate}`);

    return lines.join("\n");
  } catch {
    return "";
  }
}
