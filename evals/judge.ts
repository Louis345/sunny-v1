/**
 * Companion/tutor eval runner.
 *
 *   npx tsx evals/judge.ts baseline [--estimate] [--only T1,C4]
 *   npx tsx evals/judge.ts after    [--estimate] [--only C1,H1]
 *
 * baseline: judge the real historical reply of every golden case.
 * after:    regenerate the companion's reply for Conversation + Honesty cases with today's prompt builders and the
 *           product's model, then judge it.
 *
 * Cases, rubric text and results live ONLY in the private folder (default ~/SunnyEvals, or SUNNY_EVALS_DIR).
 * This file holds no child data. The judge (Fable) is a different model from both companion models.
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RUBRIC, judgeCriteria, normalizeScore, scoreToolSchema, type RubricGroup } from "./rubric";
import { findCaseTextInPrompts, runCodeChecks, type ChildId, type CodeCheckResult } from "./checks";

export const JUDGE_MODEL = "claude-fable-5-1";
export const HOMEWORK_COMPANION_MODEL = process.env.SUNNY_VOICE_MODEL ?? "claude-sonnet-5";
export const FACETIME_COMPANION_MODEL = process.env.SUNNY_COMPANION_TALK_MODEL ?? "claude-sonnet-4-5";
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-fable-5-1": { in: 10, out: 50 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-sonnet-4-5": { in: 3, out: 15 },
};
const BUDGET_USD = Number(process.env.EVAL_BUDGET_USD ?? 10);
const EVALS_DIR = process.env.SUNNY_EVALS_DIR ?? path.join(os.homedir(), "SunnyEvals");
const SRC = path.resolve(__dirname, "..", "src");
const RUN_DATE = process.env.EVAL_RUN_DATE ?? new Date().toISOString().slice(0, 10);

type Turn = { role: "child" | "companion" | "narrator" | "parent"; text: string };
export type EvalCase = {
  id: string;
  group: RubricGroup;
  polarity: "pass" | "fail" | "mixed";
  child: ChildId;
  companion: string;
  surface: "homework" | "facetime" | "planner";
  item: string;
  turns: Turn[];
  childLine: string;
  actualReply: string;
  expected: string;
  regen?: boolean;
};
type CriterionScore = { score: number | null; reason: string };
type CaseResult = {
  id: string;
  group: RubricGroup;
  polarity: string;
  reply: string;
  replySource: "historical" | "regenerated";
  code: CodeCheckResult;
  judge: Record<string, CriterionScore> | null;
  judgeError?: string;
  caseScore: number | null;
};

const usage = { usd: 0, calls: 0, byModel: {} as Record<string, { input: number; output: number }> };
function addUsage(model: string, u: { input_tokens: number; output_tokens: number }) {
  const p = PRICES[model] ?? { in: 10, out: 50 };
  usage.usd += (u.input_tokens * p.in + u.output_tokens * p.out) / 1e6;
  usage.calls += 1;
  const m = (usage.byModel[model] ??= { input: 0, output: 0 });
  m.input += u.input_tokens;
  m.output += u.output_tokens;
  if (usage.usd > BUDGET_USD) throw new Error(`budget exceeded: $${usage.usd.toFixed(2)} > $${BUDGET_USD}`);
}

export function loadCases(): EvalCase[] {
  const file = path.join(EVALS_DIR, "cases.json");
  return (JSON.parse(fs.readFileSync(file, "utf8")) as { cases: EvalCase[] }).cases;
}

function loadRubricText(): string {
  return fs.readFileSync(path.join(EVALS_DIR, "rubric-draft.md"), "utf8");
}

/** README rule 4: refuse to run if any case text was pasted into a companion/persona/planner prompt. */
export function promptLeakCheck(cases: EvalCase[]): { path: string; phrase: string }[] {
  const dirs = ["prompts", "souls", "companions"].map((d) => path.join(SRC, d));
  const files: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|ts|json|txt)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) files.push({ path: path.relative(SRC, p), text: fs.readFileSync(p, "utf8") });
    }
  };
  dirs.forEach(walk);
  const texts = cases.flatMap((c) => [c.childLine, c.actualReply, c.expected, ...c.turns.map((t) => t.text)]);
  return findCaseTextInPrompts(texts, files);
}

function transcript(c: EvalCase): string {
  const name = (r: Turn["role"]) => (r === "companion" ? c.companion : r === "child" ? `${c.child} (STT; may include a parent)` : r);
  return c.turns.map((t) => `${name(t.role)}: ${t.text}`).join("\n") || "(no earlier turns captured)";
}

function judgeSystem(rubric: string): string {
  return [
    "You are grading one moment from Sunny, a voice AI tutor-friend for 9-year-old twins (Ila has ADHD, dyslexia and a language disorder).",
    "Grade ONLY the reply under test, using the parents' rubric below. Be strict and literal: a parent will read your one-line reasons.",
    "Score every criterion in the tool. Use null when the criterion does not apply to this moment (for example 'Stops when told' when nobody said stop, or 'Names her mistake' when she was not wrong).",
    "Yes/No criteria: 1 = Yes (good), 0 = No (bad). Scale criteria: 1 (bad) to 5 (good).",
    "The parents' note on what a good reply looks like is a reference, not the only acceptable answer.",
    "Call submit_scores exactly once, with no other text.",
    "",
    "<rubric>",
    rubric,
    "</rubric>",
  ].join("\n");
}

function judgeUser(c: EvalCase, reply: string, replySource: string): string {
  return [
    `Case ${c.id} — group: ${c.group}. Speaker under test: ${c.companion} (${c.surface}).`,
    `On screen / known facts: ${c.item}`,
    "",
    "Earlier in this moment:",
    transcript(c),
    "",
    `${c.child} just said: ${c.childLine}`,
    "",
    `REPLY UNDER TEST (${replySource}):`,
    reply || "(silent: the companion said nothing)",
    "",
    `Parents' note on what good looks like: ${c.expected}`,
  ].join("\n");
}

async function judgeOne(client: Anthropic, c: EvalCase, reply: string, replySource: string, rubric: string) {
  const tool = {
    name: "submit_scores",
    description: `Submit the ${c.group} rubric scores for this one reply.`,
    strict: true,
    input_schema: scoreToolSchema(c.group),
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    // Fable 5.1 rejects forced tool_choice; auto + strict schema + an explicit instruction instead.
    const res = (await client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 8000,
      system: judgeSystem(rubric),
      tools: [tool],
      tool_choice: { type: "auto" },
      output_config: { effort: process.env.EVAL_JUDGE_EFFORT ?? "medium" },
      messages: [{ role: "user", content: judgeUser(c, reply, replySource) }],
    } as unknown as Anthropic.MessageCreateParamsNonStreaming)) as Anthropic.Message;
    addUsage(JUDGE_MODEL, res.usage);
    if (res.stop_reason === "refusal") throw new Error("judge refusal");
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_scores");
    if (call) return call.input as Record<string, CriterionScore>;
    console.warn(` 🎮 [eval] [judge-no-tool] case=${c.id} attempt=${attempt}`);
  }
  throw new Error("judge returned no submit_scores call");
}

/** Today's homework companion prompt: base soul + individual soul + personality + spoken-turn + expression rules. No care plan (it holds live chart data). */
async function homeworkSystemPrompt(c: EvalCase): Promise<string> {
  const { getCompanionConfig, readCompanionSoulMarkdownFromAbsolute } = await import("../src/companions/loader");
  const { COMPANION_SPOKEN_TURN_PROMPT } = await import("../src/server/companionTurnTaking");
  const { COMPANION_EXPRESSION_PROMPT } = await import("../src/server/companionExpressionTags");
  const cfg = getCompanionConfig(c.child);
  const personalityPath = path.join(SRC, "prompts", "companions", c.companion.toLowerCase(), "personality.md");
  const personality = fs.existsSync(personalityPath) ? fs.readFileSync(personalityPath, "utf8").trim() : "";
  return [
    `You are talking with ${c.child}.`,
    readCompanionSoulMarkdownFromAbsolute(cfg.markdownPath),
    personality,
    COMPANION_SPOKEN_TURN_PROMPT,
    COMPANION_EXPRESSION_PROMPT,
    `## Right now\nOn screen: ${c.item}`,
  ].filter(Boolean).join("\n\n");
}

async function facetimeSystemPrompt(c: EvalCase): Promise<string> {
  const { buildShowroomTalkSystemPrompt } = await import("../src/server/companionShowroomTalk");
  const id = c.companion.toLowerCase();
  const personality = fs.readFileSync(path.join(SRC, "prompts", "companions", id, "personality.md"), "utf8").trim();
  const recent = c.turns.length ? `Earlier in this call:\n${transcript(c)}` : undefined;
  return buildShowroomTalkSystemPrompt({
    companionId: id,
    companionName: c.companion,
    showroomTheme: "video call",
    personality,
    mode: "video_call",
    callSource: "showroom",
    relationshipState: "selected",
    companionMemory: [recent, `Known facts: ${c.item}`].filter(Boolean).join("\n"),
  });
}

/** Earlier turns become alternating messages; narrator and parent lines ride on the user side, as in the product. */
function homeworkMessages(c: EvalCase): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = [];
  const push = (role: "user" | "assistant", text: string) => {
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n${text}`;
    else msgs.push({ role, content: text });
  };
  for (const t of c.turns) {
    if (t.role === "companion") push("assistant", t.text);
    else push("user", t.role === "narrator" ? `[Game narrator said aloud: ${t.text}]` : t.text);
  }
  push("user", c.childLine);
  if (msgs[0]?.role === "assistant") msgs.unshift({ role: "user", content: "[Session in progress]" });
  return msgs;
}

async function regenerate(client: Anthropic, c: EvalCase): Promise<string> {
  const facetime = c.surface === "facetime";
  const model = facetime ? FACETIME_COMPANION_MODEL : HOMEWORK_COMPANION_MODEL;
  const system = facetime ? await facetimeSystemPrompt(c) : await homeworkSystemPrompt(c);
  const messages: Anthropic.MessageParam[] = facetime ? [{ role: "user", content: c.childLine }] : homeworkMessages(c);
  const res = await client.messages.create({ model, max_tokens: 1024, system, messages });
  addUsage(model, res.usage);
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .replace(/\[[a-z_]{2,24}\]\s*/gi, "") // expression tags are silent in the product
    .replace(/\s+/g, " ")
    .trim();
}

function caseScore(group: RubricGroup, code: CodeCheckResult, judge: Record<string, CriterionScore> | null): number | null {
  const vals: number[] = [];
  for (const c of RUBRIC[group]) {
    let v: number | null = null;
    if (c.by === "judge" && judge) v = normalizeScore(c.kind, judge[c.key]?.score ?? null);
    if (c.by === "code") v = (code as unknown as Record<string, number>)[c.key] ?? null;
    if (v !== null) vals.push(v);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function estimate(cases: EvalCase[], mode: string, rubric: string): number {
  const judgeIn = (judgeSystem(rubric).length + 1500) / 3.2; // chars → tokens (rough, conservative)
  const judgeOut = Number(process.env.EVAL_EST_JUDGE_OUT ?? 2500); // thinking + tool call
  const perJudge = (judgeIn * 10 + judgeOut * 50) / 1e6;
  const regenPer = mode === "after" ? (12000 * 2 + 300 * 10) / 1e6 : 0; // ~12k-token companion prompt on Sonnet
  const total = cases.length * (perJudge + regenPer);
  console.log(` 🎮 [eval] [estimate] mode=${mode} cases=${cases.length} judge≈$${perJudge.toFixed(3)}/case regen≈$${regenPer.toFixed(3)}/case total≈$${total.toFixed(2)} budget=$${BUDGET_USD}`);
  return total;
}

function summarize(results: CaseResult[], mode: string): string {
  const groups = [...new Set(results.map((r) => r.group))];
  const lines = [`# Sunny eval — ${mode} — ${RUN_DATE}`, "", `Judge ${JUDGE_MODEL}; cost $${usage.usd.toFixed(2)} over ${usage.calls} calls.`, "", "| Group | Cases | Score (0–100) |", "|---|---|---|"];
  for (const g of groups) {
    const s = results.filter((r) => r.group === g && r.caseScore !== null).map((r) => r.caseScore as number);
    lines.push(`| ${g} | ${s.length} | ${s.length ? Math.round((100 * s.reduce((a, b) => a + b, 0)) / s.length) : "—"} |`);
  }
  lines.push("", "## Per criterion (share of applicable cases scored good)", "");
  for (const g of groups) {
    for (const c of RUBRIC[g]) {
      const vals = results
        .filter((r) => r.group === g)
        .map((r) => (c.by === "code" ? (r.code as unknown as Record<string, number>)[c.key] : c.by === "judge" ? normalizeScore(c.kind, r.judge?.[c.key]?.score ?? null) : null))
        .filter((v): v is number => v !== null && v !== undefined);
      lines.push(`- ${g} ${c.label} [${c.by}]: ${vals.length ? `${Math.round((100 * vals.reduce((a, b) => a + b, 0)) / vals.length)} (n=${vals.length})` : "n/a"}`);
    }
  }
  lines.push("", "## Cases", "");
  for (const r of results) {
    const bad = Object.entries(r.judge ?? {}).filter(([, v]) => v.score === 0 || (v.score !== null && v.score <= 2)).map(([k, v]) => `${k}: ${v.reason}`);
    lines.push(`- **${r.id}** (${r.polarity}) ${r.caseScore === null ? "—" : Math.round(100 * r.caseScore)} · ${r.code.words}w${r.code.short ? "" : " LONG"}${r.code.never_repeats ? "" : " REPEAT"}${r.code.promisePhrases.length ? ` PROMISE(${r.code.promisePhrases.join("|")})` : ""}${r.code.planningNotes ? " PLANNING-NOTE" : ""}${r.code.listOrMarkdown ? " LIST" : ""}${r.judgeError ? ` ERROR ${r.judgeError}` : ""}`);
    if (r.replySource === "regenerated") lines.push(`  - reply: “${r.reply}”`);
    for (const b of bad) lines.push(`  - ${b}`);
  }
  return lines.join("\n");
}

async function main() {
  const [mode = "baseline", ...flags] = process.argv.slice(2);
  if (mode !== "baseline" && mode !== "after") throw new Error(`unknown mode ${mode}`);
  const only = flags.includes("--only") ? flags[flags.indexOf("--only") + 1].split(",") : null;
  const all = loadCases();
  const leaks = promptLeakCheck(all);
  if (leaks.length) {
    console.error(" 🎮 [eval] [prompt-leak-check] [FAIL]", leaks.slice(0, 5));
    process.exit(2);
  }
  console.log(" 🎮 [eval] [prompt-leak-check] [pass] no case text in src/prompts, src/souls, src/companions");
  let cases = mode === "after" ? all.filter((c) => (c.group === "conversation" || c.group === "honesty") && c.regen !== false) : all;
  if (only) cases = cases.filter((c) => only.includes(c.id));
  const rubric = loadRubricText();
  const est = estimate(cases, mode, rubric);
  if (flags.includes("--estimate")) return;
  if (est > BUDGET_USD) throw new Error(`estimate $${est.toFixed(2)} exceeds budget $${BUDGET_USD}; ask the owner first`);

  const client = new Anthropic();
  const results: CaseResult[] = [];
  for (const c of cases) {
    let reply = c.actualReply;
    let replySource: CaseResult["replySource"] = "historical";
    if (mode === "after") {
      reply = await regenerate(client, c);
      replySource = "regenerated";
      console.log(` 🎮 [eval] [regen] case=${c.id} words=${reply.split(/\s+/).length}`);
    }
    const priorSpoken = c.turns.filter((t) => t.role === "companion" || t.role === "narrator").map((t) => t.text);
    const code = runCodeChecks({ child: c.child, reply, childLine: c.childLine, priorSpoken });
    let judge: CaseResult["judge"] = null;
    let judgeError: string | undefined;
    try {
      judge = await judgeOne(client, c, reply, replySource, rubric);
    } catch (err) {
      judgeError = err instanceof Error ? err.message : String(err);
      console.error(` 🎮 [eval] [judge] [failed] case=${c.id} ${judgeError}`);
      if (judgeError.startsWith("budget exceeded")) throw err;
    }
    const score = caseScore(c.group, code, judge);
    results.push({ id: c.id, group: c.group, polarity: c.polarity, reply, replySource, code, judge, judgeError, caseScore: score });
    console.log(` 🎮 [eval] [judged] case=${c.id} score=${score === null ? "—" : Math.round(100 * score)} spent=$${usage.usd.toFixed(2)}`);
  }

  const outDir = path.join(EVALS_DIR, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `${mode}-${RUN_DATE}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ mode, date: RUN_DATE, judgeModel: JUDGE_MODEL, companionModels: { homework: HOMEWORK_COMPANION_MODEL, facetime: FACETIME_COMPANION_MODEL }, usage, results }, null, 2));
  fs.writeFileSync(`${base}.md`, summarize(results, mode));
  console.log(` 🎮 [eval] [done] wrote ${base}.json and .md cost=$${usage.usd.toFixed(2)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(" 🎮 [eval] [run] [failed]", err);
    process.exit(1);
  });
}
