import { z } from "zod";
import type { HomeworkProblemItem } from "../agents/psychologist/psychologist";
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
  /** Legacy manifest field — vision grades; kept empty for schema compatibility. */
  canonicalAnswer: z.string().default(""),
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
  extractionProblems: HomeworkProblemItem[];
}): WorksheetInteractionMode {
  const raw = String(args.rawContent ?? "").toLowerCase();
  if (!raw.trim()) return "answer_entry";
  for (const problem of args.extractionProblems) {
    const s = problem.structured;
    if (
      s?.problemType === "compare_amounts" &&
      s.visibleFacts?.kind === "compare_amounts"
    ) {
      const left = s.visibleFacts.leftAmountCents;
      const right = s.visibleFacts.rightAmountCents;
      if (hasMoneyAmount(raw, left) && hasMoneyAmount(raw, right)) {
        return "review";
      }
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
    prompt: problem.question,
    canonicalAnswer: "",
    gradingMode: "numeric" as const,
    linkedGames:
      problem.linkedGames.length > 0
        ? [...problem.linkedGames]
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
