import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { SANDBOX_CHILDREN } from "./cases";
import { askModel, blindOrder, buildAsk, checkActivities, dryClient, renderPage, runSandbox, spellingMenu, type Activity } from "./sandbox";

const wrestler = SANDBOX_CHILDREN.find(child => child.id === "wrestler")!;
const menu = spellingMenu(wrestler);
afterEach(() => { vi.unstubAllGlobals(); });

it("offers Sunny's real spelling menu, without rewards or encounters", () => {
  const ids = menu.map(game => game.id);
  expect(ids).toContain("word-radar");
  expect(ids).not.toContain("wordle");
  for (const id of ["mystery", "quest", "boss"]) expect(ids).not.toContain(id);
  // Dry run 2026-10-27: modes were read from the wrong field, so every game looked mode-less.
  expect(menu.find(game => game.id === "word-radar")?.modes).toContain("hidden_word_recall");
});

it("gives every model the same ask, with only her words and real games to choose from", () => {
  const ask = buildAsk(wrestler, menu);
  expect(buildAsk(wrestler, menu).hash).toBe(ask.hash);
  const item = (ask.tool.input_schema.properties as any).activities.items.properties;
  expect(item.words.items.enum).toEqual(wrestler.words);
  expect(item.game.enum).toEqual(menu.map(game => game.id));
  expect(ask.prompt).toContain("Wrestling practice");
});

it("asks each model the way it accepts: forced tool for today's models, its own choice for the 5.5 models", async () => {
  const ask = buildAsk(wrestler, menu);
  const sent: any[] = [];
  const client = { messages: { create: async (request: any) => { sent.push(request); return dryClient("x").messages.create(request); } } };
  await askModel(client, "claude-sonnet-5", ask, wrestler, menu);
  await askModel(client, "claude-sonnet-5-5", ask, wrestler, menu);
  expect(sent[0].tool_choice).toEqual({ type: "tool", name: "propose_activities" });
  expect(sent[1].tool_choice).toEqual({ type: "auto" });
  expect(sent[0].messages).toEqual(sent[1].messages);
});

it("checks report words that are not hers and games Sunny cannot run", () => {
  const row = (game: string, words: string[], mode = ""): Activity => ({ title: "t", story: "A wrestling match", game, mode, words, picture: "p", why_her: "w" });
  const checks = checkActivities([row("word-radar", ["catch", "zebra"], "hidden_word_recall"), row("wordle", ["knee"]), row("word-radar", ["knock"], "hidden_word_recall")], wrestler, menu);
  const byName = Object.fromEntries(checks.map(check => [check.name, check]));
  expect(byName["only her words"]).toMatchObject({ passed: false, detail: "not hers: zebra" });
  expect(byName["real games"].passed).toBe(false);
  expect(byName["different games"].passed).toBe(false);
  expect(byName["missed words"]).toMatchObject({ passed: false, detail: "2 of 3 missed words practiced" });
  expect(byName["her interests (rough)"].passed).toBe(true);
});

it("keeps model names out of the page until Reveal", async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spelling-sandbox-"));
  const { file } = await runSandbox({ models: ["claude-sonnet-5", "claude-opus-5-5"], caseIds: ["wrestler"], dry: true, outputRoot });
  const html = fs.readFileSync(file, "utf8");
  const [visible, data] = html.split('<script type="application/json" id="data">');
  expect(visible).not.toMatch(/claude-|sonnet|opus/i);
  expect(data).toContain("claude-opus-5-5");
  expect(html).toContain("Ila picks A");
  fs.rmSync(outputRoot, { recursive: true, force: true });
});

it("shuffles cards the same way every time for a run, independent of the order models were asked", () => {
  expect(blindOrder("run", "wrestler", ["a", "b", "c"])).toEqual(blindOrder("run", "wrestler", ["a", "b", "c"]));
  const orders = new Set(["r1", "r2", "r3", "r4", "r5"].map(run => blindOrder(run, "wrestler", ["a", "b", "c"]).join("")));
  expect(orders.size).toBeGreaterThan(1);
});

it("makes a dry run with no network at all, and refuses a real child", async () => {
  vi.stubGlobal("fetch", () => { throw new Error("network_forbidden"); });
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spelling-sandbox-"));
  const { run } = await runSandbox({ models: ["a", "b"], dry: true, outputRoot });
  expect(run.cases.map(row => row.child.id)).toEqual(SANDBOX_CHILDREN.map(child => child.id));
  expect(run.cases.every(row => row.candidates.every(candidate => !candidate.error && candidate.activities.length === 3))).toBe(true);
  fs.rmSync(outputRoot, { recursive: true, force: true });
  SANDBOX_CHILDREN.push({ id: "ila", words: ["a"], missedWords: [], soul: "" });
  try { await expect(runSandbox({ models: ["a"], dry: true, caseIds: ["ila"] })).rejects.toThrow("sandbox_real_child_refused:ila"); }
  finally { SANDBOX_CHILDREN.pop(); }
});

it("stops asking once the token cap is reached", async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spelling-sandbox-"));
  const client = { messages: { create: async (request: any) => ({ ...(await dryClient("x").messages.create(request)), usage: { input_tokens: 600, output_tokens: 500 } }) as any } };
  const { run } = await runSandbox({ models: ["a", "b", "c"], caseIds: ["wrestler"], maxTokens: 1000, client, outputRoot });
  expect(run.cases[0].candidates.map(candidate => candidate.error ?? "asked")).toEqual(["asked", "token cap 1000 reached; not asked", "token cap 1000 reached; not asked"]);
  fs.rmSync(outputRoot, { recursive: true, force: true });
});
