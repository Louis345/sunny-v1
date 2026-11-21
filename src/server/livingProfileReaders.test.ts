import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openChart } from "../chart/db";
import { recordFact } from "../chart/spelling/record";
import { readSoulWithCurrentFacts } from "../profiles/soulCurrentFacts";
import { applyCompanionRelationshipToolUses } from "./companionChildFacts";
import { recordCompanionInteractionEvent } from "./companionInteractionMemory";
import { RECALL_ABOUT_HER_TOOL, getShowroomRelationshipTools } from "./companionShowroomTalk";
import { runForgetChildFact } from "../scripts/forgetChildFact";
import { readLivingProfile } from "./livingProfileFacts";

// The living profile reaches the Planner through her soul, companions can recall older things on demand, and the owner
// removes a wrong fact with one command (2026-11-11).
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "living-readers-"));
  vi.stubEnv("SUNNY_CHART_DIR", path.join(root, "charts"));
  fs.mkdirSync(path.join(root, "src/context/lab-reina"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/context/lab-reina/soul.md"), "# Reina\n## Favorite things\n- wrestling with dad\n");
  const db = openChart("lab-reina");
  const fact = (factId: string, topic: string, statement: string, quote: string, at: string) => recordFact(db, "child.fact_learned",
    { factId, topic, kind: "like", statement, quote, speaker: "caller_child", sessionId: "call", companionId: "hikari", sourceEventIds: ["e1"] } as never, { occurred_at: at });
  fact("f1", "wrestling", "Reina loves wrestling with her dad.", "I love wrestling", "2026-11-01T22:00:00.000Z");
  fact("f2", "wrestling", "Reina doesn't like wrestling anymore; she got hurt.", "I got hurt", "2026-11-11T22:00:00.000Z");
  db.close();
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it("the Planner's soul carries what she said lately, ahead of the older profile", () => {
  const soul = readSoulWithCurrentFacts("lab-reina", { rootDir: root });
  expect(soul).toContain("Reina doesn't like wrestling anymore; she got hurt.");
  expect(soul).not.toContain("Reina loves wrestling with her dad.");
  expect(soul.indexOf("got hurt")).toBeLessThan(soul.indexOf("wrestling with dad"));
});

it("any companion can recall older things she said, with dates, including what a newer fact replaced", () => {
  recordCompanionInteractionEvent({ childId: "lab-reina", companionId: "elli", callSource: "showroom", relationshipState: "earned_reward", eventType: "companion_talk_completed",
    questionText: "my wrestling coach is mean", companionText: "Oh no.", commandCount: 0, visionUsed: false, createdAt: "2026-11-09T22:00:00.000Z" }, { rootDir: root });
  expect(getShowroomRelationshipTools().map(tool => tool.name)).toContain(RECALL_ABOUT_HER_TOOL);
  const [result] = applyCompanionRelationshipToolUses({ childId: "lab-reina", companionId: "hikari", content: [{ type: "tool_use", id: "t1", name: RECALL_ABOUT_HER_TOOL, input: { query: "wrestling" } }] }, { rootDir: root });
  const body = JSON.parse(result.content);
  expect(result.is_error).toBe(false);
  expect(body.facts.map((fact: { statement: string; current: boolean }) => [fact.statement, fact.current])).toEqual([
    ["Reina doesn't like wrestling anymore; she got hurt.", true], ["Reina loves wrestling with her dad.", false]]);
  expect(body.said).toEqual([{ on: "2026-11-09", to: "elli", herWords: "my wrestling coach is mean" }]);
});

it("one command removes a wrong fact, and the topic falls back to the one before", async () => {
  const lines: string[] = [];
  await runForgetChildFact(["--child", "lab-reina", "--fact", "f2", "--reason", "That was her sister"], { log: line => lines.push(line) });
  expect(readLivingProfile("lab-reina")!.current.map(fact => fact.factId)).toEqual(["f1"]);
  await runForgetChildFact(["--child", "lab-reina", "--list"], { log: line => lines.push(line) });
  expect(lines.join("\n")).toContain("f1");
  await expect(runForgetChildFact(["--child", "lab-reina", "--fact", "f2"], { log: () => undefined })).rejects.toThrow("reason");
});
