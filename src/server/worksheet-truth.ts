/**
 * Single source of truth for worksheet problem accuracy (server-side facts).
 *
 * PRINCIPLE: The server provides FACTS and confidence flags. Pedagogical wording
 * for the child is owned by the model, except short non-numeric transitions
 * (see session-manager).
 *
 * PRINCIPLE: candidateCorrection is a heuristic only — never auto-applied as
 * spoken truth; the model + image remain authoritative when values are suspect.
 */

import type { CanonicalWorksheetProblem } from "./worksheet-problem";

export type WorksheetDomain = "coin_counting" | "general_math";
export type ValueConfidence = "trusted" | "suspect";

/** Trusted max for elementary US coin amounts (four quarters = $1.00). Flag extraction > this. */
export const COIN_WORKSHEET_MAX_CENTS = 100;

export interface TruthValue {
  value: number;
  confidence: ValueConfidence;
  /** Heuristic only — never auto-spoken; model verifies against the worksheet image. */
  candidateCorrection?: number;
  reason?: string;
}

export interface WorksheetProblemTruth {
  problemId: string;
  kind: string;
  leftCents: TruthValue;
  rightCents: TruthValue;
  usableForReveal: boolean;
  usableForGamePool: boolean;
  toContextInjection: () => string;
  getRevealFacts: () => { correctAnswer: string; hint: string } | null;
}

export interface AmountValidationResult {
  allValid: boolean;
  valid: number[];
  flagged: number[];
  suggestions: Array<{ original: number; suggested: number }>;
}

/**
 * Best-effort domain from extractor subject line until extraction schema
 * provides structured lesson_scope.
 */
export function detectWorksheetDomain(subject: string): WorksheetDomain {
  const s = subject.toLowerCase();
  if (
    /\b(coin|money|cent|cents|quarter|dime|nickel|penny|pennies)\b/.test(s)
  ) {
    return "coin_counting";
  }
  return "general_math";
}

export function validateExtractionAmounts(opts: {
  worksheetDomain: WorksheetDomain;
  amounts: number[];
}): AmountValidationResult {
  const { worksheetDomain, amounts } = opts;

  if (worksheetDomain !== "coin_counting") {
    return { allValid: true, valid: [...amounts], flagged: [], suggestions: [] };
  }

  const valid: number[] = [];
  const flagged: number[] = [];
  const suggestions: Array<{ original: number; suggested: number }> = [];

  for (const amt of amounts) {
    if (amt > COIN_WORKSHEET_MAX_CENTS) {
      flagged.push(amt);
      if (amt > COIN_WORKSHEET_MAX_CENTS && amt < 200) {
        suggestions.push({ original: amt, suggested: amt - 100 });
      }
    } else {
      valid.push(amt);
    }
  }

  return {
    allValid: flagged.length === 0,
    valid,
    flagged,
    suggestions,
  };
}

function validateSingleAmount(
  cents: number,
  domain: WorksheetDomain,
): TruthValue {
  if (domain !== "coin_counting" || cents <= COIN_WORKSHEET_MAX_CENTS) {
    return { value: cents, confidence: "trusted" };
  }
  const candidateCorrection =
    cents > COIN_WORKSHEET_MAX_CENTS && cents < 200 ? cents - 100 : undefined;
  return {
    value: cents,
    confidence: "suspect",
    candidateCorrection,
    reason: `${cents}¢ exceeds coin worksheet maximum (${COIN_WORKSHEET_MAX_CENTS}¢) — likely OCR misread (candidate: ${candidateCorrection != null ? `${candidateCorrection}¢` : "verify visually"})`,
  };
}

export function buildProblemTruth(opts: {
  problemId: string;
  kind: string;
  extractedLeftCents: number;
  extractedRightCents: number;
  worksheetDomain: WorksheetDomain;
}): WorksheetProblemTruth {
  const left = validateSingleAmount(
    opts.extractedLeftCents,
    opts.worksheetDomain,
  );
  const right = validateSingleAmount(
    opts.extractedRightCents,
    opts.worksheetDomain,
  );

  const usable =
    left.confidence === "trusted" && right.confidence === "trusted";

  return {
    problemId: opts.problemId,
    kind: opts.kind,
    leftCents: left,
    rightCents: right,
    usableForReveal: usable,
    usableForGamePool: usable,

    toContextInjection(): string {
      const lines: string[] = [];
      lines.push(`[Problem ${opts.problemId} Facts]`);
      lines.push(`Kind: ${opts.kind}`);

      if (left.confidence === "trusted") {
        lines.push(`Left amount: ${left.value}¢`);
      } else {
        lines.push(
          `Left amount: ${left.value}¢ (WARNING: OCR may have misread this — ` +
            (left.candidateCorrection != null
              ? `possibly ${left.candidateCorrection}¢`
              : "verify against the worksheet image") +
            ")",
        );
      }

      if (right.confidence === "trusted") {
        lines.push(`Right amount: ${right.value}¢`);
      } else {
        lines.push(
          `Right amount: ${right.value}¢ (WARNING: OCR may have misread this — ` +
            (right.candidateCorrection != null
              ? `possibly ${right.candidateCorrection}¢`
              : "verify against the worksheet image") +
            ")",
        );
      }

      if (!usable) {
        lines.push(
          "IMPORTANT: Some extracted values are suspect. Use the worksheet image as your source of truth, not the extracted numbers alone.",
        );
      }

      return lines.join("\n");
    },

    getRevealFacts(): { correctAnswer: string; hint: string } | null {
      if (!usable) return null;
      if (opts.kind === "compare_amounts") {
        const larger = Math.max(left.value, right.value);
        const smaller = Math.min(left.value, right.value);
        const side = left.value > right.value ? "left" : "right";
        return {
          correctAnswer: `The ${side} side has more money (${larger}¢ vs ${smaller}¢)`,
          hint: `Compare ${left.value}¢ and ${right.value}¢`,
        };
      }
      return null;
    },
  };
}

/** Build truth map entries from normalized canonical problems. */
export function buildTruthForCanonicalProblem(
  problem: CanonicalWorksheetProblem,
  worksheetDomain: WorksheetDomain,
): WorksheetProblemTruth | null {
  if (problem.kind === "compare_amounts") {
    return buildProblemTruth({
      problemId: String(problem.id),
      kind: problem.kind,
      extractedLeftCents: problem.leftAmountCents,
      extractedRightCents: problem.rightAmountCents,
      worksheetDomain,
    });
  }
  if (problem.kind === "money_count") {
    const price = validateSingleAmount(
      problem.itemPriceCents,
      worksheetDomain,
    );
    const total = validateSingleAmount(
      problem.totalSpentCents,
      worksheetDomain,
    );
    const usable =
      price.confidence === "trusted" && total.confidence === "trusted";
    const id = String(problem.id);
    return {
      problemId: id,
      kind: problem.kind,
      leftCents: price,
      rightCents: total,
      usableForReveal: usable,
      usableForGamePool: usable,
      toContextInjection(): string {
        const lines: string[] = [
          `[Problem ${id} Facts]`,
          `Kind: money_count`,
          `Item: ${problem.itemLabel}`,
        ];
        lines.push(
          price.confidence === "trusted"
            ? `Item price: ${price.value}¢`
            : `Item price: ${price.value}¢ (WARNING: suspect — candidate ${price.candidateCorrection ?? "n/a"}¢)`,
        );
        lines.push(
          total.confidence === "trusted"
            ? `Total spent: ${total.value}¢`
            : `Total spent: ${total.value}¢ (WARNING: suspect — candidate ${total.candidateCorrection ?? "n/a"}¢)`,
        );
        if (!usable) {
          lines.push(
            "IMPORTANT: Extracted money values may be OCR errors — verify against the worksheet image.",
          );
        }
        return lines.join("\n");
      },
      getRevealFacts(): { correctAnswer: string; hint: string } | null {
        if (!usable) return null;
        return {
          correctAnswer: problem.canonicalAnswer,
          hint: problem.hint,
        };
      },
    };
  }
  return null;
}

// ── Log integrity ──

export interface LogAttemptValidation {
  valid: boolean;
  effectiveChildSaid: string;
  reason?: string;
  warning?: string;
}

export function validateLogWorksheetAttempt(opts: {
  modelChildSaid: string;
  actualTranscript: string;
  modelProblemId: string;
  serverProblemId: string;
}): LogAttemptValidation {
  if (opts.modelProblemId !== opts.serverProblemId) {
    return {
      valid: false,
      effectiveChildSaid: opts.actualTranscript.trim(),
      reason: `problemId mismatch: model=${opts.modelProblemId} server=${opts.serverProblemId}`,
    };
  }

  if (!opts.actualTranscript.trim()) {
    return {
      valid: true,
      effectiveChildSaid: opts.modelChildSaid,
      warning: "empty transcript — using model-supplied childSaid",
    };
  }

  return {
    valid: true,
    effectiveChildSaid: opts.actualTranscript.trim(),
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

export function buildSanitizedStorePool(opts: {
  worksheetDomain: WorksheetDomain;
  amounts: number[];
}): Array<{ emoji: string; name: string; price: number }> {
  const validation = validateExtractionAmounts(opts);
  const unique = [...new Set(validation.valid)].sort((a, b) => a - b);
  return unique.map((price, i) => ({
    ...STORE_ITEMS[i % STORE_ITEMS.length],
    price,
  }));
}

/** Trusted compare amounts for post–store-game follow-up context (no scripted child-facing sentences). */
export function formatTrustedAmountsSummaryForLearningArc(
  problems: CanonicalWorksheetProblem[],
  truthById: Map<string, WorksheetProblemTruth>,
): string {
  const lines: string[] = [];
  for (const p of problems) {
    const t = truthById.get(String(p.id));
    if (!t || !t.usableForGamePool) continue;
    if (p.kind === "compare_amounts") {
      lines.push(
        `Problem ${p.id}: left ${t.leftCents.value}¢, right ${t.rightCents.value}¢ (trusted extraction)`,
      );
    }
  }
  if (lines.length === 0) {
    return "No fully trusted extracted cent amounts — use the worksheet image for numbers.";
  }
  return lines.join("\n");
}
