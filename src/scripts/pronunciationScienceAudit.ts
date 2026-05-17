import fs from "fs";
import path from "path";
import {
  comparePronunciationProviders,
  demoPronunciationScienceResults,
  readLatestPronunciationScienceSummary,
  writePronunciationScienceEvidence,
} from "../engine/pronunciationScience";
import {
  ADAPTABILITY_DEMO_CHILD_ID,
  resetAdaptabilityDemo,
  sandboxContextRoot,
} from "./adaptabilityDemo";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function childIdFromArgs(): string {
  const childId = (argValue("child") ?? ADAPTABILITY_DEMO_CHILD_ID).trim().toLowerCase();
  if (childId !== ADAPTABILITY_DEMO_CHILD_ID) {
    throw new Error(`pronunciation_science_audit_requires_demo_sandbox:${childId}`);
  }
  return childId;
}

export type PronunciationScienceAuditReport = {
  childId: string;
  contextRoot: string;
  evidenceFile: string;
  providerAgreement: string[];
  providerDisagreements: string[];
  clearestExplanations: string[];
  wilsonSignalSummary: string[];
  flowStateSummary: string[];
  recommendation: "azure" | "speechace" | "both" | "neither";
};

function recommendationFromAgreement(agreement: ReturnType<typeof comparePronunciationProviders>): PronunciationScienceAuditReport["recommendation"] {
  const clear = agreement.map((row) => row.clearestProvider);
  if (clear.includes("both")) return "both";
  const azure = clear.filter((item) => item === "azure").length;
  const speechace = clear.filter((item) => item === "speechace").length;
  if (azure > 0 && speechace > 0) return "both";
  if (azure > 0) return "azure";
  if (speechace > 0) return "speechace";
  return "neither";
}

export function runPronunciationScienceAudit(opts: {
  childId?: string;
  rootDir?: string;
  reset?: boolean;
  now?: Date;
} = {}): PronunciationScienceAuditReport {
  const rootDir = opts.rootDir ?? process.cwd();
  const childId = opts.childId ?? childIdFromArgs();
  if (childId !== ADAPTABILITY_DEMO_CHILD_ID) {
    throw new Error(`pronunciation_science_audit_requires_demo_sandbox:${childId}`);
  }
  const contextRoot = sandboxContextRoot(rootDir);
  const childDir = path.join(contextRoot, childId);
  if (opts.reset !== false || !fs.existsSync(path.join(childDir, "learning_profile.json"))) {
    resetAdaptabilityDemo({ rootDir, scenario: "weak_performance" });
  }

  const createdAt = (opts.now ?? new Date()).toISOString();
  const results = demoPronunciationScienceResults(createdAt);
  const evidenceFile = writePronunciationScienceEvidence(childId, {
    sessionId: `pronunciation-science-audit-${createdAt}`,
    homeworkId: "hw-pronunciation-science-fixture",
    results,
  }, {
    rootDir,
    contextRoot,
    now: opts.now,
  });
  const summary = readLatestPronunciationScienceSummary(childId, { rootDir, contextRoot });
  const comparisons = comparePronunciationProviders(results);
  const report: PronunciationScienceAuditReport = {
    childId,
    contextRoot,
    evidenceFile,
    providerAgreement: comparisons
      .filter((row) => row.agreement === "agree")
      .map((row) => `${row.targetWord}: ${row.reason}`),
    providerDisagreements: comparisons
      .filter((row) => row.agreement === "mixed")
      .map((row) => `${row.targetWord}: ${row.reason}`),
    clearestExplanations: comparisons.map((row) =>
      `${row.targetWord}: clearest=${row.clearestProvider} providers=${row.providers.join("+")}`,
    ),
    wilsonSignalSummary: summary.wilsonSignals,
    flowStateSummary: [
      `avgBestStreak=${summary.flowState.averageBestStreak ?? "none"}`,
      `missToHitRecoveries=${summary.flowState.totalMissToHitRecoveries}`,
      `replayRequests=${summary.flowState.totalReplayRequests}`,
      `abandonments=${summary.flowState.abandonments}`,
    ],
    recommendation: recommendationFromAgreement(comparisons),
  };

  console.log(`🎮 [pronunciation-science-audit] [child] ${report.childId}`);
  console.log(`🎮 [pronunciation-science-audit] [context-root] ${report.contextRoot}`);
  console.log(`🎮 [pronunciation-science-audit] [evidence-file] ${report.evidenceFile}`);
  console.log("🎮 [pronunciation-science-audit] [provider-agreement]");
  for (const line of report.providerAgreement) console.log(`  - ${line}`);
  console.log("🎮 [pronunciation-science-audit] [provider-disagreements]");
  for (const line of report.providerDisagreements) console.log(`  - ${line}`);
  console.log("🎮 [pronunciation-science-audit] [clearest-explanations]");
  for (const line of report.clearestExplanations) console.log(`  - ${line}`);
  console.log("🎮 [pronunciation-science-audit] [wilson-signals]");
  for (const line of report.wilsonSignalSummary) console.log(`  - ${line}`);
  console.log("🎮 [pronunciation-science-audit] [flow-state]");
  for (const line of report.flowStateSummary) console.log(`  - ${line}`);
  console.log(`🎮 [pronunciation-science-audit] [recommendation] ${report.recommendation}`);
  return report;
}

if (require.main === module) {
  runPronunciationScienceAudit();
}
