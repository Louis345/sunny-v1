import express from "express";
import type { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimAssignmentIngestionWorker,
  completeAssignmentIngestionWorker,
  isTrustedAssignmentTransport,
  readAssignmentIntake,
  reconcileAssignmentIntake,
  registerAssignmentInboxRoutes,
  runAssignmentInboxWorker,
  resumeAssignmentInboxJobs,
  launchAssignmentIngestion,
  storeAssignmentIntake,
  type AssignmentIntakeRecord,
} from "./assignmentInbox";

function inboxRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-assignment-inbox-"));
}

function pdfBase64(label = "assignment"): string {
  return Buffer.from(`%PDF-1.7\n${label}\n%%EOF`).toString("base64");
}

function writeSuccessfulResult(root: string, record: AssignmentIntakeRecord, launchId?: string): void {
  fs.writeFileSync(path.join(root, record.intakeId, "ingestion-result.json"), JSON.stringify({
    version: 1,
    status: "discovery_ready",
    childId: record.childId,
    domain: record.domain,
    intakeId: record.intakeId,
    sourceFileHash: record.fileHash,
    ...(launchId ? { launchId } : {}),
    homeworkId: `hw-${record.domain}-verified`,
    completedAt: new Date().toISOString(),
  }));
}

function writeFailedResult(root: string, record: AssignmentIntakeRecord, error: string, launchId?: string): void {
  fs.writeFileSync(path.join(root, record.intakeId, "ingestion-result.json"), JSON.stringify({
    version: 1,
    status: "failed_resumable",
    childId: record.childId,
    domain: record.domain,
    intakeId: record.intakeId,
    sourceFileHash: record.fileHash,
    ...(launchId ? { launchId } : {}),
    completedAt: new Date().toISOString(),
    error,
  }));
}

function writeAtomicLock(root: string, record: AssignmentIntakeRecord, launchId: string, pid = process.pid): void {
  const value = Buffer.from(JSON.stringify({
    version: 1,
    launchId,
    pid,
    claimedAt: new Date().toISOString(),
  })).toString("base64url");
  fs.symlinkSync(`.owner-${value}`, path.join(root, record.intakeId, "launch.lock"));
}

describe("assignment inbox", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    vi.restoreAllMocks();
  });

  it("stores one immutable source and reuses it for a duplicate upload", () => {
    const root = inboxRoot();
    const input = {
      childId: "ila",
      domain: "math" as const,
      filename: "Day 22 graphs.pdf",
      mimeType: "application/pdf",
      dataBase64: pdfBase64(),
    };

    const first = storeAssignmentIntake(input, { inboxRoot: root });
    const second = storeAssignmentIntake(input, { inboxRoot: root });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.record.intakeId).toBe(first.record.intakeId);
    expect(fs.readFileSync(first.record.sourceFile, "utf8")).toContain("assignment");
    expect(fs.readdirSync(root)).toEqual([first.record.intakeId]);
  });

  it("rejects a file whose bytes do not match its declared type", () => {
    expect(() => storeAssignmentIntake({
      childId: "ila",
      domain: "spelling",
      filename: "words.pdf",
      mimeType: "application/pdf",
      dataBase64: Buffer.from("not a PDF").toString("base64"),
    }, { inboxRoot: inboxRoot() })).toThrow("assignment_upload_signature_mismatch");
  });

  it("dispatches one durable worker and never repeats completed work", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila",
      domain: "math",
      filename: "graph.pdf",
      mimeType: "application/pdf",
      dataBase64: pdfBase64("one launch"),
    }, { inboxRoot: root });
    const child = new EventEmitter() as ChildProcess;
    Object.defineProperty(child, "pid", { value: process.pid });
    const spawnMock = vi.fn((..._args: unknown[]) => child);
    const spawnProcess = spawnMock as unknown as typeof spawn;

    expect(launchAssignmentIngestion(record, { inboxRoot: root, cwd: "/repo", env: {}, spawnProcess })).toBe(true);
    expect(launchAssignmentIngestion(record, { inboxRoot: root, cwd: "/repo", env: {}, spawnProcess })).toBe(false);
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(spawnProcess).toHaveBeenCalledWith("/usr/bin/lockf", [
      "-t", "0", path.join(root, record.intakeId, "worker.lock"),
      "npx", "tsx", "src/scripts/runAssignmentInboxWorker.ts", `--intake-id=${record.intakeId}`,
      expect.stringMatching(/^--launch-id=/), `--inbox-root=${root}`,
    ], expect.objectContaining({
      cwd: "/repo",
      env: expect.objectContaining({ SUNNY_NON_INTERACTIVE: "true" }),
    }));
    const launchId = (spawnMock.mock.calls[0]?.[1] as string[])
      .find(value => value.startsWith("--launch-id="))?.slice("--launch-id=".length) ?? "";
    expect(readAssignmentIntake(record.intakeId, { inboxRoot: root }).status).toBe("received");
    expect(claimAssignmentIngestionWorker({ intakeId: record.intakeId, launchId, pid: process.pid }, { inboxRoot: root })).toBe(true);

    writeSuccessfulResult(root, record, launchId);
    completeAssignmentIngestionWorker({ intakeId: record.intakeId, launchId, exitCode: 0 }, { inboxRoot: root });
    child.emit("close", 0);
    expect(readAssignmentIntake(record.intakeId, { inboxRoot: root })).toMatchObject({
      status: "discovery_ready",
      homeworkId: "hw-math-verified",
    });
    expect(launchAssignmentIngestion(record, { inboxRoot: root, cwd: "/repo", env: {}, spawnProcess })).toBe(false);
    expect(spawnProcess).toHaveBeenCalledTimes(1);
  });

  it("does not call an unverified zero exit Discovery ready", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "graph.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("zero without result"),
    }, { inboxRoot: root });
    const child = new EventEmitter() as ChildProcess;
    Object.defineProperty(child, "pid", { value: 9211 });
    const spawnMock = vi.fn((..._args: unknown[]) => child);
    const spawnProcess = spawnMock as unknown as typeof spawn;

    launchAssignmentIngestion(record, { inboxRoot: root, spawnProcess });
    const launchId = (spawnMock.mock.calls[0]?.[1] as string[])
      .find(value => value.startsWith("--launch-id="))?.slice("--launch-id=".length) ?? "";
    claimAssignmentIngestionWorker({ intakeId: record.intakeId, launchId, pid: process.pid }, { inboxRoot: root });
    completeAssignmentIngestionWorker({ intakeId: record.intakeId, launchId, exitCode: 0 }, { inboxRoot: root });

    expect(readAssignmentIntake(record.intakeId, { inboxRoot: root })).toMatchObject({
      status: "failed_resumable",
      error: "assignment_ingestion_completion_unverified",
    });
  });

  it("reports a worker process that exits before claiming the intake", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "dispatch.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("dispatch exits"),
    }, { inboxRoot: root });
    const child = new EventEmitter() as ChildProcess;
    const spawnProcess = vi.fn((..._args: unknown[]) => child) as unknown as typeof spawn;

    expect(launchAssignmentIngestion(record, { inboxRoot: root, spawnProcess })).toBe(true);
    child.emit("close", 1);

    expect(readAssignmentIntake(record.intakeId, { inboxRoot: root })).toMatchObject({
      status: "failed_resumable",
      error: "assignment_inbox_worker_failed_before_claim",
    });
  });

  it("treats an operating-system lock conflict as another worker owning the intake", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "contended.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("worker contention"),
    }, { inboxRoot: root });
    const child = new EventEmitter() as ChildProcess;
    const spawnProcess = vi.fn((..._args: unknown[]) => child) as unknown as typeof spawn;

    expect(launchAssignmentIngestion(record, { inboxRoot: root, spawnProcess })).toBe(true);
    child.emit("close", 75);

    expect(readAssignmentIntake(record.intakeId, { inboxRoot: root }).status).toBe("received");
  });

  it("reconciles a verified result after the API process lost its worker listener", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "spelling", filename: "words.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("restart recovery"),
    }, { inboxRoot: root });
    fs.writeFileSync(path.join(root, record.intakeId, "job.json"), JSON.stringify({
      ...record, status: "running", pid: 999_999_999, attempts: 1,
    }));
    writeSuccessfulResult(root, record);

    expect(reconcileAssignmentIntake(record.intakeId, { inboxRoot: root })).toMatchObject({
      status: "discovery_ready",
      homeworkId: "hw-spelling-verified",
    });
  });

  it("recovers inbox truth on startup and launches only work that never started", () => {
    const root = inboxRoot();
    const received = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "new.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("received"),
    }, { inboxRoot: root }).record;
    const completed = storeAssignmentIntake({
      childId: "ila", domain: "spelling", filename: "done.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("completed during restart"),
    }, { inboxRoot: root }).record;
    fs.writeFileSync(path.join(root, completed.intakeId, "job.json"), JSON.stringify({
      ...completed, status: "running", pid: 999_999_999, attempts: 1,
    }));
    writeSuccessfulResult(root, completed);
    const launch = vi.fn(() => true);

    expect(resumeAssignmentInboxJobs({ inboxRoot: root, launch })).toEqual({
      reconciled: 1,
      launched: 1,
    });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ intakeId: received.intakeId }));
    expect(readAssignmentIntake(completed.intakeId, { inboxRoot: root }).status).toBe("discovery_ready");
  });

  it("does not bypass a durable launch lock when in-memory state is absent", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "locked.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("locked"),
    }, { inboxRoot: root });
    fs.writeFileSync(path.join(root, record.intakeId, "launch.lock"), JSON.stringify({
      version: 1,
      launchId: "existing-launch",
      pid: process.pid,
      claimedAt: new Date().toISOString(),
    }), { mode: 0o600 });
    const spawnProcess = vi.fn(() => new EventEmitter() as ChildProcess) as unknown as typeof spawn;

    expect(launchAssignmentIngestion(record, { inboxRoot: root, spawnProcess })).toBe(false);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("lets the ingestion worker atomically claim ownership before any provider work", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "claim.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("claim ownership"),
    }, { inboxRoot: root });

    expect(claimAssignmentIngestionWorker({
      intakeId: record.intakeId,
      launchId: "launch-a",
      pid: process.pid,
    }, { inboxRoot: root })).toBe(true);
    expect(readAssignmentIntake(record.intakeId, { inboxRoot: root })).toMatchObject({
      status: "running",
      launchId: "launch-a",
      pid: process.pid,
      attempts: 1,
    });
    expect(fs.lstatSync(path.join(root, record.intakeId, "launch.lock")).isSymbolicLink()).toBe(true);
    expect(claimAssignmentIngestionWorker({
      intakeId: record.intakeId,
      launchId: "launch-b",
      pid: process.pid,
    }, { inboxRoot: root })).toBe(false);
  });

  it("runs the existing domain ingestion inside the lock-owning worker process", async () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "spelling", filename: "worker.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("worker command"),
    }, { inboxRoot: root });
    const ingest = vi.fn(async () => ({ homeworkId: "hw-spelling-worker" }));

    const result = await runAssignmentInboxWorker({
      intakeId: record.intakeId,
      launchId: "worker-launch",
      pid: process.pid,
    }, { inboxRoot: root, ingest });

    expect(ingest).toHaveBeenCalledOnce();
    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({
      intakeId: record.intakeId,
      childId: "ila",
      domain: "spelling",
      sourceFile: record.sourceFile,
      fileHash: record.fileHash,
    }));
    expect(result).toMatchObject({ status: "discovery_ready", homeworkId: "hw-spelling-worker" });
    expect(JSON.parse(fs.readFileSync(path.join(root, record.intakeId, "ingestion-result.json"), "utf8"))).toMatchObject({
      intakeId: record.intakeId,
      sourceFileHash: record.fileHash,
      homeworkId: "hw-spelling-worker",
    });
  });

  it("recovers a malformed legacy lock instead of leaving the intake permanently stuck", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "truncated.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("truncated lock"),
    }, { inboxRoot: root });
    fs.writeFileSync(path.join(root, record.intakeId, "launch.lock"), "{");

    expect(reconcileAssignmentIntake(record.intakeId, { inboxRoot: root }).status).toBe("received");
    expect(fs.existsSync(path.join(root, record.intakeId, "launch.lock"))).toBe(false);
    expect(claimAssignmentIngestionWorker({
      intakeId: record.intakeId,
      launchId: "recovered-launch",
      pid: process.pid,
    }, { inboxRoot: root })).toBe(true);
  });

  it("does not let a stale result or status poll remove a retry worker's live lock", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "retry-race.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("retry race"),
    }, { inboxRoot: root });
    fs.writeFileSync(path.join(root, record.intakeId, "job.json"), JSON.stringify({
      ...record,
      status: "failed_resumable",
      error: "previous attempt failed",
      launchId: "old-launch",
      attempts: 1,
    }));
    writeFailedResult(root, record, "previous attempt failed", "old-launch");
    writeAtomicLock(root, record, "new-launch");

    expect(reconcileAssignmentIntake(record.intakeId, { inboxRoot: root })).toMatchObject({
      status: "failed_resumable",
      launchId: "old-launch",
    });
    expect(fs.lstatSync(path.join(root, record.intakeId, "launch.lock")).isSymbolicLink()).toBe(true);
    expect(claimAssignmentIngestionWorker({
      intakeId: record.intakeId,
      launchId: "competing-launch",
      pid: process.pid,
    }, { inboxRoot: root })).toBe(false);
  });

  it("does not claim a running live worker even if its lock is unexpectedly absent", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "live.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("live worker"),
    }, { inboxRoot: root });
    fs.writeFileSync(path.join(root, record.intakeId, "job.json"), JSON.stringify({
      ...record,
      status: "running",
      launchId: "live-launch",
      pid: process.pid,
      attempts: 1,
    }));

    expect(claimAssignmentIngestionWorker({
      intakeId: record.intakeId,
      launchId: "competing-launch",
      pid: process.pid,
    }, { inboxRoot: root })).toBe(false);
  });

  it("recovers a lock left before worker ownership was committed", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "crash.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("pre-claim crash"),
    }, { inboxRoot: root });
    fs.writeFileSync(path.join(root, record.intakeId, "launch.lock"), JSON.stringify({
      version: 1,
      launchId: "crashed-launch",
      pid: 999_999_999,
    }), { mode: 0o600 });
    const launch = vi.fn(() => true);

    expect(reconcileAssignmentIntake(record.intakeId, { inboxRoot: root }).status).toBe("received");
    expect(fs.existsSync(path.join(root, record.intakeId, "launch.lock"))).toBe(false);
    expect(resumeAssignmentInboxJobs({ inboxRoot: root, launch })).toEqual({ reconciled: 0, launched: 1 });
    expect(launch).toHaveBeenCalledOnce();
  });

  it("does not accept a completion result that is not bound to this immutable upload", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "spelling", filename: "bound.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("bound result"),
    }, { inboxRoot: root });
    expect(claimAssignmentIngestionWorker({
      intakeId: record.intakeId,
      launchId: "launch-bound",
      pid: process.pid,
    }, { inboxRoot: root })).toBe(true);
    fs.writeFileSync(path.join(root, record.intakeId, "ingestion-result.json"), JSON.stringify({
      version: 1,
      status: "discovery_ready",
      childId: record.childId,
      domain: record.domain,
      homeworkId: "hw-spelling-wrong-source",
      completedAt: new Date().toISOString(),
      intakeId: record.intakeId,
      sourceFileHash: "wrong-hash",
      launchId: "launch-bound",
    }));

    expect(completeAssignmentIngestionWorker({
      intakeId: record.intakeId,
      launchId: "launch-bound",
      exitCode: 0,
    }, { inboxRoot: root })).toMatchObject({
      status: "failed_resumable",
      error: "assignment_ingestion_result_source_mismatch",
    });
  });

  it("revalidates the immutable source when the worker claims the job", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "tamper.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("worker source"),
    }, { inboxRoot: root });
    fs.writeFileSync(record.sourceFile, "%PDF-1.7\ntampered after upload\n%%EOF");

    expect(() => claimAssignmentIngestionWorker({
      intakeId: record.intakeId,
      launchId: "launch-tampered",
      pid: process.pid,
    }, { inboxRoot: root })).toThrow("assignment_intake_source_mismatch");
    expect(readAssignmentIntake(record.intakeId, { inboxRoot: root }).status).toBe("received");
    expect(fs.existsSync(path.join(root, record.intakeId, "launch.lock"))).toBe(false);
  });

  it("stores child uploads and metadata with private filesystem permissions", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila", domain: "math", filename: "private.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("private"),
    }, { inboxRoot: root });
    const mode = (file: string) => fs.statSync(file).mode & 0o777;

    expect(mode(root)).toBe(0o700);
    expect(mode(path.join(root, record.intakeId))).toBe(0o700);
    expect(mode(record.sourceFile)).toBe(0o600);
    expect(mode(path.join(root, record.intakeId, "job.json"))).toBe(0o600);
  });

  it("rejects insecure remote assignment transport while allowing loopback or TLS", () => {
    expect(isTrustedAssignmentTransport(false, "127.0.0.1")).toBe(true);
    expect(isTrustedAssignmentTransport(false, "::1")).toBe(true);
    expect(isTrustedAssignmentTransport(false, "192.168.1.50")).toBe(false);
    expect(isTrustedAssignmentTransport(true, "192.168.1.50")).toBe(true);
  });

  it("revalidates the immutable source before reusing an upload", () => {
    const root = inboxRoot();
    const input = {
      childId: "ila", domain: "math" as const, filename: "graph.pdf", mimeType: "application/pdf",
      dataBase64: pdfBase64("original"),
    };
    const { record } = storeAssignmentIntake(input, { inboxRoot: root });
    fs.writeFileSync(record.sourceFile, "%PDF-1.7\ntampered\n%%EOF");

    expect(() => storeAssignmentIntake(input, { inboxRoot: root })).toThrow("assignment_intake_source_mismatch");
  });

  it("records a truthful resumable reason when ingestion exits unsuccessfully", () => {
    const root = inboxRoot();
    const { record } = storeAssignmentIntake({
      childId: "ila",
      domain: "spelling",
      filename: "words.pdf",
      mimeType: "application/pdf",
      dataBase64: pdfBase64("failed launch"),
    }, { inboxRoot: root });
    const child = new EventEmitter() as ChildProcess;
    Object.defineProperty(child, "pid", { value: 8765 });
    const spawnMock = vi.fn((..._args: unknown[]) => child);
    const spawnProcess = spawnMock as unknown as typeof spawn;

    expect(launchAssignmentIngestion(record, { inboxRoot: root, spawnProcess })).toBe(true);
    const launchId = (spawnMock.mock.calls[0]?.[1] as string[])
      .find(value => value.startsWith("--launch-id="))?.slice("--launch-id=".length) ?? "";
    claimAssignmentIngestionWorker({ intakeId: record.intakeId, launchId, pid: process.pid }, { inboxRoot: root });
    writeFailedResult(root, record, "Learning profile not found for child: ila", launchId);
    completeAssignmentIngestionWorker({ intakeId: record.intakeId, launchId, exitCode: 3 }, { inboxRoot: root });
    child.emit("close", 3);

    expect(readAssignmentIntake(record.intakeId, { inboxRoot: root })).toMatchObject({
      status: "failed_resumable",
      exitCode: 3,
      error: "Learning profile not found for child: ila",
    });
  });

  it("requires a device token and starts the existing ingestion path without waiting", async () => {
    const root = inboxRoot();
    const launch = vi.fn((_record: AssignmentIntakeRecord) => true);
    const app = express();
    app.use(express.json({ limit: "18mb" }));
    registerAssignmentInboxRoutes(app, {
      inboxRoot: root,
      deviceToken: "local-secret",
      childExists: (childId) => childId === "ila",
      launch,
    });
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;

    const denied = await fetch(`http://127.0.0.1:${port}/api/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId: "ila", domain: "math", filename: "graph.pdf", mimeType: "application/pdf", dataBase64: pdfBase64() }),
    });
    expect(denied.status).toBe(401);

    const malformed = await fetch(`http://127.0.0.1:${port}/api/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer é" },
      body: JSON.stringify({ childId: "ila", domain: "math", filename: "graph.pdf", mimeType: "application/pdf", dataBase64: pdfBase64() }),
    });
    expect(malformed.status).toBe(401);

    const accepted = await fetch(`http://127.0.0.1:${port}/api/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer local-secret" },
      body: JSON.stringify({ childId: "ila", domain: "math", filename: "graph.pdf", mimeType: "application/pdf", dataBase64: pdfBase64() }),
    });
    const body = await accepted.json() as { intakeId: string; status: string; statusUrl: string };

    expect(accepted.status).toBe(202);
    expect(body.status).toBe("received");
    expect(body.statusUrl).toBe(`/api/assignments/${body.intakeId}/status`);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ childId: "ila", domain: "math" }));

    const status = await fetch(`http://127.0.0.1:${port}${body.statusUrl}`, {
      headers: { Authorization: "Bearer local-secret" },
    });
    expect(status.status).toBe(200);
    const statusBody = await status.json() as Record<string, unknown>;
    expect(statusBody).toMatchObject({ intakeId: body.intakeId, childId: "ila", domain: "math", status: "received" });
    expect(statusBody.sourceFile).toBeUndefined();
    expect(readAssignmentIntake(body.intakeId, { inboxRoot: root }).sourceFile).not.toBe("");
  });

  it("rejects unknown children and domains before writing an upload", async () => {
    const root = inboxRoot();
    const app = express();
    app.use(express.json({ limit: "18mb" }));
    registerAssignmentInboxRoutes(app, {
      inboxRoot: root,
      deviceToken: "local-secret",
      childExists: (childId) => childId === "ila",
      launch: vi.fn(() => true),
    });
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const headers = { "Content-Type": "application/json", Authorization: "Bearer local-secret" };

    const unknownChild = await fetch(`http://127.0.0.1:${port}/api/assignments`, {
      method: "POST", headers,
      body: JSON.stringify({ childId: "stranger", domain: "math", filename: "graph.pdf", mimeType: "application/pdf", dataBase64: pdfBase64() }),
    });
    expect(unknownChild.status).toBe(404);

    const unsupportedDomain = await fetch(`http://127.0.0.1:${port}/api/assignments`, {
      method: "POST", headers,
      body: JSON.stringify({ childId: "ila", domain: "science", filename: "graph.pdf", mimeType: "application/pdf", dataBase64: pdfBase64() }),
    });
    expect(unsupportedDomain.status).toBe(422);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("distinguishes an operational launch failure from invalid client input", async () => {
    const root = inboxRoot();
    const app = express();
    app.use(express.json({ limit: "18mb" }));
    registerAssignmentInboxRoutes(app, {
      inboxRoot: root,
      deviceToken: "local-secret",
      childExists: childId => childId === "ila",
      launch: () => { throw new Error("spawn EACCES"); },
    });
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer local-secret" },
      body: JSON.stringify({
        childId: "ila", domain: "math", filename: "graph.pdf", mimeType: "application/pdf", dataBase64: pdfBase64("spawn failure"),
      }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "assignment_ingestion_launch_failed" });
  });
});
