import crypto from "crypto";
import type Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile as execFileCallback } from "child_process";
import { promisify } from "util";
import { extractText, getDocumentProxy } from "unpdf";

const execFile = promisify(execFileCallback);

export type AssignmentSourceKind =
  | "embedded_text_pdf"
  | "scanned_assignment_image"
  | "image_assignment"
  | "text_assignment";

export type AssignmentExtractionMethod = "unpdf" | "tesseract" | "native_pdf" | "text";

export type AssignmentPageText = {
  pageNumber: number;
  text: string;
  imagePath?: string;
};

export type AssignmentSourceExtraction = {
  sourceKind: AssignmentSourceKind;
  sourcePath: string;
  filename: string;
  mediaType: string;
  fileHash: string;
  extractionMethod: AssignmentExtractionMethod;
  pages: AssignmentPageText[];
  fullText: string;
  warnings: string[];
};

export type AssignmentSourceExtractionOptions = {
  /** Directory for generated OCR page images. Defaults to a temp folder. */
  pageImageDir?: string;
};

export const ASSIGNMENT_SOURCE_CONTRACT_VERSION = 3;

export type AssignmentSourceCheckpoint = {
  version: number;
  fileHash: string;
  pageCount: number;
  extractionMethod: AssignmentExtractionMethod;
};

export function isCurrentAssignmentSourceCheckpoint(
  saved: AssignmentSourceCheckpoint | undefined,
  current: AssignmentSourceCheckpoint,
): boolean {
  return Boolean(saved
    && saved.version >= 2
    && saved.version <= current.version
    && saved.fileHash === current.fileHash
    && saved.pageCount === current.pageCount
    && saved.extractionMethod === current.extractionMethod);
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const PDF_PREVIEW_IMAGE_MAX_EDGE_PX = 1000;

export function isWeakExtractedText(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 40) return true;
  const alphaCount = (cleaned.match(/[a-z]/gi) ?? []).length;
  return alphaCount < 20;
}

export function classifyAssignmentSource(filePath: string, extractedPdfText = ""): AssignmentSourceKind {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".txt") return "text_assignment";
  if (IMAGE_EXTENSIONS.has(ext)) return "image_assignment";
  if (ext === ".pdf") {
    return isWeakExtractedText(extractedPdfText) ? "scanned_assignment_image" : "embedded_text_pdf";
  }
  throw new Error(`unsupported_assignment_source:${filePath}`);
}

function mediaTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".txt") return "text/plain";
  return "application/octet-stream";
}

export function assignmentSourceFileHash(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

/** One disk contract for intake and the background worker; accept validated legacy raw records. */
export function readAssignmentSourceExtraction(file: string): AssignmentSourceExtraction {
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  const extraction = saved.extraction ?? saved;
  if ((saved.extraction && (saved.version !== ASSIGNMENT_SOURCE_CONTRACT_VERSION || saved.fileHash !== extraction.fileHash))
    || typeof extraction.fileHash !== "string" || typeof extraction.fullText !== "string"
    || !Array.isArray(extraction.pages) || !Array.isArray(extraction.warnings)
    || typeof extraction.sourcePath !== "string" || typeof extraction.extractionMethod !== "string") {
    throw new Error(`assignment_extraction_invalid:${file}`);
  }
  return extraction;
}

export function writeAssignmentSourceExtraction(file: string, extraction: AssignmentSourceExtraction): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify({version: ASSIGNMENT_SOURCE_CONTRACT_VERSION, fileHash: extraction.fileHash, extraction}, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

/** The same source evidence reaches both Discovery and targeted academic planning. */
export function assignmentPlannerContent(extraction: AssignmentSourceExtraction, prompt: string): Anthropic.MessageParam["content"] {
  if (fs.existsSync(extraction.sourcePath) && ["application/pdf","image/png","image/jpeg","image/webp"].includes(extraction.mediaType)) {
    const bytes=fs.readFileSync(extraction.sourcePath);
    if (crypto.createHash("sha256").update(bytes).digest("hex")!==extraction.fileHash) throw new Error("assignment_source_hash_mismatch");
    if (extraction.mediaType === "application/pdf") return [
      {type:"document",source:{type:"base64",media_type:"application/pdf",data:bytes.toString("base64")},title:extraction.filename || "Math assignment",context:"This is the complete original assignment. Inspect every page before prescribing the learning program."},
      {type:"text",text:prompt},
    ];
    if (["image/png","image/jpeg","image/webp"].includes(extraction.mediaType)) return [
      {type:"image",source:{type:"base64",media_type:extraction.mediaType as "image/png"|"image/jpeg"|"image/webp",data:bytes.toString("base64")}},
      {type:"text",text:prompt},
    ];
  }
  if (!extraction.fullText.trim()) throw new Error("assignment_evidence_empty:provide_readable_assignment");
  return prompt;
}

export async function loadOrExtractAssignmentSource(
  filePath: string,
  cacheFile: string,
  extract: (source: string) => Promise<AssignmentSourceExtraction> = extractAssignmentSource,
): Promise<{ extraction: AssignmentSourceExtraction; reused: boolean }> {
  const fileHash = assignmentSourceFileHash(filePath);
  try {
    const cached = readAssignmentSourceExtraction(cacheFile);
    if (cached.fileHash === fileHash) {
      const extraction={...cached,sourcePath:path.resolve(filePath),filename:path.basename(filePath)};
      if (extraction.sourcePath!==cached.sourcePath) writeAssignmentSourceExtraction(cacheFile,extraction);
      return { extraction, reused: true };
    }
  } catch {
    // Missing or invalid operational extraction is safe to recompute locally (no provider).
  }
  const extraction = { ...await extract(filePath), fileHash };
  writeAssignmentSourceExtraction(cacheFile, extraction);
  return { extraction, reused: false };
}

async function extractEmbeddedPdfText(filePath: string): Promise<{ text: string; pageCount: number }> {
  const buffer = fs.readFileSync(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return {
    text: text ?? "",
    pageCount: pdf.numPages,
  };
}

export function assertCompletePdfPageCoverage(
  expectedPageCount: number,
  renderedPagePaths: string[],
): void {
  if (renderedPagePaths.length !== expectedPageCount) {
    throw new Error(
      `assignment_pdf_page_coverage_incomplete:expected=${expectedPageCount}:rendered=${renderedPagePaths.length}`,
    );
  }
}

export function nativePdfPagePlaceholders(pageCount: number): AssignmentPageText[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    pageNumber: index + 1,
    text: "",
  }));
}

export function pdfExtractionMethodForWarnings(warnings: string[]): AssignmentExtractionMethod {
  return warnings.some((warning) => warning.includes("native_document_used"))
    ? "native_pdf"
    : "tesseract";
}

function ocrFailureWarning(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code)
    : "unknown";
  if (code === "ENOENT") return "tesseract_unavailable_image_text_empty";
  return `tesseract_failed_${code.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
}

async function ocrImage(imagePath: string): Promise<{ text: string; warnings: string[] }> {
  try {
    const { stdout } = await execFile("tesseract", [
      imagePath,
      "stdout",
      "--psm",
      "6",
    ], { maxBuffer: 1024 * 1024 * 10 });
    return { text: stdout.trim(), warnings: [] };
  } catch (error) {
    return { text: "", warnings: [ocrFailureWarning(error)] };
  }
}

async function renderPdfPreviewImages(
  filePath: string,
  outputDir: string,
): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPrefix = path.join(outputDir, "page");
  await execFile("pdftoppm", [
    "-png",
    "-scale-to",
    String(PDF_PREVIEW_IMAGE_MAX_EDGE_PX),
    filePath,
    outputPrefix,
  ], { maxBuffer: 1024 * 1024 * 5 });
  return fs.readdirSync(outputDir)
    .filter((file) => /^page-\d+\.png$/i.test(file))
    .map((file) => path.join(outputDir, file))
    .sort((left, right) => {
      const leftPage = Number(path.basename(left).match(/page-(\d+)\.png/i)?.[1] ?? 0);
      const rightPage = Number(path.basename(right).match(/page-(\d+)\.png/i)?.[1] ?? 0);
      return leftPage - rightPage;
    });
}

async function ocrPdfWithLocalPreview(
  filePath: string,
  expectedPageCount: number,
  opts: AssignmentSourceExtractionOptions,
): Promise<{ pages: AssignmentPageText[]; warnings: string[] }> {
  const warnings = ["pdf_embedded_text_empty_used_ocr"];
  const outputDir = opts.pageImageDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "sunny-assignment-pages-"));
  let imagePaths: string[];
  try {
    imagePaths = await renderPdfPreviewImages(filePath, outputDir);
  } catch {
    return {
      pages: nativePdfPagePlaceholders(expectedPageCount),
      warnings: [
        ...warnings,
        "pdf_local_renderer_unavailable_native_document_used",
      ],
    };
  }
  // A one-page Quick Look thumbnail previously passed as a complete seven-page
  // assignment. The original PDF is now sent to the Planner, so incomplete
  // optional previews fall back to native document evidence instead.
  try {
    assertCompletePdfPageCoverage(expectedPageCount, imagePaths);
  } catch {
    return {
      pages: nativePdfPagePlaceholders(expectedPageCount),
      warnings: [
        ...warnings,
        `pdf_local_renderer_incomplete_native_document_used:expected=${expectedPageCount}:rendered=${imagePaths.length}`,
      ],
    };
  }
  const pages: AssignmentPageText[] = [];
  for (const [index, imagePath] of imagePaths.entries()) {
    const ocr = await ocrImage(imagePath);
    warnings.push(...ocr.warnings);
    pages.push({
      pageNumber: index + 1,
      imagePath,
      text: ocr.text,
    });
  }
  return { pages, warnings: [...new Set(warnings)] };
}

export async function extractAssignmentSource(
  filePath: string,
  opts: AssignmentSourceExtractionOptions = {},
): Promise<AssignmentSourceExtraction> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`assignment_source_missing:${filePath}`);
  }
  const ext = path.extname(filePath).toLowerCase();
  const fileHash = assignmentSourceFileHash(filePath);
  const filename = path.basename(filePath);
  const sourcePath = path.resolve(filePath);
  const mediaType = mediaTypeFor(filePath);

  if (ext === ".txt") {
    const text = fs.readFileSync(filePath, "utf8");
    return {
      sourceKind: "text_assignment",
      sourcePath,
      filename,
      mediaType,
      fileHash,
      extractionMethod: "text",
      pages: [{ pageNumber: 1, text }],
      fullText: text,
      warnings: [],
    };
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    const ocr = await ocrImage(filePath);
    return {
      sourceKind: "image_assignment",
      sourcePath,
      filename,
      mediaType,
      fileHash,
      extractionMethod: "tesseract",
      pages: [{ pageNumber: 1, imagePath: sourcePath, text: ocr.text }],
      fullText: ocr.text,
      warnings: ocr.warnings,
    };
  }

  if (ext === ".pdf") {
    const embeddedPdf = await extractEmbeddedPdfText(filePath);
    if (!isWeakExtractedText(embeddedPdf.text)) {
      return {
        sourceKind: "embedded_text_pdf",
        sourcePath,
        filename,
        mediaType,
        fileHash,
        extractionMethod: "unpdf",
        pages: [{ pageNumber: 1, text: embeddedPdf.text }],
        fullText: embeddedPdf.text,
        warnings: [],
      };
    }

    const { pages, warnings } = await ocrPdfWithLocalPreview(filePath, embeddedPdf.pageCount, opts);
    return {
      sourceKind: "scanned_assignment_image",
      sourcePath,
      filename,
      mediaType,
      fileHash,
      extractionMethod: pdfExtractionMethodForWarnings(warnings),
      pages,
      fullText: pages.map((page) => page.text).join("\n\n").trim(),
      warnings,
    };
  }

  throw new Error(`unsupported_assignment_source:${filePath}`);
}
