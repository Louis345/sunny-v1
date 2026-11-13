import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type IngestionRunResult = {
  version: 1;
  status: "discovery_ready" | "failed_resumable";
  childId: string;
  domain: "math" | "spelling";
  intakeId?: string;
  sourceFileHash?: string;
  launchId?: string;
  homeworkId?: string;
  completedAt: string;
  error?: string;
};

export type IngestionRunBinding = Pick<IngestionRunResult, "intakeId" | "sourceFileHash">;

export function resultFileFromArgs(argv: string[]): string | null {
  const value = argv.find(item => item.startsWith("--result-file="))?.slice("--result-file=".length).trim();
  return value ? path.resolve(value) : null;
}

export function resultBindingFromArgs(argv: string[]): IngestionRunBinding {
  const value = (name: string) => argv.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3).trim();
  const intakeId = value("intake-id");
  const sourceFileHash = value("source-file-hash");
  if (!intakeId && !sourceFileHash) return {};
  if (!intakeId || !sourceFileHash) throw new Error("ingestion_run_binding_incomplete");
  return { intakeId, sourceFileHash };
}

export function writeIngestionRunResult(file: string | null, result: IngestionRunResult): void {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(file), 0o700);
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

export function readIngestionRunResult(file: string): IngestionRunResult | null {
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<IngestionRunResult>;
  if (value.version !== 1
    || (value.status !== "discovery_ready" && value.status !== "failed_resumable")
    || (value.domain !== "math" && value.domain !== "spelling")
    || typeof value.childId !== "string"
    || typeof value.completedAt !== "string"
    || !Number.isFinite(Date.parse(value.completedAt))
    || (value.intakeId !== undefined && typeof value.intakeId !== "string")
    || (value.sourceFileHash !== undefined && typeof value.sourceFileHash !== "string")
    || (value.launchId !== undefined && typeof value.launchId !== "string")
    || (value.status === "discovery_ready" && typeof value.homeworkId !== "string")
    || (value.status === "failed_resumable" && typeof value.error !== "string")) {
    throw new Error("ingestion_run_result_invalid");
  }
  return value as IngestionRunResult;
}
