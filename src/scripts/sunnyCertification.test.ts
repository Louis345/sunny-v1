import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSourceSnapshotUnchanged,
  certificationRuntimeEnv,
  createCertificationRun,
  formatCertificationProgress,
  findCertificationRun,
  hashCertificationImplementation,
  runCertificationSetupOnly,
  normalizeDraggedPath,
  validateCertificationWorkspace,
  writeCertificationReport,
} from "./sunnyCertification";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

function fixture(): { rootDir: string; certificationRoot: string; pdf: string } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cert-source-"));
  const certificationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cert-runs-"));
  roots.push(rootDir, certificationRoot);
  fs.writeFileSync(path.join(rootDir, "package.json"), JSON.stringify({ scripts: {} }));
  fs.mkdirSync(path.join(rootDir, "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "web", "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "children.config.json"), JSON.stringify({
    defaultCompanionId: "elli",
    childCompanionIds: { ila: "elli", reina: "matilda" },
    childProfiles: { ila: { companion: "elli" }, reina: {} },
    companions: { elli: { name: "Elli" }, matilda: { name: "Matilda" } },
  }));
  fs.mkdirSync(path.join(rootDir, "src", "context", "schemas"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "src", "context", "schemas", "marker.ts"), "export const marker=true;");
  fs.mkdirSync(path.join(rootDir, "src", "logs"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "src", "logs", "ila_attempts.json"), "[]");
  fs.mkdirSync(path.join(rootDir, "src", "context", "ila", "homework", "direct-drafts", "old"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "src", "context", "ila", "learning_profile.json"), JSON.stringify({ childId: "ila", linked: path.join(rootDir, "src/context/ila/notes.md") }));
  fs.writeFileSync(path.join(rootDir, "src", "context", "ila", "notes.md"), "history");
  fs.writeFileSync(path.join(rootDir, "src", "context", "ila", "homework", "direct-drafts", "old", "job.json"), "{}");
  fs.mkdirSync(path.join(rootDir, "src", "context", "reina"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "src", "context", "reina", "learning_profile.json"), "{}");
  fs.mkdirSync(path.join(rootDir, "web", "public", "generated", "direct-math"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "web", "public", "generated", "direct-math", "live.jpeg"), "family-art");
  const pdf = path.join(rootDir, "assignment.pdf");
  fs.writeFileSync(pdf, "assignment");
  return { rootDir, certificationRoot, pdf };
}

describe("Sunny impersonation certification", () => {
  it("keeps generated proof and runtime learning records out of release commits", () => {
    const ignore = fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
    expect(ignore).toContain("/output/");
    expect(ignore).toContain("/outputs/");
    expect(ignore).toContain("/web/public/generated/");
    expect(ignore).toContain("src/context/*/homework/direct-drafts/");
    expect(ignore).toContain("src/context/*/homework/cycles/");
  });

  it("keeps spelling and math identities separate even for the same source file", () => {
    const { rootDir, certificationRoot, pdf } = fixture();
    const math = createCertificationRun({ rootDir, certificationRoot, childId: "ila", domain: "math", assignmentPath: pdf });
    const spelling = createCertificationRun({ rootDir, certificationRoot, childId: "ila", domain: "spelling", assignmentPath: pdf });
    expect(spelling.homeworkDomain).toBe("spelling");
    expect(spelling.workspaceDir).not.toBe(math.workspaceDir);
    expect(findCertificationRun({ certificationRoot, childId: "ila", domain: "spelling" })?.certificationRunId).toBe(spelling.certificationRunId);
    expect(() => assertSourceSnapshotUnchanged(spelling)).not.toThrow();
  });
  it("normalizes a Finder-dragged path and renders truthful phase progress", () => {
    expect(normalizeDraggedPath("  /Users/test/4_13\\ Math.pdf\u00a0")).toBe("/Users/test/4_13 Math.pdf");
    expect(formatCertificationProgress(2, 4, "Creating isolated workspace")).toBe(
      "[■■□□] 2/4 — Creating isolated workspace",
    );
  });

  it("uses an explicit PDF without requiring a nested certification prompt", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/sunnyCertification.ts"), "utf8");
    expect(source).toContain("if (assignmentArg)");
    expect(source).toContain("assignmentPath: normalizeDraggedPath(assignmentArg)");
  });

  it("creates a current-code workspace with only the selected cloned child and no resumable family drafts", () => {
    const { rootDir, certificationRoot, pdf } = fixture();
    const progress: string[] = [];
    const manifest = createCertificationRun({
      rootDir,
      certificationRoot,
      childId: "ila",
      domain: "math",
      assignmentPath: pdf,
      onProgress: (event) => progress.push(formatCertificationProgress(event.step, event.total, event.label)),
    });
    const workspace = manifest.workspaceDir;

    expect(JSON.parse(fs.readFileSync(path.join(workspace, "children.config.json"), "utf8"))).toEqual({
      defaultCompanionId: "elli",
      childCompanionIds: { ila: "elli" },
      childProfiles: { ila: { companion: "elli" } },
      companions: { elli: { name: "Elli" }, matilda: { name: "Matilda" } },
    });
    expect(() => validateCertificationWorkspace(manifest)).not.toThrow();
    expect(fs.existsSync(path.join(workspace, "src/context/schemas/marker.ts"))).toBe(true);
    expect(fs.existsSync(path.join(workspace, "src/context/ila/learning_profile.json"))).toBe(true);
    expect(fs.existsSync(path.join(workspace, "src/context/reina"))).toBe(false);
    expect(fs.existsSync(path.join(workspace, "src/context/ila/homework/direct-drafts/old"))).toBe(false);
    expect(fs.existsSync(path.join(workspace, "web/public/generated/direct-math/live.jpeg"))).toBe(false);
    expect(fs.lstatSync(path.join(workspace, "node_modules")).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(workspace, "web/node_modules")).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(workspace, "src/context/ila/learning_profile.json"), "utf8")).toContain(workspace);
    expect(manifest.evidenceAuthority).toBe("simulation");
    expect(manifest.sourceSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(progress).toEqual([
      "[■□□□] 1/4 — Validating assignment and child",
      "[■■□□] 2/4 — Creating isolated workspace",
    ]);
  });

  it("builds a runtime that persists normally only inside the cloned workspace and disables external upload", () => {
    const { rootDir, certificationRoot, pdf } = fixture();
    const manifest = createCertificationRun({ rootDir, certificationRoot, childId: "ila", domain: "math", assignmentPath: pdf });
    const env = certificationRuntimeEnv(manifest, { ANTHROPIC_API_KEY: "test-key" });

    expect(env.SUNNY_CONTEXT_ROOT).toBe(path.join(manifest.workspaceDir, "src", "context"));
    expect(env.SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT).toBe("true");
    expect(env.SUNNY_CERTIFICATION_RUN_ID).toBe(manifest.certificationRunId);
    manifest.homeworkId = "hw-1";
    expect(certificationRuntimeEnv(manifest, {}).SUNNY_CERTIFICATION_HOMEWORK_ID).toBe("hw-1");
    expect(env.SUNNY_EVIDENCE_AUTHORITY).toBe("simulation");
    expect(env.SUNNY_LOG_UPLOAD_ON_END).toBe("false");
    expect(env.SUNNY_SESSION_LOG_ROOT).toBe(path.join(manifest.runDir, "logs", "sessions"));
    expect(env.SUNNY_BROWSER_PROFILE_DIR).toBe(path.join(manifest.runDir, "browser-profile"));
    expect(env.SUNNY_PREVIEW_MODE).toBeUndefined();
    expect(Number(env.PORT)).toBeGreaterThanOrEqual(4300);
  });

  it("can prove the real setup handoff without starting ingestion or changing source child data", () => {
    const { rootDir, certificationRoot, pdf } = fixture();
    const manifest = createCertificationRun({ rootDir, certificationRoot, childId: "ila", domain: "math", assignmentPath: pdf });

    const report = runCertificationSetupOnly(manifest);

    expect(report).toMatchObject({
      verdict: "INCOMPLETE",
      sourceChildUnchanged: true,
      state: "created",
    });
    expect(manifest.homeworkId).toBeUndefined();
  });

  it("resumes the same child and assignment run and detects any source-family mutation", () => {
    const { rootDir, certificationRoot, pdf } = fixture();
    const manifest = createCertificationRun({ rootDir, certificationRoot, childId: "ila", domain: "math", assignmentPath: pdf });
    expect(findCertificationRun({ certificationRoot, childId: "ila", domain: "math" })?.certificationRunId).toBe(manifest.certificationRunId);
    expect(() => assertSourceSnapshotUnchanged(manifest)).not.toThrow();

    fs.writeFileSync(path.join(rootDir, "src/context/ila/notes.md"), "changed");
    expect(() => assertSourceSnapshotUnchanged(manifest)).toThrow("certification_source_child_changed");
  });

  it("never reuses a certification workspace copied from an older pipeline implementation", () => {
    const { rootDir, certificationRoot, pdf } = fixture();
    const first = createCertificationRun({ rootDir, certificationRoot, childId: "ila", domain: "math", assignmentPath: pdf });

    fs.writeFileSync(path.join(rootDir, "src/context/schemas/marker.ts"), "export const marker='new-pipeline';");
    const second = createCertificationRun({ rootDir, certificationRoot, childId: "ila", domain: "math", assignmentPath: pdf });

    expect(second.certificationRunId).not.toBe(first.certificationRunId);
    expect(second.workspaceDir).not.toBe(first.workspaceDir);
    expect(fs.readFileSync(path.join(second.workspaceDir, "src/context/schemas/marker.ts"), "utf8"))
      .toContain("new-pipeline");
  });

  it("invalidates reuse when child-visible styles, games, or companion configuration change", () => {
    const { rootDir } = fixture();
    fs.mkdirSync(path.join(rootDir, "web", "src"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "web", "public", "games"), { recursive: true });
    const style = path.join(rootDir, "web", "src", "app.css");
    const game = path.join(rootDir, "web", "public", "games", "word-radar.html");
    const config = path.join(rootDir, "children.config.json");
    fs.writeFileSync(style, ".activity{display:block}");
    fs.writeFileSync(game, "<button>Play</button>");

    const original = hashCertificationImplementation(rootDir);
    fs.writeFileSync(style, ".activity{display:none}");
    const afterStyle = hashCertificationImplementation(rootDir);
    fs.writeFileSync(game, "<button hidden>Play</button>");
    const afterGame = hashCertificationImplementation(rootDir);
    fs.writeFileSync(config, JSON.stringify({ childProfiles: { ila: {} }, companions: {} }));
    const afterConfig = hashCertificationImplementation(rootDir);

    expect(afterStyle).not.toBe(original);
    expect(afterGame).not.toBe(afterStyle);
    expect(afterConfig).not.toBe(afterGame);
  });

  it("refuses a copied workspace whose selected companion preset is missing", () => {
    const { rootDir, certificationRoot, pdf } = fixture();
    const manifest = createCertificationRun({ rootDir, certificationRoot, childId: "ila", domain: "math", assignmentPath: pdf });
    const configPath = path.join(manifest.workspaceDir, "children.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.companions = {};
    fs.writeFileSync(configPath, JSON.stringify(config));
    manifest.workspaceImplementationHash = hashCertificationImplementation(manifest.workspaceDir);
    expect(() => validateCertificationWorkspace(manifest)).toThrow("certification_companion_preset_missing:elli");
  });

  it("writes an honest incomplete report before the full board is ready", () => {
    const { rootDir, certificationRoot, pdf } = fixture();
    const manifest = createCertificationRun({ rootDir, certificationRoot, childId: "ila", domain: "math", assignmentPath: pdf });
    const report = writeCertificationReport(manifest);
    expect(report).toMatchObject({ verdict: "INCOMPLETE", sourceChildUnchanged: true, evidenceAuthority: "simulation" });
    expect(report.cost).toMatchObject({ currency: "USD", knownTotal: 0, incomplete: true });
    expect(fs.existsSync(path.join(manifest.runDir, "report", "report.json"))).toBe(true);
  });

  it("reports malformed lifecycle and provider receipts instead of swallowing them", () => {
    const { rootDir, certificationRoot, pdf } = fixture();
    const manifest = createCertificationRun({ rootDir, certificationRoot, childId: "ila", domain: "math", assignmentPath: pdf });
    manifest.homeworkId = "hw-bad-report";
    const cycleFile = path.join(manifest.workspaceDir, "src/context/ila/homework/cycles/hw-bad-report.json");
    const receiptFile = path.join(manifest.workspaceDir, "src/context/ila/homework/direct-drafts/hw-bad-report/provider-receipts/bad.json");
    fs.mkdirSync(path.dirname(cycleFile), { recursive: true });
    fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
    fs.writeFileSync(cycleFile, "not-json");
    fs.writeFileSync(receiptFile, "not-json");
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => warnings.push(String(message));
    try {
      const report = writeCertificationReport(manifest);
      expect(report.limitations.join(" ")).toContain("Lifecycle record could not be read");
      expect(report.limitations.join(" ")).toContain("Malformed provider receipt: bad.json");
      expect(warnings.join(" ")).toContain("[certification] [report-input] [invalid]");
    } finally {
      console.warn = originalWarn;
    }
  });
});
