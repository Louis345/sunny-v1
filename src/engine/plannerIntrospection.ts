import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import { listBoardInstances } from "./learningBoardInstances";
import { listChildProductIssues } from "./productIssues";
import type { LearningCycleDecision, LearningCycleNodeContract, LearningCycleRecordV2, LearningCycleRepositoryOptions, LearningObservation } from "./learningCycleRepository";
export type { PlannerSelfReview } from "./learningCycleRepository";

/**
 * The Planner reviews itself (contract 56, owner 2026-11-08). Code lays out two records as facts: her answers
 * per word, and the Planner's own earlier decisions beside what she did after each. What to conclude is the
 * Planner's: nothing here ranks, judges or recommends.
 */

const SYNTHETIC = /(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i;
const HELP: Record<LearningObservation["assistance"]["status"], string> = { unassisted: "on her own", assisted: "with help", unknown: "help not recorded" };
const clip = (text: string, max = 220) => { const flat = text.replace(/\s+/g, " ").trim(); return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat; };

/** Board numbers in publication order, as she met them (1 is her first board on this list). */
function boardNumbers(cycle: LearningCycleRecordV2) {
  const boards = listBoardInstances(cycle);
  return (nodeId: string) => boards.findIndex(board => board.nodeIds.includes(nodeId)) + 1 || undefined;
}

/** What a stop practiced: its spelling words, or (math) the ids of her recorded problems. */
const targetsOf = (node: LearningCycleNodeContract): string[] => {
  const words = Object.values(node.evidenceContract?.spellingItems ?? {}).map(item => item.word);
  return words.length ? words : Object.keys(node.evidenceContract?.itemContracts ?? {});
};

/** Each scored answer on this list with its word (or math problem id), the stop it came from and that stop's board number. */
function answers(cycle: LearningCycleRecordV2) {
  const wordOf = new Map<string, string>();
  for (const node of cycle.nodes) for (const item of Object.values(node.evidenceContract?.spellingItems ?? {})) wordOf.set(item.id, item.word);
  if (cycle.domain !== "spelling") for (const node of cycle.nodes) for (const id of Object.keys(node.evidenceContract?.itemContracts ?? {})) wordOf.set(id, id);
  const boardOf = boardNumbers(cycle);
  // The most specific node id wins, as in observationNode: `b2-radar` never claims `b2-radar-2`'s answers.
  const nodeOf = (row: LearningObservation) => cycle.nodes.find(node => row.sourceId === `activity:${node.nodeId}:recall`)
    ?? cycle.nodes.filter(node => row.sourceId.endsWith(`:${node.nodeId}`)).sort((a, b) => b.nodeId.length - a.nodeId.length)[0];
  return (cycle.observations ?? []).filter(row => typeof row.result?.correct === "boolean" && wordOf.has(row.itemId) && !SYNTHETIC.test(`${row.observationId} ${row.sourceId}`))
    .map(row => { const node = nodeOf(row); return { row, word: wordOf.get(row.itemId)!, node, board: node ? boardOf(node.nodeId) : undefined }; })
    .sort((a, b) => Date.parse(a.row.observedAt) - Date.parse(b.row.observedAt));
}
type Answer = ReturnType<typeof answers>[number];

const activityOf = (node: LearningCycleNodeContract) => node.implementationType ?? (node.role === "evaluation" ? "discovery-check" : node.mechanic);

/** How many right, and her distinct misspellings with counts, most frequent first ("inport" x3, "impot" x1). */
function tally(list: Answer[]): { right: string; wrote: string } {
  const wrong = new Map<string, number>();
  for (const { row } of list) if (!row.result.correct && row.childResponse?.trim()) wrong.set(row.childResponse.trim(), (wrong.get(row.childResponse.trim()) ?? 0) + 1);
  return { right: `${list.filter(row => row.row.result.correct).length} of ${list.length} right`,
    wrote: [...wrong].sort((a, b) => b[1] - a[1]).map(([text, count]) => `"${clip(text, 40)}" x${count}`).join(", ") };
}

/** Her track record on each word: right on her own and with help, what she wrote when wrong, and where she practiced it. */
export function spellingTrackRecordSection(cycle: LearningCycleRecordV2): string {
  const all = answers(cycle), boardOf = boardNumbers(cycle);
  const words = [...new Set(cycle.nodes.flatMap(node => Object.values(node.evidenceContract?.spellingItems ?? {}).map(item => item.word)))];
  const steady: string[] = [], untried: string[] = [], lines: string[] = [];
  for (const word of words) {
    const rows = all.filter(row => row.word === word);
    if (!rows.length) { untried.push(word); continue; }
    const own = rows.filter(row => row.row.assistance.status === "unassisted");
    if (own.length && own.every(row => row.row.result.correct)) { steady.push(`${word} (${own.length} of ${own.length})`); continue; }
    const buckets = (["unassisted", "assisted", "unknown"] as const).map(status => [status, rows.filter(row => row.row.assistance.status === status)] as const)
      .filter(([, list]) => list.length).map(([status, list]) => { const { right, wrote } = tally(list); return `${HELP[status]} ${right}${wrote ? `, wrote ${wrote}` : ""}`; });
    // Every stop she played or answered with this word, including pages that record no answer.
    const answered = new Set(rows.flatMap(row => row.node ? [row.node.nodeId] : []));
    const stops = cycle.nodes.filter(node => (node.state === "completed" || answered.has(node.nodeId)) && Object.values(node.evidenceContract?.spellingItems ?? {}).some(item => item.word === word))
      .map(node => ({ node, board: boardOf(node.nodeId) })).sort((a, b) => (a.board ?? 0) - (b.board ?? 0));
    const groups = new Map<string, { boards: Set<number>; titles: Set<string> }>();
    for (const { node, board } of stops) {
      const group = groups.get(activityOf(node)) ?? { boards: new Set(), titles: new Set() };
      if (board) group.boards.add(board);
      group.titles.add(node.title);
      groups.set(activityOf(node), group);
    }
    const practiced = [...groups].map(([type, group]) => `${type} on board${group.boards.size === 1 ? "" : "s"} ${[...group.boards].sort((a, b) => a - b).join(", ")} (${[...group.titles].map(title => `"${clip(title, 40)}"`).join(", ")})`);
    const latest = own.at(-1);
    const latestText = latest ? `; latest on her own: "${clip(latest.row.childResponse ?? "", 40)}" (${latest.row.result.correct ? "right" : "missed"}${latest.board ? `, board ${latest.board}` : ""})` : "; not yet answered on her own";
    lines.push(`- ${word}: ${buckets.join("; ")}${practiced.length ? `; practiced in: ${practiced.join(", ")}` : ""}${latestText}`);
  }
  return ["Her track record on each word (code counted every recorded answer on this list; on her own means no help was recorded):", ...lines,
    ...(steady.length ? [`- Right every time she answered on her own: ${steady.join(", ")}`] : []), ...(untried.length ? [`- Not answered yet: ${untried.join(", ")}`] : [])].join("\n");
}

/** Math: her track record on each recorded problem: her first answer on each board (right or not, on her own
 * or with help) and her latest answer. Counted by code; what it means is the Planner's. */
export function mathTrackRecordSection(cycle: LearningCycleRecordV2): string {
  const all = answers(cycle);
  const problems = new Map<string, string>();
  for (const node of cycle.nodes) for (const item of Object.values(node.evidenceContract?.itemContracts ?? {})) if (!problems.has(item.id)) problems.set(item.id, item.prompt);
  const answer = (row: Answer) => `"${clip(row.row.childResponse ?? "", 40)}" ${row.row.result.correct ? "right" : "missed"} ${HELP[row.row.assistance.status]}`;
  const untried: string[] = [], lines: string[] = [];
  for (const [id, prompt] of problems) {
    const rows = all.filter(row => row.word === id);
    if (!rows.length) { untried.push(`${id} "${clip(prompt, 60)}"`); continue; }
    const boards = [...new Set(rows.map(row => row.board ?? 0))].sort((a, b) => a - b);
    const first = boards.map(board => { const row = rows.find(candidate => (candidate.board ?? 0) === board)!; return `${board ? `board ${board}` : "board unknown"}: ${answer(row)}`; });
    const latest = rows.at(-1)!;
    lines.push(`- ${id} "${clip(prompt, 60)}": ${first.join("; ")}; latest: ${answer(latest)}${latest.board ? ` (board ${latest.board})` : ""}; ${rows.length} answer${rows.length === 1 ? "" : "s"} in all`);
  }
  return ["Her track record on each problem (code counted every recorded answer on this assignment; her first answer at each board; on her own means no help was recorded):", ...lines,
    ...(untried.length ? [`- Not answered yet: ${untried.join(", ")}`] : [])].join("\n");
}

/** Your journal: each earlier decision in your words, the board it built, and her results on its words before and after. */
export function plannerJournalSection(cycle: LearningCycleRecordV2): string {
  const header = "Your journal: what you tried on earlier boards and what happened (your words from each decision; her answers counted by code):";
  const decisions = cycle.decisionHistory.filter(row => row.eventType === "theory_decided");
  if (!decisions.length) return `${header}\n- No earlier decisions on this list yet.`;
  const boards = listBoardInstances(cycle), all = answers(cycle);
  const nodes = new Map(cycle.nodes.map(node => [node.nodeId, node]));
  const quoted = (list: string[] | undefined) => (list ?? []).map(text => `"${clip(text)}"`).join(" | ") || "(nothing listed)";
  return [header, ...decisions.flatMap((decision, index) => {
    const at = Date.parse(decision.createdAt), until = decisions[index + 1] ? Date.parse(decisions[index + 1].createdAt) : Infinity;
    const playedBefore = boards.map((board, i) => ({ board, number: i + 1 })).filter(row => row.board.publishedAt && Date.parse(row.board.publishedAt) <= at && row.board.plannerDecisionId !== decision.decisionId).at(-1);
    const builtIndex = boards.findIndex(board => board.plannerDecisionId === decision.decisionId);
    const stops = builtIndex >= 0 ? boards[builtIndex].nodeIds.map(id => nodes.get(id)).filter((node): node is LearningCycleNodeContract => Boolean(node)) : [];
    const targeted = [...new Set(stops.flatMap(targetsOf))];
    const own = (word: string, from: number, to: number) => all.filter(row => row.word === word && row.row.assistance.status === "unassisted" && Date.parse(row.row.observedAt) >= from && Date.parse(row.row.observedAt) < to);
    const result = (list: Answer[]) => { if (!list.length) return "not answered on her own"; const { right, wrote } = tally(list); return `${right}${wrote ? ` (wrote ${wrote})` : ""}`; };
    const review = decision.selfReview?.whatIChangeNow;
    return [
      `- Decision ${index + 1} (${decision.createdAt.slice(0, 10)}${playedBefore ? `, after board ${playedBefore.number}` : ""}; ${decision.nextAction ?? "no action"}; theory ${decision.status ?? "unstated"})`,
      `  Your reason: "${clip(decision.reason)}"`,
      `  You said you would change: ${quoted(decision.change)}`,
      `  You said you would test next: ${quoted(decision.testNext)}`,
      ...(review ? [`  Your self-review then: "${clip(review)}"`] : []),
      builtIndex >= 0 ? `  You built board ${builtIndex + 1}: ${stops.map(node => `${activityOf(node)} "${clip(node.title, 40)}" (${targetsOf(node).join(", ")}${node.focus ? `; aimed at: ${clip(node.focus, 80)}` : ""})`).join("; ")}` : "  No board was built from this decision.",
      ...(targeted.length ? [`  Her answers on those ${cycle.domain === "spelling" ? "words" : "problems"}, on her own, before this decision -> after it (until your next decision):`,
        ...targeted.map(word => `    - ${word}: before ${result(own(word, -Infinity, at))} -> after ${result(own(word, at, until))}`)] : []),
    ];
  })].join("\n");
}

/** What she (or a parent) said about Sunny's games, one line each: when, where (the stop's title when known), her words.
 * Facts only (owner 2026-11-08: "why wouldn't a system naturally infer what is best"): what it means is the reader's. */
export function childFeedbackLines(cycle: LearningCycleRecordV2, opts: LearningCycleRepositoryOptions = {}): string[] {
  const titles = new Map(cycle.nodes.map(node => [node.nodeId, node.title]));
  return listChildProductIssues(cycle.childId, { rootDir: opts.rootDir }).map(row =>
    `${row.createdAt.slice(0, 10)}, at "${clip((row.nodeId && titles.get(row.nodeId)) || row.activityId, 60)}": "${clip(row.childUtterance)}"`);
}

export function childFeedbackSection(cycle: LearningCycleRecordV2, opts: LearningCycleRepositoryOptions = {}): string {
  const lines = childFeedbackLines(cycle, opts);
  return ["What she (or a parent) said about Sunny's games, in her own words (recorded by code, most recent last):", ...(lines.length ? lines.map(line => `- ${line}`) : ["- Nothing recorded yet."])].join("\n");
}

/** One readable entry per saved decision in her folder; a failed write is logged and never stops the board. */
export function writePlannerJournalEntry(cycle: LearningCycleRecordV2, decision: LearningCycleDecision, opts: LearningCycleRepositoryOptions = {}): void {
  try {
    const review = decision.selfReview;
    const dir = path.join(resolveChildContextDir(cycle.childId, { rootDir: opts.rootDir }), "homework", "planner-journal");
    const file = path.join(dir, `${cycle.homeworkId.replace(/[^a-zA-Z0-9_.-]+/g, "_")}.md`);
    const entry = [
      `## ${decision.decisionId}`, "",
      `- Date: ${decision.createdAt}`,
      `- Built on: ${listBoardInstances(cycle).filter(board => board.publishedAt).at(-1)?.boardId ?? "none"}`,
      `- Action: ${decision.nextAction ?? "none"} (theory ${decision.status ?? "unstated"})`,
      `- Reason: ${decision.reason}`, "",
      "### Self-review", "",
      ...(review ? [`- What I tried: ${review.whatITried}`, `- What happened: ${review.whatHappened}`, `- Why: ${review.why}`, `- What I change now: ${review.whatIChangeNow}`] : ["- No self-review was recorded with this decision."]), "",
      "### Change", "", ...((decision.change ?? []).length ? decision.change!.map(line => `- ${line}`) : ["- (nothing listed)"]), "", "",
    ].join("\n");
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, `# Planner journal: ${cycle.homeworkId}\n\n`, "utf8");
    fs.appendFileSync(file, entry, "utf8");
    console.log(` 🎮 [planner-journal] [review] [saved] homework=${cycle.homeworkId} board=${decision.decisionId} self_review=${review ? "yes" : "none"}`);
  } catch (error) {
    console.error(` 🎮 [planner-journal] [review] [write-failed] homework=${cycle.homeworkId} board=${decision.decisionId} reason=${error instanceof Error ? error.message : String(error)}`);
  }
}
