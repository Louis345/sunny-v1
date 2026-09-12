import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendToContext } from "../utils/appendToContext";

const roots: string[] = [];
const originalContextRoot = process.env.SUNNY_CONTEXT_ROOT;
const originalAllow = process.env.SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT;

afterEach(() => {
  if (originalContextRoot === undefined) delete process.env.SUNNY_CONTEXT_ROOT;
  else process.env.SUNNY_CONTEXT_ROOT = originalContextRoot;
  if (originalAllow === undefined) delete process.env.SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT;
  else process.env.SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT = originalAllow;
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

describe("appendToContext isolation", () => {
  it("appends legacy narrative memory inside the selected context root", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-context-append-"));
    roots.push(root);
    const childDir = path.join(root, "reina");
    fs.mkdirSync(childDir, { recursive: true });
    const isolatedFile = path.join(childDir, "reina_context.md");
    fs.writeFileSync(isolatedFile, "# Isolated Reina\n", "utf8");
    process.env.SUNNY_CONTEXT_ROOT = root;
    process.env.SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT = "true";

    await appendToContext("Reina", "Session", "Isolated evidence only.");

    expect(fs.readFileSync(isolatedFile, "utf8")).toContain("Isolated evidence only.");
  });
});
