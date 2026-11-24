import { familyClock, familyDay } from "../utils/familyCalendar";
import { observationNode } from "./observationNode";
import { readyOnPaperSection } from "./readyOnPaper";
import { isFirstTryOnHerOwn } from "./sessionTimeline";
import { returnedWorkHelpLabel } from "./longitudinalLearning";
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
export const targetsOf = (node: LearningCycleNodeContract): string[] => {
  const words = Object.values(node.evidenceContract?.spellingItems ?? {}).map(item => item.word);
  return words.length ? words : Object.keys(node.evidenceContract?.itemContracts ?? {});
};

/** Each scored answer on this list with its word (or math problem id), the stop it came from and that stop's board number. */
export function answers(cycle: LearningCycleRecordV2) {
  const wordOf = new Map<string, string>();
  const byConstruct = new Map<string, string>();
  for (const node of cycle.nodes) for (const item of Object.values(node.evidenceContract?.spellingItems ?? {})) { wordOf.set(item.id, item.word); if (item.constructId) byConstruct.set(item.constructId, item.word); }
  // A returned school test has its own item ids, linked to her frozen word by its one primary construct.
  for (const row of cycle.observations ?? []) {
    const primary = row.constructLinks?.find(link => link.role === "primary")?.constructId;
    if (!wordOf.has(row.itemId) && primary && byConstruct.has(primary)) wordOf.set(row.itemId, byConstruct.get(primary)!);
  }
  if (cycle.domain !== "spelling") for (const node of cycle.nodes) for (const id of Object.keys(node.evidenceContract?.itemContracts ?? {})) wordOf.set(id, id);
  const boardOf = boardNumbers(cycle);
  // The most specific node id wins, as in observationNode: `b2-radar` never claims `b2-radar-2`'s answers.
  const nodeOf = (row: LearningObservation) => observationNode(cycle, row);
  return (cycle.observations ?? []).filter(row => typeof row.result?.correct === "boolean" && wordOf.has(row.itemId) && !SYNTHETIC.test(`${row.observationId} ${row.sourceId}`))
    .map(row => { const node = nodeOf(row); return { row, word: wordOf.get(row.itemId)!, node, board: node ? boardOf(node.nodeId) : undefined }; })
    .sort((a, b) => Date.parse(a.row.observedAt) - Date.parse(b.row.observedAt));
}
type Answer = ReturnType<typeof answers>[number];

const SCHOOL = new Set(["graded_work", "delayed_reassessment"]);
const bucketOf = (row: Answer) => SCHOOL.has(String(row.row.provenance)) ? "school" as const : row.row.assistance.status;

export const activityOf = (node: LearningCycleNodeContract) => node.implementationType ?? (node.role === "evaluation" ? "discovery-check" : node.mechanic);

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
    // Her returned school test is its own fact, never folded into practice whose help was not captured.
    const buckets = (["unassisted", "assisted", "unknown", "school"] as const).map(status => [status, rows.filter(row => bucketOf(row) === status)] as const)
      .filter(([, list]) => list.length).map(([status, list]) => { const { right, wrote } = tally(list); return `${status === "school" ? "on the school test" : HELP[status]} ${right}${wrote ? `, wrote ${wrote}` : ""}`; });
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
  const answer = (row: Answer) => `"${clip(row.row.childResponse ?? "", 40)}" ${row.row.result.correct ? "right" : "missed"} ${bucketOf(row) === "school" ? "on the school test" : HELP[row.row.assistance.status]}`;
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

/**
 * Every answer she gave on a math assignment, oldest first, one line each (owner 2026-11-24: a parent saw "she is
 * guessing" from this list in minutes; per-problem summaries hid it when every board brought new problems).
 */
export function mathAnswersSection(cycle: LearningCycleRecordV2): string {
  const prompts = new Map<string, string>();
  for (const node of cycle.nodes) for (const item of Object.values(node.evidenceContract?.itemContracts ?? {})) if (!prompts.has(item.id)) prompts.set(item.id, item.prompt);
  const rows = answers(cycle).map(row => `- ${familyDay(row.row.observedAt)} ${row.word} "${clip(prompts.get(row.word) ?? row.word, 60)}": "${clip(row.row.childResponse ?? "", 40)}" ${row.row.result.correct ? "right" : "missed"}, ${bucketOf(row) === "school" ? "on the school test" : HELP[row.row.assistance.status]}${row.board ? ` (board ${row.board})` : ""}`);
  return ["Every answer she gave on this assignment, oldest first (date, problem, her answer, right or missed, on her own or with help):",
    ...(rows.length ? rows : ["- No answers recorded yet."])].join("\n");
}

/** Each of the Planner's calls with her first try on her own on the board that decision built, if any (2026-11-10:
 * code checks the tutor; owner 2026-11-24: a bet belongs to its experiment's board, never to a later board's answer). */
export function scorePlannerCalls(cycle: LearningCycleRecordV2): Array<{ decision: LearningCycleDecision; itemId: string; label: string; onHerOwn: boolean; board?: number; answer?: LearningObservation; hit?: boolean }> {
  const wordIdOf = new Map<string, { wordId: string; word: string }>();
  for (const node of cycle.nodes) for (const item of Object.values(node.evidenceContract?.spellingItems ?? {})) wordIdOf.set(item.id, { wordId: item.wordId, word: item.word });
  const boards = listBoardInstances(cycle);
  const own = (cycle.observations ?? []).filter(row => isFirstTryOnHerOwn(row) && typeof row.result?.correct === "boolean" && !SYNTHETIC.test(`${row.observationId} ${row.sourceId}`))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  return (cycle.decisionHistory ?? []).filter(row => row.eventType === "theory_decided" && row.expectations?.length).flatMap(decision => {
    const index = boards.findIndex(board => board.plannerDecisionId === decision.decisionId);
    const stops = new Set(index >= 0 ? boards[index].nodeIds : []);
    return decision.expectations!.map(call => {
      const matches = (row: LearningObservation) => (wordIdOf.get(row.itemId)?.wordId ?? row.itemId) === call.itemId && stops.has(observationNode(cycle, row)?.nodeId ?? "");
      const answer = own.find(matches);
      const label = [...wordIdOf.values()].find(row => row.wordId === call.itemId)?.word ?? call.itemId;
      return { decision, itemId: call.itemId, label, onHerOwn: call.onHerOwn, ...(index >= 0 ? { board: index + 1 } : {}), ...(answer ? { answer, hit: answer.result.correct === call.onHerOwn } : {}) };
    });
  });
}

/** How many experiments the ledger shows in full; older ones are only in the tally (owner 2026-11-24: capped cost). */
export const LEDGER_EXPERIMENTS = 5;

/**
 * The experiment ledger (owner 2026-11-24, design v4): each experiment in the tutor's words, the bets code scored on
 * the board it built, a running tally, and how far she is from the goal. Reality grades; nothing here judges.
 */
export function experimentLedgerSection(cycle: LearningCycleRecordV2, schoolTest: string): string {
  const header = "Your experiments, and what reality said (bets scored by code only on the board each experiment built):";
  const decisions = cycle.decisionHistory.filter(row => row.eventType === "theory_decided" && (row.experiment || row.expectations?.length));
  const calls = scorePlannerCalls(cycle), boards = listBoardInstances(cycle);
  const nodes = new Map(cycle.nodes.map(node => [node.nodeId, node]));
  const bet = (call: (typeof calls)[number]) => `${call.label} ${call.onHerOwn ? "right" : "not yet"} -> ${!call.answer ? "not enough evidence (not on this board on her own)"
    : `${call.hit ? "came true" : "missed"}${call.answer.result.correct ? "" : ` ("${clip(call.answer.childResponse ?? "?", 40)}")`}`}`;
  const shown = decisions.slice(-LEDGER_EXPERIMENTS);
  const entries = shown.flatMap(decision => {
    const index = boards.findIndex(board => board.plannerDecisionId === decision.decisionId);
    const stops = index >= 0 ? boards[index].nodeIds.map(id => nodes.get(id)).filter((node): node is LearningCycleNodeContract => Boolean(node)) : [];
    const mine = calls.filter(call => call.decision.decisionId === decision.decisionId);
    const experiment = decision.experiment;
    return [
      `- ${index >= 0 ? `Board ${index + 1}` : "No board built"} (decided ${decision.createdAt.slice(0, 10)}): ${experiment ? `trying "${clip(experiment.trying)}"; why "${clip(experiment.why)}"` : `no experiment written; reason "${clip(decision.reason)}"`}`,
      ...(experiment?.conclusionOnLast ? [`  Your conclusion on the one before: "${clip(experiment.conclusionOnLast)}"`] : []),
      ...(stops.length ? [`  Stops: ${stops.map(node => `${activityOf(node)} "${clip(node.title, 40)}"${node.focus ? ` (aimed at: ${clip(node.focus, 80)})` : ""}`).join("; ")}`] : []),
      `  Bets: ${mine.length ? mine.map(bet).join("; ") : "none made"}`,
    ];
  });
  const scored = calls.filter(call => call.answer);
  const tally = `- All experiments: ${scored.filter(call => call.hit).length} of ${scored.length} scored bets came true; ${calls.length - scored.length} not enough evidence.`;
  const older = decisions.length - shown.length;
  return [header, ...(entries.length ? entries : ["- No experiments yet. decide's experiment and expect_on_her_own start the ledger."]),
    ...(older ? [`- ${older} earlier experiment${older === 1 ? " is" : "s are"} counted in the tally; read_record decisions has each one.`] : []),
    tally, "read_board_wording shows the exact words your last board said to her.", "", distanceToGoalSection(cycle, schoolTest)].join("\n");
}

/** How far she is from the goal, counted by code: spelling, each word's latest first try on her own; math, problems she
 * had not seen, answered on her own, per concept the tutor named in its ready-on-paper calls. */
function distanceToGoalSection(cycle: LearningCycleRecordV2, schoolTest: string): string {
  const own = answers(cycle).filter(row => isFirstTryOnHerOwn(row.row) && !SCHOOL.has(String(row.row.provenance)));
  const lines: string[] = [];
  if (cycle.domain === "spelling") {
    const latest = new Map<string, Answer>();
    for (const row of own) latest.set(row.word, row);
    const missed = [...latest.values()].filter(row => !row.row.result.correct).map(row => row.word);
    lines.push(`- Her words: ${latest.size - missed.length} of ${latest.size} right on her latest try on her own${missed.length ? ` (missed: ${missed.join(", ")})` : ""}.`);
  } else {
    const unseen = own.filter(row => row.row.exposure === "unseen");
    const concepts = [...cycle.decisionHistory].reverse().find(row => row.readyOnPaper?.some(call => call.items?.length))?.readyOnPaper ?? [];
    const grouped = new Set<string>();
    for (const call of concepts.filter(row => row.items?.length)) {
      const rows = unseen.filter(row => call.items!.includes(row.word));
      call.items!.forEach(id => grouped.add(id));
      lines.push(`- ${call.concept}: ${rows.filter(row => row.row.result.correct).length} of ${rows.length} right on problems she had not seen, on her own.`);
    }
    const rest = unseen.filter(row => !grouped.has(row.word));
    if (rest.length || !grouped.size) lines.push(`- ${grouped.size ? "Other problems" : "All problems"}: ${rest.filter(row => row.row.result.correct).length} of ${rest.length} right on problems she had not seen, on her own.`);
  }
  return ["Distance to the goal (counted by code from her first tries on her own):", ...lines, ...(schoolTest ? [`- ${schoolTest}`] : [])].join("\n");
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

/** Every returned school test item, confirmed by a parent, in the order written: the real test is the goal. */
export function schoolTestSection(cycle: LearningCycleRecordV2): string {
  const header = "Her returned school tests (each item as a parent confirmed it from the graded paper):";
  const returned = (cycle.observations ?? []).filter(row => SCHOOL.has(String(row.provenance)) && !SYNTHETIC.test(`${row.observationId} ${row.sourceId}`))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const line = (row: LearningObservation, help?: string) => `- ${row.observedAt.slice(0, 10)}: "${clip(row.prompt ?? row.itemId, 80)}"${row.childResponse ? ` she wrote "${clip(row.childResponse, 40)}"` : ""}: ${row.result?.correct === true ? "right" : row.result?.correct === false ? "missed" : "not marked"}${help ? `, ${help}` : ""}${row.result?.teacherNote ? ` (teacher: ${clip(String(row.result.teacherNote), 80)})` : ""}`;
  // Owner 2026-11-15: a home check (paper done at home after practice, with how much help she had) is its own reference.
  const school = returned.filter(row => row.provenance !== "delayed_reassessment");
  const home = returned.filter(row => row.provenance === "delayed_reassessment");
  const schoolPart = school.length ? [header, ...school.map(row => line(row))].join("\n") : `${header}\n- No returned school test recorded yet.`;
  if (!home.length) return schoolPart;
  return `${schoolPart}\n\n${["Her home checks (paper work done at home after practice, not a school test; a parent recorded how much help she had):", ...home.map(row => line(row, returnedWorkHelpLabel(row.assistance)))].join("\n")}`;
}

/** When the owner closed her board early for this decision, the reason as a fact (with a trailing newline), else "". */
export function ownerReplanLine(cycle: LearningCycleRecordV2): string {
  const last = [...cycle.decisionHistory].reverse().find(row => row.eventType === "theory_decided" || row.eventType === "owner_replan_requested");
  return last?.eventType === "owner_replan_requested" ? `${last.reason}\n` : "";
}

/** Her folder's journal file for one homework: `homework/planner-journal/<homework>.md`. */
export function plannerJournalFile(cycle: Pick<LearningCycleRecordV2, "childId" | "homeworkId">, opts: LearningCycleRepositoryOptions = {}): string {
  return path.join(resolveChildContextDir(cycle.childId, { rootDir: opts.rootDir }), "homework", "planner-journal", `${cycle.homeworkId.replace(/[^a-zA-Z0-9_.-]+/g, "_")}.md`);
}

/** One readable entry per saved decision in her folder; a failed write is logged and never stops the board. */
export function writePlannerJournalEntry(cycle: LearningCycleRecordV2, decision: LearningCycleDecision, opts: LearningCycleRepositoryOptions = {}): void {
  try {
    const review = decision.selfReview;
    const file = plannerJournalFile(cycle, opts), dir = path.dirname(file);
    const entry = [
      `## ${decision.decisionId}`, "",
      `- Date: ${decision.createdAt}`,
      `- Built on: ${listBoardInstances(cycle).filter(board => board.publishedAt).at(-1)?.boardId ?? "none"}`,
      `- Action: ${decision.nextAction ?? "none"} (theory ${decision.status ?? "unstated"})`,
      `- Reason: ${decision.reason}`, "",
      ...(decision.experiment ? ["### Experiment", "", `- Trying: ${decision.experiment.trying}`, `- Why: ${decision.experiment.why}`, `- Conclusion on the last: ${decision.experiment.conclusionOnLast}`,
        `- Bets: ${(decision.expectations ?? []).map(call => `${call.itemId} ${call.onHerOwn ? "right" : "not yet"}`).join(", ") || "none"}`, ""] : []),
      "### Self-review", "",
      ...(review ? [`- What I tried: ${review.whatITried}`, `- What happened: ${review.whatHappened}`, `- Why: ${review.why}`, ...(review.whatIKeep ? [`- What I keep: ${review.whatIKeep}`] : []), `- What I change now: ${review.whatIChangeNow}`] : ["- No self-review was recorded with this decision."]), "",
      "### Read-back", "",
      ...(decision.readBack && !decision.readBack.missing ? [`- Read-back: ${decision.readBack.grade}${decision.readBack.claimedGrade ? ` (it said ${decision.readBack.claimedGrade}, citing no offered evidence)` : ""}: ${decision.readBack.why}`,
        `- Theory read back: ${decision.readBack.previousTheory}`, `- Evidence cited: ${decision.readBack.evidenceIds.join(", ") || "none"}`,
        `- How she thinks: ${decision.readBack.howSheThinks}`, `- Competing explanation: ${decision.readBack.competingExplanation}`, `- How this board tells them apart: ${decision.readBack.boardTellsApart}`]
        : ["- Read-back: unclear (none was given with this decision)."]), "",
      "### Change", "", ...((decision.change ?? []).length ? decision.change!.map(line => `- ${line}`) : ["- (nothing listed)"]), "", "",
    ].join("\n");
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, `# Planner journal: ${cycle.homeworkId}\n\n`, "utf8");
    fs.appendFileSync(file, entry, "utf8");
    console.log(` 🎮 [planner-journal] [review] [saved] homework=${cycle.homeworkId} board=${decision.decisionId} self_review=${review ? "yes" : "none"} experiment=${decision.experiment ? "yes" : "none"}`);
  } catch (error) {
    console.error(` 🎮 [planner-journal] [review] [write-failed] homework=${cycle.homeworkId} board=${decision.decisionId} reason=${error instanceof Error ? error.message : String(error)}`);
  }
}
