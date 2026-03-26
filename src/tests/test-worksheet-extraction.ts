import "dotenv/config";
import {
  extractHomeworkProblems,
  parseHomeworkExtractionModelText,
} from "../../src/agents/psychologist/psychologist";

let failures = 0;

function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ❌ ${name}`);
    if (detail) console.log(`     ${detail}`);
    failures++;
  }
}

async function main(): Promise<void> {
  console.log("\nSuite 1 — Extraction never crashes on valid input");
  let suite1: Awaited<ReturnType<typeof extractHomeworkProblems>> | undefined;
  let suite1Threw = false;
  try {
    suite1 = await extractHomeworkProblems(
      "Count the coins: quarter, dime, penny",
    );
  } catch (e) {
    suite1Threw = true;
    ok(
      "extractHomeworkProblems returns (does not throw)",
      false,
      String(e),
    );
  }
  if (!suite1Threw && suite1) {
    ok("extractHomeworkProblems returns an object", typeof suite1 === "object");
    ok(
      "result has problems array",
      Array.isArray(suite1.problems),
      `typeof problems: ${typeof suite1?.problems}`,
    );
  }

  console.log("\nSuite 2 — Problems have no SVG field");
  if (suite1 && Array.isArray(suite1.problems)) {
    for (let i = 0; i < suite1.problems.length; i++) {
      const p = suite1.problems[i] as Record<string, unknown>;
      ok(
        `problem ${i + 1} has no top-level svg field`,
        !Object.prototype.hasOwnProperty.call(p, "svg"),
      );
      ok(
        `problem ${i + 1} canvas_display is plain string description only`,
        typeof p.canvas_display === "string",
        `got ${typeof p.canvas_display}`,
      );
      if (typeof p.canvas_display === "string") {
        const s = p.canvas_display.trim();
        ok(
          `problem ${i + 1} canvas_display looks like a description (e.g. coins)`,
          s.length > 0,
        );
      }
    }
    if (suite1.problems.length === 0) {
      ok("Suite 2 had problems to check", false, "problems array was empty");
    }
  } else {
    ok("Suite 2 skipped — no result from Suite 1", false);
  }

  const WORKSHEET_VERBS = [
    "circle",
    "write",
    "draw",
    "match",
    "fill",
  ] as const;
  const hasWorksheetVerb = (q: string): boolean =>
    WORKSHEET_VERBS.some((v) => new RegExp(`\\b${v}\\b`, "i").test(q));
  const hasBracketAside = (q: string): boolean => /\[[^\]]+\]/.test(q);

  console.log("\nSuite 3 — Required fields always present");
  if (suite1 && Array.isArray(suite1.problems)) {
    for (let i = 0; i < suite1.problems.length; i++) {
      const p = suite1.problems[i];
      ok(`problem ${i + 1} has id`, p.id !== undefined && p.id !== null);
      ok(
        `problem ${i + 1} question non-empty`,
        typeof p.question === "string" && p.question.trim() !== "",
      );
      ok(
        `problem ${i + 1} instructions is array (may be empty)`,
        Array.isArray(p.instructions),
        `got ${typeof (p as { instructions?: unknown }).instructions}`,
      );
      ok(
        `problem ${i + 1} question has no worksheet imperatives (Circle/Write/Draw/Match/Fill)`,
        typeof p.question === "string" && !hasWorksheetVerb(p.question),
        p.question,
      );
      ok(
        `problem ${i + 1} question has no bracket stage directions`,
        typeof p.question === "string" && !hasBracketAside(p.question),
        p.question,
      );
      ok(
        `problem ${i + 1} answer non-empty`,
        typeof p.answer === "string" && p.answer.trim() !== "",
      );
      ok(
        `problem ${i + 1} hint non-empty`,
        typeof p.hint === "string" && p.hint.trim() !== "",
      );
      ok(
        `problem ${i + 1} canvas_display non-empty string`,
        typeof p.canvas_display === "string" &&
          p.canvas_display.trim() !== "",
      );
    }
    if (suite1.problems.length === 0) {
      ok("Suite 3 had problems to check", false, "problems array was empty");
    }
  } else {
    ok("Suite 3 skipped — no result from Suite 1", false);
  }

  console.log("\nSuite 4 — JSON parse failure is caught, not thrown");
  const badTexts = [
    "no json at all",
    "{",
    '{"problems":}',
    "```\nnot json\n```",
  ];
  for (const bad of badTexts) {
    let threw = false;
    let out: ReturnType<typeof parseHomeworkExtractionModelText> | undefined;
    try {
      out = parseHomeworkExtractionModelText(bad);
    } catch {
      threw = true;
    }
    ok(
      `malformed model output does not throw: "${bad.slice(0, 24)}…"`,
      !threw,
    );
    ok(
      `fallback subject unknown for: "${bad.slice(0, 24)}…"`,
      out !== undefined &&
        out.subject === "unknown" &&
        Array.isArray(out.problems) &&
        out.problems.length === 0,
      `got ${JSON.stringify(out)}`,
    );
  }

  console.log("\n--- Summary ---");
  if (failures > 0) {
    console.log(`  ${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("  All assertions passed");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
