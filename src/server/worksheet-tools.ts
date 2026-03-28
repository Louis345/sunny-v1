/**
 * Pure worksheet session API — no WebSocket, TTS, or HTTP.
 * Claude drives; this module holds state, canvas mode, and attempt logs.
 */

import fs from "fs";
import path from "path";

// ── Types ─────────────────────────────────────────────────────────────────

export type WorksheetDomain = "coin_counting" | "general_math";

export interface ProblemInput {
  id: string;
  question: string;
  canonicalAnswer: string;
  hint: string;
  /** Per-problem extracted facts — compare_amounts: leftCents/rightCents; money_count: totalCents, etc. */
  facts: Record<string, number>;
}

export interface WorksheetSessionOptions {
  childName: string;
  companionName: string;
  problems: ProblemInput[];
  rewardThreshold: number;
  rewardGame: string;
}

export interface SessionStatus {
  sessionType: "worksheet";
  childName: string;
  problemsTotal: number;
  problemsCompleted: number;
  currentProblemId: string | null;
  canvasShowing: "idle" | "worksheet_pdf" | string;
  rewardEarned: boolean;
  rewardThreshold: number;
  pendingRewardFromLastSession: string | null;
}

export interface GetNextProblemResult {
  ok: boolean;
  problemId?: string;
  question?: string;
  hint?: string;
  facts?: Record<string, number>;
  canvasRendered?: boolean;
  error?: string;
  completed?: boolean;
}

export interface SubmitAnswerInput {
  problemId: string;
  correct: boolean;
  childSaid: string;
}

export interface SubmitAnswerResult {
  ok: boolean;
  logged?: boolean;
  problemsRemaining?: number;
  rewardEarned?: boolean;
  rewardGame?: string;
  error?: string;
}

export interface ClearCanvasResult {
  ok: boolean;
  canvasShowing: "idle";
}

export interface LaunchGameInput {
  name: string;
  type: "tool" | "reward";
}

export interface LaunchGameResult {
  ok: boolean;
  canvasShowing?: string;
  error?: string;
}

export interface AttemptRecord {
  problemId: string;
  correct: boolean;
  childSaid: string;
  timestamp: string;
}

export interface EarnedReward {
  game: string;
  childName: string;
  earned: boolean;
  timestamp: string;
}

export interface AmountValidationResult {
  allValid: boolean;
  valid: number[];
  flagged: number[];
  candidates: Array<{ original: number; candidate: number }>;
}

export interface GamePoolItem {
  emoji: string;
  name: string;
  price: number;
}

export interface WorksheetSession {
  getSessionStatus(): SessionStatus;
  getNextProblem(): GetNextProblemResult;
  /** Present a specific problem by id (canvasShow worksheet / tests). */
  showProblemById(problemId: string): GetNextProblemResult;
  submitAnswer(input: SubmitAnswerInput): SubmitAnswerResult;
  clearCanvas(): ClearCanvasResult;
  launchGame(input: LaunchGameInput): LaunchGameResult;
  getAttemptLog(): AttemptRecord[];
}

// ── Reward persistence ────────────────────────────────────────────────────

export const REWARD_STATE_DIR = path.resolve(process.cwd(), "src/state");

function rewardFilePath(childName: string): string {
  return path.join(
    REWARD_STATE_DIR,
    `${childName.toLowerCase()}_pending_reward.json`,
  );
}

export function saveEarnedReward(childName: string, game: string): void {
  fs.mkdirSync(REWARD_STATE_DIR, { recursive: true });
  const payload = {
    game,
    childName,
    earned: true,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(rewardFilePath(childName), JSON.stringify(payload, null, 2), "utf-8");
}

export function loadEarnedReward(childName: string): EarnedReward | null {
  const p = rewardFilePath(childName);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw) as EarnedReward;
  } catch {
    return null;
  }
}

export function clearEarnedReward(childName: string): void {
  const p = rewardFilePath(childName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ── Extraction / domain ─────────────────────────────────────────────────────

export function detectWorksheetDomain(subject: string): WorksheetDomain {
  if (/\b(coin|money|cent|quarter|dime|nickel|penny|pennies)\b/i.test(subject)) {
    return "coin_counting";
  }
  return "general_math";
}

export function validateExtractionAmounts(opts: {
  domain: WorksheetDomain;
  amounts: number[];
}): AmountValidationResult {
  const { domain, amounts } = opts;
  if (domain !== "coin_counting") {
    return {
      allValid: true,
      valid: [...amounts],
      flagged: [],
      candidates: [],
    };
  }

  const valid: number[] = [];
  const flagged: number[] = [];
  const candidates: Array<{ original: number; candidate: number }> = [];

  for (const amt of amounts) {
    if (amt > 100) {
      flagged.push(amt);
      if (amt > 100 && amt < 200) {
        candidates.push({ original: amt, candidate: amt - 100 });
      }
    } else {
      valid.push(amt);
    }
  }

  return {
    allValid: flagged.length === 0,
    valid,
    flagged,
    candidates,
  };
}

const STORE_ITEMS: Array<{ emoji: string; name: string }> = [
  { emoji: "🎈", name: "Balloon" },
  { emoji: "🍎", name: "Apple" },
  { emoji: "🍬", name: "Candy" },
  { emoji: "🪀", name: "Yo-Yo" },
  { emoji: "🖍️", name: "Crayons" },
  { emoji: "🍩", name: "Donut" },
  { emoji: "🌟", name: "Star Badge" },
  { emoji: "🧃", name: "Juice Box" },
  { emoji: "🍭", name: "Lollipop" },
  { emoji: "🚀", name: "Rocket Toy" },
];

export function buildSanitizedGamePool(opts: {
  domain: WorksheetDomain;
  amounts: number[];
}): GamePoolItem[] {
  const validation = validateExtractionAmounts({
    domain: opts.domain,
    amounts: opts.amounts,
  });
  const unique = [...new Set(validation.valid)].sort((a, b) => a - b);
  return unique.map((price, i) => ({
    ...STORE_ITEMS[i % STORE_ITEMS.length],
    price,
  }));
}

// ── Session factory ───────────────────────────────────────────────────────

type CanvasState = "idle" | "worksheet_pdf" | string;

export function createWorksheetSession(
  opts: WorksheetSessionOptions,
): WorksheetSession {
  const problems = [...opts.problems];
  const pendingRewardFromLastSession =
    loadEarnedReward(opts.childName)?.game ?? null;

  let canvasState: CanvasState = "idle";
  /** Index of the next problem to present (0-based). Advances only after a correct submit. */
  let nextProblemIndex = 0;
  let activeProblemId: string | null = null;
  let completedCount = 0;
  let sessionRewardEarned = false;
  const attempts: AttemptRecord[] = [];

  function problemsRemaining(): number {
    return problems.length - completedCount;
  }

  function snapshotStatus(): SessionStatus {
    return {
      sessionType: "worksheet",
      childName: opts.childName,
      problemsTotal: problems.length,
      problemsCompleted: completedCount,
      currentProblemId: activeProblemId,
      canvasShowing: canvasState,
      rewardEarned: sessionRewardEarned,
      rewardThreshold: opts.rewardThreshold,
      pendingRewardFromLastSession,
    };
  }

  function presentProblemAt(index: number): GetNextProblemResult {
    const p = problems[index];
    canvasState = "worksheet_pdf";
    activeProblemId = p.id;
    return {
      ok: true,
      problemId: p.id,
      question: p.question,
      hint: p.hint,
      facts: { ...p.facts },
      canvasRendered: true,
    };
  }

  return {
    getSessionStatus(): SessionStatus {
      return { ...snapshotStatus() };
    },

    getNextProblem(): GetNextProblemResult {
      if (canvasState !== "idle" && canvasState !== "worksheet_pdf") {
        return {
          ok: false,
          error: `canvas occupied by ${canvasState}, call clearCanvas first`,
        };
      }

      if (activeProblemId !== null) {
        const idx = problems.findIndex((p) => p.id === activeProblemId);
        if (idx >= 0) return presentProblemAt(idx);
      }

      if (nextProblemIndex >= problems.length) {
        return {
          ok: false,
          error: "no more problems",
          completed: true,
        };
      }

      return presentProblemAt(nextProblemIndex);
    },

    showProblemById(problemId: string): GetNextProblemResult {
      if (canvasState !== "idle" && canvasState !== "worksheet_pdf") {
        return {
          ok: false,
          error: `canvas occupied by ${canvasState}, call clearCanvas first`,
        };
      }
      const idx = problems.findIndex((p) => p.id === problemId);
      if (idx < 0) {
        return { ok: false, error: `unknown problem id ${problemId}` };
      }
      return presentProblemAt(idx);
    },

    submitAnswer(input: SubmitAnswerInput): SubmitAnswerResult {
      if (activeProblemId === null) {
        return { ok: false, error: "no active problem" };
      }
      if (input.problemId !== activeProblemId) {
        return {
          ok: false,
          error: `problemId mismatch: expected ${activeProblemId}, got ${input.problemId}`,
        };
      }

      const rec: AttemptRecord = {
        problemId: input.problemId,
        correct: input.correct,
        childSaid: input.childSaid,
        timestamp: new Date().toISOString(),
      };
      attempts.push(rec);

      const remaining = problemsRemaining();

      if (!input.correct) {
        return {
          ok: true,
          logged: true,
          problemsRemaining: remaining,
          rewardEarned: false,
        };
      }

      completedCount++;
      activeProblemId = null;
      nextProblemIndex++;

      if (completedCount >= opts.rewardThreshold) {
        sessionRewardEarned = true;
      }

      const remAfter = problemsRemaining();
      const out: SubmitAnswerResult = {
        ok: true,
        logged: true,
        problemsRemaining: remAfter,
        rewardEarned: sessionRewardEarned,
      };
      if (sessionRewardEarned) {
        out.rewardGame = opts.rewardGame;
      }
      return out;
    },

    clearCanvas(): ClearCanvasResult {
      canvasState = "idle";
      return { ok: true, canvasShowing: "idle" };
    },

    launchGame(input: LaunchGameInput): LaunchGameResult {
      if (canvasState !== "idle") {
        return {
          ok: false,
          error: `canvas occupied by ${canvasState}, call clearCanvas first`,
        };
      }
      canvasState = input.name;
      return { ok: true, canvasShowing: input.name };
    },

    getAttemptLog(): AttemptRecord[] {
      return attempts.map((a) => ({ ...a }));
    },
  };
}
