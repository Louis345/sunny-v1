import fs from "fs";
import path from "path";

export type SideDoorFindingCategory =
  | "allowed_debug_reader"
  | "allowed_legacy_assignment_helper"
  | "allowed_legacy_worksheet_reader"
  | "blocked_decision_reader"
  | "legacy_assignment_interpreter"
  | "deterministic_education_rule";

export type SideDoorFinding = {
  category: SideDoorFindingCategory;
  file: string;
  line: number;
  match: string;
  reason: string;
};

export type SideDoorAuditReport = {
  generatedAt: string;
  rootDir: string;
  summary: {
    totalFindings: number;
    blockedDecisionReaders: number;
    legacyAssignmentInterpreters: number;
    deterministicEducationRules: number;
    allowedDebugReaders: number;
    allowedLegacyAssignmentHelpers: number;
    allowedLegacyWorksheetReaders: number;
  };
  findings: SideDoorFinding[];
  outputDir?: string;
};

type AuditOptions = {
  rootDir: string;
  write?: boolean;
  generatedAt?: string;
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function lineNumber(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function addFinding(args: {
  findings: SideDoorFinding[];
  rootDir: string;
  file: string;
  text: string;
  index: number;
  category: SideDoorFindingCategory;
  match: string;
  reason: string;
}): void {
  args.findings.push({
    category: args.category,
    file: path.relative(args.rootDir, args.file),
    line: lineNumber(args.text, args.index),
    match: args.match,
    reason: args.reason,
  });
}

function isTestFile(file: string): boolean {
  return /\.test\.[tj]sx?$/.test(file) || /\/tests?\//.test(file);
}

function isRawTraceDecisionFile(relative: string): boolean {
  return [
    "src/engine/psychologistChartPacket.ts",
  ].includes(relative);
}

function isAllowedLegacyAssignmentHelper(relative: string, text: string): boolean {
  return relative === "src/scripts/contentAwareHomeworkPlanner.ts" &&
    text.includes("LEGACY_TEST_ONLY_ASSIGNMENT_INTERPRETER");
}

function isAllowedLegacyWorksheetReader(relative: string, text: string): boolean {
  return relative === "src/server/session-bootstrap.ts" &&
    text.includes("legacy_worksheet_extraction");
}

export function auditDecisionSideDoors(options: AuditOptions): SideDoorAuditReport {
  const rootDir = path.resolve(options.rootDir);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const findings: SideDoorFinding[] = [];

  for (const file of walk(path.join(rootDir, "src"))) {
    if (isTestFile(file)) continue;
    const relative = path.relative(rootDir, file);
    if (relative === "src/engine/sideDoorAudit.ts") continue;
    const text = fs.readFileSync(file, "utf8");

    for (const match of text.matchAll(/extractHomeworkProblems|interpretHomeworkAssignment\s*\(/g)) {
      const token = match[0] ?? "";
      if (relative === "src/agents/psychologist/psychologist.ts" && token === "extractHomeworkProblems") {
        continue;
      }
      const category = token === "extractHomeworkProblems" && isAllowedLegacyWorksheetReader(relative, text)
        ? "allowed_legacy_worksheet_reader"
        : isAllowedLegacyAssignmentHelper(relative, text)
          ? "allowed_legacy_assignment_helper"
          : "legacy_assignment_interpreter";
      addFinding({
        findings,
        rootDir,
        file,
        text,
        index: match.index ?? 0,
        category,
        match: token,
        reason: category === "legacy_assignment_interpreter"
          ? "Real assignment planning should flow through source extraction, AssignmentPlanningPacket, and the AI assignment planner."
          : category === "allowed_legacy_worksheet_reader"
            ? "Legacy worksheet extraction is allowed only for old worksheet/canvas mode, not assignment planning."
            : "Legacy assignment helper is quarantined for tests/old fallback paths and must not be used by real ingestion.",
      });
    }

    for (const match of text.matchAll(/game-traces\.ndjson|game-summaries|activity_results\/latest\.json|next_plan_/g)) {
      const category = isRawTraceDecisionFile(relative)
        ? "blocked_decision_reader"
        : "allowed_debug_reader";
      addFinding({
        findings,
        rootDir,
        file,
        text,
        index: match.index ?? 0,
        category,
        match: match[0] ?? "",
        reason: category === "blocked_decision_reader"
          ? "Raw traces are debug evidence and must not be primary planning/adaptation truth."
          : "Raw trace access is allowed only for debug, fixtures, or compatibility output.",
      });
    }

    for (const match of text.matchAll(/PURPOSE_SKILL_TARGETS|activitySupportsPurpose|target_purpose_activity_mismatch|target_group_missing_compatible_node/g)) {
      addFinding({
        findings,
        rootDir,
        file,
        text,
        index: match.index ?? 0,
        category: "deterministic_education_rule",
        match: match[0] ?? "",
        reason: "Educational fit should be planner reasoning or critique, while code blocks only structural/safety failures.",
      });
    }
  }

  const report: SideDoorAuditReport = {
    generatedAt,
    rootDir,
    summary: {
      totalFindings: findings.length,
      blockedDecisionReaders: findings.filter((item) => item.category === "blocked_decision_reader").length,
      legacyAssignmentInterpreters: findings.filter((item) => item.category === "legacy_assignment_interpreter").length,
      deterministicEducationRules: findings.filter((item) => item.category === "deterministic_education_rule").length,
      allowedDebugReaders: findings.filter((item) => item.category === "allowed_debug_reader").length,
      allowedLegacyAssignmentHelpers: findings.filter((item) => item.category === "allowed_legacy_assignment_helper").length,
      allowedLegacyWorksheetReaders: findings.filter((item) => item.category === "allowed_legacy_worksheet_reader").length,
    },
    findings: findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
  };

  if (options.write) {
    const stamp = generatedAt.replace(/[:.]/g, "-");
    const outputDir = path.join(rootDir, ".sunny-sandbox", "audits", "first-principles", stamp);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "side-doors.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(outputDir, "audit.md"), renderSideDoorAuditMarkdown(report), "utf8");
    report.outputDir = outputDir;
  }

  return report;
}

export function renderSideDoorAuditMarkdown(report: SideDoorAuditReport): string {
  const lines = [
    "# Sunny First-Principles Side-Door Audit",
    "",
    `generatedAt: ${report.generatedAt}`,
    `rootDir: ${report.rootDir}`,
    "",
    "## Summary",
    `- total findings: ${report.summary.totalFindings}`,
    `- blocked decision readers: ${report.summary.blockedDecisionReaders}`,
    `- legacy assignment interpreters: ${report.summary.legacyAssignmentInterpreters}`,
    `- deterministic education rules: ${report.summary.deterministicEducationRules}`,
    `- allowed debug readers: ${report.summary.allowedDebugReaders}`,
    `- allowed legacy assignment helpers: ${report.summary.allowedLegacyAssignmentHelpers}`,
    `- allowed legacy worksheet readers: ${report.summary.allowedLegacyWorksheetReaders}`,
    "",
    "## Findings",
  ];
  for (const finding of report.findings) {
    lines.push(`- [${finding.category}] ${finding.file}:${finding.line} \`${finding.match}\` — ${finding.reason}`);
  }
  return `${lines.join("\n")}\n`;
}
