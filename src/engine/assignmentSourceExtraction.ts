import crypto from "crypto";
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

export type AssignmentExtractionMethod = "unpdf" | "tesseract" | "text";

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

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

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

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function extractEmbeddedPdfText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text ?? "";
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
  await execFile("qlmanage", [
    "-t",
    "-s",
    "2000",
    "-o",
    outputDir,
    filePath,
  ], { maxBuffer: 1024 * 1024 * 5 });
  return fs.readdirSync(outputDir)
    .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
    .map((file) => path.join(outputDir, file))
    .sort();
}

async function ocrPdfWithLocalPreview(
  filePath: string,
  opts: AssignmentSourceExtractionOptions,
): Promise<{ pages: AssignmentPageText[]; warnings: string[] }> {
  const warnings = ["pdf_embedded_text_empty_used_ocr"];
  const outputDir = opts.pageImageDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "sunny-assignment-pages-"));
  const imagePaths = await renderPdfPreviewImages(filePath, outputDir);
  if (imagePaths.length === 0) {
    throw new Error(`assignment_pdf_ocr_render_failed:${filePath}`);
  }
  if (imagePaths.length === 1) {
    warnings.push("pdf_ocr_quicklook_preview_one_image");
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
  const fileHash = sha256File(filePath);
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
    const embeddedText = await extractEmbeddedPdfText(filePath);
    if (!isWeakExtractedText(embeddedText)) {
      return {
        sourceKind: "embedded_text_pdf",
        sourcePath,
        filename,
        mediaType,
        fileHash,
        extractionMethod: "unpdf",
        pages: [{ pageNumber: 1, text: embeddedText }],
        fullText: embeddedText,
        warnings: [],
      };
    }

    const { pages, warnings } = await ocrPdfWithLocalPreview(filePath, opts);
    return {
      sourceKind: "scanned_assignment_image",
      sourcePath,
      filename,
      mediaType,
      fileHash,
      extractionMethod: "tesseract",
      pages,
      fullText: pages.map((page) => page.text).join("\n\n").trim(),
      warnings,
    };
  }

  throw new Error(`unsupported_assignment_source:${filePath}`);
}
