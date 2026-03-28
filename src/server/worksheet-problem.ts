import type {
  HomeworkProblemItem,
  StructuredWorksheetContract,
} from "../agents/psychologist/psychologist";
import { deriveWorksheetCanvasModel } from "./worksheet-canvas-model";

export type CanonicalWorksheetProblem =
  | {
      id: number;
      page?: number;
      kind: "money_count";
      question: string;
      promptVisible?: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      linkedGames?: string[];
      evidence?: string[];
      confidence?: number;
      itemLabel: string;
      itemPriceCents: number;
      totalSpentCents: number;
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }
  | {
      id: number;
      page?: number;
      kind: "compare_amounts";
      question: string;
      promptVisible?: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      linkedGames?: string[];
      evidence?: string[];
      confidence?: number;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater" | "less";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    };

export type WorksheetProblemNormalizationResult =
  | { ok: true; problem: CanonicalWorksheetProblem }
  | {
      ok: false;
      reason:
        | "missing_required_fields"
        | "unsupported_problem_type"
        | "invalid_money_problem";
      detail?: string;
      itemId?: number;
    };

export type WorksheetPromptProblem = Pick<
  HomeworkProblemItem,
  "id" | "question" | "instructions" | "answer" | "hint" | "canvas_display"
>;

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function extractFirstCount(text: string): number | null {
  const numeric = String(text ?? "").match(/\b(\d+)\b/);
  if (numeric) return Number(numeric[1]);

  const words = String(text ?? "").toLowerCase().match(/\b[a-z]+\b/g) ?? [];
  for (let i = 0; i < words.length; i++) {
    const value = NUMBER_WORDS[words[i]];
    if (value == null) continue;
    const next = NUMBER_WORDS[words[i + 1]];
    if (value >= 20 && next != null && next < 10) {
      return value + next;
    }
    return value;
  }
  return null;
}

function extractMoneyAmount(text: string): number | null {
  const raw = String(text ?? "").toLowerCase();
  const numericDollar = raw.match(/\$\s*(\d+)(?:\.(\d{1,2}))?/);
  if (numericDollar) {
    const dollars = Number(numericDollar[1]);
    const cents = Number((numericDollar[2] ?? "0").padEnd(2, "0"));
    return dollars * 100 + cents;
  }
  const cleaned = raw.replace(/[^a-z0-9$ ]/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);
  const dollarIndex = words.findIndex((word) => word === "dollar" || word === "dollars");
  if (dollarIndex >= 0) {
    const dollars = extractFirstCount(words.slice(0, dollarIndex).join(" "));
    if (dollars == null) return null;
    const centIndex = words.findIndex((word, index) => index > dollarIndex && (word === "cent" || word === "cents"));
    const cents =
      centIndex > dollarIndex
        ? extractFirstCount(words.slice(dollarIndex + 1, centIndex).join(" "))
        : 0;
    return dollars * 100 + Math.max(0, cents ?? 0);
  }
  return null;
}

function buildCanvasSource(item: HomeworkProblemItem): WorksheetPromptProblem {
  return {
    id: item.id,
    question: item.question,
    instructions: item.instructions,
    answer: item.answer,
    hint: item.hint,
    canvas_display: item.canvas_display,
  };
}

function normalizeStructuredProblem(
  item: HomeworkProblemItem,
  structured: StructuredWorksheetContract,
): WorksheetProblemNormalizationResult {
  if (structured.problemType === "money_count" && structured.visibleFacts.kind === "money_count") {
    const price = structured.visibleFacts.itemPriceCents;
    const total = structured.visibleFacts.totalSpentCents;
    // totalSpentCents is the canonical answer. itemPriceCents may be 0 for "count all
    // coins in the box" problems with no per-item unit price.
    if (
      !structured.visibleFacts.itemLabel ||
      price < 0 ||
      total <= 0
    ) {
      return {
        ok: false,
        reason: "invalid_money_problem",
        itemId: item.id,
        detail: "Structured money_count facts were incomplete",
      };
    }
    return {
      ok: true,
      problem: {
        id: item.id,
        page: structured.page,
        kind: "money_count",
        question: structured.promptSpoken || item.question,
        promptVisible: structured.promptVisible,
        instructions: item.instructions,
        hint: item.hint,
        canonicalAnswer: structured.canonicalAnswer,
        linkedGames: structured.linkedGames,
        evidence: structured.evidence,
        confidence: structured.confidence,
        itemLabel: structured.visibleFacts.itemLabel,
        itemPriceCents: structured.visibleFacts.itemPriceCents,
        totalSpentCents: structured.visibleFacts.totalSpentCents,
        sourceAnswer: item.answer,
        sourceCanvasDisplay: item.canvas_display,
      },
    };
  }
  if (structured.problemType === "compare_amounts" && structured.visibleFacts.kind === "compare_amounts") {
    return {
      ok: true,
      problem: {
        id: item.id,
        page: structured.page,
        kind: "compare_amounts",
        question: structured.promptSpoken || item.question,
        promptVisible: structured.promptVisible,
        instructions: item.instructions,
        hint: item.hint,
        canonicalAnswer: structured.canonicalAnswer,
        linkedGames: structured.linkedGames,
        evidence: structured.evidence,
        confidence: structured.confidence,
        leftAmountCents: structured.visibleFacts.leftAmountCents,
        rightAmountCents: structured.visibleFacts.rightAmountCents,
        askVisual: structured.visibleFacts.askVisual,
        sourceAnswer: item.answer,
        sourceCanvasDisplay: item.canvas_display,
      },
    };
  }
  return {
    ok: false,
    reason: "unsupported_problem_type",
    itemId: item.id,
    detail: `Unsupported structured worksheet problem type: ${structured.problemType}`,
  };
}

export function normalizeWorksheetProblem(
  item: HomeworkProblemItem,
): WorksheetProblemNormalizationResult {
  if (!item.question?.trim() || !item.answer?.trim()) {
    return {
      ok: false,
      reason: "missing_required_fields",
      itemId: item.id,
    };
  }

  if (item.structured) {
    return normalizeStructuredProblem(item, item.structured);
  }

  const source = buildCanvasSource(item);
  const model = deriveWorksheetCanvasModel(source);
  if (!model) {
    return {
      ok: false,
      reason: "unsupported_problem_type",
      itemId: item.id,
      detail: "No deterministic worksheet model could be derived",
    };
  }

  if (
    model.kind === "money_scene" &&
    model.askVisual === "item_count" &&
    model.items.length === 1 &&
    model.totalSpentCents != null &&
    model.items[0].priceCents > 0
  ) {
    return {
      ok: true,
      problem: {
        id: item.id,
        kind: "money_count",
        question: item.question,
        instructions: item.instructions,
        hint: item.hint,
        canonicalAnswer: String(
          Math.floor(model.totalSpentCents / model.items[0].priceCents),
        ),
        itemLabel: model.items[0].label,
        itemPriceCents: model.items[0].priceCents,
        totalSpentCents: model.totalSpentCents,
        sourceAnswer: item.answer,
        sourceCanvasDisplay: item.canvas_display,
      },
    };
  }

  if (model.kind === "compare_amounts") {
    const canonicalAnswer =
      model.askVisual === "less"
        ? String(Math.min(model.leftAmountCents, model.rightAmountCents))
        : String(Math.max(model.leftAmountCents, model.rightAmountCents));
    return {
      ok: true,
      problem: {
        id: item.id,
        kind: "compare_amounts",
        question: item.question,
        instructions: item.instructions,
        hint: item.hint,
        canonicalAnswer,
        leftAmountCents: model.leftAmountCents,
        rightAmountCents: model.rightAmountCents,
        askVisual: model.askVisual,
        sourceAnswer: item.answer,
        sourceCanvasDisplay: item.canvas_display,
      },
    };
  }

  return {
    ok: false,
    reason: "invalid_money_problem",
    itemId: item.id,
    detail: "Money problem could not be normalized into a supported canonical type",
  };
}

export function gradeWorksheetTranscript(
  problem: CanonicalWorksheetProblem,
  transcript: string,
): boolean {
  const count = extractMoneyAmount(transcript) ?? extractFirstCount(transcript);
  if (count == null) return false;
  return count === Number(problem.canonicalAnswer);
}

export function toWorksheetCanvasSource(
  problem: CanonicalWorksheetProblem,
): WorksheetPromptProblem {
  if (problem.kind === "money_count") {
    const priceLine =
      problem.itemPriceCents > 0
        ? `${problem.itemLabel} ${problem.itemPriceCents}¢. Total spent ${problem.totalSpentCents}¢.`
        : `${problem.itemLabel}. Total ${problem.totalSpentCents}¢ (count the coins).`;
    return {
      id: problem.id,
      question: problem.question,
      instructions: problem.instructions,
      answer: problem.canonicalAnswer,
      hint: problem.hint,
      canvas_display: `Cookie shop. ${priceLine}`,
    };
  }

  return {
    id: problem.id,
    question: problem.question,
    instructions: problem.instructions,
    answer: problem.canonicalAnswer,
    hint: problem.hint,
    canvas_display: `Two piles of coins. One pile shows ${problem.leftAmountCents}¢. The other pile shows ${problem.rightAmountCents}¢.`,
  };
}

export function toWorksheetPromptProblem(
  problem: CanonicalWorksheetProblem,
): WorksheetPromptProblem {
  return toWorksheetCanvasSource(problem);
}
