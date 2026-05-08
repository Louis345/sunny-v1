import fs from "fs";
import path from "path";
import { execFileSync, spawnSync } from "child_process";

export type CopiedLogFile = {
  localPath: string;
  repoPath: string;
};

type CopyInput = {
  sourceRoot: string;
  repoRoot: string;
  files: string[];
};

const DEFAULT_REPO_URL = "https://github.com/Louis345/sunny-logs.git";

function repoDefaultDir(): string {
  return path.resolve(process.cwd(), "..", "sunny-logs");
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full).forEach((f) => out.push(f));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out.sort();
}

function repoRelativePath(sourceRoot: string, file: string): string {
  const rel = path.relative(sourceRoot, file);
  const parts = rel.split(path.sep);
  if (/^\d{4}$/.test(parts[0] ?? "") && /^\d{2}$/.test(parts[1] ?? "")) {
    return path.join("sessions", rel);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(parts[0] ?? "")) {
    return path.join("legacy-server-logs", rel);
  }
  return path.join("misc", rel);
}

export function collectSessionLogFiles(sourceRoot: string): string[] {
  const root = path.resolve(sourceRoot);
  return walkFiles(root)
    .filter((file) => !file.includes(`${path.sep}.`))
    .sort((a, b) => {
      const ar = repoRelativePath(root, a);
      const br = repoRelativePath(root, b);
      const rank = (rel: string) => (rel.startsWith(`sessions${path.sep}`) ? 0 : 1);
      return rank(ar) - rank(br) || ar.localeCompare(br);
    });
}

export function copySessionLogsToRepo(input: CopyInput): CopiedLogFile[] {
  const sourceRoot = path.resolve(input.sourceRoot);
  const repoRoot = path.resolve(input.repoRoot);
  return input.files.map((file) => {
    const localPath = path.resolve(file);
    if (!isInside(sourceRoot, localPath)) {
      throw new Error(`Refusing to copy log outside source root: ${file}`);
    }
    const repoPath = path.join(repoRoot, repoRelativePath(sourceRoot, localPath));
    fs.mkdirSync(path.dirname(repoPath), { recursive: true });
    if (path.basename(localPath) === "upload-status.json") {
      fs.writeFileSync(
        repoPath,
        `${JSON.stringify(
          {
            uploaded: true,
            message: "Uploaded to sunny-logs repository.",
            updatedAt: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    } else {
      fs.copyFileSync(localPath, repoPath);
    }
    return { localPath, repoPath };
  });
}

export function resolveUploadedLocalPaths(sourceRoot: string, files: string[]): string[] {
  const root = path.resolve(sourceRoot);
  const paths = new Set<string>();
  for (const file of files) {
    const localPath = path.resolve(file);
    if (!isInside(root, localPath)) continue;
    const [top] = path.relative(root, localPath).split(path.sep);
    if (top) paths.add(path.join(root, top));
  }
  return [...paths].sort();
}

function ageMsFromLogPath(sourceRoot: string, file: string, now: Date): { target: string; ageMs: number } | null {
  const root = path.resolve(sourceRoot);
  const localPath = path.resolve(file);
  if (!isInside(root, localPath)) return null;
  const parts = path.relative(root, localPath).split(path.sep);
  if (/^\d{4}$/.test(parts[0] ?? "") && /^\d{2}$/.test(parts[1] ?? "") && parts[2]) {
    const stamp = parts[2].slice(0, 10);
    const time = Date.parse(`${stamp}T00:00:00.000Z`);
    if (!Number.isFinite(time)) return null;
    return {
      target: path.join(root, parts[0], parts[1], parts[2]),
      ageMs: now.getTime() - time,
    };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(parts[0] ?? "")) {
    const time = Date.parse(`${parts[0]}T00:00:00.000Z`);
    if (!Number.isFinite(time)) return null;
    return {
      target: path.join(root, parts[0]),
      ageMs: now.getTime() - time,
    };
  }
  return null;
}

export function resolveExpiredUploadedLocalPaths(
  sourceRoot: string,
  files: string[],
  options: { now?: Date; retentionDays: number },
): string[] {
  const retentionMs = Math.max(0, options.retentionDays) * 24 * 60 * 60 * 1000;
  const now = options.now ?? new Date();
  const paths = new Set<string>();
  for (const file of files) {
    const aged = ageMsFromLogPath(sourceRoot, file, now);
    if (aged && aged.ageMs >= retentionMs) {
      paths.add(aged.target);
    }
  }
  return [...paths].sort();
}

function runGit(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function ensureLogRepo(repoRoot: string, repoUrl: string): void {
  if (fs.existsSync(path.join(repoRoot, ".git"))) return;
  if (!fs.existsSync(repoRoot)) {
    fs.mkdirSync(path.dirname(repoRoot), { recursive: true });
    const cloned = spawnSync("git", ["clone", repoUrl, repoRoot], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (cloned.status === 0) return;
    fs.mkdirSync(repoRoot, { recursive: true });
  }
  runGit(repoRoot, ["init"]);
  try {
    runGit(repoRoot, ["remote", "add", "origin", repoUrl]);
  } catch {
    runGit(repoRoot, ["remote", "set-url", "origin", repoUrl]);
  }
}

function commitAndPush(repoRoot: string): boolean {
  runGit(repoRoot, ["add", "."]);
  const status = runGit(repoRoot, ["status", "--short"]);
  if (!status) return false;
  runGit(repoRoot, ["commit", "-m", `Upload Sunny logs ${new Date().toISOString()}`]);
  try {
    runGit(repoRoot, ["branch", "-M", "main"]);
    runGit(repoRoot, ["push", "-u", "origin", "main"]);
  } catch {
    runGit(repoRoot, ["push", "origin", "HEAD"]);
  }
  return true;
}

export function uploadSessionLogs(options: {
  sourceRoot?: string;
  repoRoot?: string;
  repoUrl?: string;
  deleteLocal?: boolean;
  deleteLocalAfterDays?: number;
  now?: Date;
  files?: string[];
}): { copied: number; pushed: boolean; deleted: string[]; repoRoot: string } {
  const sourceRoot = path.resolve(options.sourceRoot ?? path.join(process.cwd(), "logs", "sessions"));
  const repoRoot = path.resolve(options.repoRoot ?? process.env.SUNNY_LOG_REPO_DIR ?? repoDefaultDir());
  const repoUrl = options.repoUrl ?? process.env.SUNNY_LOG_REPO_URL ?? DEFAULT_REPO_URL;
  const files = options.files ?? collectSessionLogFiles(sourceRoot);
  if (files.length === 0) return { copied: 0, pushed: false, deleted: [], repoRoot };
  ensureLogRepo(repoRoot, repoUrl);
  copySessionLogsToRepo({ sourceRoot, repoRoot, files });
  const pushed = commitAndPush(repoRoot);
  const deleted: string[] = [];
  if (pushed && options.deleteLocal) {
    for (const target of resolveUploadedLocalPaths(sourceRoot, files)) {
      fs.rmSync(target, { recursive: true, force: true });
      deleted.push(target);
    }
  } else if (
    pushed &&
    typeof options.deleteLocalAfterDays === "number" &&
    Number.isFinite(options.deleteLocalAfterDays)
  ) {
    for (const target of resolveExpiredUploadedLocalPaths(sourceRoot, files, {
      now: options.now,
      retentionDays: options.deleteLocalAfterDays,
    })) {
      fs.rmSync(target, { recursive: true, force: true });
      deleted.push(target);
    }
  }
  return { copied: files.length, pushed, deleted, repoRoot };
}

function parseArgs(argv: string[]): { deleteLocal: boolean; deleteLocalAfterDays?: number } {
  const retentionArg = argv.find((arg) => arg.startsWith("--delete-local-after-days="));
  const rawDays = retentionArg?.split("=")[1];
  const deleteLocalAfterDays = rawDays === undefined ? undefined : Number(rawDays);
  return {
    deleteLocal: argv.includes("--delete-local"),
    ...(Number.isFinite(deleteLocalAfterDays) ? { deleteLocalAfterDays } : {}),
  };
}

if (process.argv[1] && path.basename(process.argv[1]) === "uploadSessionLogs.ts") {
  const args = parseArgs(process.argv.slice(2));
  const result = uploadSessionLogs({
    deleteLocal: args.deleteLocal,
    deleteLocalAfterDays: args.deleteLocalAfterDays,
  });
  console.log(
    `🎮 [logs] copied=${result.copied} pushed=${result.pushed} deleted=${result.deleted.length} repo=${result.repoRoot}`,
  );
}
