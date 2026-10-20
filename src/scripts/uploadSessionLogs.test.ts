import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  collectSessionLogFiles,
  copySessionLogsToRepo,
  resolveSessionLogSourceRoot,
  resolveExpiredUploadedLocalPaths,
  resolveUploadedLocalPaths,
  uploadedStatusIsVerified,
  uploadSessionLogs,
} from "./uploadSessionLogs";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-upload-logs-test-"));
}

describe("uploadSessionLogs", () => {
  it("keeps a commit-hook parent repository untouched when uploading to a separate local repository", () => {
    const root = makeTempDir();
    const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
    const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env: cleanEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const parent = path.join(root, "parent"), logs = path.join(root, "logs"), remote = path.join(root, "remote.git"), source = path.join(root, "source");
    try {
      fs.mkdirSync(parent); fs.mkdirSync(logs); fs.mkdirSync(source);
      git(root, "init", "--bare", remote);
      for (const repo of [parent, logs]) {
        git(repo, "init", "--initial-branch=fixture");
        git(repo, "config", "user.name", "Sunny isolated test");
        git(repo, "config", "user.email", "sunny-test@example.invalid");
        git(repo, "remote", "add", "origin", remote);
        fs.writeFileSync(path.join(repo, "seed.txt"), "fixture\n");
        git(repo, "add", "."); git(repo, "commit", "-m", "fixture");
      }
      const before = git(parent, "rev-parse", "HEAD");
      const index = fs.readFileSync(path.join(parent, ".git/index"));
      fs.writeFileSync(path.join(source, "server.log"), "synthetic log\n");
      // Reproduce Git's hook environment, but point only at disposable local repos.
      vi.stubEnv("GIT_DIR", path.join(parent, ".git"));
      vi.stubEnv("GIT_INDEX_FILE", path.join(parent, ".git/index"));
      vi.stubEnv("GIT_WORK_TREE", undefined);
      vi.stubEnv("GIT_COMMON_DIR", path.join(parent, ".git"));
      const result = uploadSessionLogs({ sourceRoot: source, repoRoot: logs, repoUrl: remote });
      expect(result.pushed).toBe(true);
      expect(git(parent, "rev-parse", "HEAD")).toBe(before);
      expect(git(parent, "branch", "--show-current")).toBe("fixture");
      expect(fs.readFileSync(path.join(parent, ".git/index"))).toEqual(index);
      expect(git(parent, "status", "--porcelain")).toBe("");
      expect(git(logs, "show", "HEAD:misc/server.log")).toBe("synthetic log");
    } finally { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("uses the isolated session-log root supplied by the running Sunny workflow", () => {
    expect(
      resolveSessionLogSourceRoot("/tmp/sunny", {
        SUNNY_SESSION_LOG_ROOT: "./isolated/run-42/logs/sessions",
      }),
    ).toBe(path.resolve("/tmp/sunny", "isolated/run-42/logs/sessions"));

    expect(resolveSessionLogSourceRoot("/tmp/sunny", {})).toBe(
      path.resolve("/tmp/sunny", "logs/sessions"),
    );
  });

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

  it("requires copied upload-status proof before local logs are eligible for deletion", () => {
    const root = makeTempDir();
    const source = path.join(root, "source");
    const repo = path.join(root, "repo");
    const session = path.join(source, "2026", "05", "2026-05-01T10-00-00_reina_homework_old001");
    fs.mkdirSync(session, { recursive: true });
    fs.writeFileSync(path.join(session, "summary.md"), "# summary\n");
    fs.writeFileSync(
      path.join(session, "upload-status.json"),
      JSON.stringify({ uploaded: false, updatedAt: "2026-05-01T10:00:00.000Z" }),
    );
    copySessionLogsToRepo({
      sourceRoot: source,
      repoRoot: repo,
      files: collectSessionLogFiles(source),
    });

    expect(uploadedStatusIsVerified(source, repo, session)).toBe(true);
    fs.writeFileSync(
      path.join(repo, "sessions", "2026", "05", "2026-05-01T10-00-00_reina_homework_old001", "upload-status.json"),
      JSON.stringify({ uploaded: false }),
    );
    expect(uploadedStatusIsVerified(source, repo, session)).toBe(false);
  });

  it("uploads companion video call trace folders and honors 7-day retention after upload proof", () => {
    const root = makeTempDir();
    const source = path.join(root, "source");
    const repo = path.join(root, "repo");
    const traceFolder = path.join(
      source,
      "2026",
      "05",
      "2026-05-01T22-10-00_showroom_video_call_trace123",
    );
    fs.mkdirSync(traceFolder, { recursive: true });
    fs.writeFileSync(path.join(traceFolder, "companion-call-trace.ndjson"), "{}\n");
    fs.writeFileSync(path.join(traceFolder, "trace-summary.json"), "{}\n");
    fs.writeFileSync(
      path.join(traceFolder, "upload-status.json"),
      JSON.stringify({ uploaded: false }),
    );

    const files = collectSessionLogFiles(source);
    copySessionLogsToRepo({ sourceRoot: source, repoRoot: repo, files });

    expect(files).toEqual([
      path.join(traceFolder, "companion-call-trace.ndjson"),
      path.join(traceFolder, "trace-summary.json"),
      path.join(traceFolder, "upload-status.json"),
    ]);
    expect(
      fs.existsSync(
        path.join(
          repo,
          "sessions",
          "2026",
          "05",
          "2026-05-01T22-10-00_showroom_video_call_trace123",
          "companion-call-trace.ndjson",
        ),
      ),
    ).toBe(true);
    expect(
      resolveExpiredUploadedLocalPaths(source, files, {
        now: new Date("2026-05-09T00:00:00.000Z"),
        retentionDays: 7,
      }),
    ).toEqual([traceFolder]);
    expect(uploadedStatusIsVerified(source, repo, traceFolder)).toBe(true);
  });
});
