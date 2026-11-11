import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openChart, type ChartDatabase } from "../chart/db";
import { exportEvents } from "../chart/exportEvents";
import { recordFact } from "../chart/spelling/record";
import { projectLivingProfile } from "../chart/livingProfile";

// 2026-11-11 owner: "the soul.md file, it's not static. It grows… maybe Reina hates wrestling. She gets hurt… her soul
// file updates with that context. So then she's not constantly reminded." Facts come from her own words in a call she
// opened, each with her exact quote; the newest fact on a topic is what everyone reads; a parent can retract one.
let root: string, db: ChartDatabase;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "living-profile-")); db = openChart("lab-living", { chartDir: root }); });
afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });

const learned = (factId: string, topic: string, statement: string, quote: string, at: string, kind = "like") =>
  recordFact(db, "child.fact_learned", { factId, topic, kind, statement, quote, speaker: "caller_child", sessionId: "call-1", companionId: "hikari", sourceEventIds: ["companion_interaction_1"] } as never, { occurred_at: at });

it("the newest fact on a topic is current; the older one stays in her history", () => {
  learned("f1", "Wrestling", "Reina loves wrestling with her dad.", "I love wrestling with daddy", "2026-11-01T22:00:00.000Z");
  learned("f2", "wrestling", "Reina doesn't like wrestling anymore; she got hurt.", "I don't like wrestling anymore I got hurt", "2026-11-11T22:00:00.000Z", "dislike");
  learned("f3", "unicorns", "Reina likes unicorns.", "unicorns are the best", "2026-11-05T22:00:00.000Z");
  const profile = projectLivingProfile(exportEvents(db));
  expect(profile.current.map(fact => fact.factId)).toEqual(["f2", "f3"]);
  expect(profile.current[0]).toMatchObject({ topic: "wrestling", kind: "dislike", quote: "I don't like wrestling anymore I got hurt", learnedOn: "2026-11-11", replaces: ["f1"] });
  expect(profile.history.map(fact => fact.factId)).toEqual(["f1", "f3", "f2"]);
});

it("a parent retraction removes a wrong fact from what everyone reads, and the topic falls back to the one before", () => {
  learned("f1", "wrestling", "Reina loves wrestling.", "I love wrestling", "2026-11-01T22:00:00.000Z");
  learned("f2", "wrestling", "Reina hates wrestling.", "I hate wrestling", "2026-11-11T22:00:00.000Z", "dislike");
  recordFact(db, "child.fact_retracted", { factId: "f2", reason: "That was her sister talking." } as never);
  const profile = projectLivingProfile(exportEvents(db));
  expect(profile.current.map(fact => fact.factId)).toEqual(["f1"]);
  expect(profile.retracted).toEqual([{ factId: "f2", reason: "That was her sister talking." }]);
});

it("refuses a fact without her words, from anyone but the caller, or a retraction of a fact that does not exist", () => {
  expect(() => recordFact(db, "child.fact_learned", { factId: "x", topic: "t", kind: "like", statement: "s", quote: "", speaker: "caller_child", sessionId: "c", companionId: "elli", sourceEventIds: ["e"] } as never)).toThrow("chart_payload_invalid");
  expect(() => recordFact(db, "child.fact_learned", { factId: "y", topic: "t", kind: "like", statement: "s", quote: "q", speaker: "parent", sessionId: "c", companionId: "elli", sourceEventIds: ["e"] } as never)).toThrow("chart_payload_invalid");
  expect(() => recordFact(db, "child.fact_retracted", { factId: "missing", reason: "wrong" } as never)).toThrow("chart_fact_missing");
});
