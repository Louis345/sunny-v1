import crypto from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { readIngestionRunResult, writeIngestionRunResult } from "../utils/ingestionRunResult";

export type AssignmentInboxDomain = "math" | "spelling";
export type AssignmentIntakeStatus =
  | "received"
  | "running"
  | "discovery_ready"
  | "failed_resumable";

export type AssignmentIntakeRecord = {
  version: 1;
  intakeId: string;
  childId: string;
  domain: AssignmentInboxDomain;
  originalFilename: string;
  mimeType: string;
  fileHash: string;
  byteLength: number;
  sourceFile: string;
  status: AssignmentIntakeStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  launchId?: string;
  pid?: number;
  exitCode?: number;
  error?: string;
  homeworkId?: string;
};

export type AssignmentInboxOptions = {
  inboxRoot?: string;
  now?: () => Date;
};

export type AssignmentInboxRouteOptions = AssignmentInboxOptions & {
  deviceToken?: string;
  childExists: (childId: string) => boolean;
  launch?: (record: AssignmentIntakeRecord) => boolean;
};

type AssignmentUpload = {
  childId: string;
  domain: AssignmentInboxDomain;
  filename: string;
  mimeType: string;
  dataBase64: string;
};

type LaunchOptions = AssignmentInboxOptions & {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  spawnProcess?: typeof spawn;
};

type ResumeOptions = LaunchOptions & {
  launch?: (record: AssignmentIntakeRecord) => boolean;
};

type WorkerOptions = AssignmentInboxOptions & {
  ingest: (record: AssignmentIntakeRecord) => Promise<{ homeworkId: string }>;
};

type AssignmentLaunchLock = {
  version: 1;
  launchId: string;
  pid: number;
  claimedAt: string;
};

export type AssignmentInboxWorkerClaim = {
  intakeId: string;
  launchId: string;
  pid: number;
};

export type AssignmentInboxWorkerCompletion = {
  intakeId: string;
  launchId: string;
  exitCode: number;
  error?: unknown;
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const EXTENSION_BY_MIME = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const activeIntakes = new Set<string>();

function sha256(value: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function atomicWriteJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(file), 0o700);
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function normalizeBase64(value: string): string {
  return value.replace(/\s+/g, "");
}

function decodeUpload(value: string): Buffer {
  const normalized = normalizeBase64(value);
  if (!normalized || normalized.length % 4 !== 0 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("assignment_upload_base64_invalid");
  }
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) throw new Error("assignment_upload_size_invalid");
  if (bytes.toString("base64").replace(/=+$/, "") !== normalized.replace(/=+$/, "")) {
    throw new Error("assignment_upload_base64_invalid");
  }
  return bytes;
}

function bytesMatchMime(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function safeDisplayFilename(value: string): string {
  const normalized = path.basename(value).replace(/[^a-zA-Z0-9._ -]+/g, "-").trim();
  return normalized.slice(0, 160) || "assignment";
}

export function resolveAssignmentInboxRoot(options: AssignmentInboxOptions = {}): string {
  if (options.inboxRoot) return path.resolve(options.inboxRoot);
  if (process.env.SUNNY_INBOX_ROOT?.trim()) return path.resolve(process.env.SUNNY_INBOX_ROOT.trim());
  return path.join(os.homedir(), ".sunny", "assignment-inbox");
}

function recordFile(root: string, intakeId: string): string {
  return path.join(root, intakeId, "job.json");
}

function resultFile(root: string, intakeId: string): string {
  return path.join(root, intakeId, "ingestion-result.json");
}

function lockFile(root: string, intakeId: string): string {
  return path.join(root, intakeId, "launch.lock");
}

function operatingSystemLockFile(root: string, intakeId: string): string {
  return path.join(root, intakeId, "worker.lock");
}

function launchLockExists(root: string, intakeId: string): boolean {
  try {
    fs.lstatSync(lockFile(root, intakeId));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function readLaunchLock(root: string, intakeId: string): AssignmentLaunchLock | null {
  const file = lockFile(root, intakeId);
  if (!launchLockExists(root, intakeId)) return null;
  try {
    const stat = fs.lstatSync(file);
    const serialized = stat.isSymbolicLink()
      ? Buffer.from(fs.readlinkSync(file).replace(/^\.owner-/, ""), "base64url").toString("utf8")
      : fs.readFileSync(file, "utf8");
    const value = JSON.parse(serialized) as Partial<AssignmentLaunchLock>;
    if (value.version !== 1 || typeof value.launchId !== "string" || typeof value.pid !== "number") return null;
    return value as AssignmentLaunchLock;
  } catch {
    return null;
  }
}

function publicRecord(record: AssignmentIntakeRecord): Omit<AssignmentIntakeRecord, "sourceFile"> & { statusUrl: string } {
  const { sourceFile: _sourceFile, ...safe } = record;
  return { ...safe, statusUrl: `/api/assignments/${record.intakeId}/status` };
}

export function readAssignmentIntake(intakeId: string, options: AssignmentInboxOptions = {}): AssignmentIntakeRecord {
  if (!/^assignment-(math|spelling)-[a-f0-9]{20}$/.test(intakeId)) throw new Error("assignment_intake_id_invalid");
  const file = recordFile(resolveAssignmentInboxRoot(options), intakeId);
  if (!fs.existsSync(file)) throw new Error("assignment_intake_not_found");
  return JSON.parse(fs.readFileSync(file, "utf8")) as AssignmentIntakeRecord;
}

function writeAssignmentIntake(record: AssignmentIntakeRecord, options: AssignmentInboxOptions = {}): void {
  atomicWriteJson(recordFile(resolveAssignmentInboxRoot(options), record.intakeId), record);
}

export function storeAssignmentIntake(
  input: AssignmentUpload,
  options: AssignmentInboxOptions = {},
): { record: AssignmentIntakeRecord; reused: boolean } {
  const childId = input.childId.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(childId)) throw new Error("assignment_upload_child_invalid");
  if (input.domain !== "math" && input.domain !== "spelling") throw new Error("assignment_upload_domain_unsupported");
  const extension = EXTENSION_BY_MIME.get(input.mimeType);
  if (!extension) throw new Error("assignment_upload_mime_unsupported");
  const bytes = decodeUpload(input.dataBase64);
  if (!bytesMatchMime(bytes, input.mimeType)) throw new Error("assignment_upload_signature_mismatch");

  const fileHash = sha256(bytes);
  const intakeId = `assignment-${input.domain}-${sha256(`${childId}:${input.domain}:${fileHash}`).slice(0, 20)}`;
  const root = resolveAssignmentInboxRoot(options);
  const existingFile = recordFile(root, intakeId);
  if (fs.existsSync(existingFile)) {
    const record = readAssignmentIntake(intakeId, options);
    if (record.fileHash !== fileHash || record.childId !== childId || record.domain !== input.domain) {
      throw new Error("assignment_intake_identity_collision");
    }
    const expectedSource = path.join(root, intakeId, `source${extension}`);
    if (path.resolve(record.sourceFile) !== path.resolve(expectedSource)
      || !fs.existsSync(expectedSource)
      || !fs.statSync(expectedSource).isFile()
      || fs.statSync(expectedSource).size !== record.byteLength
      || sha256(fs.readFileSync(expectedSource)) !== fileHash) {
      throw new Error("assignment_intake_source_mismatch");
    }
    return { record, reused: true };
  }

  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.chmodSync(root, 0o700);
  const targetDir = path.join(root, intakeId);
  const temporaryDir = `${targetDir}.tmp-${crypto.randomUUID()}`;
  const sourceFile = path.join(targetDir, `source${extension}`);
  const now = (options.now ?? (() => new Date()))().toISOString();
  const record: AssignmentIntakeRecord = {
    version: 1,
    intakeId,
    childId,
    domain: input.domain,
    originalFilename: safeDisplayFilename(input.filename),
    mimeType: input.mimeType,
    fileHash,
    byteLength: bytes.length,
    sourceFile,
    status: "received",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    fs.mkdirSync(temporaryDir, { recursive: false, mode: 0o700 });
    fs.writeFileSync(path.join(temporaryDir, `source${extension}`), bytes, { flag: "wx", mode: 0o600 });
    fs.writeFileSync(path.join(temporaryDir, "job.json"), `${JSON.stringify(record, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(temporaryDir, targetDir);
    fs.chmodSync(targetDir, 0o700);
  } catch (error) {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
    if (fs.existsSync(existingFile)) return { record: readAssignmentIntake(intakeId, options), reused: true };
    throw error;
  }
  console.log(` 🎮 [assignment-inbox] [stored] [received] child=${childId} domain=${input.domain} intake=${intakeId}`);
  return { record, reused: false };
}

function processAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function assertImmutableSource(record: AssignmentIntakeRecord): void {
  if (!fs.existsSync(record.sourceFile)
    || !fs.statSync(record.sourceFile).isFile()
    || fs.statSync(record.sourceFile).size !== record.byteLength
    || sha256(fs.readFileSync(record.sourceFile)) !== record.fileHash) {
    throw new Error("assignment_intake_source_mismatch");
  }
}

function releaseLaunchLock(root: string, intakeId: string, launchId?: string): void {
  if (launchId) {
    const lock = readLaunchLock(root, intakeId);
    if (lock && lock.launchId !== launchId) return;
  }
  fs.rmSync(lockFile(root, intakeId), { force: true });
}

function applyVerifiedResult(record: AssignmentIntakeRecord, options: AssignmentInboxOptions = {}): AssignmentIntakeRecord | null {
  const root = resolveAssignmentInboxRoot(options);
  let result;
  try {
    result = readIngestionRunResult(resultFile(root, record.intakeId));
  } catch (error) {
    return {
      ...record,
      status: "failed_resumable",
      error: error instanceof Error ? error.message : String(error),
      updatedAt: (options.now ?? (() => new Date()))().toISOString(),
    };
  }
  if (!result) return null;
  if (record.launchId && result.launchId !== record.launchId) return null;
  if (result.childId !== record.childId || result.domain !== record.domain || result.intakeId !== record.intakeId) {
    return {
      ...record,
      status: "failed_resumable",
      error: "assignment_ingestion_result_identity_mismatch",
      updatedAt: (options.now ?? (() => new Date()))().toISOString(),
    };
  }
  if (result.sourceFileHash !== record.fileHash) {
    return {
      ...record,
      status: "failed_resumable",
      error: "assignment_ingestion_result_source_mismatch",
      updatedAt: (options.now ?? (() => new Date()))().toISOString(),
    };
  }
  return {
    ...record,
    status: result.status,
    ...(result.homeworkId ? { homeworkId: result.homeworkId } : {}),
    ...(result.error ? { error: result.error } : {}),
    updatedAt: result.completedAt,
  };
}

export function reconcileAssignmentIntake(
  intakeId: string,
  options: AssignmentInboxOptions = {},
): AssignmentIntakeRecord {
  const root = resolveAssignmentInboxRoot(options);
  const current = readAssignmentIntake(intakeId, options);
  const lock = readLaunchLock(root, intakeId);
  if (lock && processAlive(lock.pid) && lock.launchId !== current.launchId) return current;
  const verified = applyVerifiedResult(current, options);
  if (verified) {
    delete verified.pid;
    writeAssignmentIntake(verified, options);
    if (lock) releaseLaunchLock(root, intakeId, lock.launchId);
    return verified;
  }
  if (lock && processAlive(lock.pid)) return current;
  if (lock) releaseLaunchLock(root, intakeId, lock.launchId);
  else if (launchLockExists(root, intakeId)) releaseLaunchLock(root, intakeId);
  if (current.status !== "running") return current;
  if (processAlive(current.pid)) return current;
  const failed: AssignmentIntakeRecord = {
    ...current,
    status: "failed_resumable",
    error: "assignment_ingestion_worker_stopped_without_result",
    updatedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  delete failed.pid;
  delete failed.launchId;
  writeAssignmentIntake(failed, options);
  return failed;
}

export function claimAssignmentIngestionWorker(
  claim: AssignmentInboxWorkerClaim,
  options: AssignmentInboxOptions = {},
): boolean {
  const root = resolveAssignmentInboxRoot(options);
  const current = reconcileAssignmentIntake(claim.intakeId, options);
  if (current.status === "discovery_ready") return false;
  if (current.status === "running" && processAlive(current.pid)) return false;
  assertImmutableSource(current);
  const now = (options.now ?? (() => new Date()))().toISOString();
  try {
    const lock = {
      version: 1,
      launchId: claim.launchId,
      pid: claim.pid,
      claimedAt: now,
    } satisfies AssignmentLaunchLock;
    fs.symlinkSync(`.owner-${Buffer.from(JSON.stringify(lock)).toString("base64url")}`, lockFile(root, current.intakeId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    assertImmutableSource(current);
    fs.rmSync(resultFile(root, current.intakeId), { force: true });
    const running: AssignmentIntakeRecord = {
      ...current,
      status: "running",
      attempts: current.attempts + 1,
      updatedAt: now,
      launchId: claim.launchId,
      pid: claim.pid,
    };
    delete running.error;
    delete running.exitCode;
    writeAssignmentIntake(running, options);
    console.log(` 🎮 [assignment-inbox] [worker-claim] [acquired] intake=${current.intakeId} pid=${claim.pid}`);
    return true;
  } catch (error) {
    releaseLaunchLock(root, current.intakeId, claim.launchId);
    throw error;
  }
}

export function completeAssignmentIngestionWorker(
  completion: AssignmentInboxWorkerCompletion,
  options: AssignmentInboxOptions = {},
): AssignmentIntakeRecord {
  const root = resolveAssignmentInboxRoot(options);
  const latest = readAssignmentIntake(completion.intakeId, options);
  if (latest.launchId !== completion.launchId) return latest;
  const verified = applyVerifiedResult(latest, options);
  const finished: AssignmentIntakeRecord = completion.exitCode === 0 && verified?.status === "discovery_ready"
    ? { ...verified, exitCode: completion.exitCode }
    : {
        ...latest,
        status: "failed_resumable",
        exitCode: completion.exitCode,
        updatedAt: (options.now ?? (() => new Date()))().toISOString(),
        error: completion.error instanceof Error
          ? completion.error.message
          : completion.error
            ? String(completion.error)
            : verified?.status === "failed_resumable" && verified.error
              ? verified.error
              : completion.exitCode === 0
                ? "assignment_ingestion_completion_unverified"
                : `assignment_ingestion_exited:${completion.exitCode}`,
      };
  delete finished.pid;
  writeAssignmentIntake(finished, options);
  releaseLaunchLock(root, completion.intakeId, completion.launchId);
  console.log(` 🎮 [assignment-inbox] [ingestion] [${finished.status}] child=${latest.childId} domain=${latest.domain} intake=${latest.intakeId}`);
  return finished;
}

export function launchAssignmentIngestion(record: AssignmentIntakeRecord, options: LaunchOptions = {}): boolean {
  const root = resolveAssignmentInboxRoot(options);
  const current = reconcileAssignmentIntake(record.intakeId, options);
  if (current.status === "discovery_ready") return false;
  if (activeIntakes.has(current.intakeId) || launchLockExists(root, current.intakeId)) return false;

  const launchId = crypto.randomUUID();
  activeIntakes.add(current.intakeId);
  let child: ChildProcess | undefined;
  try {
    // macOS lockf owns the cross-process exclusion. Its advisory lock is
    // released by the kernel if the worker crashes, so stale metadata can
    // never let two provider workers run for the same immutable upload.
    child = (options.spawnProcess ?? spawn)("/usr/bin/lockf", [
      "-t",
      "0",
      operatingSystemLockFile(root, current.intakeId),
      "npx",
      "tsx",
      "src/scripts/runAssignmentInboxWorker.ts",
      `--intake-id=${current.intakeId}`,
      `--launch-id=${launchId}`,
      `--inbox-root=${root}`,
    ], {
      cwd: options.cwd ?? process.cwd(),
      env: { ...(options.env ?? process.env), SUNNY_NON_INTERACTIVE: "true" },
      stdio: "inherit",
    });
  } catch (error) {
    if (child) child.kill();
    activeIntakes.delete(current.intakeId);
    throw error;
  }
  let settled = false;
  const releaseActive = (failedBeforeClaim: boolean) => {
    if (settled) return;
    settled = true;
    activeIntakes.delete(current.intakeId);
    if (!failedBeforeClaim) return;
    const latest = reconcileAssignmentIntake(current.intakeId, options);
    if (latest.status !== "received" || launchLockExists(root, current.intakeId)) return;
    writeAssignmentIntake({
      ...latest,
      status: "failed_resumable",
      error: "assignment_inbox_worker_failed_before_claim",
      updatedAt: (options.now ?? (() => new Date()))().toISOString(),
    }, options);
    console.error(` 🎮 [assignment-inbox] [worker-dispatch] [failed] intake=${current.intakeId}`);
  };
  child.once("error", () => releaseActive(true));
  child.once("close", (code) => releaseActive(code !== 0 && code !== 75));
  console.log(` 🎮 [assignment-inbox] [ingestion] [dispatched] child=${current.childId} domain=${current.domain} intake=${current.intakeId} launch=${launchId}`);
  return true;
}

export async function runAssignmentInboxWorker(
  claim: AssignmentInboxWorkerClaim,
  options: WorkerOptions,
): Promise<AssignmentIntakeRecord | null> {
  if (!claimAssignmentIngestionWorker(claim, options)) return null;
  const root = resolveAssignmentInboxRoot(options);
  const record = readAssignmentIntake(claim.intakeId, options);
  try {
    const result = await options.ingest(record);
    writeIngestionRunResult(resultFile(root, record.intakeId), {
      version: 1,
      status: "discovery_ready",
      childId: record.childId,
      domain: record.domain,
      intakeId: record.intakeId,
      sourceFileHash: record.fileHash,
      launchId: claim.launchId,
      homeworkId: result.homeworkId,
      completedAt: new Date().toISOString(),
    });
    return completeAssignmentIngestionWorker({ ...claim, exitCode: 0 }, options);
  } catch (error) {
    writeIngestionRunResult(resultFile(root, record.intakeId), {
      version: 1,
      status: "failed_resumable",
      childId: record.childId,
      domain: record.domain,
      intakeId: record.intakeId,
      sourceFileHash: record.fileHash,
      launchId: claim.launchId,
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
    return completeAssignmentIngestionWorker({ ...claim, exitCode: 1, error }, options);
  }
}

export function resumeAssignmentInboxJobs(options: ResumeOptions = {}): { reconciled: number; launched: number } {
  const root = resolveAssignmentInboxRoot(options);
  if (!fs.existsSync(root)) return { reconciled: 0, launched: 0 };
  let reconciled = 0;
  let launched = 0;
  const launch = options.launch ?? ((record: AssignmentIntakeRecord) => launchAssignmentIngestion(record, options));
  for (const intakeId of fs.readdirSync(root).filter(name => /^assignment-(math|spelling)-[a-f0-9]{20}$/.test(name))) {
    const before = readAssignmentIntake(intakeId, options);
    const after = reconcileAssignmentIntake(intakeId, options);
    if (after.status !== before.status || after.updatedAt !== before.updatedAt) reconciled += 1;
    if (after.status === "received" && launch(after)) launched += 1;
  }
  if (reconciled || launched) {
    console.log(` 🎮 [assignment-inbox] [startup-recovery] [complete] reconciled=${reconciled} launched=${launched}`);
  }
  return { reconciled, launched };
}

function authorized(req: Request, token: string): boolean {
  const supplied = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const suppliedBytes = Buffer.from(supplied);
  const tokenBytes = Buffer.from(token);
  if (!supplied || suppliedBytes.length !== tokenBytes.length) return false;
  return crypto.timingSafeEqual(suppliedBytes, tokenBytes);
}

export function isTrustedAssignmentTransport(secure: boolean, remoteAddress: string | undefined): boolean {
  if (secure) return true;
  return remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress === "::ffff:127.0.0.1";
}

export function registerAssignmentInboxRoutes(app: Express, options: AssignmentInboxRouteOptions): void {
  app.post("/api/assignments", (req: Request, res: Response) => {
    if (!isTrustedAssignmentTransport(req.secure, req.socket.remoteAddress)) {
      return res.status(426).json({ error: "secure_transport_required" });
    }
    const token = options.deviceToken ?? process.env.SUNNY_DEVICE_API_TOKEN?.trim() ?? "";
    if (!token) return res.status(503).json({ error: "sunny_device_api_not_configured" });
    if (!authorized(req, token)) return res.status(401).json({ error: "unauthorized" });
    const childId = typeof req.body?.childId === "string" ? req.body.childId.trim().toLowerCase() : "";
    const domain = typeof req.body?.domain === "string" ? req.body.domain.trim().toLowerCase() : "";
    if (!options.childExists(childId)) return res.status(404).json({ error: "child_not_found" });
    if (domain !== "math" && domain !== "spelling") return res.status(422).json({ error: "assignment_upload_domain_unsupported" });
    try {
      const result = storeAssignmentIntake({
        childId,
        domain,
        filename: String(req.body?.filename ?? ""),
        mimeType: String(req.body?.mimeType ?? ""),
        dataBase64: String(req.body?.dataBase64 ?? ""),
      }, options);
      const launch = options.launch ?? ((record: AssignmentIntakeRecord) => launchAssignmentIngestion(record, options));
      let started: boolean;
      try {
        started = launch(result.record);
      } catch (error) {
        console.error(" 🎮 [assignment-inbox] [launch] [failed]", error);
        return res.status(500).json({ error: "assignment_ingestion_launch_failed" });
      }
      const response = publicRecord(readAssignmentIntake(result.record.intakeId, options));
      return res.status(started ? 202 : 200).json({ ...response, reused: result.reused });
    } catch (error) {
      console.error(" 🎮 [assignment-inbox] [upload] [failed]", error);
      const message = error instanceof Error ? error.message : String(error);
      const clientErrors = new Set([
        "assignment_upload_base64_invalid",
        "assignment_upload_size_invalid",
        "assignment_upload_child_invalid",
        "assignment_upload_domain_unsupported",
        "assignment_upload_mime_unsupported",
        "assignment_upload_signature_mismatch",
      ]);
      return clientErrors.has(message)
        ? res.status(422).json({ error: message })
        : res.status(500).json({ error: "assignment_upload_storage_failed" });
    }
  });

  app.get("/api/assignments/:intakeId/status", (req: Request, res: Response) => {
    if (!isTrustedAssignmentTransport(req.secure, req.socket.remoteAddress)) {
      return res.status(426).json({ error: "secure_transport_required" });
    }
    const token = options.deviceToken ?? process.env.SUNNY_DEVICE_API_TOKEN?.trim() ?? "";
    if (!token) return res.status(503).json({ error: "sunny_device_api_not_configured" });
    if (!authorized(req, token)) return res.status(401).json({ error: "unauthorized" });
    try {
      return res.json(publicRecord(reconcileAssignmentIntake(String(req.params.intakeId ?? ""), options)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(message === "assignment_intake_not_found" ? 404 : 422).json({ error: message });
    }
  });
}
