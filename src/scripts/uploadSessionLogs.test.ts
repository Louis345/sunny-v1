import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  collectSessionLogFiles,
  copySessionLogsToRepo,
  resolveExpiredUploadedLocalPaths,
  resolveUploadedLocalPaths,
} from "./uploadSessionLogs";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-upload-logs-test-"));
}

describe("uploadSessionLogs", () => {
  it("copies packet logs and legacy daily server logs into separate repo folders", () => {
    const root = makeTempDir();
    const source = path.join(root, "source");
    const repo = path.join(root, "repo");
    fs.mkdirSync(
      path.join(source, "2026", "05", "2026-05-05T10-00-00_reina_homework_abc123"),
      { recursive: true },
    );
    fs.mkdirSync(path.join(source, "2026-05-05"), { recursive: true });
    fs.writeFileSync(
      path.join(source, "2026", "05", "2026-05-05T10-00-00_reina_homework_abc123", "summary.md"),
      "# summary\n",
    );
    fs.writeFileSync(path.join(source, "2026-05-05", "server.log"), "legacy\n");

    const files = collectSessionLogFiles(source);
    const copied = copySessionLogsToRepo({ sourceRoot: source, repoRoot: repo, files });

    expect(copied).toEqual([
      {
        localPath: path.join(
          source,
          "2026",
          "05",
          "2026-05-05T10-00-00_reina_homework_abc123",
          "summary.md",
        ),
        repoPath: path.join(
          repo,
          "sessions",
          "2026",
          "05",
          "2026-05-05T10-00-00_reina_homework_abc123",
          "summary.md",
        ),
      },
      {
        localPath: path.join(source, "2026-05-05", "server.log"),
        repoPath: path.join(repo, "legacy-server-logs", "2026-05-05", "server.log"),
      },
    ]);
    expect(
      fs.readFileSync(
        path.join(
          repo,
          "sessions",
          "2026",
          "05",
          "2026-05-05T10-00-00_reina_homework_abc123",
          "summary.md",
        ),
        "utf8",
      ),
    ).toBe("# summary\n");
    expect(
      fs.readFileSync(path.join(repo, "legacy-server-logs", "2026-05-05", "server.log"), "utf8"),
    ).toBe("legacy\n");
  });

  it("deletes only uploaded top-level local log folders after a verified push", () => {
    const sourceRoot = path.join(makeTempDir(), "sessions");
    const files = [
      path.join(sourceRoot, "2026", "05", "packet", "summary.md"),
      path.join(sourceRoot, "2026-05-05", "server.log"),
    ];

    expect(resolveUploadedLocalPaths(sourceRoot, files)).toEqual([
      path.join(sourceRoot, "2026"),
      path.join(sourceRoot, "2026-05-05"),
    ]);
  });

  it("keeps recent packet logs and deletes only uploaded logs older than the retention window", () => {
    const sourceRoot = path.join(makeTempDir(), "sessions");
    const files = [
      path.join(sourceRoot, "2026", "05", "2026-05-01T10-00-00_reina_homework_old001", "summary.md"),
      path.join(sourceRoot, "2026", "05", "2026-05-03T10-00-00_reina_homework_new001", "summary.md"),
      path.join(sourceRoot, "2026-05-01", "server.log"),
      path.join(sourceRoot, "2026-05-03", "server.log"),
    ];

    expect(
      resolveExpiredUploadedLocalPaths(sourceRoot, files, {
        now: new Date("2026-05-08T12:00:00.000Z"),
        retentionDays: 7,
      }),
    ).toEqual([
      path.join(sourceRoot, "2026-05-01"),
      path.join(sourceRoot, "2026", "05", "2026-05-01T10-00-00_reina_homework_old001"),
    ]);
  });
});
