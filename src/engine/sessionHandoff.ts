import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { getChildChart } from "../profiles/childChart";
import { resolveChildContextDir } from "../utils/contextRoot";
import { requestForModel } from "./plannerTransport";
import { buildSessionTimeline } from "./sessionTimeline";
import { getLearningCycle, type LearningCycleRecordV2, type LearningCycleRepositoryOptions } from "./learningCycleRepository";

/**
 * The shift handoff (owner, 2026-11-09: "when I was relieved from duty I gave a five-minute report"). After a
 * session, a small model reads that session's conversation between her and her companion beside her recorded
 * answers, and writes the report the Planner reads next: what she tried on each word, what the help actually was,
 * and what she said. Her answers stay counted by code; the handoff explains them. It never blocks a session.
 */
export const handoffModel = () => process.env.SUNNY_HANDOFF_MODEL?.trim() || "claude-haiku-5-5";
type HandoffClient = { messages: { create: (request: Anthropic.Messages.MessageCreateParamsNonStreaming) => Promise<Anthropic.Messages.Message> } };
const SYNTHETIC = /(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i;
const HELP = { unassisted: "on her own", assisted: "with help", unknown: "help not recorded" } as const;

function handoffDir(cycle: Pick<LearningCycleRecordV2, "childId" | "homeworkId">, opts: LearningCycleRepositoryOptions = {}): string {
  return path.join(resolveChildContextDir(cycle.childId, { rootDir: opts.rootDir }), "homework", "handoffs", cycle.homeworkId.replace(/[^a-zA-Z0-9_.-]+/g, "_"));
}

/** Her answers recorded since the session started: word (or problem), what she gave, right or not, help status. */
function answersSince(cycle: LearningCycleRecordV2, startedAt: string): string[] {
  const names = new Map<string, string>();
  for (const node of cycle.nodes) {
    for (const item of Object.values(node.evidenceContract?.spellingItems ?? {})) names.set(item.id, item.word);
    for (const item of Object.values(node.evidenceContract?.itemContracts ?? {})) names.set(item.id, item.prompt);
  }
  const from = Date.parse(startedAt);
  return (cycle.observations ?? []).filter(row => names.has(row.itemId) && Date.parse(row.observedAt) >= from && !SYNTHETIC.test(`${row.observationId} ${row.sourceId}`))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
    .map(row => `${row.observedAt.slice(11, 19)} ${names.get(row.itemId)}: "${row.childResponse ?? ""}" ${row.result?.correct === true ? "right" : row.result?.correct === false ? "missed" : "unscored"}, ${HELP[row.assistance.status]}`);
}

export function buildHandoffAsk(input: { childName: string; companionName: string; homeworkTitle: string; transcript: string; answers: string[]; timeline?: string }): string {
  return `You are writing the shift handoff for a tutoring session, like a nurse's report at the end of a shift. ${input.childName} is a child working with her companion ${input.companionName} on "${input.homeworkTitle}". Her tutor reads your report before planning her next lesson.

${input.timeline ? `${input.timeline}\n\n` : ""}Her recorded answers this session (counted by the system; "with help" means help was recorded, not what kind):
${input.answers.length ? input.answers.join("\n") : "(none recorded)"}

The session's conversation (user is the child, assistant is ${input.companionName}):
${input.transcript}

Write the handoff as the session's retro, in under 320 words, as short bullet lines under these headings:
What went well: what worked for her and when, with the moment things turned (for example when she first understood a game, or what delighted her), quoted, with times from the timeline.
What went wrong: where she got stuck, frustrated or confused and for how long, quoted, with times from the timeline.
Words or problems: for each one, what she tried and exactly what the help was when there was help (for example: spelled every letter for her, gave one chunk, asked a question, only said the word again).
In the room: anything off screen that shaped the session (a parent guiding her, other children, noise).
Report only what the timeline, the conversation and the answers show; her tutor draws the conclusions.`;
}

/** Writes this session's handoff into her folder and returns its path; any failure is logged and returns undefined. */
export async function writeSessionHandoff(input: { childId: string; sessionDir: string; homeworkId?: string; client?: HandoffClient }, opts: LearningCycleRepositoryOptions = {}): Promise<string | undefined> {
  try {
    const transcriptFile = path.join(input.sessionDir, "transcript.md");
    const metadata = JSON.parse(fs.readFileSync(path.join(input.sessionDir, "metadata.json"), "utf8")) as { sessionId?: string; startedAt?: string; child?: string };
    const transcript = fs.existsSync(transcriptFile) ? fs.readFileSync(transcriptFile, "utf8") : "";
    const chart = getChildChart(input.childId, { rootDir: opts.rootDir });
    const cycle = input.homeworkId ? getLearningCycle(input.childId, input.homeworkId, opts) : chart.learningCycle;
    if (!cycle || !metadata.startedAt || !transcript.includes("**user:**")) {
      console.log(` 🎮 [handoff] [skipped] child=${input.childId} reason=${!cycle ? "no_learning_cycle" : !metadata.startedAt ? "no_start_time" : "no_child_turns"}`);
      return undefined;
    }
    const timeline = buildSessionTimeline(input.sessionDir, cycle);
    const gameFacts = timeline.split("\n").filter(line => line.startsWith("Game "));
    const ask = buildHandoffAsk({ childName: metadata.child || input.childId, companionName: chart.companion?.displayName || "her companion",
      homeworkTitle: cycle.assignment?.title ?? cycle.homeworkId, transcript: transcript.slice(-60_000), answers: answersSince(cycle, metadata.startedAt),
      timeline: timeline.slice(0, 12_000) });
    const client = input.client ?? (new Anthropic() as unknown as HandoffClient);
    const message = await client.messages.create(requestForModel({ model: handoffModel(), max_tokens: 8000, messages: [{ role: "user", content: ask }] }));
    const text = message.content.flatMap(block => block.type === "text" ? [block.text] : []).join("\n").trim();
    if (!text) throw new Error("empty_handoff");
    const dir = handoffDir(cycle, opts);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${metadata.startedAt.replace(/[:.]/g, "-")}.md`);
    const counted = `\n\n**Games, counted by code:**\n${gameFacts.length ? gameFacts.map(line => `- ${line}`).join("\n") : "- No game recorded."}`;
    fs.writeFileSync(file, `# Handoff ${metadata.startedAt.slice(0, 16).replace("T", " ")} (session ${metadata.sessionId ?? "unknown"})\n\n${text}${counted}\n`, "utf8");
    console.log(` 🎮 [handoff] [written] child=${input.childId} homework=${cycle.homeworkId} model=${handoffModel()} file=${path.basename(file)} tokens_in=${message.usage?.input_tokens ?? 0} tokens_out=${message.usage?.output_tokens ?? 0}`);
    return file;
  } catch (error) {
    console.error(` 🎮 [handoff] [failed] child=${input.childId} reason=${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/** The last few handoffs for this homework, oldest first, for the Planner's question. */
export function handoffSection(cycle: LearningCycleRecordV2, opts: LearningCycleRepositoryOptions = {}, limit = 3): string {
  const header = "Shift handoffs from her sessions (a small model's summary of each session's conversation with her companion; her answers above are counted by code):";
  const dir = handoffDir(cycle, opts);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith(".md")).sort().slice(-limit) : [];
  if (!files.length) return `${header}\n- No handoff yet.`;
  return [header, ...files.map(name => fs.readFileSync(path.join(dir, name), "utf8").trim().slice(0, 3000))].join("\n\n");
}
