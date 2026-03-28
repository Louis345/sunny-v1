import { z } from "zod";
import type { CanonicalWorksheetProblem } from "./worksheet-problem";

const OVERLAY_FIELD_SCHEMA = z.object({
  fieldId: z.string().min(1),
  kind: z.enum(["text", "number", "choice"]),
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  placeholder: z.string().optional(),
  options: z.array(z.string().min(1)).optional(),
});

const PAGE_SCHEMA = z.object({
  page: z.number().int().positive(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

const PROBLEM_SCHEMA = z.object({
  problemId: z.string().min(1),
  page: z.number().int().positive(),
  prompt: z.string().min(1),
  canonicalAnswer: z.string().min(1),
  gradingMode: z.enum(["numeric", "exact", "choice"]),
  linkedGames: z.array(z.string().min(1)).default([]),
  overlayFields: z.array(OVERLAY_FIELD_SCHEMA).min(1),
});

const MANIFEST_SCHEMA = z.object({
  assignmentId: z.string().min(1),
  childName: z.enum(["Ila", "Reina"]),
  title: z.string().min(1),
  source: z.literal("worksheet_pdf"),
  createdAt: z.string().min(1),
  pdfAssetUrl: z.string().min(1),
  pages: z.array(PAGE_SCHEMA).min(1),
  problems: z.array(PROBLEM_SCHEMA).min(1),
});

export type OverlayField = z.infer<typeof OVERLAY_FIELD_SCHEMA>;
export type AssignmentPage = z.infer<typeof PAGE_SCHEMA>;
export type AssignmentProblem = z.infer<typeof PROBLEM_SCHEMA>;
export type AssignmentManifest = z.infer<typeof MANIFEST_SCHEMA>;
export type AssignmentManifestInput = AssignmentManifest;
export type WorksheetInteractionMode = "answer_entry" | "review";

export type AssignmentAnswerInput = {
  problemId: string;
  fieldId: string;
  value: string;
};

export type WorksheetResumePoint = {
  activeProblemId: string;
  currentPage: number;
  activeFieldId?: string;
  interactionMode?: WorksheetInteractionMode;
};

export type WorksheetPlayerState = WorksheetResumePoint & {
  pdfAssetUrl: string;
  overlayFields: OverlayField[];
};

type NormalizeResult =
  | { ok: true; manifest: AssignmentManifest }
  | { ok: false; reason: string; detail?: string };

function parseIntegerWords(text: string): number | null {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  const numeric = cleaned.match(/\b(\d+)\b/);
  if (numeric) return Number(numeric[1]);

  const ones: Record<string, number> = {
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
  };
  const tens: Record<string, number> = {
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };

  const words = cleaned.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const first = words[i];
    if (tens[first] != null) {
      const next = words[i + 1];
      return tens[first] + (next && ones[next] != null ? ones[next] : 0);
    }
    if (ones[first] != null) return ones[first];
  }
  return null;
}

function parseMoneyAmount(text: string): number | null {
  const raw = String(text ?? "").toLowerCase();
  const dollarNumeric = raw.match(/\$\s*(\d+)(?:\.(\d{1,2}))?/);
  if (dollarNumeric) {
    const dollars = Number(dollarNumeric[1]);
    const cents = Number((dollarNumeric[2] ?? "0").padEnd(2, "0"));
    return dollars * 100 + cents;
  }
  const cleaned = raw.replace(/[^a-z0-9$ ]/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);
  const dollarIndex = words.findIndex((word) => word === "dollar" || word === "dollars");
  if (dollarIndex >= 0) {
    const dollars = parseIntegerWords(words.slice(0, dollarIndex).join(" "));
    if (dollars == null) return null;
    const centIndex = words.findIndex((word, index) => index > dollarIndex && (word === "cent" || word === "cents"));
    const cents =
      centIndex > dollarIndex
        ? parseIntegerWords(words.slice(dollarIndex + 1, centIndex).join(" "))
        : 0;
    return dollars * 100 + Math.max(0, cents ?? 0);
  }
  return null;
}

export function normalizeOverlayField(args: {
  field: OverlayField;
  pageWidth: number;
  pageHeight: number;
}): OverlayField {
  const minSize = 24;
  const pageWidth = Math.max(1, args.pageWidth);
  const pageHeight = Math.max(1, args.pageHeight);
  const width = Math.max(minSize, Math.min(pageWidth, Math.round(args.field.width)));
  const height = Math.max(minSize, Math.min(pageHeight, Math.round(args.field.height)));
  const x = Math.max(0, Math.min(pageWidth - width, Math.round(args.field.x)));
  const y = Math.max(0, Math.min(pageHeight - height, Math.round(args.field.y)));
  return {
    ...args.field,
    x,
    y,
    width,
    height,
  };
}

export function normalizeAssignmentManifest(input: AssignmentManifestInput): NormalizeResult {
  const parsed = MANIFEST_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_manifest",
      detail: parsed.error.issues.map((issue) => issue.message).join("; "),
    };
  }
  const manifest = parsed.data;

  for (const problem of manifest.problems) {
    if (problem.linkedGames.includes("space-invaders")) {
      return {
        ok: false,
        reason: "invalid_instructional_game",
        detail: "space-invaders is reward-only",
      };
    }
  }

  return { ok: true, manifest };
}

function hasMoneyAmount(text: string, cents: number): boolean {
  const decimal = (cents / 100).toFixed(2).replace(".", "\\.");
  return (
    new RegExp(`\\$\\s*${decimal}\\b`, "i").test(text) ||
    new RegExp(`\\b${cents}\\s*cents?\\b`, "i").test(text)
  );
}

export function detectWorksheetInteractionMode(args: {
  rawContent: string;
  problems: CanonicalWorksheetProblem[];
}): WorksheetInteractionMode {
  const raw = String(args.rawContent ?? "").toLowerCase();
  if (!raw.trim()) return "answer_entry";
  for (const problem of args.problems) {
    if (
      problem.kind === "compare_amounts" &&
      hasMoneyAmount(raw, problem.leftAmountCents) &&
      hasMoneyAmount(raw, problem.rightAmountCents)
    ) {
      return "review";
    }
  }
  return "answer_entry";
}

export function buildWorksheetPlayerState(
  manifest: AssignmentManifest,
  interactionMode: WorksheetInteractionMode = "answer_entry",
): WorksheetPlayerState {
  const firstProblem = manifest.problems[0];
  return {
    activeProblemId: firstProblem.problemId,
    currentPage: firstProblem.page,
    activeFieldId: firstProblem.overlayFields[0]?.fieldId,
    interactionMode,
    pdfAssetUrl: manifest.pdfAssetUrl,
    overlayFields: firstProblem.overlayFields,
  };
}

export function gradeAssignmentAnswer(
  manifest: AssignmentManifest,
  answer: AssignmentAnswerInput,
): { correct: boolean; expectedAnswer: string; problemId: string } {
  const problem = manifest.problems.find((entry) => entry.problemId === answer.problemId);
  if (!problem) {
    return {
      correct: false,
      expectedAnswer: "",
      problemId: answer.problemId,
    };
  }
  const field = problem.overlayFields.find((entry) => entry.fieldId === answer.fieldId);
  if (!field) {
    return {
      correct: false,
      expectedAnswer: problem.canonicalAnswer,
      problemId: problem.problemId,
    };
  }

  const rawValue = String(answer.value ?? "").trim();
  let correct = false;
  if (problem.gradingMode === "numeric") {
    const parsedValue = parseMoneyAmount(rawValue) ?? parseIntegerWords(rawValue);
    const parsedExpected =
      parseMoneyAmount(problem.canonicalAnswer) ?? parseIntegerWords(problem.canonicalAnswer);
    correct = parsedValue != null && parsedExpected != null && parsedValue === parsedExpected;
  } else {
    correct = rawValue.toLowerCase() === problem.canonicalAnswer.toLowerCase();
  }

  return {
    correct,
    expectedAnswer: problem.canonicalAnswer,
    problemId: problem.problemId,
  };
}

export function resumeAssignmentProblem(
  manifest: AssignmentManifest,
  resumePoint: WorksheetResumePoint,
): WorksheetPlayerState {
  const problem =
    manifest.problems.find((entry) => entry.problemId === resumePoint.activeProblemId) ??
    manifest.problems[0];
  return {
    activeProblemId: problem.problemId,
    currentPage: problem.page,
    activeFieldId:
      problem.overlayFields.some((field) => field.fieldId === resumePoint.activeFieldId)
        ? resumePoint.activeFieldId
        : problem.overlayFields[0]?.fieldId,
    interactionMode: resumePoint.interactionMode ?? "answer_entry",
    pdfAssetUrl: manifest.pdfAssetUrl,
    overlayFields: problem.overlayFields,
  };
}

export function buildAssignmentManifestFromWorksheetProblems(args: {
  assignmentId: string;
  childName: "Ila" | "Reina";
  title: string;
  createdAt: string;
  pdfAssetUrl: string;
  problems: CanonicalWorksheetProblem[];
  /** Page coordinate space (default 1000×1400 — PDF-ish). Use real pixel size for raster worksheets. */
  pageWidth?: number;
  pageHeight?: number;
}): AssignmentManifest {
  const pageWidth = args.pageWidth ?? 1000;
  const pageHeight = args.pageHeight ?? 1400;
  const problems: AssignmentProblem[] = args.problems.map((problem, index) => ({
    problemId: String(problem.id),
    page: problem.page ?? 1,
    prompt: problem.promptVisible ?? problem.question,
    canonicalAnswer: problem.canonicalAnswer,
    gradingMode: "numeric",
    linkedGames:
      problem.linkedGames && problem.linkedGames.length > 0
        ? [...problem.linkedGames]
        : problem.kind === "money_count"
          ? ["store-game", "coin-counter"]
          : ["coin-counter"],
    overlayFields: [
      normalizeOverlayField({
        field: {
          fieldId: `${problem.id}-answer`,
          kind: "number",
          x:
            pageWidth === 1000 && pageHeight === 1400
              ? 620
              : Math.round(pageWidth * 0.62),
          y:
            pageWidth === 1000 && pageHeight === 1400
              ? 260 + index * 150
              : Math.round(pageHeight * (0.186 + index * 0.107)),
          width:
            pageWidth === 1000 && pageHeight === 1400
              ? 140
              : Math.round(pageWidth * 0.14),
          height:
            pageWidth === 1000 && pageHeight === 1400
              ? 60
              : Math.round(pageHeight * 0.043),
          placeholder: "?",
        },
        pageWidth,
        pageHeight,
      }),
    ],
  }));

  const manifest = {
    assignmentId: args.assignmentId,
    childName: args.childName,
    title: args.title,
    source: "worksheet_pdf" as const,
    createdAt: args.createdAt,
    pdfAssetUrl: args.pdfAssetUrl,
    pages: [{ page: 1, width: pageWidth, height: pageHeight }],
    problems,
  };
  const normalized = normalizeAssignmentManifest(manifest);
  if (!normalized.ok) {
    throw new Error(normalized.detail || normalized.reason);
  }
  return normalized.manifest;
}
