import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { countPdfFilesInFolder } from "../utils/loadHomeworkFolder";

describe("countPdfFilesInFolder", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-hw-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns 0 for empty folder", () => {
    expect(countPdfFilesInFolder(dir)).toBe(0);
  });

  it("counts only .pdf files", () => {
    fs.writeFileSync(path.join(dir, "a.pdf"), "%PDF-1.4\n");
    fs.writeFileSync(path.join(dir, "b.png"), "x");
    fs.writeFileSync(path.join(dir, "c.PDF"), "x");
    expect(countPdfFilesInFolder(dir)).toBe(2);
  });

  it("ignores subdirectories", () => {
    fs.mkdirSync(path.join(dir, "nested"));
    fs.writeFileSync(path.join(dir, "nested", "x.pdf"), "x");
    fs.writeFileSync(path.join(dir, "root.pdf"), "x");
    expect(countPdfFilesInFolder(dir)).toBe(1);
  });
});
