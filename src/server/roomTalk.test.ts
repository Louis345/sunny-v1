import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { RoomTalkBuffer, summarizeAndSaveRoomTalk } from "./roomTalk";
import { readChildEvidenceSection } from "../profiles/childEvidence";

// Human-caught 2026-11-23 (Ila, board 14): with Elli minimized she said "six steps to four... four steps to five closer
// closer to fifty", her best evidence of the night, and code sent it only to the server console. The Planner knew it
// only because a person wrote it into a teaching note. Why logs did not help: the words were logged, never saved to her
// record. Why the lab missed it: no test asked where minimized speech goes. Now the room talk is kept for the session
// and a cheap model writes one digest at the end, with quotes checked against what was heard.
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it("keeps one line per thing said: a transcript that grows as she talks replaces its shorter self", () => {
  const buffer = new RoomTalkBuffer();
  buffer.add("2026-11-23T22:35:10Z", "Five...");
  buffer.add("2026-11-23T22:35:17Z", "Five... so six steps to four four four steps to five closer closer to fifty.");
  buffer.add("2026-11-23T22:35:20Z", "Five... so six steps to four four four steps to five closer closer to fifty.");
  buffer.add("2026-11-23T22:35:36Z", "The dollar money model.");
  expect(buffer.lines().map(row => row.text)).toEqual(["Five... so six steps to four four four steps to five closer closer to fifty.", "The dollar money model."]);
});

it("saves a digest to her record at session end, with only quotes that were really heard, and the Planner can read it", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "room-talk-")); roots.push(rootDir);
  fs.mkdirSync(path.join(rootDir, "src/context/lab-ila"), { recursive: true });
  const buffer = new RoomTalkBuffer();
  buffer.add("2026-11-23T22:35:17Z", "Five... so six steps to four four four steps to five closer closer to fifty.");
  buffer.add("2026-11-23T22:35:44Z", "The dollar money model. It was halfway. Like, halfway, do the... what do I do?");
  const summarize = vi.fn(async () => ({
    summary: "She reasoned about which house was closer; an adult used money to explain halfway.",
    her_words: [{ quote: "closer to fifty", shows: "She judged 'closer' by counting steps." }, { quote: "I invented this", shows: "not heard" }],
    adults_teaching: [{ quote: "It was halfway", what: "An adult explained halfway with money." }],
    feelings: [],
  }));
  const saved = await summarizeAndSaveRoomTalk({ childId: "lab-ila", sessionId: "s1", lines: buffer.lines(), summarize }, { rootDir });
  expect(summarize).toHaveBeenCalledTimes(1);
  expect(saved?.herWords.map(row => row.quote)).toEqual(["closer to fifty"]);
  expect(saved?.droppedQuotes).toBe(1);
  const rows = readChildEvidenceSection("room_talk", { childId: "lab-ila", asOf: "2026-12-01T00:00:00Z", rootDir }) as Array<Record<string, unknown>>;
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows[0])).toContain("closer to fifty");
  expect(JSON.stringify(rows[0])).not.toContain("I invented this");
});

it("an empty session calls no model and saves nothing", async () => {
  const summarize = vi.fn();
  expect(await summarizeAndSaveRoomTalk({ childId: "lab-ila", sessionId: "s2", lines: [], summarize }, { rootDir: os.tmpdir() })).toBeUndefined();
  expect(summarize).not.toHaveBeenCalled();
});

it("the Planner's question shows the session digest and her quotes beside her words", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "room-talk-planner-")); roots.push(rootDir);
  fs.mkdirSync(path.join(rootDir, "src/context/lab-ila"), { recursive: true });
  const buffer = new RoomTalkBuffer();
  buffer.add("2026-11-23T22:35:17Z", "Five... so six steps to four four four steps to five closer closer to fifty.");
  await summarizeAndSaveRoomTalk({ childId: "lab-ila", sessionId: "s1", lines: buffer.lines(),
    summarize: async () => ({ summary: "She counted steps on the hill.", her_words: [{ quote: "closer to fifty", shows: "closer by counting" }], adults_teaching: [], feelings: [] }) }, { rootDir });
  const { conceptSignalSection } = await import("../engine/conceptSignal");
  const cycle = { childId: "lab-ila", homeworkId: "hw", createdAt: "2026-11-20T00:00:00Z", nodes: [], observations: [], decisionHistory: [] } as never;
  const section = conceptSignalSection(cycle, { rootDir });
  expect(section.text).toContain("What the kiosk mic heard at the table while her companion was minimized");
  expect(section.text).toContain('she: "closer to fifty"');
  expect(section.evidenceIds.some(id => id.startsWith("room:"))).toBe(true);
});
