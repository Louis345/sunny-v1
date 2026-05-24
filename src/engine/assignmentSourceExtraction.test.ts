import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyAssignmentSource,
  extractAssignmentSource,
  isWeakExtractedText,
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
