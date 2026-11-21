import { describe, expect, it } from "vitest";
import type { ChildChart } from "../profiles/childChart";
import { buildAssignmentPlanningPacket, parseSpellingIntake, prepareSpellingDiagnosticPacket, type AssignmentPlanningPacket, type AssignmentSourceExtraction } from "./assignmentPlanner";
import { plannerToolDefinitions } from "./plannerToolLoop";
import { strictBudget } from "./plannerTransport";
import { spellingDiscoveryToolkit } from "./spellingDiscoveryTools";
import { assembleAuthoredBoardDefinition } from "../shared/adventureBoardDefinition";

function packet(): AssignmentPlanningPacket {
  const text = "Spelling Week 4\nsign\nknow\nwrite";
  const extraction: AssignmentSourceExtraction = { sourceKind: "scanned_assignment_image", sourcePath: "/tmp/demo.png", filename: "demo.png", mediaType: "image/png", fileHash: "d".repeat(64), extractionMethod: "tesseract", pages: [{ pageNumber: 1, text }], fullText: text, warnings: [] };
  const chart = { childId: "demo-pashley", rootDir: process.cwd(), identity: { childId: "demo-pashley", displayName: "Demo" }, learningProfile: { childId: "demo-pashley", name: "Demo" }, homework: { pending: null, selectedDomain: "spelling", lanes: {}, recent: [] }, activeSessionPlan: null, carePlan: { current: null, source: "missing" }, companion: { presetId: "elli", config: {}, displayName: "Elli" }, companionCare: { plan: {}, view: {}, filePath: "", existed: true }, artifacts: { contentCatalog: [] }, activityResults: { latest: null, recent: [] }, decisionTrace: [], learningHistory: { constructs: {} } } as unknown as ChildChart;
  return prepareSpellingDiagnosticPacket(buildAssignmentPlanningPacket({ childId: "demo-pashley", extraction, childChart: chart }), chart);
}
function session(p = packet()) {
  const kit = spellingDiscoveryToolkit(p);
  const state = kit.initialState();
  const call = (name: string, input: unknown) => {
    const tool = kit.tools.find(row => row.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: `schema: ${parsed.error.message}` };
    return tool.run(state, parsed.data);
  };
  return { p, kit, state, call };
}
const instrument = (p: AssignmentPlanningPacket) => `${p.spellingDiagnostics!.instruments[0].activityId}:${p.spellingDiagnostics!.instruments[0].modeId}`;
const evidence = (p: AssignmentPlanningPacket) => [p.spellingDiagnostics!.evidenceIds[0]];
const capture = { words: [{ word: "sign", page_number: 1 }, { word: "know", page_number: 1 }, { word: "write", page_number: 1 }], uncertainty: [], source_notes: ["Header is not a word."] };
const choose = (p: AssignmentPlanningPacket, overrides: Record<string, unknown> = {}) => ({ action: "select", instrument: instrument(p), check_words: ["sign", "know", "write"], reason: "It checks every word without showing it.", evidence_ids: evidence(p), uncertainty: ["Device unknown."], next_evidence_needed: ["Her first spellings."], ...overrides });

describe("spelling Discovery tools", () => {
  it("offers three small strict tools with the validated instruments and evidence as pick-lists", () => {
    const { p, kit } = session();
    const definitions = plannerToolDefinitions(kit.tools);
    expect(definitions.map(tool => tool.name)).toEqual(["record_words", "choose_discovery", "finish_intake"]);
    expect(definitions.every(tool => (tool as { strict?: boolean }).strict)).toBe(true);
    expect(strictBudget(definitions).unsupported).toEqual([]);
    const text = JSON.stringify(definitions);
    expect(text).toContain(instrument(p));
    expect(text).toContain(evidence(p)[0]);
    for (const bookkeeping of ["boardDefinition", "version", "activityNodeId", "portals", "edges", "position"]) expect(text).not.toContain(`"${bookkeeping}"`);
  });

  it("assembles an intake that today's reader accepts, with a code-built one-stop journey", () => {
    const { p, kit, state, call } = session();
    expect(call("record_words", capture)).toMatchObject({ ok: true });
    expect(call("choose_discovery", choose(p))).toMatchObject({ ok: true });
    expect(call("finish_intake", { title: "Spelling Week 4", portal_label: "Word Radar Check", endpoint_label: "Done" })).toMatchObject({ ok: true });
    expect(kit.finished(state)).toBe(true);
    const { capture: intake, journey } = kit.result(state);
    expect(intake.words.map(row => row.word)).toEqual(["sign", "know", "write"]);
    expect(intake.diagnostic).toMatchObject({ action: "select", activityId: p.spellingDiagnostics!.instruments[0].activityId, modeId: p.spellingDiagnostics!.instruments[0].modeId });
    expect(journey!.portals.map(portal => [portal.kind, portal.activityNodeId ?? null])).toEqual([["start", null], ["activity", "diagnostic"], ["endpoint", null]]);
    expect(journey!.portals.find(portal => portal.kind === "activity")!.label).toBe("Word Radar Check");
    // With any drawing (here none: the plain layout), the full intake parses exactly as before.
    const parsed = parseSpellingIntake({ ...intake, boardDefinition: assembleAuthoredBoardDefinition(journey!, {}) }, p);
    expect(parsed.boardDefinition?.portals).toHaveLength(3);
  });

  it("answers capture and choice mistakes with reasons", () => {
    const { p, call } = session();
    expect(call("record_words", { ...capture, words: [{ word: "sign", page_number: 1 }, { word: "Sign", page_number: 1 }] })).toMatchObject({ ok: false, error: expect.stringContaining("more than once") });
    expect(call("record_words", { ...capture, words: [{ word: "sign", page_number: 7 }] })).toMatchObject({ ok: false, error: expect.stringContaining("page 7") });
    expect(call("choose_discovery", choose(p, { instrument: "none" }))).toMatchObject({ ok: false, error: expect.stringContaining("instrument") });
    expect(call("choose_discovery", choose(p, { action: "needs_instrument", check_words: [] }))).toMatchObject({ ok: false, error: expect.stringContaining("none") });
    expect(call("finish_intake", { title: "T", portal_label: "P", endpoint_label: "E" })).toMatchObject({ ok: false, error: expect.stringContaining("record_words") });
    expect(call("record_words", capture)).toMatchObject({ ok: true });
    expect(call("finish_intake", { title: "T", portal_label: "P", endpoint_label: "E" })).toMatchObject({ ok: false, error: expect.stringContaining("choose_discovery") });
  });

  it("finishes without a board when no validated instrument fits", () => {
    const { p, kit, state, call } = session();
    call("record_words", capture);
    expect(call("choose_discovery", choose(p, { action: "needs_instrument", instrument: "none", check_words: [] }))).toMatchObject({ ok: true });
    expect(call("finish_intake", { title: "T", portal_label: "P", endpoint_label: "E" })).toMatchObject({ ok: true });
    const { capture: intake, journey } = kit.result(state);
    expect(intake.diagnostic).toMatchObject({ action: "needs_instrument" });
    expect(journey).toBeUndefined();
    expect(parseSpellingIntake(intake, p).diagnostic?.action).toBe("needs_instrument");
  });

  // Contract 54 (owner, 2026-11-07): the Planner chooses how a list begins. It checks the words it picks, or none.
  it("lets the Planner check only some words, keeping the choice on the intake", () => {
    const { p, kit, state, call } = session();
    call("record_words", capture);
    expect(call("choose_discovery", choose(p, { check_words: ["know"] }))).toMatchObject({ ok: true });
    expect(call("finish_intake", { title: "T", portal_label: "Quick check", endpoint_label: "E" })).toMatchObject({ ok: true });
    const { capture: intake, journey } = kit.result(state);
    expect(intake.diagnostic).toMatchObject({ action: "select", checkWords: ["know"] });
    expect(journey).toBeDefined();
    expect(parseSpellingIntake({ ...intake, boardDefinition: assembleAuthoredBoardDefinition(journey!, {}) }, p).diagnostic).toMatchObject({ checkWords: ["know"] });
  });

  it("lets the Planner open with teaching and check nothing up front", () => {
    const { p, kit, state, call } = session();
    call("record_words", capture);
    expect(call("choose_discovery", choose(p, { action: "open_with_teaching", instrument: "none", check_words: [] }))).toMatchObject({ ok: true });
    expect(call("finish_intake", { title: "T", portal_label: "Start", endpoint_label: "E" })).toMatchObject({ ok: true });
    const { capture: intake, journey } = kit.result(state);
    expect(intake.diagnostic).toMatchObject({ action: "open_with_teaching", checkWords: [] });
    expect(journey).toBeDefined();
    expect(parseSpellingIntake({ ...intake, boardDefinition: assembleAuthoredBoardDefinition(journey!, {}) }, p).diagnostic?.action).toBe("open_with_teaching");
  });

  it("answers an opening choice that does not fit its words", () => {
    const { p, call } = session();
    call("record_words", capture);
    expect(call("choose_discovery", choose(p, { check_words: [] }))).toMatchObject({ ok: false, error: expect.stringContaining("open_with_teaching") });
    expect(call("choose_discovery", choose(p, { action: "open_with_teaching", instrument: "none", check_words: ["know"] }))).toMatchObject({ ok: false, error: expect.stringContaining("check_words") });
    expect(call("choose_discovery", choose(p, { check_words: ["banana"] }))).toMatchObject({ ok: true });
    expect(call("finish_intake", { title: "T", portal_label: "P", endpoint_label: "E" })).toMatchObject({ ok: false, error: expect.stringContaining("banana") });
  });
});
