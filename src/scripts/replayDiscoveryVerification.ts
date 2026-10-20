import fs from "node:fs";
import path from "node:path";
import {
  hashDiscoveryContract,
  verifyDiscoveryRuntimeScoring,
  type MathDiscoveryEvaluationContract,
} from "../engine/adaptiveMathDiscovery";
import { DISCOVERY_VERIFIER_VERSION, type JourneyCapture } from "../engine/discoveryVisualReview";
import { hashDirectory, type CertificationRunManifest } from "./sunnyCertification";

/**
 * Zero-cost replay: runs saved Discovery bytes through the current local
 * browser/scoring verifier. It never calls a provider, never repairs, and
 * writes its proof under `replay/` so production acceptance is untouched.
 */
export type ReplayCandidate = {
  source: "builder" | "reviewed";
  htmlHash: string;
  passed: boolean;
  failures: string[];
  captures: JourneyCapture[];
  outputDir: string;
};

export type ReplayReport = {
  version: 1;
  draftDir: string;
  verifierVersion: number;
  academicHash: string;
  passed: boolean;
  /** The bytes an ordinary resume would review under the current checkpoint rules. */
  resumeCandidate: ReplayCandidate["source"];
  providerCalls: number;
  protectedDirsUnchanged: boolean;
  elapsedMs: number;
  candidates: ReplayCandidate[];
};

type AcademicItems = Pick<MathDiscoveryEvaluationContract, "items">;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function savedCandidates(draftDir: string): Array<{ source: ReplayCandidate["source"]; html: string }> {
  const candidates: Array<{ source: ReplayCandidate["source"]; html: string }> = [];
  const builderFile = path.join(draftDir, "discovery-builder.json");
  if (fs.existsSync(builderFile)) {
    const html = readJson<{ html?: unknown }>(builderFile).html;
    if (typeof html === "string") candidates.push({ source: "builder", html });
  }
  const checkpointFile = path.join(draftDir, "visual-review", "visual-review-checkpoint.json");
  if (fs.existsSync(checkpointFile)) {
    const html = readJson<{ html?: unknown }>(checkpointFile).html;
    if (typeof html === "string" && !candidates.some(candidate => candidate.html === html)) candidates.push({ source: "reviewed", html });
  }
  if (candidates.length === 0) throw new Error(`replay_saved_html_missing:${draftDir}`);
  return candidates;
}

export async function replaySavedDiscovery(input: { draftDir: string; protectedDirs?: string[] }): Promise<ReplayReport> {
  const startedAt = Date.now();
  const draftDir = path.resolve(input.draftDir);
  const academic = readJson<AcademicItems>(path.join(draftDir, "discovery-academic.json"));
  const protectedBefore = (input.protectedDirs ?? []).map(dir => hashDirectory(dir));
  const replayRoot = path.join(draftDir, "replay", `v${DISCOVERY_VERIFIER_VERSION}`);
  let providerCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (resource: Parameters<typeof fetch>[0]) => {
    providerCalls += 1;
    throw new Error(`replay_network_forbidden:${String(resource)}`);
  }) as typeof fetch;
  const candidates: ReplayCandidate[] = [];
  try {
    for (const candidate of savedCandidates(draftDir)) {
      const htmlHash = hashDiscoveryContract(candidate.html);
      const outputDir = path.join(replayRoot, `${candidate.source}-${htmlHash.slice(0, 12)}`);
      fs.rmSync(outputDir, { recursive: true, force: true });
      try {
        const screenshots = await verifyDiscoveryRuntimeScoring({ html: candidate.html, academic, outputDir });
        candidates.push({ source: candidate.source, htmlHash, passed: true, failures: [], captures: screenshots.captures ?? [], outputDir });
      } catch (error) {
        const detail = error as { issues?: string[]; captures?: JourneyCapture[] };
        const failures = Array.isArray(detail.issues) ? detail.issues : [error instanceof Error ? error.message : String(error)];
        candidates.push({ source: candidate.source, htmlHash, passed: false, failures, captures: detail.captures ?? [], outputDir });
      }
      const result = candidates.at(-1)!;
      console.log(` 🎮 [discovery-replay] [candidate] [${result.passed ? "passed" : "failed"}] source=${result.source} hash=${htmlHash.slice(0, 12)} academic=${result.captures.filter(row => row.kind === "academic_item").length} transitions=${result.captures.filter(row => row.kind === "transition").length}${result.passed ? "" : ` failures=${result.failures.join(" | ")}`}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  const protectedDirsUnchanged = (input.protectedDirs ?? []).every((dir, index) => hashDirectory(dir) === protectedBefore[index]);
  const report: ReplayReport = {
    version: 1,
    draftDir,
    verifierVersion: DISCOVERY_VERIFIER_VERSION,
    academicHash: hashDiscoveryContract(academic.items),
    passed: candidates.every(candidate => candidate.passed) && protectedDirsUnchanged && providerCalls === 0,
    resumeCandidate: candidates.some(candidate => candidate.source === "reviewed") ? "reviewed" : "builder",
    providerCalls,
    protectedDirsUnchanged,
    elapsedMs: Math.max(1, Date.now() - startedAt),
    candidates,
  };
  fs.mkdirSync(replayRoot, { recursive: true });
  fs.writeFileSync(path.join(replayRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(` 🎮 [discovery-replay] [complete] [${report.passed ? "passed" : "failed"}] verifier=${report.verifierVersion} providerCalls=${providerCalls} protectedUnchanged=${protectedDirsUnchanged} elapsedMs=${report.elapsedMs} report=${path.join(replayRoot, "report.json")}`);
  return report;
}

function resolveRunDraft(runDir: string): { draftDir: string; protectedDirs: string[] } {
  const manifest = readJson<CertificationRunManifest>(path.join(runDir, "certification-run.json"));
  const drafts = path.join(manifest.workspaceDir, "src", "context", manifest.sourceChildId, "homework", "direct-drafts");
  const ids = manifest.homeworkId
    ? [manifest.homeworkId]
    : fs.existsSync(drafts) ? fs.readdirSync(drafts).filter(name => name.startsWith(`hw-${manifest.homeworkDomain}-`)) : [];
  if (ids.length !== 1) throw new Error(`replay_homework_identity_ambiguous:${ids.join(",") || "none"}`);
  return { draftDir: path.join(drafts, ids[0]!), protectedDirs: [manifest.sourceChildDir] };
}

function arg(name: string): string | undefined {
  return process.argv.slice(2).find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const run = arg("run");
  const draft = arg("draft");
  if (!run === !draft) throw new Error("replay_requires_exactly_one_of:--run=<certification run dir>|--draft=<direct-drafts/hw-* dir>");
  const target = run ? resolveRunDraft(path.resolve(run)) : { draftDir: path.resolve(draft!), protectedDirs: [] };
  const report = await replaySavedDiscovery(target);
  console.log(`\nReplay ${report.passed ? "PASSED" : "FAILED"} in ${(report.elapsedMs / 1000).toFixed(1)}s — verifier v${report.verifierVersion}, provider calls ${report.providerCalls}`);
  for (const candidate of report.candidates) {
    console.log(`  ${candidate.source.padEnd(8)} ${candidate.htmlHash.slice(0, 12)} ${candidate.passed ? "pass" : "FAIL"}  ${candidate.outputDir}`);
  }
  console.log(`  Resume would review: ${report.resumeCandidate}`);
  if (!report.passed) process.exitCode = 1;
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(`Discovery replay failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
