import * as fs from "fs";
import * as path from "path";

export type PromptRefactorIssueSeverity = "info" | "warning" | "high";

export type PromptRefactorIssueCode =
  | "review_prompt_missing_current_laws"
  | "review_prompt_prefers_prompt_over_evidence_code"
  | "stale_prompt_audit_doc"
  | "contradictory_prompt_rule"
  | "exact_scripted_turn_prompt"
  | "hardcoded_child_generation_prompt";

export type PromptRefactorIssue = {
  severity: PromptRefactorIssueSeverity;
  code: PromptRefactorIssueCode;
  file: string;
  line: number;
  message: string;
  evidence: string;
};

export type PromptRefactorAuditReport = {
  generatedAt: string;
  rootDir: string;
  summary: {
    promptFilesScanned: number;
    blockingIssueCount: number;
    promptHygieneScore: number;
    contradictionCount: number;
    exactScriptCount: number;
    hardcodedChildGenerationCount: number;
    stalePromptCount: number;
    missingLawCoverage: string[];
  };
  issues: PromptRefactorIssue[];
  outputDir?: string;
};

export type PromptRefactorAuditOptions = {
  rootDir: string;
  now?: Date;
  write?: boolean;
};

const PROMPT_EXTENSIONS = new Set([".md", ".ts", ".tsx", ".json", ".yml", ".yaml"]);
const IGNORED_DIRS = new Set([
  ".git",
  ".sunny-sandbox",
  ".worktrees",
  "dist",
  "node_modules",
  "test-artifacts",
]);
const CURRENT_LAWS = ["Law 12", "Law 13", "Law 14"] as const;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && PROMPT_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function isPromptBearingFile(rootDir: string, file: string, text: string): boolean {
  const relative = path.relative(rootDir, file);
  if (/\.test\.[tj]sx?$/.test(relative)) return false;
  if (relative === "src/engine/promptRefactorAudit.ts") return false;
  if (relative.startsWith("src/context/")) return false;
  if (relative === "AGENTS.md") return true;
  if (relative === "PROMPT_AUDIT.md") return true;
  if (relative.startsWith(".github/workflows/")) return true;
  if (relative.startsWith("src/companions/")) return true;
  if (relative.startsWith("src/modes/")) return true;
  if (relative.startsWith("src/prompts/")) return true;
  if (relative.startsWith("src/agents/")) return true;
  if (/src\/scripts\/(?:generate|ingest|audit|.*Planner)/.test(relative)) return true;
  return /\b(prompt|system_prompt|systemPrompt|You are|Generate a|Say exactly|Turn 5)\b/i.test(text);
}

function lineNumber(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function lineAt(text: string, index: number): string {
  const before = text.lastIndexOf("\n", index);
  const after = text.indexOf("\n", index);
  const start = before >= 0 ? before + 1 : 0;
  const end = after >= 0 ? after : text.length;
  return text.slice(start, end).trim();
}

function addIssue(args: {
  issues: PromptRefactorIssue[];
  rootDir: string;
  file: string;
  text: string;
  index: number;
  code: PromptRefactorIssueCode;
  severity?: PromptRefactorIssueSeverity;
  message: string;
  evidence?: string;
}): void {
  args.issues.push({
    severity: args.severity ?? "high",
    code: args.code,
    file: path.relative(args.rootDir, args.file),
    line: lineNumber(args.text, args.index),
    message: args.message,
    evidence: args.evidence ?? lineAt(args.text, args.index),
  });
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function extractDate(text: string): Date | null {
  const match = text.match(/\b(?:Date:\s*)?(\d{4}-\d{2}-\d{2})\b/i);
  if (!match?.[1]) return null;
  const parsed = new Date(`${match[1]}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86_400_000);
}

function hasCurrentLawCoverage(text: string, law: string): boolean {
  const number = law.replace("Law ", "");
  const pattern = new RegExp(`\\b(?:${law}|law\\s*${number}|Development Laws[\\s\\S]{0,400}${number})\\b`, "i");
  return pattern.test(text);
}

function scanReviewPrompt(args: {
  file: string;
  rootDir: string;
  text: string;
  issues: PromptRefactorIssue[];
  missingLaws: string[];
}): void {
  const relative = path.relative(args.rootDir, args.file);
  const isReviewPrompt =
    /claude-review\.ya?ml$/.test(relative) ||
    /\bClaude PR Review\b|\bsystem_prompt\b[\s\S]{0,1200}\bAGENTS\.md\b/i.test(args.text);
  if (!isReviewPrompt) return;

  for (const law of CURRENT_LAWS) {
    if (!hasCurrentLawCoverage(args.text, law)) args.missingLaws.push(law);
  }
  if (CURRENT_LAWS.some((law) => !hasCurrentLawCoverage(args.text, law))) {
    addIssue({
      issues: args.issues,
      rootDir: args.rootDir,
      file: args.file,
      text: args.text,
      index: 0,
      code: "review_prompt_missing_current_laws",
      message: "Review prompt does not cover the current AGENTS Laws 12-14 gate.",
      evidence: "Missing one or more of Law 12, Law 13, Law 14.",
    });
  }

  const promptOverEvidence = args.text.match(/prompt fix instead|replaced with a prompt edit|recommend the prompt fix/i);
  if (promptOverEvidence) {
    addIssue({
      issues: args.issues,
      rootDir: args.rootDir,
      file: args.file,
      text: args.text,
      index: promptOverEvidence.index ?? 0,
      code: "review_prompt_prefers_prompt_over_evidence_code",
      message: "Review prompt can prefer prompt edits over evidence routing, chart writes, or activity contracts.",
    });
  }
}

function scanStaleAuditDoc(args: {
  file: string;
  rootDir: string;
  text: string;
  now: Date;
  issues: PromptRefactorIssue[];
}): void {
  const relative = path.relative(args.rootDir, args.file);
  if (relative !== "PROMPT_AUDIT.md") return;
  const date = extractDate(args.text);
  if (!date) return;
  const ageDays = daysBetween(date, args.now);
  const mentionsCurrentLaws = CURRENT_LAWS.every((law) => hasCurrentLawCoverage(args.text, law));
  if (ageDays > 30 || !mentionsCurrentLaws) {
    addIssue({
      issues: args.issues,
      rootDir: args.rootDir,
      file: args.file,
      text: args.text,
      index: args.text.search(/\d{4}-\d{2}-\d{2}/),
      code: "stale_prompt_audit_doc",
      message: "Prompt audit document is stale or does not cover current AGENTS Laws 12-14.",
      evidence: `auditAgeDays=${ageDays}; laws12To14Covered=${mentionsCurrentLaws}`,
    });
  }
}

function scanContradictoryPromptRules(args: {
  file: string;
  rootDir: string;
  text: string;
  issues: PromptRefactorIssue[];
}): void {
  const bansNonEnglish = /NEVER use Japanese|NEVER use .*non-English|VOICE RULE:[^\n]*emoji/i.test(args.text);
  if (!bansNonEnglish) return;
  const childVisibleBlock = args.text.match(/##\s*(?:Goodbye|Opening Line|Returning Greeting)[\s\S]*?(?:\n##\s|\s*$)/i);
  if (childVisibleBlock && /[^\x00-\x7F]/.test(childVisibleBlock[0])) {
    const index = args.text.indexOf(childVisibleBlock[0]);
    addIssue({
      issues: args.issues,
      rootDir: args.rootDir,
      file: args.file,
      text: args.text,
      index,
      code: "contradictory_prompt_rule",
      message: "Prompt bans non-English/emoji output but child-visible static copy contains non-ASCII text.",
      evidence: childVisibleBlock[0].split("\n").slice(0, 4).join(" ").trim(),
    });
  }
}

function scanScriptedTurnLanguage(args: {
  file: string;
  rootDir: string;
  text: string;
  issues: PromptRefactorIssue[];
}): void {
  const scriptedPattern =
    /\b(?:Turns?\s+\d+(?:[-–]\d+)?|First\s+\d+(?:-\d+)?\s+turns|Turn\s+\d+)\b|Say exactly one of these|exact phrases above/i;
  const match = args.text.match(scriptedPattern);
  if (!match) return;
  addIssue({
    issues: args.issues,
    rootDir: args.rootDir,
    file: args.file,
    text: args.text,
    index: match.index ?? 0,
    code: "exact_scripted_turn_prompt",
    message: "Prompt contains fixed turn-count or exact-phrase scripting instead of live-context behavior.",
  });
}

function scanHardcodedChildGeneration(args: {
  file: string;
  rootDir: string;
  text: string;
  issues: PromptRefactorIssue[];
}): void {
  const relative = path.relative(args.rootDir, args.file);
  if (!/src\/scripts\/|src\/agents\/designer|src\/engine\/.*Artifact/.test(relative)) return;
  const match = args.text.match(/Generate\s+[^`"'\n]{0,120}\b(?:for|about)\s+(?:Ila|Reina)\b|\b(?:Ila|Reina)\s+\(age\s+\d+/i);
  if (!match) return;
  addIssue({
    issues: args.issues,
    rootDir: args.rootDir,
    file: args.file,
    text: args.text,
    index: match.index ?? 0,
    code: "hardcoded_child_generation_prompt",
    message: "Generation prompt hardcodes a child identity instead of using child chart or GAME_PARAMS child context.",
  });
}

function hygieneScore(blockingIssueCount: number): number {
  return Math.max(0, 100 - blockingIssueCount * 10);
}

export function auditPromptRefactorReadiness(
  options: PromptRefactorAuditOptions,
): PromptRefactorAuditReport {
  const rootDir = path.resolve(options.rootDir);
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const issues: PromptRefactorIssue[] = [];
  const missingLaws: string[] = [];
  const promptFiles = walk(rootDir)
    .filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return isPromptBearingFile(rootDir, file, text);
    })
    .sort((a, b) => a.localeCompare(b));

  for (const file of promptFiles) {
    const text = fs.readFileSync(file, "utf8");
    scanReviewPrompt({ file, rootDir, text, issues, missingLaws });
    scanStaleAuditDoc({ file, rootDir, text, now, issues });
    scanContradictoryPromptRules({ file, rootDir, text, issues });
    scanScriptedTurnLanguage({ file, rootDir, text, issues });
    scanHardcodedChildGeneration({ file, rootDir, text, issues });
  }

  const blockingIssueCount = issues.filter((issue) => issue.severity === "high").length;
  const report: PromptRefactorAuditReport = {
    generatedAt,
    rootDir,
    summary: {
      promptFilesScanned: promptFiles.length,
      blockingIssueCount,
      promptHygieneScore: hygieneScore(blockingIssueCount),
      contradictionCount: issues.filter((issue) => issue.code === "contradictory_prompt_rule").length,
      exactScriptCount: issues.filter((issue) => issue.code === "exact_scripted_turn_prompt").length,
      hardcodedChildGenerationCount: issues.filter((issue) => issue.code === "hardcoded_child_generation_prompt").length,
      stalePromptCount: issues.filter((issue) => issue.code === "stale_prompt_audit_doc").length,
      missingLawCoverage: uniqueSorted(missingLaws),
    },
    issues: issues.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
  };

  if (options.write) {
    const stamp = generatedAt.replace(/[:.]/g, "-");
    const outputDir = path.join(rootDir, ".sunny-sandbox", "audits", "prompt-refactor", stamp);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "prompt-refactor-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(outputDir, "audit.md"), renderPromptRefactorAuditMarkdown(report), "utf8");
    report.outputDir = outputDir;
  }

  return report;
}

export function renderPromptRefactorAuditMarkdown(report: PromptRefactorAuditReport): string {
  const lines = [
    "# Prompt Refactor Audit",
    "",
    `generatedAt: ${report.generatedAt}`,
    `rootDir: ${report.rootDir}`,
    "",
    "## Summary",
    `- prompt files scanned: ${report.summary.promptFilesScanned}`,
    `- blocking issues: ${report.summary.blockingIssueCount}`,
    `- prompt hygiene score: ${report.summary.promptHygieneScore}`,
    `- contradictions: ${report.summary.contradictionCount}`,
    `- exact scripts: ${report.summary.exactScriptCount}`,
    `- hardcoded child generation prompts: ${report.summary.hardcodedChildGenerationCount}`,
    `- stale prompt docs: ${report.summary.stalePromptCount}`,
    `- missing law coverage: ${report.summary.missingLawCoverage.join(", ") || "none"}`,
    "",
    "## Issues",
  ];
  for (const issue of report.issues) {
    lines.push(`- [${issue.severity}] ${issue.code} ${issue.file}:${issue.line} - ${issue.message}`);
  }
  return `${lines.join("\n")}\n`;
}

function runCli(): void {
  const write = process.argv.includes("--write");
  const report = auditPromptRefactorReadiness({
    rootDir: process.cwd(),
    write,
  });
  process.stdout.write(renderPromptRefactorAuditMarkdown(report));
  if (report.outputDir) {
    process.stdout.write(`\n[prompt-refactor-audit] written ${report.outputDir}\n`);
  }
  if (report.summary.blockingIssueCount > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}
