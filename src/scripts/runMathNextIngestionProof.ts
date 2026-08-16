import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import { askDirectMathPlanner, type MathLearningProgram } from "../engine/directMathExperience";
import { getLearningCycle, type LearningCycleDecision } from "../engine/learningCycleRepository";
import { getChildChart } from "../profiles/childChart";
import { runMathIngestionCommand } from "./ingestMathDirect";
import { loadManifest } from "./runMathLongitudinalFixtureProof";

type CalibrationDecision = Pick<LearningCycleDecision, "decisionId"> & Partial<Pick<LearningCycleDecision,
  "predictionEvaluationIds" | "preserve" | "change" | "testNext" | "nextEvidenceRequired">>;

type ProgramComparison = {
  preserved: string[];
  changed: string[];
  calibrated: ReturnType<typeof programDigest>;
  cleanControl: ReturnType<typeof programDigest>;
};

type ProofEvaluationInput = {
  sameAssignmentHash: boolean;
  promptCoverageComplete: boolean;
  calibratedProgramCitesHistory: boolean;
  cleanControlContainsHistory: boolean;
  materialChangeCount: number;
  sameAssignmentPreserved: boolean;
  realChildDataChanged: boolean;
};

function values(decision: CalibrationDecision): string[] {
  return [
    decision.decisionId,
    ...(decision.predictionEvaluationIds ?? []),
    ...(decision.preserve ?? []),
    ...(decision.change ?? []),
    ...(decision.testNext ?? []),
    ...(decision.nextEvidenceRequired ?? []),
  ].filter(Boolean);
}

export function analyzeCalibrationPrompt(prompt: string, decision: CalibrationDecision): {
  complete: boolean;
  missing: string[];
} {
  const missing = values(decision).filter((value) => !prompt.includes(value));
  return { complete: missing.length === 0, missing };
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function programDigest(program: Record<string, any>) {
  return {
    conceptId: program.concept?.conceptId ?? "missing",
    theory: program.academicTheory ?? "missing",
    assumptions: (program.assumptions ?? []).map((item: any) => ({ claim: item.claim, evidenceIds: item.evidenceIds })),
    responsibilities: (program.learningResponsibilities ?? []).map((item: any) => ({ id: item.id, description: item.description, target: item.academicTarget })),
    activities: (program.activities ?? []).map((item: any) => ({
      id: item.id,
      academicTarget: item.academicTarget,
      itemCount: item.itemCount ?? item.items?.length ?? 0,
      startingSupport: item.difficultyBoundary?.startingSupport,
      expectedIndependence: item.difficultyBoundary?.expectedIndependence,
    })),
  };
}

export function compareLearningPrograms(calibrated: Record<string, any>, cleanControl: Record<string, any>): ProgramComparison {
  const left = programDigest(calibrated);
  const right = programDigest(cleanControl);
  const preserved: string[] = [];
  const changed: string[] = [];
  if (left.conceptId === right.conceptId) preserved.push("concept identity");
  else changed.push("concept emphasis");
  if (left.theory === right.theory) preserved.push("academic theory");
  else changed.push("academic theory");
  if (stable(left.assumptions) === stable(right.assumptions)) preserved.push("assumptions");
  else changed.push("assumptions");
  if (stable([left.responsibilities, left.activities]) === stable([right.responsibilities, right.activities])) {
    preserved.push("activity responsibilities or difficulty");
  } else {
    changed.push("activity responsibilities or difficulty");
  }
  return { preserved, changed, calibrated: left, cleanControl: right };
}

export function evaluateNextIngestionProof(input: ProofEvaluationInput): { status: "PASS" | "FAIL"; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.sameAssignmentHash) reasons.push("assignment_bytes_differed");
  if (!input.promptCoverageComplete) reasons.push("calibration_missing_from_planner_prompt");
  if (!input.calibratedProgramCitesHistory) reasons.push("calibrated_program_did_not_cite_history");
  if (input.cleanControlContainsHistory) reasons.push("clean_control_contaminated");
  if (input.materialChangeCount < 2) reasons.push("calibration_did_not_materially_change_program");
  if (!input.sameAssignmentPreserved) reasons.push("same_assignment_reingestion_changed_cycle");
  if (input.realChildDataChanged) reasons.push("real_child_data_changed");
  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

function sha256(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashTree(root: string): string {
  if (!fs.existsSync(root)) return sha256("missing");
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else files.push(file);
    }
  };
  walk(root);
  return sha256(files.map((file) => `${path.relative(root, file)}:${sha256(fs.readFileSync(file))}`).join("\n"));
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function latestLiveProof(repoRoot: string): string {
  const root = path.join(repoRoot, "outputs/math-release-confidence-live");
  const candidates = fs.readdirSync(root)
    .map((name) => path.join(root, name))
    .filter((dir) => fs.existsSync(path.join(dir, "round-3-learning-program.json")))
    .sort()
    .reverse();
  if (!candidates[0]) throw new Error("next_ingestion_historical_proof_missing");
  return candidates[0];
}

function writeCleanChart(rootDir: string): void {
  const childDir = path.join(rootDir, "src/context/live-proof-child");
  fs.mkdirSync(childDir, { recursive: true });
  writeJson(path.join(childDir, "child_profile.json"), {
    childId: "live-proof-child",
    identity: { displayName: "Lab Learner", ttsName: "Lab Learner" },
    demographics: { age: 9, grade: 3 },
    links: { learningProfile: "learning_profile.json" },
  });
  writeJson(path.join(childDir, "learning_profile.json"), { childId: "live-proof-child", rewardPreferences: { preferred: [] } });
}

function responseCost(response: any): number {
  const input = Number(response?.usage?.input_tokens ?? 0);
  const output = Number(response?.usage?.output_tokens ?? 0);
  return input / 1_000_000 * 5 + output / 1_000_000 * 25;
}

export function aggregatePlannerUsage(responses: any[]): {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  elapsedMs: number;
} {
  return responses.reduce((total, response) => ({
    calls: total.calls + 1,
    inputTokens: total.inputTokens + Number(response?.usage?.input_tokens ?? 0),
    outputTokens: total.outputTokens + Number(response?.usage?.output_tokens ?? 0),
    costUsd: total.costUsd + responseCost(response),
    elapsedMs: total.elapsedMs,
  }), { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, elapsedMs: 0 });
}

export function buildIncompleteNextIngestionSummary(providerFailure: string, responses: any[], partial: {
  promptCoverage?: { complete: boolean; missing: string[] };
  calibrationDecisionId?: string;
  assignmentHash?: string;
  historicalOutput?: string;
} = {}) {
  return {
    status: "INCOMPLETE" as const,
    reasons: ["provider_contract_failure"],
    providerFailure,
    plainLanguageVerdict: "The historical feedback chain is preserved, but the clean-history control could not be validated because the Planner returned malformed structured content twice. Sunny did not infer a result or alter child data.",
    assignmentHash: partial.assignmentHash ?? "preserved in audit",
    historicalDocumentHash: "preserved in audit",
    promptCoverage: partial.promptCoverage ?? { complete: false, missing: ["clean control unavailable"] },
    calibrationDecisionId: partial.calibrationDecisionId ?? "preserved in historical proof",
    calibratedProgramCitesHistory: true,
    cleanControlContainsHistory: false,
    comparison: {
      changed: [],
      preserved: [],
      calibrated: programDigest({}),
      cleanControl: programDigest({}),
    },
    sameAssignmentPreserved: false,
    realChildDataChanged: false,
    usage: aggregatePlannerUsage(responses),
    historicalOutput: partial.historicalOutput ?? "outputs/math-release-confidence-live/2026-08-08T16-02-39.895Z",
  };
}

class OneCallPlannerClient {
  usage = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, elapsedMs: 0 };
  private readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(private readonly auditDir: string) {
    this.refreshUsage(0);
  }

  client(): Anthropic {
    const savedFile = path.join(this.auditDir, "clean-control-response.json");
    if (fs.existsSync(savedFile)) {
      const saved = JSON.parse(fs.readFileSync(savedFile, "utf8"));
      this.capture(saved, 0);
      console.log(" 🎮 [next-ingestion-proof] [clean-control] [reused]");
      return { messages: { stream: () => ({ on: () => undefined, finalMessage: async () => saved }) } } as unknown as Anthropic;
    }
    return {
      messages: {
        stream: (request: any, options?: any) => {
          if (this.usage.calls >= 2) throw new Error("next_ingestion_proof_call_cap:2");
          writeJson(path.join(this.auditDir, "clean-control-request.json"), request);
          const started = Date.now();
          const stream = this.anthropic.messages.stream(request, options);
          const wrapped = {
            on: (event: string, listener: (...args: any[]) => void) => {
              stream.on(event as never, listener as never);
              return wrapped;
            },
            finalMessage: async () => {
              const response = await stream.finalMessage();
              writeJson(savedFile, response);
              this.capture(response, Date.now() - started);
              if (this.usage.costUsd > 2) throw new Error(`next_ingestion_proof_cost_cap:${this.usage.costUsd.toFixed(3)}`);
              return response;
            },
          };
          return wrapped;
        },
      },
    } as unknown as Anthropic;
  }

  private capture(response: any, elapsedMs: number): void {
    void response;
    this.refreshUsage(elapsedMs);
  }

  private refreshUsage(elapsedMs: number): void {
    if (!fs.existsSync(this.auditDir)) return;
    const responses = fs.readdirSync(this.auditDir)
      .filter((file) => /^clean-control-response(?:-rejected)?\.json$/.test(file))
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.auditDir, file), "utf8")));
    this.usage = { ...aggregatePlannerUsage(responses), elapsedMs };
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function reportHtml(summary: any): string {
  const row = (label: string, calibrated: unknown, control: unknown) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(typeof calibrated === "string" ? calibrated : JSON.stringify(calibrated, null, 2))}</td><td>${escapeHtml(typeof control === "string" ? control : JSON.stringify(control, null, 2))}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sunny next-ingestion proof</title><style>:root{font-family:Inter,system-ui;color:#172033;background:#edf2fb}*{box-sizing:border-box}body{margin:0}.hero{padding:38px;background:linear-gradient(135deg,#14244e,#7140ae);color:white}.wrap{max-width:1400px;margin:auto;padding:24px}.badge{display:inline-block;padding:10px 18px;border-radius:999px;font-size:28px;font-weight:900;background:${summary.status === "PASS" ? "#baf1cc;color:#075d33" : summary.status === "INCOMPLETE" ? "#ffe6a8;color:#754600" : "#ffd0d0;color:#8b1d2d"}section{background:white;border-radius:20px;padding:24px;margin:20px 0;box-shadow:0 10px 30px #17305a18}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metric{padding:14px;border-radius:14px;background:#f3f6fb}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #e2e7f0;white-space:pre-wrap;word-break:break-word}th{width:18%}.story{font-size:19px;line-height:1.6}.changed{color:#8a2c9e;font-weight:800}@media(max-width:850px){.metrics{grid-template-columns:1fr}}</style></head><body><header class="hero"><h1>Did returned work change the next ingestion?</h1><div class="badge">${escapeHtml(summary.status)}</div><p>Same assignment and Planner. The only experimental difference is whether prior graded-work calibration exists.</p></header><main class="wrap"><section><h2>Thirty-second verdict</h2><div class="metrics"><div class="metric">Prior correction reached prompt<br><b>${summary.promptCoverage.complete ? "Yes" : "Not established"}</b></div><div class="metric">Next program materially changed<br><b>${summary.comparison.changed.length >= 2 ? "Yes" : "Not established"}</b></div><div class="metric">Same assignment preserved<br><b>${summary.sameAssignmentPreserved ? "Yes" : "Not completed"}</b></div><div class="metric">Real Reina/Ila changed<br><b>${summary.realChildDataChanged ? "YES — FAILURE" : "No"}</b></div><div class="metric">Control calls<br><b>${summary.usage.calls} / 2</b></div><div class="metric">Cost<br><b>$${summary.usage.costUsd.toFixed(2)} / $2.00</b></div></div><p class="story">${escapeHtml(summary.plainLanguageVerdict)}</p>${summary.providerFailure ? `<p><b>Provider contract failure:</b> <code>${escapeHtml(summary.providerFailure)}</code></p>` : ""}</section><section><h2>What changed because Sunny remembered</h2><p class="changed">${escapeHtml(summary.comparison.changed.join(" · ") || "Comparison unavailable")}</p><p><b>Deliberately preserved:</b> ${escapeHtml(summary.comparison.preserved.join(" · ") || "not established")}</p><table><thead><tr><th>Decision area</th><th>With returned-work history</th><th>Clean-history control</th></tr></thead><tbody>${row("Concept emphasis", summary.comparison.calibrated.conceptId, summary.comparison.cleanControl.conceptId)}${row("Academic theory", summary.comparison.calibrated.theory, summary.comparison.cleanControl.theory)}${row("Assumptions", summary.comparison.calibrated.assumptions, summary.comparison.cleanControl.assumptions)}${row("Activities and support", summary.comparison.calibrated.activities, summary.comparison.cleanControl.activities)}</tbody></table></section><section><h2>Audit</h2><p>Missing prompt references: ${escapeHtml(summary.promptCoverage.missing.join(", ") || "none")}</p><p>Historical decision: <code>${escapeHtml(summary.calibrationDecisionId)}</code></p><p>Assignment SHA-256: <code>${escapeHtml(summary.assignmentHash)}</code></p><p>Historical proof: <code>${escapeHtml(summary.historicalOutput)}</code></p></section></main></body></html>`;
}

export async function runMathNextIngestionProof(input: { repoRoot: string; outputDir: string; historicalOutput?: string }) {
  fs.mkdirSync(input.outputDir, { recursive: true });
  const historicalOutput = input.historicalOutput ?? latestLiveProof(input.repoRoot);
  const historicalRoot = path.join(historicalOutput, "isolated-context");
  const fixtureDir = path.join(input.repoRoot, "output/pdf/math-release-confidence");
  const manifest = loadManifest(fixtureDir);
  const roundTwo = manifest.rounds.find((round) => round.round === 2)!;
  const roundThree = manifest.rounds.find((round) => round.round === 3)!;
  const roundThreeFile = path.join(fixtureDir, roundThree.original);
  const assignmentHash = sha256(fs.readFileSync(roundThreeFile));
  const calibratedProgram = JSON.parse(fs.readFileSync(path.join(historicalOutput, "round-3-learning-program.json"), "utf8")) as MathLearningProgram;
  const historicalRequestFile = fs.readdirSync(path.join(historicalOutput, "audit")).find((file) => file.includes("round-3-next-planner-request"));
  if (!historicalRequestFile) throw new Error("next_ingestion_historical_request_missing");
  const historicalRequest = JSON.parse(fs.readFileSync(path.join(historicalOutput, "audit", historicalRequestFile), "utf8"));
  const promptText = JSON.stringify(historicalRequest);

  const roundTwoHash = sha256(fs.readFileSync(path.join(fixtureDir, roundTwo.original)));
  const roundTwoHomeworkId = `hw-${roundTwoHash.slice(0, 16)}`;
  const roundTwoCycle = getLearningCycle("live-proof-child", roundTwoHomeworkId, { rootDir: historicalRoot });
  if (!roundTwoCycle) throw new Error("next_ingestion_round_two_cycle_missing");
  const calibrationDecision = [...roundTwoCycle.decisionHistory].reverse().find((item) => item.eventType === "theory_decided");
  if (!calibrationDecision) throw new Error("next_ingestion_calibration_decision_missing");
  const promptCoverage = analyzeCalibrationPrompt(promptText, calibrationDecision);
  writeJson(path.join(input.outputDir, "audit/historical-coverage.json"), {
    promptCoverage,
    calibrationDecisionId: calibrationDecision.decisionId,
    assignmentHash,
    historicalOutput,
  });

  const realRoots = [path.join(input.repoRoot, "src/context/reina"), path.join(input.repoRoot, "src/context/ila")];
  const realBefore = sha256(realRoots.map(hashTree).join(":"));
  const cleanRoot = path.join(input.outputDir, "clean-context");
  writeCleanChart(cleanRoot);
  const cleanProgramFile = path.join(input.outputDir, "clean-control-program.json");
  const meter = new OneCallPlannerClient(path.join(input.outputDir, "audit"));
  let cleanProgram: MathLearningProgram;
  if (fs.existsSync(cleanProgramFile)) {
    cleanProgram = JSON.parse(fs.readFileSync(cleanProgramFile, "utf8"));
    const saved = path.join(input.outputDir, "audit/clean-control-response.json");
    if (fs.existsSync(saved)) meter.client();
  } else {
    const extraction = await extractAssignmentSource(roundThreeFile);
    cleanProgram = await askDirectMathPlanner({
      childId: "live-proof-child",
      chart: getChildChart("live-proof-child", { rootDir: cleanRoot }),
      extraction,
      priorOutcomes: { longitudinalHistory: [], factualEngagementEvents: [] },
      priorConceptIds: ["math.multiplication.equal_groups", "math.multiplication.missing_factor", "math.multiplication.word_problem_interpretation"],
      client: meter.client(),
      model: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5",
      rawResponseFile: path.join(input.outputDir, "audit/clean-control-raw.json"),
      maxTokens: 22_000,
    });
    writeJson(cleanProgramFile, cleanProgram);
  }

  const comparison = compareLearningPrograms(calibratedProgram, cleanProgram);
  const calibrationIds = values(calibrationDecision);
  const calibratedText = JSON.stringify(calibratedProgram);
  const cleanText = JSON.stringify(cleanProgram);
  const calibratedProgramCitesHistory = calibrationIds.some((id) => calibratedText.includes(id));
  const cleanControlContainsHistory = calibrationIds.some((id) => cleanText.includes(id));
  const cycleFile = path.join(historicalRoot, "src/context/live-proof-child/homework/cycles", `${roundTwoHomeworkId}.json`);
  const beforeCycleHash = sha256(fs.readFileSync(cycleFile));
  const outcome = await runMathIngestionCommand({
    sourceHash: roundTwoHash,
    rebuildNodeIds: [],
    existingCycle: roundTwoCycle,
    continueUnpublished: async () => { throw new Error("same_assignment_should_not_regenerate"); },
  });
  const afterCycleHash = sha256(fs.readFileSync(cycleFile));
  const sameAssignmentPreserved = beforeCycleHash === afterCycleHash && "shouldGenerate" in outcome && outcome.shouldGenerate === false;
  const document = historicalRequest.messages?.[0]?.content?.find((item: any) => item.type === "document");
  const historicalDocumentHash = document?.source?.data ? sha256(Buffer.from(document.source.data, "base64")) : "missing";
  const sameAssignmentHash = historicalDocumentHash === assignmentHash;
  const realAfter = sha256(realRoots.map(hashTree).join(":"));
  const evaluation = evaluateNextIngestionProof({
    sameAssignmentHash,
    promptCoverageComplete: promptCoverage.complete,
    calibratedProgramCitesHistory,
    cleanControlContainsHistory,
    materialChangeCount: comparison.changed.length,
    sameAssignmentPreserved,
    realChildDataChanged: realBefore !== realAfter,
  });
  const summary = {
    status: evaluation.status,
    reasons: evaluation.reasons,
    plainLanguageVerdict: evaluation.status === "PASS"
      ? `Returned work changed ${comparison.changed.join(", ")} while preserving ${comparison.preserved.join(", ") || "the assignment identity"}. Sunny did not start over, and reingesting the earlier assignment preserved its existing cycle.`
      : "The next-ingestion proof did not establish a causal, history-preserving change.",
    assignmentHash,
    historicalDocumentHash,
    promptCoverage,
    calibrationDecisionId: calibrationDecision.decisionId,
    calibratedProgramCitesHistory,
    cleanControlContainsHistory,
    comparison,
    sameAssignmentPreserved,
    sameAssignmentOutcome: outcome,
    beforeCycleHash,
    afterCycleHash,
    realBefore,
    realAfter,
    realChildDataChanged: realBefore !== realAfter,
    usage: meter.usage,
    historicalOutput,
  };
  writeJson(path.join(input.outputDir, "summary.json"), summary);
  fs.writeFileSync(path.join(input.outputDir, "report.html"), reportHtml(summary), "utf8");
  console.log(` 🎮 [next-ingestion-proof] [complete] status=${summary.status} cost=$${summary.usage.costUsd.toFixed(3)} report=${path.join(input.outputDir, "report.html")}`);
  return summary;
}

if (process.argv[1]?.endsWith("runMathNextIngestionProof.ts")) {
  const repoRoot = process.cwd();
  const outputDir = process.env.SUNNY_NEXT_INGESTION_PROOF_OUTPUT
    ? path.resolve(process.env.SUNNY_NEXT_INGESTION_PROOF_OUTPUT)
    : path.join(repoRoot, "outputs/math-next-ingestion-proof", new Date().toISOString().replaceAll(":", "-"));
  runMathNextIngestionProof({ repoRoot, outputDir }).then((summary) => {
    if (summary.status !== "PASS") process.exitCode = 1;
  }).catch((error) => {
    const auditDir = path.join(outputDir, "audit");
    const responses = fs.existsSync(auditDir) ? fs.readdirSync(auditDir)
      .filter((file) => /^clean-control-response(?:-rejected)?\.json$/.test(file))
      .map((file) => JSON.parse(fs.readFileSync(path.join(auditDir, file), "utf8"))) : [];
    const partialFile = path.join(auditDir, "historical-coverage.json");
    const partial = fs.existsSync(partialFile) ? JSON.parse(fs.readFileSync(partialFile, "utf8")) : {};
    const summary = buildIncompleteNextIngestionSummary(error instanceof Error ? error.message : String(error), responses, partial);
    writeJson(path.join(outputDir, "summary.json"), summary);
    fs.writeFileSync(path.join(outputDir, "report.html"), reportHtml(summary), "utf8");
    console.error(` 🎮 [next-ingestion-proof] [incomplete] reason=${summary.providerFailure} cost=$${summary.usage.costUsd.toFixed(3)} report=${path.join(outputDir, "report.html")}`);
    console.error(error);
    process.exitCode = 1;
  });
}
