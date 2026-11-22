import fs from "node:fs";
import path from "node:path";

/**
 * S39: every folder Sunny grows has a lifetime. The kiosk enforces this table once at startup and logs one size line.
 * Records (learning profiles, attempts, word banks, post-session truth, the databases) are not in the table: they are
 * kept forever. Deploy backups keep the newest 5 in scripts/deploy-saori.sh. No alerts (owner, 2026-11-18).
 */
export type StorageRule = {
  name: string;
  root: "repo" | "home";
  /** Folder (relative to its root) the rule walks. A `*` segment matches any one folder name. */
  folder: string;
  keepDays: number;
  /** Which entries the rule may remove; everything else in the folder is left alone. */
  removable: (relativePath: string, isTopLevelOfFolder: boolean) => boolean;
  why: string;
};

export const STORAGE_POLICY: StorageRule[] = [
  {
    name: "server-logs",
    root: "repo",
    folder: "logs/server",
    keepDays: 14,
    removable: (rel) => rel.endsWith(".log"),
    why: "dated server logs are for diagnosing this week's sessions",
  },
  {
    name: "session-traces",
    root: "repo",
    folder: "logs/sessions",
    keepDays: 14,
    removable: (rel) => path.basename(rel) !== "post-session-truth.json",
    why: "call and debug traces diagnose recent sessions; post-session truth is read by the chart and is a record",
  },
  {
    name: "planner-request-copies",
    root: "repo",
    folder: "src/context/*/homework/cycles/.planner",
    keepDays: 14,
    removable: (rel) => rel.split(path.sep).includes("provider-diagnostics") && rel.endsWith(".request.json"),
    why: "full copies of each Planner request exist for replay benchmarks; the answers and receipts stay",
  },
  {
    name: "kiosk-labs",
    root: "home",
    folder: ".sunny",
    keepDays: 7,
    removable: (_rel, topLevel) => topLevel,
    why: "lab, certification and demo runs never live on the kiosk; only the kiosk browser profile stays",
  },
];

const MAX_DEPTH = 12;

type Found = { file: string; rel: string; topLevel: boolean };

function expandFolder(base: string, folder: string): string[] {
  let current = [base];
  for (const segment of folder.split("/")) {
    const next: string[] = [];
    for (const dir of current) {
      if (segment !== "*") {
        next.push(path.join(dir, segment));
        continue;
      }
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) next.push(path.join(dir, entry.name));
      }
    }
    current = next;
  }
  return current.filter((dir) => fs.existsSync(dir));
}

function walkFiles(dir: string, depth = 0, out: string[] = []): string[] {
  if (depth > MAX_DEPTH) {
    console.error(` 🎮 [storage] [walk] [too-deep] ${dir}`);
    return out;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, depth + 1, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function sizeOf(target: string): number {
  if (!fs.existsSync(target)) return 0;
  try {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) return stat.size;
    return walkFiles(target).reduce((sum, file) => {
      try { return sum + fs.statSync(file).size; } catch { return sum; }
    }, 0);
  } catch (error) {
    console.error(` 🎮 [storage] [size] [failed] ${target}`, error);
    return 0;
  }
}

function removeEmptyDirs(dir: string, depth = 0): void {
  if (depth > MAX_DEPTH) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    removeEmptyDirs(full, depth + 1);
    if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
  }
}

function candidates(rule: StorageRule, folderDir: string): Found[] {
  if (rule.root === "home") {
    return fs.readdirSync(folderDir).filter((name) => !name.startsWith(".")).map((name) => ({ file: path.join(folderDir, name), rel: name, topLevel: true }));
  }
  return walkFiles(folderDir).map((file) => ({ file, rel: path.relative(folderDir, file), topLevel: false }));
}

function formatMb(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
  return `${Math.round(bytes / 1024 ** 2)}MB`;
}

export const KIOSK_MARKER_FILE = ".sunny-kiosk";

export function enforceStoragePolicy(input: {
  repoRoot: string;
  homeDir: string;
  browserProfileDir: string;
  /** Only the kiosk removes anything; a developer's Mac only logs sizes. Saori is marked by `~/.sunny-kiosk`. */
  isKiosk: boolean;
  now?: number;
}): { removed: number; freedBytes: number } {
  const now = input.now ?? Date.now();
  let removed = 0;
  let freedBytes = 0;
  for (const rule of input.isKiosk ? STORAGE_POLICY : []) {
    const base = rule.root === "repo" ? input.repoRoot : input.homeDir;
    const cutoff = now - rule.keepDays * 24 * 60 * 60 * 1000;
    for (const folderDir of expandFolder(base, rule.folder)) {
      try {
        for (const found of candidates(rule, folderDir)) {
          if (path.resolve(found.file) === path.resolve(input.browserProfileDir)) continue;
          if (!rule.removable(found.rel, found.topLevel)) continue;
          if (fs.statSync(found.file).mtimeMs >= cutoff) continue;
          const bytes = sizeOf(found.file);
          fs.rmSync(found.file, { recursive: true, force: true });
          removed += 1;
          freedBytes += bytes;
        }
        if (rule.root === "repo") removeEmptyDirs(folderDir);
      } catch (error) {
        console.error(` 🎮 [storage] [${rule.name}] [failed] ${folderDir}`, error);
      }
    }
  }

  const sizes: string[] = [`logs=${formatMb(sizeOf(path.join(input.repoRoot, "logs")))}`];
  const contextDir = path.join(input.repoRoot, "src", "context");
  if (fs.existsSync(contextDir)) {
    for (const entry of fs.readdirSync(contextDir, { withFileTypes: true })) {
      if (entry.isDirectory()) sizes.push(`${entry.name}=${formatMb(sizeOf(path.join(contextDir, entry.name)))}`);
    }
  }
  sizes.push(`dot-sunny=${formatMb(sizeOf(path.join(input.homeDir, ".sunny")))}`);
  sizes.push(`sunnydata=${formatMb(sizeOf(path.join(input.homeDir, "SunnyData")))}`);
  let free = "unknown";
  try {
    const stat = fs.statfsSync(input.repoRoot);
    free = formatMb(stat.bavail * stat.bsize);
  } catch (error) {
    console.error(" 🎮 [storage] [free] [failed]", error);
  }
  console.log(` 🎮 [storage] [startup] [sizes] kiosk=${input.isKiosk} removed=${removed} freed=${formatMb(freedBytes)} ${sizes.join(" ")} free=${free}`);
  return { removed, freedBytes };
}
