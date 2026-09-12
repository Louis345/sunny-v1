import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";

type CertificationDomain = "math" | "spelling";

export type CertificationRunManifest = {
  version: 2;
  certificationRunId: string;
  sourceRoot: string;
  sourceChildId: string;
  sourceChildDir: string;
  sourceSnapshotHash: string;
  sourceImplementationHash: string;
  workspaceImplementationHash: string;
  workspaceDir: string;
  runDir: string;
  assignmentPath: string;
  assignmentFingerprint: string;
  homeworkId?: string;
  homeworkDomain: CertificationDomain;
  evidenceAuthority: "simulation";
  state: "created" | "discovery_ready" | "session_closed" | "attention_needed" | "failed";
  createdAt: string;
  updatedAt: string;
};

type CreateCertificationRunInput = {
  rootDir?: string;
  certificationRoot?: string;
  childId: string;
  domain: CertificationDomain;
  assignmentPath: string;
  onProgress?: (event: CertificationProgressEvent) => void;
};

export type CertificationProgressEvent = {
  step: number;
  total: number;
  label: string;
};

const MANIFEST = "certification-run.json";

export function normalizeDraggedPath(value: string): string {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\([\\ "'()])/g, "$1");
}

export function formatCertificationProgress(step: number, total: number, label: string): string {
  const safeTotal = Math.max(1, total);
  const safeStep = Math.min(safeTotal, Math.max(0, step));
  return `[${"■".repeat(safeStep)}${"□".repeat(safeTotal - safeStep)}] ${safeStep}/${safeTotal} — ${label}`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else files.push(full);
    }
  };
  visit(root);
  return files.sort();
}

export function hashDirectory(root: string): string {
  const absolute = path.resolve(root);
  const hash = createHash("sha256");
  for (const file of walkFiles(absolute)) {
    const relative = path.relative(absolute, file);
    const stat = fs.lstatSync(file);
    hash.update(relative);
    hash.update("\0");
    hash.update(stat.isSymbolicLink() ? `link:${fs.readlinkSync(file)}` : fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function hashCertificationImplementation(rootDir: string): string {
  const root = path.resolve(rootDir);
  const files = [
    ...walkFiles(path.join(root, "src")),
    ...walkFiles(path.join(root, "web", "src")),
    ...walkFiles(path.join(root, "web", "public", "games")),
    ...[
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "children.config.json",
      "web/index.html",
      "web/package.json",
      "web/package-lock.json",
    ].map((file) => path.join(root, file)),
  ].filter((file) => {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
    const relative = path.relative(root, file);
    const parts = relative.split(path.sep);
    if (parts[0] === "src" && parts[1] === "logs") return false;
    if (parts[0] === "src" && parts[1] === "context" && parts[2] !== "schemas") return false;
    return /\.(?:c?js|mjs|json|ts|tsx|css|html|svg)$/.test(file);
  }).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(root, file));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readChildrenConfig(rootDir: string): Record<string, unknown> & {
  childProfiles?: Record<string, unknown>;
  childCompanionIds?: Record<string, unknown>;
  companions?: Record<string, unknown>;
  defaultCompanionId?: unknown;
} {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "children.config.json"), "utf8")) as {
    childProfiles?: Record<string, unknown>;
    childCompanionIds?: Record<string, unknown>;
    companions?: Record<string, unknown>;
    defaultCompanionId?: unknown;
  };
}

function copyWorkspace(rootDir: string, workspaceDir: string, childId: string): void {
  const config = readChildrenConfig(rootDir);
  const registered = new Set([...Object.keys(config.childProfiles ?? {}), "creator"]);
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.cpSync(rootDir, workspaceDir, {
    recursive: true,
    dereference: true,
    filter: (source) => {
      const relative = path.relative(rootDir, source);
      if (!relative) return true;
      const parts = relative.split(path.sep);
      if (parts.includes("node_modules") || [".git", ".sunny-sandbox", "output", "outputs", "tmp"].includes(parts[0] ?? "")) return false;
      if (relative === ".env" || relative.startsWith(`web${path.sep}dist`)) return false;
      if (relative.startsWith(`web${path.sep}public${path.sep}generated${path.sep}direct-math`)) return false;
      if (relative.startsWith(`src${path.sep}logs`)) return false;
      if (parts[0] === "src" && parts[1] === "context" && (registered.has(parts[2] ?? "") || (parts[2] ?? "").startsWith("qa_"))) return false;
      return true;
    },
  });

  const sourceChild = path.join(rootDir, "src", "context", childId);
  const clonedChild = path.join(workspaceDir, "src", "context", childId);
  fs.cpSync(sourceChild, clonedChild, { recursive: true, dereference: true });
  fs.rmSync(path.join(clonedChild, "homework", "direct-drafts"), { recursive: true, force: true });
  fs.rmSync(path.join(workspaceDir, "web", "public", "generated", "direct-math"), { recursive: true, force: true });

  const selectedProfile = config.childProfiles?.[childId];
  const selectedCompanionId = config.childCompanionIds?.[childId];
  fs.writeFileSync(
    path.join(workspaceDir, "children.config.json"),
    `${JSON.stringify({
      ...config,
      childProfiles: { [childId]: selectedProfile ?? {} },
      childCompanionIds: selectedCompanionId == null ? {} : { [childId]: selectedCompanionId },
    }, null, 2)}\n`,
  );

  for (const file of walkFiles(clonedChild)) {
    if (!/\.(json|md|txt)$/i.test(file)) continue;
    const before = fs.readFileSync(file, "utf8");
    const after = before.split(rootDir).join(workspaceDir);
    if (after !== before) fs.writeFileSync(file, after, "utf8");
    if (fs.readFileSync(file, "utf8").includes(rootDir)) throw new Error(`certification_source_reference_remaining:${file}`);
  }

  for (const dependencyDir of ["node_modules", path.join("web", "node_modules")]) {
    const source = path.join(rootDir, dependencyDir);
    const destination = path.join(workspaceDir, dependencyDir);
    if (!fs.existsSync(source) || fs.existsSync(destination)) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.symlinkSync(source, destination, "dir");
  }
}

function writeManifest(manifest: CertificationRunManifest): void {
  fs.mkdirSync(manifest.runDir, { recursive: true });
  fs.writeFileSync(path.join(manifest.runDir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function createCertificationRun(input: CreateCertificationRunInput): CertificationRunManifest {
  input.onProgress?.({ step: 1, total: 4, label: "Validating assignment and child" });
  const rootDir = path.resolve(input.rootDir ?? process.cwd());
  const certificationRoot = path.resolve(input.certificationRoot ?? path.join(os.homedir(), ".sunny", "certifications"));
  const childId = input.childId.trim().toLowerCase();
  const assignmentPath = path.resolve(input.assignmentPath);
  const sourceChildDir = path.join(rootDir, "src", "context", childId);
  if (!fs.existsSync(sourceChildDir)) throw new Error(`certification_source_child_missing:${childId}`);
  if (!fs.statSync(assignmentPath).isFile()) throw new Error(`certification_assignment_missing:${assignmentPath}`);
  if (isInside(rootDir, certificationRoot)) throw new Error("certification_root_must_be_outside_source_workspace");
  const sourceSnapshotHash = hashDirectory(sourceChildDir);
  const sourceImplementationHash = hashCertificationImplementation(rootDir);
  const assignmentFingerprint = sha256(fs.readFileSync(assignmentPath));
  const certificationRunId = `cert-v2-${childId}-${input.domain}-${assignmentFingerprint.slice(0, 10)}-${sourceSnapshotHash.slice(0, 8)}-${sourceImplementationHash.slice(0, 8)}`;
  const runDir = path.join(certificationRoot, certificationRunId);
  const manifestPath = path.join(runDir, MANIFEST);
  if (fs.existsSync(manifestPath)) {
    input.onProgress?.({ step: 2, total: 4, label: "Reusing isolated workspace" });
    const existing = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as CertificationRunManifest;
    validateCertificationWorkspace(existing);
    return existing;
  }
  const workspaceDir = path.join(runDir, "workspace");
  input.onProgress?.({ step: 2, total: 4, label: "Creating isolated workspace" });
  copyWorkspace(rootDir, workspaceDir, childId);
  const workspaceImplementationHash = hashCertificationImplementation(workspaceDir);
  const now = new Date().toISOString();
  const manifest: CertificationRunManifest = {
    version: 2,
    certificationRunId,
    sourceRoot: rootDir,
    sourceChildId: childId,
    sourceChildDir,
    sourceSnapshotHash,
    sourceImplementationHash,
    workspaceImplementationHash,
    workspaceDir,
    runDir,
    assignmentPath,
    assignmentFingerprint,
    homeworkDomain: input.domain,
    evidenceAuthority: "simulation",
    state: "created",
    createdAt: now,
    updatedAt: now,
  };
  validateCertificationWorkspace(manifest);
  writeManifest(manifest);
  return manifest;
}

export function validateCertificationWorkspace(manifest: CertificationRunManifest): void {
  if (
    hashCertificationImplementation(manifest.sourceRoot) !== manifest.sourceImplementationHash ||
    hashCertificationImplementation(manifest.workspaceDir) !== manifest.workspaceImplementationHash
  ) {
    throw new Error("certification_workspace_implementation_stale");
  }
  const config = readChildrenConfig(manifest.workspaceDir);
  const childIds = Object.keys(config.childProfiles ?? {});
  if (childIds.length !== 1 || childIds[0] !== manifest.sourceChildId) {
    throw new Error(`certification_child_scope_invalid:${childIds.join(",")}`);
  }
  const configured = config.childCompanionIds?.[manifest.sourceChildId];
  const companionId = typeof configured === "string"
    ? configured
    : typeof config.defaultCompanionId === "string" ? config.defaultCompanionId : undefined;
  if (!companionId || !config.companions || !(companionId in config.companions)) {
    throw new Error(`certification_companion_preset_missing:${companionId ?? "unknown"}`);
  }
  const profile = path.join(manifest.workspaceDir, "src", "context", manifest.sourceChildId, "learning_profile.json");
  if (!fs.existsSync(profile)) throw new Error(`certification_learning_profile_missing:${manifest.sourceChildId}`);
}

export function findCertificationRun(input: {
  certificationRoot?: string;
  childId: string;
  domain: CertificationDomain;
}): CertificationRunManifest | null {
  const root = path.resolve(input.certificationRoot ?? path.join(os.homedir(), ".sunny", "certifications"));
  if (!fs.existsSync(root)) return null;
  const matches = fs.readdirSync(root)
    .map((name) => path.join(root, name, MANIFEST))
    .filter((file) => fs.existsSync(file))
    .map((file) => JSON.parse(fs.readFileSync(file, "utf8")) as CertificationRunManifest)
    .filter((run) => run.version === 2
      && typeof run.sourceImplementationHash === "string"
      && run.sourceImplementationHash === hashCertificationImplementation(run.sourceRoot)
      && run.sourceChildId === input.childId.trim().toLowerCase()
      && run.homeworkDomain === input.domain)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return matches[0] ?? null;
}

export function assertSourceSnapshotUnchanged(manifest: CertificationRunManifest): void {
  if (hashDirectory(manifest.sourceChildDir) !== manifest.sourceSnapshotHash) {
    throw new Error("certification_source_child_changed");
  }
}

export type CertificationReport = {
  version: 1;
  certificationRunId: string;
  evidenceAuthority: "simulation";
  verdict: "PASS" | "FAIL" | "INCOMPLETE";
  sourceChildUnchanged: boolean;
  sourceSnapshotHash: string;
  currentSourceSnapshotHash: string;
  assignmentFingerprint: string;
  homeworkId?: string;
  lifecycle?: string;
  state: CertificationRunManifest["state"];
  cost: { currency: "USD"; knownTotal: number; incomplete: boolean; providerReceiptCount: number };
  limitations: string[];
  generatedAt: string;
};

function readLifecycle(manifest: CertificationRunManifest): {
  lifecycle?: string;
  limitation?: string;
} {
  if (!manifest.homeworkId) return {};
  const file = path.join(manifest.workspaceDir, "src", "context", manifest.sourceChildId, "homework", "cycles", `${manifest.homeworkId}.json`);
  if (!fs.existsSync(file)) return {};
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as { lifecycle?: string };
    return { lifecycle: value.lifecycle };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(` 🎮 [certification] [report-input] [invalid] type=lifecycle file=${path.basename(file)} reason=${reason}`);
    return { limitation: `Lifecycle record could not be read: ${path.basename(file)}.` };
  }
}

function providerReceiptFiles(manifest: CertificationRunManifest): string[] {
  if (!manifest.homeworkId) return [];
  const draft = path.join(manifest.workspaceDir, "src", "context", manifest.sourceChildId, "homework", "direct-drafts", manifest.homeworkId);
  return walkFiles(draft).filter((file) => file.includes(`${path.sep}provider-receipts${path.sep}`) && file.endsWith(".json"));
}

export function writeCertificationReport(manifest: CertificationRunManifest): CertificationReport {
  const currentSourceSnapshotHash = hashDirectory(manifest.sourceChildDir);
  const sourceChildUnchanged = currentSourceSnapshotHash === manifest.sourceSnapshotHash;
  const receipts = providerReceiptFiles(manifest);
  let knownTotal = 0;
  let pricedReceiptCount = 0;
  const reportInputLimitations: string[] = [];
  for (const file of receipts) {
    try {
      const value = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      const amount = typeof value.estimatedCostUsd === "number"
        ? value.estimatedCostUsd
        : typeof value.costUsd === "number" ? value.costUsd : undefined;
      if (amount != null) { knownTotal += amount; pricedReceiptCount += 1; }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(` 🎮 [certification] [report-input] [invalid] type=provider-receipt file=${path.basename(file)} reason=${reason}`);
      reportInputLimitations.push(`Malformed provider receipt: ${path.basename(file)}.`);
    }
  }
  const lifecycleRead = readLifecycle(manifest);
  const lifecycle = lifecycleRead.lifecycle;
  if (lifecycleRead.limitation) reportInputLimitations.push(lifecycleRead.limitation);
  const automatedReady = lifecycle === "board_ready";
  const report: CertificationReport = {
    version: 1,
    certificationRunId: manifest.certificationRunId,
    evidenceAuthority: "simulation",
    verdict: !sourceChildUnchanged ? "FAIL" : "INCOMPLETE",
    sourceChildUnchanged,
    sourceSnapshotHash: manifest.sourceSnapshotHash,
    currentSourceSnapshotHash,
    assignmentFingerprint: manifest.assignmentFingerprint,
    ...(manifest.homeworkId ? { homeworkId: manifest.homeworkId } : {}),
    ...(lifecycle ? { lifecycle } : {}),
    state: manifest.state,
    cost: {
      currency: "USD",
      knownTotal,
      incomplete: receipts.length === 0 || pricedReceiptCount !== receipts.length,
      providerReceiptCount: receipts.length,
    },
    limitations: [
      ...(automatedReady ? [] : ["Targeted chapter is not yet board_ready."]),
      "Manual mathematical meaning, interaction clarity, Elli/VRM behavior, sound, animation, and ceremony review is still required.",
      ...(receipts.length === pricedReceiptCount && receipts.length > 0 ? [] : ["Provider receipts do not yet contain complete USD pricing data."]),
      ...reportInputLimitations,
    ],
    generatedAt: new Date().toISOString(),
  };
  const reportDir = path.join(manifest.runDir, "report");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export function runCertificationSetupOnly(manifest: CertificationRunManifest): CertificationReport {
  validateCertificationWorkspace(manifest);
  assertSourceSnapshotUnchanged(manifest);
  const report = writeCertificationReport(manifest);
  console.log(` 🎮 [certification] [setup-only] [passed] run=${manifest.certificationRunId}`);
  return report;
}

function stablePort(runId: string): number {
  return 4300 + (Number.parseInt(sha256(runId).slice(0, 6), 16) % 500);
}

export function certificationRuntimeEnv(
  manifest: CertificationRunManifest,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.SUNNY_PREVIEW_MODE;
  delete env.VITE_PREVIEW_MODE;
  delete env.SUNNY_STATELESS;
  delete env.SUNNY_TEST_MODE;
  return {
    ...env,
    SUNNY_CONTEXT_ROOT: path.join(manifest.workspaceDir, "src", "context"),
    SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT: "true",
    SUNNY_CERTIFICATION_RUN_ID: manifest.certificationRunId,
    SUNNY_CERTIFICATION_CHILD_ID: manifest.sourceChildId,
    ...(manifest.homeworkId ? { SUNNY_CERTIFICATION_HOMEWORK_ID: manifest.homeworkId } : {}),
    SUNNY_EVIDENCE_AUTHORITY: "simulation",
    SUNNY_LOG_UPLOAD_ON_END: "false",
    SUNNY_SESSION_LOG_ROOT: path.join(manifest.runDir, "logs", "sessions"),
    SUNNY_BROWSER_PROFILE_DIR: path.join(manifest.runDir, "browser-profile"),
    SUNNY_CERTIFICATION_REPORT_DIR: path.join(manifest.runDir, "report"),
    PORT: String(stablePort(manifest.certificationRunId)),
    ...(fs.existsSync(path.join(manifest.sourceRoot, ".env"))
      ? { DOTENV_CONFIG_PATH: path.join(manifest.sourceRoot, ".env") }
      : {}),
  };
}

function updateState(manifest: CertificationRunManifest, state: CertificationRunManifest["state"]): void {
  manifest.state = state;
  manifest.updatedAt = new Date().toISOString();
  writeManifest(manifest);
}

function runCommand(manifest: CertificationRunManifest, args: string[]): void {
  const result = spawnSync("npm", args, {
    cwd: manifest.workspaceDir,
    env: certificationRuntimeEnv(manifest),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`certification_command_failed:${args.join(" ")}:${result.status ?? "signal"}`);
}

function resolveGeneratedHomeworkId(manifest: CertificationRunManifest): string {
  const drafts = path.join(manifest.workspaceDir, "src", "context", manifest.sourceChildId, "homework", "direct-drafts");
  const ids = fs.existsSync(drafts)
    ? fs.readdirSync(drafts).filter((name) => name.startsWith(`hw-${manifest.homeworkDomain}-`) && fs.statSync(path.join(drafts, name)).isDirectory())
    : [];
  if (ids.length !== 1) throw new Error(`certification_homework_identity_ambiguous:${ids.join(",")}`);
  return ids[0]!;
}

export function runCertification(
  manifest: CertificationRunManifest,
  onProgress?: (event: CertificationProgressEvent) => void,
): void {
  assertSourceSnapshotUnchanged(manifest);
  validateCertificationWorkspace(manifest);
  try {
    if (manifest.state === "created" || manifest.state === "failed") {
      onProgress?.({ step: 3, total: 4, label: "Preparing and verifying Discovery" });
      runCommand(manifest, ["run", `sunny:ingest:${manifest.homeworkDomain}`, "--", `--child=${manifest.sourceChildId}`, `--pdf=${manifest.assignmentPath}`]);
      manifest.homeworkId = resolveGeneratedHomeworkId(manifest);
      updateState(manifest, "discovery_ready");
    }
    onProgress?.({ step: 4, total: 4, label: "Launching the isolated learning journey" });
    console.log(`\nImpersonator test — ${path.basename(manifest.assignmentPath)}`);
    console.log("All progress is recorded only in the isolated certification copy.");
    runCommand(manifest, ["run", "sunny:run", "--", "--subject", "homework", "--child", manifest.sourceChildId, "--session-mode", "real", "--homework-domain", manifest.homeworkDomain]);
    updateState(manifest, "session_closed");
    assertSourceSnapshotUnchanged(manifest);
    writeCertificationReport(manifest);
    console.log(` 🎮 [certification] [source-isolation] [passed] run=${manifest.certificationRunId}`);
    console.log(`Resume/report: ${manifest.runDir}`);
  } catch (error) {
    updateState(manifest, manifest.homeworkId ? "attention_needed" : "failed");
    writeCertificationReport(manifest);
    assertSourceSnapshotUnchanged(manifest);
    throw error;
  }
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const childId = arg("child")?.trim().toLowerCase();
  const domain = arg("homework-domain") ?? "math";
  const assignmentArg = arg("pdf");
  if (!childId) throw new Error("certification_child_required");
  if (domain !== "math" && domain !== "spelling") throw new Error("certification_domain_not_supported");
  const showProgress = (event: CertificationProgressEvent) => {
    console.log(` 🎮 [certification] [setup] [running] ${formatCertificationProgress(event.step, event.total, event.label)}`);
  };
  let manifest: CertificationRunManifest | null;
  if (assignmentArg) {
    manifest = createCertificationRun({
      childId,
      domain,
      assignmentPath: normalizeDraggedPath(assignmentArg),
      onProgress: showProgress,
    });
  } else {
    manifest = findCertificationRun({ childId, domain });
    const rl = readline.createInterface({ input, output });
    try {
      if (manifest) {
        const answer = (await rl.question(`Resume impersonator test for ${path.basename(manifest.assignmentPath)}? [Y/n] `)).trim().toLowerCase();
        if (answer === "n" || answer === "no") manifest = null;
      }
      if (!manifest) {
        const assignmentPath = await rl.question("Drag assignment here or paste its path: ");
        manifest = createCertificationRun({
          childId,
          domain,
          assignmentPath: normalizeDraggedPath(assignmentPath),
          onProgress: showProgress,
        });
      }
    } finally {
      rl.close();
    }
  }
  if (process.env.SUNNY_CERTIFICATION_SETUP_ONLY === "true") {
    runCertificationSetupOnly(manifest);
    return;
  }
  runCertification(manifest, showProgress);
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(`Impersonator test failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
