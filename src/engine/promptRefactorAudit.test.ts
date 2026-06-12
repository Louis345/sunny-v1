import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import {
  auditPromptRefactorReadiness,
  renderPromptRefactorAuditMarkdown,
} from "./promptRefactorAudit";

function write(root: string, relativePath: string, content: string): void {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

describe("prompt refactor audit", () => {
  it("turns prompt refactor risk into measurable blocking counts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-prompt-refactor-risk-"));
    write(
      root,
      "AGENTS.md",
      [
        "Organic first: Sunny routes truth instead of canned scripted responses.",
        "### Law 12: Child Chart Is The Decision Doorway",
        "### Law 13: Accountable To Reality",
        "### Law 14: Activities Are Vital-Sign Instruments",
      ].join("\n"),
    );
    write(
      root,
      ".github/workflows/claude-review.yml",
      [
        "system_prompt = \"\"\"",
        "- **Law 1 (Tests first):** Flag missing tests.",
        "PROMPT VS CODE: recommend the prompt fix instead.",
        "\"\"\"",
      ].join("\n"),
    );
    write(
      root,
      "PROMPT_AUDIT.md",
      [
        "# Prompt audit",
        "Scope: primary prompt sources. Date: 2026-04-21.",
        "None blocking.",
      ].join("\n"),
    );
    write(
      root,
      "src/companions/matilda.md",
      [
        "VOICE RULE: NEVER use Japanese, emoji, or any non-English characters.",
        "## Goodbye",
        "That was a championship round, Reina! やった! See you next time, champ! 📚",
      ].join("\n"),
    );
    write(
      root,
      "src/companions/elli.md",
      [
        "Turns 1-4: Free conversation.",
        "Turn 5: Say exactly one of these phrases.",
      ].join("\n"),
    );
    write(
      root,
      "src/scripts/generateGame.ts",
      'return `Generate a complete single-file interactive HTML game for Ila (age 8, grade 2).`;',
    );

    const report = auditPromptRefactorReadiness({
      rootDir: root,
      now: new Date("2026-05-22T12:00:00Z"),
    });

    expect(report.summary.promptFilesScanned).toBeGreaterThanOrEqual(4);
    expect(report.summary.blockingIssueCount).toBeGreaterThanOrEqual(5);
    expect(report.summary.promptHygieneScore).toBeLessThan(80);
    expect(report.summary.contradictionCount).toBeGreaterThanOrEqual(1);
    expect(report.summary.exactScriptCount).toBeGreaterThanOrEqual(1);
    expect(report.summary.hardcodedChildGenerationCount).toBeGreaterThanOrEqual(1);
    expect(report.summary.stalePromptCount).toBeGreaterThanOrEqual(1);
    expect(report.summary.missingLawCoverage).toEqual(expect.arrayContaining([
      "Law 12",
      "Law 13",
      "Law 14",
    ]));
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "review_prompt_missing_current_laws",
      "review_prompt_prefers_prompt_over_evidence_code",
      "stale_prompt_audit_doc",
      "contradictory_prompt_rule",
      "exact_scripted_turn_prompt",
      "hardcoded_child_generation_prompt",
    ]));
  });

  it("gives a clean score when prompts are organic, current, and law-covered", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-prompt-refactor-clean-"));
    write(
      root,
      "AGENTS.md",
      [
        "Organic first: Sunny routes truth instead of canned scripted responses.",
        "### Law 12: Child Chart Is The Decision Doorway",
        "### Law 13: Accountable To Reality",
        "### Law 14: Activities Are Vital-Sign Instruments",
      ].join("\n"),
    );
    write(
      root,
      ".github/workflows/claude-review.yml",
      [
        "system_prompt = \"\"\"",
        "- Law 12: Flag decision code that bypasses getChildChart.",
        "- Law 13: Flag adaptive claims without evidence, test, outcome, and chart write.",
        "- Law 14: Flag activities without attempt_event or targetResults.",
        "Prefer evidence contracts over canned teaching scripts.",
        "\"\"\"",
      ].join("\n"),
    );
    write(
      root,
      "PROMPT_AUDIT.md",
      [
        "# Prompt audit",
        "Date: 2026-05-22.",
        "Reviewed AGENTS Laws 1-14.",
      ].join("\n"),
    );
    write(
      root,
      "src/companions/elli.md",
      [
        "Follow live child context.",
        "Use current board truth before making mastery or reward claims.",
        "Ask one short question when evidence is ambiguous.",
      ].join("\n"),
    );
    write(
      root,
      "src/scripts/generateGame.ts",
      [
        "return `Generate from GAME_PARAMS.childId, captured homework evidence, and child chart context.`;",
      ].join("\n"),
    );

    const report = auditPromptRefactorReadiness({
      rootDir: root,
      now: new Date("2026-05-22T12:00:00Z"),
    });

    expect(report.summary.blockingIssueCount).toBe(0);
    expect(report.summary.promptHygieneScore).toBe(100);
    expect(report.summary.missingLawCoverage).toEqual([]);
    expect(renderPromptRefactorAuditMarkdown(report)).toContain("Prompt Refactor Audit");
  });
});
