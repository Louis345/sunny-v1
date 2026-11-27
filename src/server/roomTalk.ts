/**
 * Room talk (owner 2026-11-23): what the kiosk mic hears while her companion is minimized. Kept for the session, then
 * one cheap-model digest at session end goes into her record (room_talk), so the Planner sees what was said at the
 * table. Anyone in the room may be speaking; quotes are kept only when they were really heard. Raw lines stay in the
 * server console as before; the record holds the digest.
 */
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { requestForModel } from "../engine/plannerTransport";
import { resolveChildContextDir } from "../utils/contextRoot";
import { familyDay } from "../utils/familyCalendar";

export type RoomLine = { at: string; text: string };
type Quote = { quote: string; shows?: string; what?: string };
export type RoomTalkDigestInput = { summary: string; her_words: Quote[]; adults_teaching: Quote[]; feelings: Quote[] };
export type RoomTalkDigest = { id: string; sessionId: string; at: string; heardLines: number; model: string; summary: string;
  herWords: Quote[]; adultsTeaching: Quote[]; feelings: Quote[]; droppedQuotes: number };

const MODEL = "claude-haiku-4-5-20251001";
const MAX_LINES = 400, MAX_CHARS = 24_000;
const plain = (text: string) => text.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** One line per thing said: speech-to-text re-sends a growing transcript, and the longest version replaces the rest. */
export class RoomTalkBuffer {
  private rows: RoomLine[] = [];
  add(at: string, text: string): void {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const last = this.rows.at(-1);
    if (last && plain(clean).startsWith(plain(last.text))) { this.rows[this.rows.length - 1] = { at, text: clean }; return; }
    if (last && plain(last.text).startsWith(plain(clean))) return;
    this.rows.push({ at, text: clean });
    if (this.rows.length > MAX_LINES) this.rows.shift();
  }
  lines(): RoomLine[] { return [...this.rows]; }
}

const DIGEST_TOOL = "save_room_talk_digest";

async function summarizeWithHaiku(lines: RoomLine[]): Promise<RoomTalkDigestInput> {
  const client = new Anthropic();
  const heard = lines.map(row => `[${row.at.slice(11, 19)}] ${row.text}`).join("\n").slice(-MAX_CHARS);
  const quoteList = (description: string) => ({ type: "array", maxItems: 8, items: { type: "object", additionalProperties: false,
    properties: { quote: { type: "string", description: "Exact words copied from what was heard." }, shows: { type: "string", description } }, required: ["quote", "shows"] } });
  const message = await client.messages.create(requestForModel({
    model: MODEL,
    max_tokens: 900,
    system: "You read what a kiosk microphone heard beside a 9-year-old during her homework session, while her on-screen companion was minimized. Several people can be speaking: the child, her parents, her sister. Speech-to-text is rough. You write a short digest for her tutor, who plans her next lessons.",
    messages: [{ role: "user", content: `What was heard, oldest first:\n${heard}\n\nCall ${DIGEST_TOOL} once.` }],
    tools: [{ name: DIGEST_TOOL, description: "Save the digest for her tutor.", input_schema: { type: "object", additionalProperties: false, properties: {
      summary: { type: "string", description: "Two or three sentences: what happened at the table during the work." },
      her_words: quoteList("What it shows about how she thinks about the work (her reasoning, questions, confusion)."),
      adults_teaching: quoteList("What an adult explained or how."),
      feelings: quoteList("How she felt about the work or Sunny."),
    }, required: ["summary", "her_words", "adults_teaching", "feelings"] } }],
    tool_choice: { type: "tool", name: DIGEST_TOOL },
  }));
  const block = message.content.find(row => row.type === "tool_use" && row.name === DIGEST_TOOL) as { input?: unknown } | undefined;
  if (!block?.input || typeof block.input !== "object") throw new Error("room_talk_digest_missing");
  return block.input as RoomTalkDigestInput;
}

export function roomTalkDir(childId: string, opts: { rootDir?: string } = {}): string {
  return path.join(resolveChildContextDir(childId, { rootDir: opts.rootDir }), "room_talk");
}

/** Session end: one digest of the room talk, saved to her record. Nothing heard is nothing saved and no model call. */
export async function summarizeAndSaveRoomTalk(
  input: { childId: string; sessionId: string; lines: RoomLine[]; summarize?: (lines: RoomLine[]) => Promise<RoomTalkDigestInput> },
  opts: { rootDir?: string } = {},
): Promise<RoomTalkDigest | undefined> {
  if (!input.lines.length) return undefined;
  const raw = await (input.summarize ?? summarizeWithHaiku)(input.lines);
  const heard = plain(input.lines.map(row => row.text).join(" "));
  let dropped = 0;
  const keep = (rows: Quote[] | undefined) => (Array.isArray(rows) ? rows : []).filter(row => {
    const ok = typeof row?.quote === "string" && plain(row.quote).length > 0 && heard.includes(plain(row.quote));
    if (!ok) dropped += 1;
    return ok;
  });
  const at = input.lines.at(-1)!.at;
  const digest: RoomTalkDigest = {
    id: `room:${crypto.createHash("sha256").update(`${input.childId}:${input.sessionId}`).digest("hex").slice(0, 16)}`,
    sessionId: input.sessionId, at, heardLines: input.lines.length, model: input.summarize ? "test" : MODEL,
    summary: String(raw.summary ?? "").slice(0, 800),
    herWords: keep(raw.her_words), adultsTeaching: keep(raw.adults_teaching), feelings: keep(raw.feelings), droppedQuotes: dropped,
  };
  const dir = roomTalkDir(input.childId, opts);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${familyDay(at)}.ndjson`), `${JSON.stringify(digest)}\n`);
  console.log(` 🎮 [room-talk] [digest] [saved] child=${input.childId} session=${input.sessionId} heard=${input.lines.length} her_words=${digest.herWords.length} dropped_quotes=${dropped}`);
  return digest;
}
