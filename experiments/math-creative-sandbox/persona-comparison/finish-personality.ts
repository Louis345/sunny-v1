import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";

function estimateCost(inputTokens: number, outputTokens: number): number {
  return inputTokens / 1_000_000 * 5 + outputTokens / 1_000_000 * 25;
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function extractHtml(response: Anthropic.Messages.Message): string {
  const text = response.content.filter((item) => item.type === "text").map((item) => item.type === "text" ? item.text : "").join("\n");
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const match = fenced.match(/<!doctype html[\s\S]*<\/html>/i) ?? fenced.match(/<html[\s\S]*<\/html>/i);
  if (!match) throw new Error("complete_html_missing_at_78k");
  return match[0];
}

async function main(): Promise<void> {
  const runDir = process.argv[2];
  if (!runDir) throw new Error("usage: finish-personality.ts /absolute/run/path");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY_missing");
  const requestFile = path.join(runDir, "audit/call-08-experience-engineer-personality-request.json");
  const usageFile = path.join(runDir, "audit/usage.json");
  const summaryFile = path.join(runDir, "summary.json");
  const reportFile = path.join(runDir, "report.html");
  if (process.argv.includes("--refresh-report")) {
    const usage = JSON.parse(fs.readFileSync(usageFile, "utf8"));
    const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
    summary.plannedCallCeiling = 8;
    summary.callCeiling = usage.length;
    summary.engineerTokenCeilings = { sharedInitial: 52_000, personalityRecovery: 78_000 };
    writeJson(summaryFile, summary);
    let report = fs.readFileSync(reportFile, "utf8").replace(
      /JSON\.parse\(atob\('([^']+)'\)\)/,
      "JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('$1'),c=>c.charCodeAt(0))))",
    );
    report = report.replace(
      "All fresh arms use the same multiplication contract, factual Reina evidence, models, reasoning settings, and 52k implementation ceiling.",
      "Both fresh arms started with the same multiplication contract, factual Reina evidence, models, reasoning settings, and 52k implementation ceiling; the persona arm's disclosed 78k recovery is counted in its reliability and cost.",
    );
    report = report.replace(
      "Neutral versus personality is the strict controlled comparison. The historical candidate is the preserved Reina-backed quality floor and had a different generation architecture, so it is a practical—not scientific—staging comparison.",
      "Neutral versus personality is the strict controlled comparison through design. The historical candidate is the preserved Reina-backed quality floor and had a different generation architecture, so it is a practical—not scientific—staging comparison. The persona implementation required extra compute after failing at the shared ceiling.",
    );
    const encodedMatch = report.match(/atob\('([^']+)'\)/);
    if (!encodedMatch) throw new Error("report_payload_missing");
    const payload = JSON.parse(Buffer.from(encodedMatch[1], "base64").toString("utf8"));
    payload.summary = summary;
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    report = report.replace(encodedMatch[1], encoded);
    fs.writeFileSync(reportFile, report, "utf8");
    console.log(` 🎮 [reina-persona-comparison] [report] [refreshed] path=${reportFile}`);
    return;
  }
  const request = JSON.parse(fs.readFileSync(requestFile, "utf8"));
  request.max_tokens = 78_000;
  const usage = JSON.parse(fs.readFileSync(usageFile, "utf8"));
  const priorSpend = usage.reduce((sum: number, item: { costUsd: number }) => sum + item.costUsd, 0);
  if (priorSpend + 1.7 > 6) throw new Error("recovery_would_exceed_6_dollar_ceiling");

  writeJson(path.join(runDir, "audit/call-09-experience-engineer-personality-78k-request.json"), request);
  console.log(` 🎮 [reina-persona-comparison] [personality-78k] [running] priorSpent=$${priorSpend.toFixed(3)}`);
  const started = Date.now();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.stream(request, { timeout: 1_200_000 }).finalMessage();
  const inputTokens = response.usage.input_tokens ?? 0;
  const outputTokens = response.usage.output_tokens ?? 0;
  const costUsd = estimateCost(inputTokens, outputTokens);
  const record = {
    call: 9,
    arm: "personality",
    stage: "experience-engineer",
    model: request.model,
    status: "complete",
    inputTokens,
    outputTokens,
    costUsd,
    elapsedMs: Date.now() - started,
    stopReason: response.stop_reason ?? "unknown",
    note: "Fresh same-prompt recovery at 78k after the personality arm exhausted the shared 52k ceiling. The failed first attempt remains in cost and reliability totals.",
  };
  usage.push(record);
  writeJson(path.join(runDir, "audit/call-09-experience-engineer-personality-78k-response.json"), response);
  writeJson(usageFile, usage);
  const html = extractHtml(response);
  if (/localStorage|sessionStorage|indexedDB|document\.cookie|fetch\s*\(\s*["'`]\/api\//i.test(html)) throw new Error("experience_isolation_violation");
  fs.writeFileSync(path.join(runDir, "personality/experience.html"), html, "utf8");

  const totalSpend = Number((priorSpend + costUsd).toFixed(8));
  const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
  summary.status = "READY_FOR_HUMAN_REVIEW";
  summary.freshSpendUsd = totalSpend;
  summary.calls = usage.length;
  summary.failures.personality = null;
  summary.personalityRecovery = {
    shared52kAttempt: "max_tokens; incomplete HTML",
    recovery78kAttempt: response.stop_reason,
    recoveryCostUsd: costUsd,
    totalPersonalityEngineerCostUsd: Number((usage.filter((item: { arm: string; stage: string }) => item.arm === "personality" && item.stage === "experience-engineer").reduce((sum: number, item: { costUsd: number }) => sum + item.costUsd, 0)).toFixed(8)),
    interpretation: "Persona quality is visually reviewable, but its reliability and quality-per-dollar include the failed 52k attempt and 78k recovery.",
  };
  summary.usage = usage;
  writeJson(summaryFile, summary);

  let report = fs.readFileSync(reportFile, "utf8");
  const encodedMatch = report.match(/atob\('([^']+)'\)/);
  if (!encodedMatch) throw new Error("report_payload_missing");
  const payload = JSON.parse(Buffer.from(encodedMatch[1], "base64").toString("utf8"));
  payload.summary = summary;
  payload.provenance.personality.status = "complete_after_78k_recovery";
  payload.provenance.personality.costUsd = usage.filter((item: { arm: string }) => item.arm === "personality").reduce((sum: number, item: { costUsd: number }) => sum + item.costUsd, 0);
  payload.provenance.personality.label = "Fresh staged personalities: Mira → Theo → Juniper → Rowan (52k failed; fresh 78k recovery completed)";
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  report = report.replace(encodedMatch[1], encoded);
  fs.writeFileSync(reportFile, report, "utf8");
  console.log(` 🎮 [reina-persona-comparison] [personality-78k] [saved] stop=${response.stop_reason} outputTokens=${outputTokens} totalSpent=$${totalSpend.toFixed(3)} report=${reportFile}`);
}

main().catch((error) => {
  console.error(` 🎮 [reina-persona-comparison] [personality-78k] [failed] reason=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
