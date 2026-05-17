import fs from "fs";
import path from "path";
import {
  certifySpellingAdaptation,
  renderSpellingCertificationMarkdown,
  type SpellingCertificationReport,
} from "../engine/spellingCertification";

function argValue(argv: string[], name: string): string | null {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1] ?? null;
  return null;
}

function parseChild(argv: string[]): string {
  const child = argValue(argv, "child")?.trim();
  if (!child) throw new Error("usage: npm run sunny:spelling:certify -- --child=demo_adaptive");
  return child;
}

function defaultReportDir(rootDir: string, childId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(rootDir, ".sunny-sandbox", "certification", "spelling", `${stamp}_${childId}`);
}

function writeCertificationTraceArtifacts(outDir: string, report: SpellingCertificationReport): void {
  const traceRows = report.games.map((game) => ({
    type: "spelling_certification_game_contract",
    version: 1,
    childId: report.childId,
    sessionId: path.basename(outDir),
    game: game.gameId,
    activityId: game.gameId,
    phase: "certification",
    answerVisibility: game.checks.hiddenAnswerSafety ? "contract_checked" : "not_applicable",
    action: "contract_audit",
    status: game.status,
    allowedInRealChildSession: game.allowedInRealChildSession,
    evidenceTier: game.evidenceTier,
    masteryEligible: game.masteryEligible,
    levels: game.levels,
    activityIntentId: game.activityIntent?.intentId,
    activityIntent: game.activityIntent,
    targetSelectorDecision: game.targetSelectorDecision,
    checks: game.checks,
    issueCodes: game.issues.map((issue) => issue.code),
    timestamp: report.generatedAt,
  }));
  fs.writeFileSync(
    path.join(outDir, "game-traces.ndjson"),
    `${traceRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    "utf8",
  );

  const summariesDir = path.join(outDir, "game-summaries");
  fs.mkdirSync(summariesDir, { recursive: true });
  for (const game of report.games) {
    fs.writeFileSync(
      path.join(summariesDir, `${game.gameId}.json`),
      `${JSON.stringify({
        gameId: game.gameId,
        displayName: game.displayName,
        status: game.status,
        allowedInRealChildSession: game.allowedInRealChildSession,
        sourcePath: game.sourcePath,
        manualPreviewUrl: game.manualPreviewUrl,
        evidenceTier: game.evidenceTier,
        masteryEligible: game.masteryEligible,
        referenceImplementation: game.referenceImplementation,
        levels: game.levels,
        activityIntent: game.activityIntent,
        targetSelectorDecision: game.targetSelectorDecision,
        checks: game.checks,
        issues: game.issues,
        humanGateQuestions: report.humanGateQuestions,
      }, null, 2)}\n`,
      "utf8",
    );
  }
}

export function runCertifySpellingAdaptation(argv = process.argv.slice(2)): void {
  const rootDir = process.cwd();
  const childId = parseChild(argv);
  const outDir = argValue(argv, "out") ?? defaultReportDir(rootDir, childId);
  const report = certifySpellingAdaptation({
    childId,
    rootDir,
    sessionDir: outDir,
  });
  const markdown = renderSpellingCertificationMarkdown(report);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "spelling-certification.md"), markdown, "utf8");
  fs.writeFileSync(path.join(outDir, "spelling-certification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeCertificationTraceArtifacts(outDir, report);

  process.stdout.write(markdown);
  console.log(`🎮 [spelling-certify] [written] ${outDir}`);
  if (report.summary.blocked > 0 || report.highSeverityIssues.length > 0) {
    console.log(
      `🎮 [spelling-certify] [blocked] games=${report.summary.blocked} highIssues=${report.highSeverityIssues.length}`,
    );
  } else {
    console.log("🎮 [spelling-certify] [passed] all spelling games allowed for real child sessions");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    runCertifySpellingAdaptation();
  } catch (error) {
    console.error("🎮 [spelling-certify] [failed]", error);
    process.exitCode = 1;
  }
}
