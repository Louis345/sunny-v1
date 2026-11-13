import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readIngestionRunResult,
  resultBindingFromArgs,
  resultFileFromArgs,
  writeIngestionRunResult,
} from "../utils/ingestionRunResult";

describe("ingestion run result", () => {
  it("writes a private machine-readable completion result atomically", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-ingestion-result-"));
    const file = path.join(root, "result.json");
    writeIngestionRunResult(file, {
      version: 1,
      status: "discovery_ready",
      childId: "ila",
      domain: "math",
      homeworkId: "hw-math-proof",
      completedAt: "2026-09-14T12:00:00.000Z",
    });

    expect(readIngestionRunResult(file)).toMatchObject({
      status: "discovery_ready",
      childId: "ila",
      homeworkId: "hw-math-proof",
    });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(root)).toEqual(["result.json"]);
  });

  it("reads the optional result-file CLI boundary", () => {
    expect(resultFileFromArgs(["--child=ila", "--result-file=/tmp/result.json"]))
      .toBe("/tmp/result.json");
    expect(resultFileFromArgs(["--child=ila"])).toBeNull();
    expect(resultBindingFromArgs([
      "--intake-id=assignment-math-123",
      "--source-file-hash=abc123",
    ])).toEqual({ intakeId: "assignment-math-123", sourceFileHash: "abc123" });
    expect(resultBindingFromArgs(["--child=ila"])).toEqual({});
    expect(() => resultBindingFromArgs(["--intake-id=assignment-math-123"]))
      .toThrow("ingestion_run_binding_incomplete");
  });

  it("rejects a success result without a canonical homework identity", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-ingestion-result-"));
    const file = path.join(root, "result.json");
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      status: "discovery_ready",
      childId: "ila",
      domain: "math",
      completedAt: "2026-09-14T12:00:00.000Z",
    }));

    expect(() => readIngestionRunResult(file)).toThrow("ingestion_run_result_invalid");
  });
});
