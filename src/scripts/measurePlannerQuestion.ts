import fs from "fs";
import path from "path";

/** Issue #56, step 1: what the next-board Planner question is made of, read only and at $0.
 * Sizes each section of a frozen progression-decision-*-tools.question.json and the fields inside its
 * JSON blocks, so retrieval candidates are chosen from measurements. It prints key names and numbers
 * only: saved words used as keys, map keys and free-text keys are masked, and no value is printed. */
export type PlannerQuestion = { prompt: string; model?: string; facts?: unknown };
export type SectionRow = { section: string; chars: number };
export type FieldRow = { path: string; chars: number; items?: number };
export type PlannerQuestionMeasure = { promptChars: number; toolChars?: number; totalChars: number; sections: SectionRow[]; fields: FieldRow[] };

const MAP_KEYS = 30;
const MAX_DEPTH = 3;

const parseJson = (line: string): unknown => {
  const text = line.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
};
// "Baseline Quest eligibility (runtime truth boundary…):" → "Baseline Quest eligibility"
const label = (line: string) => line.trim().replace(/\s*\(.*$/, "").replace(/:\s*$/, "");

export function measurePlannerQuestion(question: PlannerQuestion, tools?: unknown[]): PlannerQuestionMeasure {
  const lines = question.prompt.split(/(?<=\n)/);
  const sections = new Map<string, number>();
  const blocks: Array<{ section: string; value: unknown }> = [];
  const add = (section: string, chars: number) => sections.set(section, (sections.get(section) ?? 0) + chars);
  for (let i = 0; i < lines.length; i += 1) {
    const value = i + 1 < lines.length ? parseJson(lines[i + 1]) : undefined;
    if (value !== undefined && !parseJson(lines[i])) {
      const section = label(lines[i]);
      add(section, lines[i].length + lines[i + 1].length);
      blocks.push({ section, value });
      i += 1;
    } else add("instructions", lines[i].length);
  }
  const words = new Set<string>();
  for (const { value } of blocks) if (Array.isArray(value)) for (const row of value) if (row && typeof row === "object" && "word" in row) {
    const { word, wordId } = row as { word?: unknown; wordId?: unknown };
    if (typeof word === "string") words.add(word);
    if (typeof wordId === "string") words.add(wordId);
  }
  const fields = new Map<string, FieldRow>();
  const record = (key: string, value: unknown) => {
    const row = fields.get(key) ?? { path: key, chars: 0 };
    row.chars += JSON.stringify(value)?.length ?? 0;
    if (Array.isArray(value)) row.items = (row.items ?? 0) + value.length;
    fields.set(key, row);
  };
  const walk = (value: unknown, at: string, depth: number) => {
    if (depth > MAX_DEPTH || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value) if (item && typeof item === "object" && !Array.isArray(item)) walk(item, `${at}[]`, depth); return; }
    const keys = Object.keys(value);
    const asMap = keys.length > MAP_KEYS;
    for (const key of keys) {
      const name = words.has(key) ? "<word>" : asMap || !/^[A-Za-z_][\w-]*$/.test(key) ? "<key>" : key;
      const child = (value as Record<string, unknown>)[key];
      record(`${at}.${name}`, child);
      walk(child, `${at}.${name}`, depth + 1);
    }
  };
  for (const { section, value } of blocks) { if (Array.isArray(value)) record(`${section}[]`, value); walk(value, section, 1); }
  const promptChars = question.prompt.length;
  const toolChars = tools ? JSON.stringify(tools).length : undefined;
  return { promptChars, ...(toolChars !== undefined ? { toolChars } : {}), totalChars: promptChars + (toolChars ?? 0),
    sections: [...sections].map(([section, chars]) => ({ section, chars })), fields: [...fields.values()] };
}

const pct = (part: number, whole: number) => `${whole ? ((part / whole) * 100).toFixed(1) : "0.0"}%`;
const tokens = (chars: number) => `≈${Math.round(chars / 4).toLocaleString("en-US")}`;

/** Markdown: a growth table across the given questions (in the order given), then the newest one broken down. */
export function renderPlannerQuestionMeasure(entries: Array<{ file: string; measure: PlannerQuestionMeasure }>, opts: { topFields?: number } = {}): string {
  const out: string[] = ["# Planner question size (issue #56, step 1)", "", "Characters; tokens are a rough chars÷4 estimate.", "",
    "| question | total | prompt | tools | ≈tokens |", "|---|---:|---:|---:|---:|"];
  for (const { file, measure } of entries) out.push(`| ${file} | ${measure.totalChars} | ${measure.promptChars} | ${measure.toolChars ?? "n/a"} | ${tokens(measure.totalChars)} |`);
  const latest = entries.at(-1);
  if (!latest) return out.join("\n");
  const { measure } = latest;
  out.push("", `## Sections of ${latest.file}`, "", "| section | chars | share |", "|---|---:|---:|");
  const sections = [...measure.sections, ...(measure.toolChars !== undefined ? [{ section: "tool definitions", chars: measure.toolChars }] : [])];
  for (const row of sections.sort((a, b) => b.chars - a.chars)) out.push(`| ${row.section} | ${row.chars} | ${pct(row.chars, measure.totalChars)} |`);
  out.push("", `## Largest fields in ${latest.file}`, "", "| field | chars | share | items |", "|---|---:|---:|---:|");
  for (const row of [...measure.fields].sort((a, b) => b.chars - a.chars).slice(0, opts.topFields ?? 25))
    out.push(`| ${row.path} | ${row.chars} | ${pct(row.chars, measure.totalChars)} | ${row.items ?? ""} |`);
  return out.join("\n");
}

async function toolsFor(question: PlannerQuestion): Promise<unknown[] | undefined> {
  try {
    const { spellingSuccessorToolkit } = await import("../engine/spellingSuccessorTools");
    // Every built-in counted as re-runnable: the real offer can only be the same size or smaller.
    return spellingSuccessorToolkit({ ...(question.facts as any), rerunnable: () => true }).tools as unknown[];
  } catch (error) {
    console.warn(` 🎮 [planner-measure] [tools] [skipped] ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outArg = args.find(arg => arg.startsWith("--out="))?.slice("--out=".length);
  const files = args.filter(arg => !arg.startsWith("--")).sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  if (!files.length) { console.error("Usage: npx tsx src/scripts/measurePlannerQuestion.ts <question.json>... [--out=report.md]"); process.exit(1); }
  const entries = [];
  for (const file of files) {
    const question = JSON.parse(fs.readFileSync(file, "utf8")) as PlannerQuestion;
    entries.push({ file: path.basename(path.dirname(file)), measure: measurePlannerQuestion(question, await toolsFor(question)) });
  }
  const report = renderPlannerQuestionMeasure(entries);
  if (outArg) { fs.writeFileSync(outArg, report); console.log(` 🎮 [planner-measure] [report] [written] ${outArg} questions=${entries.length}`); }
  else console.log(report);
}

if (require.main === module) main().catch(error => { console.error(` 🎮 [planner-measure] [run] [failed] ${error instanceof Error ? error.stack : String(error)}`); process.exit(1); });
