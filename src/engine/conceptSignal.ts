/**
 * The concept signal (docs/specs/child-knowledge-store.md, stage 1; owner + Saori 2026-11-22): how she thinks, kept
 * apart from right/wrong counts. Code lays out three kinds of fact, each with an id the Planner can cite:
 *   - her own words about understanding ("I don't understand the concept"), verbatim and dated;
 *   - problems or words right only with help (help-dependence);
 *   - her wrong answers exactly as she gave them, grouped by the Planner's own concept tags (ready_on_paper items).
 * Code names no misconception and ranks nothing: what the pattern means is the Planner's to infer.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import type { LearningCycleRecordV2, LearningCycleRepositoryOptions, LearningObservation } from "./learningCycleRepository";

const SYNTHETIC = /(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i;
/** Statements about understanding, either way ("I don't get it", "now I get it", "that makes sense", "I'm confused"). */
const ABOUT_UNDERSTANDING = /\b(understand|understood|get it|got it|don'?t get|confus|makes? (no )?sense|know how|what does .{1,40} mean|i don'?t know why)/i;
const MAX_WORDS = 12, MAX_ITEMS_PER_CONCEPT = 10, MAX_ANSWERS_PER_ITEM = 6;
const clip = (text: string, max = 160) => { const flat = text.replace(/\s+/g, " ").trim(); return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat; };
const minute = (iso: string) => iso.slice(0, 16).replace("T", " ");

/** A short, stable id for one recorded answer (observation ids run to 120 characters). */
export const observationEvidenceId = (observationId: string): string => `ans-${crypto.createHash("sha1").update(observationId).digest("hex").slice(0, 8)}`;

type Said = { id: string; at: string; words: string; source?: string };

/** Her words to her companions since this assignment began (companion_interactions, one file per day). */
function herWordsAboutUnderstanding(cycle: Pick<LearningCycleRecordV2, "childId" | "createdAt">, opts: LearningCycleRepositoryOptions): Said[] {
  const dir = path.join(resolveChildContextDir(cycle.childId, { rootDir: opts.rootDir }), "companion_interactions");
  const since = cycle.createdAt.slice(0, 10);
  let files: string[] = [];
  try { files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(name) && name.slice(0, 10) >= since).sort() : []; }
  catch (error) { console.warn(` 🎮 [concept-signal] [her-words] [unreadable] child=${cycle.childId} reason=${error instanceof Error ? error.message : String(error)}`); }
  const said: Said[] = [];
  for (const file of files) {
    let lines: string[] = [];
    try { lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n"); } catch { continue; }
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { id?: unknown; questionText?: unknown; createdAt?: unknown; callSource?: unknown };
        if (typeof row.id !== "string" || typeof row.questionText !== "string" || typeof row.createdAt !== "string") continue;
        if (row.createdAt < cycle.createdAt || !ABOUT_UNDERSTANDING.test(row.questionText)) continue;
        said.push({ id: row.id, at: row.createdAt, words: row.questionText, ...(typeof row.callSource === "string" ? { source: row.callSource } : {}) });
      } catch { /* one unreadable line never hides the rest */ }
    }
  }
  return said.sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_WORDS);
}

/** The Planner's own concept tag for each item, from its ready_on_paper calls (the latest call naming an item wins). */
function conceptOfItem(cycle: Pick<LearningCycleRecordV2, "decisionHistory">): Map<string, string> {
  const concept = new Map<string, string>();
  for (const decision of cycle.decisionHistory ?? []) for (const call of decision.readyOnPaper ?? []) for (const id of call.items ?? []) concept.set(id, call.concept.trim());
  return concept;
}

/** Each item's prompt as she saw it: a math problem's text, or a spelling word. */
function itemTexts(cycle: Pick<LearningCycleRecordV2, "nodes">): Map<string, string> {
  const texts = new Map<string, string>();
  for (const node of cycle.nodes ?? []) {
    for (const item of Object.values(node.evidenceContract?.itemContracts ?? {})) if (!texts.has(item.id)) texts.set(item.id, item.prompt);
    for (const item of Object.values(node.evidenceContract?.spellingItems ?? {})) if (!texts.has(item.id)) texts.set(item.id, item.word);
  }
  return texts;
}

const helpLabel = (row: LearningObservation) => row.assistance.status === "unassisted" ? "on her own" : row.assistance.status === "assisted" ? "with help" : "help not recorded";

export function conceptSignalSection(cycle: LearningCycleRecordV2, opts: LearningCycleRepositoryOptions = {}): { text: string; evidenceIds: string[] } {
  const evidenceIds: string[] = [];
  const said = herWordsAboutUnderstanding(cycle, opts);
  evidenceIds.push(...said.map(row => `said:${row.id}`));

  const texts = itemTexts(cycle), concepts = conceptOfItem(cycle);
  const rows = (cycle.observations ?? []).filter(row => typeof row.result?.correct === "boolean" && texts.has(row.itemId) && !SYNTHETIC.test(`${row.observationId} ${row.sourceId}`))
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const byItem = new Map<string, LearningObservation[]>();
  for (const row of rows) byItem.set(row.itemId, [...(byItem.get(row.itemId) ?? []), row]);
  const label = (itemId: string) => `"${clip(texts.get(itemId) ?? itemId, 80)}"`;

  // Right only with help: right at least once with help, never right on her own.
  const helpOnly: string[] = [];
  for (const [itemId, list] of byItem) {
    const helpedRight = list.filter(row => row.result.correct && row.assistance.status === "assisted");
    if (!helpedRight.length || list.some(row => row.result.correct && row.assistance.status === "unassisted")) continue;
    const own = list.filter(row => !row.result.correct && row.assistance.status === "unassisted" && row.childResponse?.trim());
    evidenceIds.push(...helpedRight.map(row => observationEvidenceId(row.observationId)));
    helpOnly.push(`- ${label(itemId)}${concepts.has(itemId) ? ` (${concepts.get(itemId)})` : ""}: right with help ${helpedRight.length} time${helpedRight.length === 1 ? "" : "s"}; ${own.length ? `on her own she wrote ${own.map(row => `"${clip(row.childResponse!, 30)}"`).join(", ")}` : "not answered on her own yet"} [${helpedRight.map(row => observationEvidenceId(row.observationId)).join(", ")}]`);
  }

  // Her wrong answers, as she gave them, per concept the Planner named.
  const groups = new Map<string, string[]>();
  for (const [itemId, list] of byItem) {
    const wrong = list.filter(row => !row.result.correct && row.childResponse?.trim()).slice(-MAX_ANSWERS_PER_ITEM);
    if (!wrong.length) continue;
    evidenceIds.push(...wrong.map(row => observationEvidenceId(row.observationId)));
    const key = concepts.get(itemId) ?? "";
    groups.set(key, [...(groups.get(key) ?? []), `${label(itemId)} → ${wrong.map(row => `"${clip(row.childResponse!, 30)}" (${helpLabel(row)}) [${observationEvidenceId(row.observationId)}]`).join(", ")}`]);
  }
  const wrongLines = [...groups].sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1)).map(([concept, items]) => {
    const shown = items.slice(-MAX_ITEMS_PER_CONCEPT), hidden = items.length - shown.length;
    return `- ${concept || "Problems you have not tagged to a concept"}: ${shown.join("; ")}${hidden ? `; and ${hidden} earlier item${hidden === 1 ? "" : "s"} in read_record observations` : ""}`;
  });

  console.log(` 🎮 [concept-signal] [built] homework=${cycle.homeworkId} her_words=${said.length} help_only=${helpOnly.length} wrong_groups=${groups.size}`);
  const text = [
    "How she thinks, kept apart from right/wrong counts (facts laid out by code; what they mean is yours to infer). Cite the ids in brackets.",
    "Her own words about understanding, to her companions on this assignment (verbatim from speech-to-text, newest last):",
    ...(said.length ? said.map(row => `- [said:${row.id}] ${minute(row.at)}: "${clip(row.words)}"`) : ["- Nothing she said about understanding is recorded on this assignment yet."]),
    "Right only with help (right with help, not yet right on her own):",
    ...(helpOnly.length ? helpOnly : ["- None."]),
    "Her wrong answers, exactly as she gave them, grouped by your own concept tags from ready_on_paper:",
    ...(wrongLines.length ? wrongLines : ["- No wrong answers recorded yet."]),
  ].join("\n");
  return { text, evidenceIds: [...new Set(evidenceIds)] };
}
