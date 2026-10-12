import {runMathProviderStage,hashDiscoveryContract} from "../engine/adaptiveMathDiscovery";
import {linearJourneyFixture} from './fixtures/authoredJourney';
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedSpellingLab } from "./fixtures/spellingEvidenceFirst";
import { runSpellingDiscoveryIntake } from "./ingestHomework";
import { buildAssignmentPlanningPacket, prepareSpellingDiagnosticPacket, planSpellingIntakeFromSource, parseSpellingIntake, buildSpellingIntakePrompt, spellingIntakeAuthoringSchema, spellingIntakeToolJsonSchema, type AssignmentPlanningPacket } from "../engine/assignmentPlanner";
import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import { getChildChart } from "../profiles/childChart";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { buildSpellingDiscoveryPlan, createSpellingDiscoveryCycle } from "../engine/learningCycleIngest";
import { attachSpellingDiscoveryEvidence } from "../engine/assignmentPlanner";
import { recordSpellingDiscoveryAttempt } from "../engine/learningCycleRuntime";
import { completeDiscoveryEvaluation } from "../engine/adaptiveMathDiscovery";

import { requestPlannerMessage } from "../engine/plannerTransport";
vi.mock("../engine/plannerTransport",async original=>({...await original<typeof import("../engine/plannerTransport")>(),requestPlannerMessage:vi.fn()}));
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
async function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "spelling-diagnostic-")); roots.push(rootDir);
  const sourceFile = seedSpellingLab(rootDir), childId = "lab-child";
  const chart = getChildChart(childId, { rootDir });
  const raw = buildAssignmentPlanningPacket({ childId, childChart: chart, extraction: await extractAssignmentSource(sourceFile) });
  return { rootDir, sourceFile, childId, raw, packet: prepareSpellingDiagnosticPacket(raw, chart) };
}
function capture(packet: AssignmentPlanningPacket) {
  return { boardDefinition:linearJourneyFixture(["diagnostic"]), title: "School spelling", words: [{ word: "night", pageNumber: 1 }, { word: "light", pageNumber: 1 }], uncertainty: [],
    diagnostic: { action: "select", activityId: "word-radar", modeId: "independent_spelling_discovery", reason: "Audio elicits the assigned word without showing its letters; captured letters can measure recall.", evidenceIds: [`assignment:${packet.sourceDocument.fileHash}`], uncertainty: ["No current device observation or independent recall evidence."], nextEvidenceNeeded: ["Observe successful audio playback and response capture for every assigned word."] } };
}

describe("Planner-owned opening spelling diagnostic", () => {
  it("exposes only explicitly validated diagnostic capabilities, with limits and device uncertainty", async () => {
    const { packet } = await fixture();
    expect(packet.spellingDiagnostics!.instruments.map(row => `${row.activityId}/${row.modeId}`)).toEqual(["word-radar/independent_spelling_discovery"]);
    expect(packet.spellingDiagnostics!.instruments[0]).toMatchObject({ protocol: "spelling-recall-v1", config: { inputMode: "keyboard", showTimer: false, hideWordDuringResponse: true } });
    expect(packet.spellingDiagnostics!.device).toEqual({ status: "unknown" });
    const prompt = buildSpellingIntakePrompt(packet);
    expect(prompt).toContain("needs_instrument");
    expect(prompt).toContain("independent_spelling_discovery");
    expect(prompt).not.toContain("The existing hidden-word recall instrument will offer every captured word");
  });
  it("requires a decision for new requests while legacy saved captures remain readable", async () => {
    const { packet, raw } = await fixture();
    const { diagnostic: _, ...legacy } = capture(packet);
    expect(() => parseSpellingIntake(legacy, packet)).toThrow("spelling_diagnostic_decision_required");
    expect(parseSpellingIntake(legacy, raw)).toEqual(legacy);
  });
  it("does not promote practice modes when no certified instrument is launchable", async () => {
    const { raw } = await fixture();
    const packet = prepareSpellingDiagnosticPacket({ ...raw, activityCatalog: raw.activityCatalog.map(card => ({ ...card, launchable: false })) });
    expect(packet.spellingDiagnostics!.instruments).toEqual([]);
    expect(() => parseSpellingIntake(capture(packet), packet)).toThrow("spelling_diagnostic_instrument_unavailable");
    const { activityId: _, modeId: __, ...reason } = capture(packet).diagnostic;
    expect(parseSpellingIntake({ ...capture(packet), diagnostic: { ...reason, action: "needs_instrument" } }, packet).diagnostic?.action).toBe("needs_instrument");
  });
  it.each([
    { activityId: "wheel-of-fortune" },
    { modeId: "hidden_word_recall" },
    { evidenceIds: ["invented-observation"] },
    { config: { showTimer: true } },
  ])("rejects unsupported or invented diagnostic authority: %j", async change => {
    const { packet } = await fixture(), draft = capture(packet);
    expect(() => parseSpellingIntake({ ...draft, diagnostic: { ...draft.diagnostic, ...change } }, packet)).toThrow();
  });
  it("commits the Planner's decision and frozen capability once, projects it, and reuses on restart", async () => {
    const input = await fixture();
    const callPlannerModel = vi.fn(async (packet: AssignmentPlanningPacket) => ({ draft: capture(packet) }));
    const first = await runSpellingDiscoveryIntake(input, { callPlannerModel });
    const cycle = getLearningCycle(input.childId, first.homeworkId, input)!;
    const selected = cycle.nodes[0].evidenceContract.diagnosticSelection!;
    expect(selected.decision).toEqual(capture(input.packet).diagnostic);
    expect(selected.instrument).toMatchObject({ activityId: "word-radar", modeId: "independent_spelling_discovery", protocol: "spelling-recall-v1" });
    const plan = buildSpellingDiscoveryPlan({ cycle, companion: { id: "elli", name: "Elli" } });
    expect(plan.nodePlan[0]).toMatchObject({ activityId: selected.instrument.activityId, wordRadarConfig: selected.instrument.config });
    await runSpellingDiscoveryIntake(input, { callPlannerModel });
    expect(getLearningCycle(input.childId, first.homeworkId, input)!.nodes[0].evidenceContract.diagnosticSelection).toEqual(selected);
    expect(callPlannerModel).toHaveBeenCalledOnce();
    const modified = structuredClone(cycle);
    modified.nodes[0].evidenceContract.diagnosticSelection!.instrument.config.showTimer = true;
    expect(() => buildSpellingDiscoveryPlan({ cycle: modified, companion: { id: "elli", name: "Elli" } })).toThrow("spelling_diagnostic_selection_invalid");
    expect(() => createSpellingDiscoveryCycle({ childId: input.childId, homeworkId: first.homeworkId, title: cycle.assignment.title, contentFingerprint: cycle.assignment.contentFingerprint, items: Object.values(cycle.nodes[0].evidenceContract.spellingItems!), diagnosticSelection: modified.nodes[0].evidenceContract.diagnosticSelection , boardDefinition:linearJourneyFixture([(first.homeworkId)+":discovery"]) }, input)).toThrow("spelling_diagnostic_selection_changed");
  });
  it("persists an unsuitable-instrument decision without fallback, publication, or another call on resume", async () => {
    const input = await fixture();
    const callPlannerModel = vi.fn(async (packet: AssignmentPlanningPacket) => {
      const draft = capture(packet), { activityId: _, modeId: __, ...diagnostic } = draft.diagnostic;
      return { draft: { ...draft, diagnostic: { ...diagnostic, action: "needs_instrument", reason: "Available capture cannot establish the requested construct with known conditions." } } };
    });
    for (let i = 0; i < 2; i++) await expect(runSpellingDiscoveryIntake(input, { callPlannerModel })).rejects.toThrow("spelling_diagnostic_needs_instrument");
    const homeworkId = `hw-spelling-${input.packet.sourceDocument.fileHash.slice(0, 8)}`;
    expect(getLearningCycle(input.childId, homeworkId, input)).toBeNull();
    const saved = JSON.parse(fs.readFileSync(path.join(input.rootDir, "src/context/lab-child/homework/direct-drafts", homeworkId, "spelling-intake-response.json"), "utf8"));
    expect(saved.output.diagnostic.action).toBe("needs_instrument");
    const directory=path.join(input.rootDir,'src/context/lab-child/homework/direct-drafts',homeworkId,'provider-diagnostics');
    const failures=fs.readdirSync(directory).filter(name=>name.endsWith('.failure.json')).map(name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')));
    expect(failures).toHaveLength(2);
    expect(failures[0]).toMatchObject({childId:input.childId,homeworkId,stage:'spelling_intake',diagnosis:'unassigned',error:{message:expect.stringContaining('spelling_diagnostic_needs_instrument')}});
    expect(callPlannerModel).toHaveBeenCalledOnce();
  });
  it("passes the recorded diagnostic rationale forward with actual outcomes, without raw responses", async () => {
    const input = await fixture();
    const { homeworkId } = await runSpellingDiscoveryIntake(input, { callPlannerModel: async packet => ({ draft: capture(packet) }) });
    const opening = getLearningCycle(input.childId, homeworkId, input)!;
    Object.values(opening.nodes[0].evidenceContract.spellingItems!).forEach((item, index) => recordSpellingDiscoveryAttempt({ childId: input.childId, homeworkId,
      attempt: { attemptId: `observation-${index}`, itemId: item.id, attemptedValue: index ? "wrong-private-response" : item.word, observedAt: "2026-09-09T12:00:00Z" }, support: { status: "unassisted", scaffolds: [] } }, input));
    completeDiscoveryEvaluation({ ...input, homeworkId, completedAt: "2026-09-09T12:01:00Z" });
    const chart = getChildChart(input.childId, input);
    const targeted = attachSpellingDiscoveryEvidence(input.packet, chart);
    expect(targeted.discoveryEvidence!.diagnosticSelection).toEqual(opening.nodes[0].evidenceContract.diagnosticSelection);
    expect(targeted.discoveryEvidence!.observations).toHaveLength(2);
    const next = prepareSpellingDiagnosticPacket(input.raw, chart);
    expect(next.spellingDiagnostics!.evidenceIds).toEqual(expect.arrayContaining(["observation-0", "observation-1"]));
    expect(JSON.stringify(next.spellingDiagnostics)).not.toContain("wrong-private-response");
  });
  it("sends the same conditional contract inside a provider-supported object tool envelope",()=>{
    const schema=spellingIntakeToolJsonSchema(spellingIntakeAuthoringSchema(true)) as any;
    expect(schema.type).toBe("object");expect(schema.anyOf).toBeUndefined();
    expect(schema.required).toEqual(["plan"]);
    expect(schema.properties.plan.anyOf[0].required).toContain("boardDefinition");
  });
  it("makes activity bindings executable tool arguments, not guessed activity names", async () => {
    const {packet}=await fixture(), draft=capture(packet);
    const schema=spellingIntakeAuthoringSchema(true);
    const wrong=structuredClone(draft); wrong.boardDefinition.portals.find(p=>p.kind==='activity')!.activityNodeId='word-radar';
    expect(schema.safeParse(wrong).success).toBe(false);
    const missing=structuredClone(draft); delete missing.boardDefinition.portals.find(p=>p.kind==='activity')!.activityNodeId;
    expect(schema.safeParse(missing).success).toBe(false);
    expect(schema.safeParse(draft).success).toBe(true);
    const tool=spellingIntakeToolJsonSchema(schema) as any;
    const resolve=(node:any):any=>node.$ref ? resolve(tool.$defs[node.$ref.split("/").at(-1)]) : node;
    const board=resolve(tool.properties.plan.anyOf[0].properties.boardDefinition);
    const portals=resolve(board.properties.portals.items).anyOf.map(resolve);
    expect(portals[0].required).toContain('activityNodeId');
    expect(resolve(portals[0].properties.activityNodeId).enum).toEqual(['diagnostic']);
    expect(JSON.stringify(tool)).not.toContain('"minimum"');
    expect(JSON.stringify(tool)).not.toContain('"maxItems"');
    expect(JSON.stringify(tool)).not.toContain('"pattern"');
    expect(JSON.stringify(tool)).toContain('Runtime constraints:');
    expect(tool.$defs).toBeDefined();
  });
  it.each(["renamed","wrong","missing"])("repairs %s bindings without regenerating captured homework", async defect => {
    const input = await fixture();
    const good = capture(input.packet);
    const missing = structuredClone(good);
    delete (missing as Partial<typeof missing>).boardDefinition;
    expect(spellingIntakeAuthoringSchema(true).safeParse(missing).success).toBe(false);
    const gap = {...missing, diagnostic:{action:"needs_instrument",reason:"No valid instrument",evidenceIds:[input.packet.spellingDiagnostics!.evidenceIds[0]],uncertainty:["unknown"],nextEvidenceNeeded:["instrument"]}};
    expect(spellingIntakeAuthoringSchema(true).safeParse(gap).success).toBe(true);
    const malformed = structuredClone(good) as any;
    const portal = malformed.boardDefinition.portals.find((p:any)=>p.kind==="activity");
    if(defect==="renamed") {portal.activityId=portal.activityNodeId;delete portal.activityNodeId;}
    else if(defect==="wrong") portal.activityNodeId="word-radar";
    else delete portal.activityNodeId;
    const callPlannerModel=vi.fn().mockResolvedValueOnce({draft:malformed})
      .mockResolvedValueOnce({draft:{diagnostic:good.diagnostic,boardDefinition:good.boardDefinition}});
    const first=await runSpellingDiscoveryIntake(input,{callPlannerModel});
    const cycle=getLearningCycle(input.childId,first.homeworkId,input)!;
    expect(cycle.assignment.title).toBe(good.title);
    expect(cycle.boards![0].definition?.portals.map(p=>({id:p.id,label:p.label,position:p.position}))).toEqual(good.boardDefinition.portals.map(p=>({id:p.id,label:p.label,position:p.position})));
    await runSpellingDiscoveryIntake(input,{callPlannerModel});
    expect(callPlannerModel).toHaveBeenCalledTimes(2);
  });

  it("repairs one incomplete Planner response once, then reuses the validated intake on restart", async () => {
    // Human catch: the real provider omitted one required field while the 12 visible words looked correct.
    // Log catch: Zod named the missing field, but the durable raw receipt made every restart repeat the failure.
    // Lab miss: prior mocks always returned complete diagnostics and the old invariant explicitly preserved malformed receipts.
    const input = await fixture();
    const incomplete = structuredClone(capture(input.packet));
    delete (incomplete.diagnostic as Partial<typeof incomplete.diagnostic>).nextEvidenceNeeded;
    const callPlannerModel = vi.fn()
      .mockResolvedValueOnce({ draft: incomplete })
      .mockResolvedValueOnce({ draft: capture(input.packet) });

    const first = await runSpellingDiscoveryIntake(input, { callPlannerModel });
    const cycle = getLearningCycle(input.childId, first.homeworkId, input)!;
    expect(Object.values(cycle.nodes[0].evidenceContract.spellingItems!).map(item => item.word)).toEqual(["night", "light"]);
    expect(cycle.nodes[0].evidenceContract.diagnosticSelection!.decision.nextEvidenceNeeded).toEqual(capture(input.packet).diagnostic.nextEvidenceNeeded);
    expect(callPlannerModel).toHaveBeenCalledTimes(2);

    await runSpellingDiscoveryIntake(input, { callPlannerModel });
    expect(callPlannerModel).toHaveBeenCalledTimes(2);
  });
  it.each(["diagnostic-schema-correction-v1","authoring-correction-v3"])("recovers a successful paid %s correction without another provider call", async suffix=>{
    const input=await fixture(),good=capture(input.packet),bad=structuredClone(good) as any;
    delete bad.diagnostic.nextEvidenceNeeded;
    const homeworkId=`hw-spelling-${input.packet.sourceDocument.fileHash.slice(0,8)}`;
    const draftDir=path.join(input.rootDir,'src/context',input.childId,'homework/direct-drafts',homeworkId);
    fs.mkdirSync(draftDir,{recursive:true});
    fs.writeFileSync(path.join(draftDir,'spelling-intake-request.json'),JSON.stringify(input.packet));
    await runMathProviderStage({draftDir,stage:'spelling-intake',model:'recorded',request:input.packet,execute:async()=>({draft:bad,latencyMs:0})});
    await runMathProviderStage({draftDir,stage:`spelling-intake-${suffix}`,model:'recorded',request:{originalRequestHash:hashDiscoveryContract(input.packet)},execute:async()=>({draft:suffix.endsWith("v3")?{diagnostic:good.diagnostic,boardDefinition:good.boardDefinition}:good,latencyMs:0})});
    fs.rmSync(path.join(draftDir,'provider-diagnostics'),{recursive:true,force:true});
    const provider=vi.fn(async()=>{throw Error('paid call forbidden on received legacy recovery');});
    const result=await runSpellingDiscoveryIntake(input,{callPlannerModel:provider});
    expect(getLearningCycle(input.childId,result.homeworkId,input)).not.toBeNull();
    expect(provider).not.toHaveBeenCalled();
  });
  it("source confirmation cannot replace the Planner's diagnostic decision", async () => {
    const input = await fixture(), draft = capture(input.packet);
    const callPlannerModel = vi.fn(async () => ({ draft: { ...draft, uncertainty: [{ kind: "ambiguous_word", pageNumber: 1, detail: "Confirm word identity." }] } }));
    await expect(runSpellingDiscoveryIntake(input, { callPlannerModel })).rejects.toThrow("confirmation_required");
    const confirmedCapture = { capture: { ...draft, diagnostic: { ...draft.diagnostic, reason: "Not the Planner's recorded reason." } }, reviewer: "lab-parent", approvedAt: "2026-09-09T12:00:00Z" };
    await expect(runSpellingDiscoveryIntake({ ...input, confirmedCapture } as never, { callPlannerModel })).rejects.toThrow("spelling_diagnostic_confirmation_changed");
    expect(callPlannerModel).toHaveBeenCalledOnce();
  });
});

it('returns invalid opening geometry once to the same Planner and resumes its saved correction',async()=>{
 const {packet,rootDir}=await fixture();const valid=capture(packet);const invalid=structuredClone(valid);
 invalid.boardDefinition.portals[1].position=structuredClone(invalid.boardDefinition.portals[0].position);
 const callPlannerModel=vi.fn().mockResolvedValueOnce({draft:invalid}).mockResolvedValueOnce({draft:valid});
 const options={callPlannerModel,providerReceipt:{draftDir:path.join(rootDir,'receipts'),stage:'intake'}};
 expect((await planSpellingIntakeFromSource(packet,options)).output.boardDefinition).toEqual(valid.boardDefinition);
 expect(callPlannerModel).toHaveBeenCalledTimes(2);
 expect((await planSpellingIntakeFromSource(packet,options)).output.boardDefinition).toEqual(valid.boardDefinition);
 expect(callPlannerModel).toHaveBeenCalledTimes(2);
},20000);


it('uses the shared endpoint binding contract in diagnostic authoring and execution', async () => {
  const { packet } = await fixture();
  const draft = capture(packet);
  const board = linearJourneyFixture(['diagnostic']);
  board.portals = board.portals.filter(portal => portal.id !== 'end');
  board.portals.find(portal => portal.id === 'diagnostic')!.kind = 'endpoint';
  board.paths[0].portalIds = ['start', 'diagnostic'];
  board.edges = board.edges.filter(edge => edge.to !== 'end');
  const authored = {...draft, boardDefinition:board};
  expect(spellingIntakeAuthoringSchema(true).parse(authored)).toEqual(authored);
  expect(parseSpellingIntake(authored, packet).boardDefinition).toEqual(board);
});

it('repairs only the board when the initial diagnostic decision is valid, preserving it across restart',async()=>{
 const {packet,rootDir}=await fixture(),valid=capture(packet),invalid=structuredClone(valid);
 (invalid.boardDefinition as {version:number}).version=1;
 const callPlannerModel=vi.fn().mockResolvedValueOnce({draft:invalid}).mockResolvedValueOnce({draft:{boardDefinition:valid.boardDefinition}});
 const options={callPlannerModel,providerReceipt:{draftDir:path.join(rootDir,'frozen-diagnostic-receipts'),stage:'intake'}};
 const result=await planSpellingIntakeFromSource(packet,options);
 expect(result.output.diagnostic).toEqual(valid.diagnostic);
 expect(result.output.boardDefinition).toEqual(valid.boardDefinition);
 expect((await planSpellingIntakeFromSource(packet,options)).output).toEqual(result.output);
 expect(callPlannerModel).toHaveBeenCalledTimes(2);
});

it('does not accept a board correction that rewrites a valid diagnostic rationale',async()=>{
 const {packet,rootDir}=await fixture(),valid=capture(packet),invalid=structuredClone(valid);
 (invalid.boardDefinition as {version:number}).version=1;
 const callPlannerModel=vi.fn().mockResolvedValueOnce({draft:invalid}).mockResolvedValueOnce({draft:{boardDefinition:valid.boardDefinition,diagnostic:{...valid.diagnostic,reason:'Changed independently of board repair'}}});
 await expect(planSpellingIntakeFromSource(packet,{callPlannerModel,providerReceipt:{draftDir:path.join(rootDir,'diagnostic-drift-receipts'),stage:'intake'}})).rejects.toThrow('spelling_intake_correction_changed_diagnostic');
 expect(callPlannerModel).toHaveBeenCalledTimes(2);
});

it('production intake board repair exposes no diagnostic field to the provider',async()=>{
 const {packet,rootDir}=await fixture(),valid=capture(packet),invalid=structuredClone(valid);
 (invalid.boardDefinition as {version:number}).version=1;
 vi.stubEnv('ANTHROPIC_API_KEY','recorded-no-network');
 const requests:any[]=[];
 vi.mocked(requestPlannerMessage).mockReset().mockImplementation(async(_client,request:any)=>{
  requests.push(request);
  return {id:'recorded-intake-'+requests.length,stop_reason:'tool_use',content:[{type:'tool_use',id:'tool-'+requests.length,name:'write_adventure_session_plan',input:{plan:requests.length===1?invalid:{boardDefinition:valid.boardDefinition}}}],usage:{input_tokens:1,output_tokens:1}} as never;
 });
 try {
  const options={providerReceipt:{draftDir:path.join(rootDir,'board-only-provider'),stage:'intake'}};
  const result=await planSpellingIntakeFromSource(packet,options);
  expect(result.output.diagnostic).toEqual(valid.diagnostic);
  expect(requests).toHaveLength(2);
  expect(Object.keys(requests[1].tools[0].input_schema.properties.plan.properties)).toEqual(['boardDefinition']);
  expect(JSON.stringify(requests[1].messages)).toContain('already valid and frozen');
  await planSpellingIntakeFromSource(packet,options);
  expect(requests).toHaveLength(2);
 } finally {vi.unstubAllEnvs();}
});

it('reuses a legacy full board repair with the same normalized diagnostic rationale',async()=>{
 const {packet,rootDir}=await fixture(),valid=capture(packet);
 valid.diagnostic.reason='  '+valid.diagnostic.reason+'  ';
 const invalid=structuredClone(valid);(invalid.boardDefinition as {version:number}).version=1;
 const callPlannerModel=vi.fn().mockResolvedValueOnce({draft:invalid}).mockResolvedValueOnce({draft:valid});
 const options={callPlannerModel,providerReceipt:{draftDir:path.join(rootDir,'normalized-diagnostic-receipts'),stage:'intake'}};
 expect((await planSpellingIntakeFromSource(packet,options)).output.diagnostic?.reason).toBe(valid.diagnostic.reason.trim());
 await planSpellingIntakeFromSource(packet,options);
 expect(callPlannerModel).toHaveBeenCalledTimes(2);
});
it('rejects explicit null diagnostic in a legacy full board repair',async()=>{
 const {packet,rootDir}=await fixture(),valid=capture(packet),invalid=structuredClone(valid);
 (invalid.boardDefinition as {version:number}).version=1;
 const callPlannerModel=vi.fn().mockResolvedValueOnce({draft:invalid}).mockResolvedValueOnce({draft:{boardDefinition:valid.boardDefinition,diagnostic:null}});
 await expect(planSpellingIntakeFromSource(packet,{callPlannerModel,providerReceipt:{draftDir:path.join(rootDir,'null-diagnostic-receipts'),stage:'intake'}})).rejects.toThrow('spelling_intake_correction_changed_diagnostic');
 expect(callPlannerModel).toHaveBeenCalledTimes(2);
});
