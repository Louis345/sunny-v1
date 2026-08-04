import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASSIGNMENT_SOURCE_CONTRACT_VERSION,
  assertCompletePdfPageCoverage,
  isCurrentAssignmentSourceCheckpoint,
  nativePdfPagePlaceholders,
  classifyAssignmentSource,
  extractAssignmentSource,
  isWeakExtractedText,
  loadOrExtractAssignmentSource,
  PDF_PREVIEW_IMAGE_MAX_EDGE_PX,
  pdfExtractionMethodForWarnings,
} from "./assignmentSourceExtraction";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-assignment-source-"));
  tempDirs.push(dir);
  return dir;
}

describe("assignment source extraction", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reuses a hash-matched cached extraction without invoking extraction again", async () => {
    const dir = tempDir();
    const source = path.join(dir, "assignment.txt");
    const cache = path.join(dir, "assignment-extraction.json");
    fs.writeFileSync(source, "equal groups");
    const extract = vi.fn(async () => extractAssignmentSource(source));

    const first = await loadOrExtractAssignmentSource(source, cache, extract);
    const second = await loadOrExtractAssignmentSource(source, cache, extract);

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("classifies intake files before interpretation", () => {
    expect(classifyAssignmentSource(
      "homework.pdf",
      "Benchmark Advance Spelling Silent Letters sign know write High-Frequency Words among building",
    )).toBe("embedded_text_pdf");
    expect(classifyAssignmentSource("homework.pdf", "")).toBe("scanned_assignment_image");
    expect(classifyAssignmentSource("scan.png", "")).toBe("image_assignment");
    expect(classifyAssignmentSource("paste.txt", "words")).toBe("text_assignment");
  });

  it("treats empty or tiny PDF text as weak and eligible for OCR fallback", () => {
    expect(isWeakExtractedText("")).toBe(true);
    expect(isWeakExtractedText("Benchmark Advance Spelling\nSilent Letters\nsign know write")).toBe(false);
  });

  it("keeps PDF preview images small enough for live vision capture", () => {
    expect(PDF_PREVIEW_IMAGE_MAX_EDGE_PX).toBeLessThanOrEqual(1200);
  });

  it("rejects an incomplete rendered page set before a scanned PDF reaches the Planner", () => {
    expect(() => assertCompletePdfPageCoverage(7, ["page-1.png"]))
      .toThrow("assignment_pdf_page_coverage_incomplete:expected=7:rendered=1");

    expect(() => assertCompletePdfPageCoverage(3, [
      "page-1.png",
      "page-2.png",
      "page-3.png",
    ])).not.toThrow();
  });

  it("invalidates drafts created before complete source evidence was recorded", () => {
    const current = {
      version: ASSIGNMENT_SOURCE_CONTRACT_VERSION,
      fileHash: "coin-pdf-hash",
      pageCount: 7,
      extractionMethod: "tesseract" as const,
    };

    expect(isCurrentAssignmentSourceCheckpoint(undefined, current)).toBe(false);
    expect(isCurrentAssignmentSourceCheckpoint({ ...current, pageCount: 1 }, current)).toBe(false);
    expect(isCurrentAssignmentSourceCheckpoint({ ...current, version: 2 }, current)).toBe(true);
    expect(isCurrentAssignmentSourceCheckpoint(current, current)).toBe(true);
  });

  it("keeps a scanned PDF usable when the optional local page renderer is unavailable", () => {
    expect(nativePdfPagePlaceholders(3)).toEqual([
      { pageNumber: 1, text: "" },
      { pageNumber: 2, text: "" },
      { pageNumber: 3, text: "" },
    ]);
  });

  it("reports native PDF evidence instead of claiming OCR when local rendering is unavailable", () => {
    expect(pdfExtractionMethodForWarnings([
      "pdf_embedded_text_empty_used_ocr",
      "pdf_local_renderer_unavailable_native_document_used",
    ])).toBe("native_pdf");
    expect(pdfExtractionMethodForWarnings(["pdf_embedded_text_empty_used_ocr"]))
      .toBe("tesseract");
  });

  it("extracts text files with method metadata, source hash, pages, and warnings", async () => {
    const dir = tempDir();
    const file = path.join(dir, "assignment.txt");
    fs.writeFileSync(file, "Silent Letters\nsign\nknow\n\nHigh-Frequency Words\namong\nbuilding\n", "utf8");

    const extraction = await extractAssignmentSource(file);

    expect(extraction.sourceKind).toBe("text_assignment");
    expect(extraction.extractionMethod).toBe("text");
    expect(extraction.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(extraction.pages).toEqual([
      expect.objectContaining({
        pageNumber: 1,
        text: expect.stringContaining("High-Frequency Words"),
      }),
    ]);
    expect(extraction.fullText).toContain("Silent Letters");
    expect(extraction.warnings).toEqual([]);
  });

  it("keeps image-first assignments usable when local tesseract is unavailable", async () => {
    const dir = tempDir();
    const file = path.join(dir, "assignment.png");
    fs.writeFileSync(file, Buffer.from("fake image bytes"));
    const priorPath = process.env.PATH;
    process.env.PATH = "";
    try {
      const extraction = await extractAssignmentSource(file);

      expect(extraction.sourceKind).toBe("image_assignment");
      expect(extraction.extractionMethod).toBe("tesseract");
      expect(extraction.pages).toEqual([{
        pageNumber: 1,
        imagePath: file,
        text: "",
      }]);
      expect(extraction.fullText).toBe("");
      expect(extraction.warnings).toContain("tesseract_unavailable_image_text_empty");
    } finally {
      process.env.PATH = priorPath;
    }
  });
});
