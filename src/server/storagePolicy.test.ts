import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_POLICY, enforceStoragePolicy } from "./storagePolicy";

// S39 (owner 2026-11-18: "imagine putting this on a friend's machine, it's a bomb"). Nothing Sunny wrote had a size
// budget: by 11/21 Saori had 14 GB free of 460 GB, ~/.sunny held 49 GB of lab and certification runs, Ila's folder was
// 980 MB (mostly Planner request copies) while her real record is ~8 MB. Why the human caught it: the disk warning on
// the kiosk. Why logs missed it: no line ever reported a folder size. Why the lab missed it: no test ran a month of
// sessions and looked at the disk afterwards.

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-21T12:00:00Z");
const dirs: string[] = [];

function tmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-storage-"));
  dirs.push(dir);
  return dir;
}

function write(file: string, ageDays: number, bytes = 10): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "x".repeat(bytes));
  const at = new Date(NOW - ageDays * DAY);
  fs.utimesSync(file, at, at);
}

function age(target: string, ageDays: number): void {
  const at = new Date(NOW - ageDays * DAY);
  fs.utimesSync(target, at, at);
}

function roots() {
  const repoRoot = tmp();
  const homeDir = tmp();
  return { repoRoot, homeDir, browserProfileDir: path.join(homeDir, ".sunny", "kiosk-browser-profile"), isKiosk: true };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("every folder Sunny grows has a lifetime (S39)", () => {
  it("server logs older than 14 days go; newer ones stay", () => {
    const r = roots();
    write(path.join(r.repoRoot, "logs/server/2026-10-01.log"), 51);
    write(path.join(r.repoRoot, "logs/server/2026-11-20.log"), 1);
    enforceStoragePolicy({ ...r, now: NOW });
    expect(fs.existsSync(path.join(r.repoRoot, "logs/server/2026-10-01.log"))).toBe(false);
    expect(fs.existsSync(path.join(r.repoRoot, "logs/server/2026-11-20.log"))).toBe(true);
  });

  it("old session traces go, but the post-session truth the chart reads is a record and stays", () => {
    const r = roots();
    const old = path.join(r.repoRoot, "logs/sessions/2026/10/01_ila_trace");
    write(path.join(old, "companion-call-trace.ndjson"), 51);
    write(path.join(old, "post-session-truth.json"), 51);
    write(path.join(r.repoRoot, "logs/sessions/2026/11/20_ila_trace/companion-call-trace.ndjson"), 1);
    enforceStoragePolicy({ ...r, now: NOW });
    expect(fs.existsSync(path.join(old, "companion-call-trace.ndjson"))).toBe(false);
    expect(fs.existsSync(path.join(old, "post-session-truth.json"))).toBe(true);
    expect(fs.existsSync(path.join(r.repoRoot, "logs/sessions/2026/11/20_ila_trace/companion-call-trace.ndjson"))).toBe(true);
  });

  it("old Planner request copies go; the Planner's answers and her records stay", () => {
    const r = roots();
    const diag = path.join(r.repoRoot, "src/context/ila/homework/cycles/.planner/hw1/batch/provider-diagnostics");
    write(path.join(diag, "turn-1.request.json"), 30);
    write(path.join(diag, "turn-1.response.json"), 30);
    write(path.join(diag, "turn-9.request.json"), 2);
    write(path.join(r.repoRoot, "src/context/ila/learning_profile.json"), 300);
    enforceStoragePolicy({ ...r, now: NOW });
    expect(fs.existsSync(path.join(diag, "turn-1.request.json"))).toBe(false);
    expect(fs.existsSync(path.join(diag, "turn-1.response.json"))).toBe(true);
    expect(fs.existsSync(path.join(diag, "turn-9.request.json"))).toBe(true);
    expect(fs.existsSync(path.join(r.repoRoot, "src/context/ila/learning_profile.json"))).toBe(true);
  });

  it("lab runs never stay on the kiosk; the live browser profile is kept", () => {
    const r = roots();
    write(path.join(r.homeDir, ".sunny/certifications/run-1/board.png"), 40);
    age(path.join(r.homeDir, ".sunny/certifications/run-1"), 40);
    age(path.join(r.homeDir, ".sunny/certifications"), 40);
    write(path.join(r.browserProfileDir, "Default/Cookies"), 40);
    age(r.browserProfileDir, 40);
    write(path.join(r.homeDir, ".sunny/tonight-lab/run.json"), 0);
    enforceStoragePolicy({ ...r, now: NOW });
    expect(fs.existsSync(path.join(r.homeDir, ".sunny/certifications"))).toBe(false);
    expect(fs.existsSync(path.join(r.browserProfileDir, "Default/Cookies"))).toBe(true);
    expect(fs.existsSync(path.join(r.homeDir, ".sunny/tonight-lab/run.json"))).toBe(true);
  });

  it("a developer's Mac is never cleaned, only measured", () => {
    const r = { ...roots(), isKiosk: false };
    write(path.join(r.homeDir, ".sunny/certifications/run-1/board.png"), 40);
    age(path.join(r.homeDir, ".sunny/certifications"), 40);
    write(path.join(r.repoRoot, "logs/server/2026-10-01.log"), 51);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    enforceStoragePolicy({ ...r, now: NOW });
    expect(fs.existsSync(path.join(r.homeDir, ".sunny/certifications/run-1/board.png"))).toBe(true);
    expect(fs.existsSync(path.join(r.repoRoot, "logs/server/2026-10-01.log"))).toBe(true);
  });

  it("logs one size line at startup and raises no alert", () => {
    const r = roots();
    write(path.join(r.repoRoot, "src/context/ila/learning_profile.json"), 1, 2048);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    enforceStoragePolicy({ ...r, now: NOW });
    const lines = log.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("[storage]"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/ 🎮 \[storage\] \[startup\] \[sizes\] .*ila=.*free=/);
  });

  it("a month of daily sessions stays inside the budget", () => {
    const r = roots();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const mb = 1024 * 1024;
    for (let day = 0; day < 30; day++) {
      const now = NOW + day * DAY;
      const stamp = new Date(now).toISOString().slice(0, 10);
      const at = new Date(now);
      const files = [
        path.join(r.repoRoot, `logs/server/${stamp}.log`),
        path.join(r.repoRoot, `logs/sessions/${stamp}_ila/companion-call-trace.ndjson`),
        path.join(r.repoRoot, `src/context/ila/homework/cycles/.planner/hw-${stamp}/b/provider-diagnostics/t.request.json`),
      ];
      for (const file of files) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.alloc(mb));
        fs.utimesSync(file, at, at);
      }
      enforceStoragePolicy({ ...r, now });
    }
    const total = (dir: string): number => fs.readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .reduce((sum, entry) => sum + fs.statSync(path.join(entry.parentPath, entry.name)).size, 0);
    // three 1 MB writers kept 14 days each is ~45 MB; without the policy a month is 90 MB
    expect(total(r.repoRoot)).toBeLessThanOrEqual(48 * mb);
  });

  it("the table names a lifetime and a reason for every rule", () => {
    expect(STORAGE_POLICY.length).toBeGreaterThanOrEqual(4);
    for (const rule of STORAGE_POLICY) {
      expect(rule.why.length).toBeGreaterThan(10);
      expect(rule.keepDays).toBeGreaterThan(0);
    }
  });
});
