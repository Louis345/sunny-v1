import {describe,it,expect,vi,afterEach} from "vitest";
import fs from "node:fs";import path from "node:path";
import {z} from "zod";
import * as transport from "./plannerTransport";
import {priorProposal} from "../chart/spelling/journey";

// Ingestion 2026-10-14 (Codex, October 9 Long-e sheet): the spelling Planner returned
// submit_spelling_proposal with `priors` as a JSON string. The schema rightly refused it and
// ingestion stopped. Live run 10 the day before did the same with the lesson Planner's
// `activities`. Each was patched in its own place; provider tests only ever used valid answers.
// A list or object that arrives as JSON text is decoded once, at the provider boundary, for every
// tool; then the usual validation runs unchanged.
afterEach(()=>vi.restoreAllMocks());
const decode=(value:unknown,schema:unknown)=>(transport as unknown as {decodeToolInput:(value:unknown,schema:unknown)=>unknown}).decodeToolInput(value,schema);
const message=(input:unknown)=>({plannerMessage:{id:"recorded",stop_reason:"tool_use",content:[{type:"tool_use",id:"t",name:"submit_spelling_proposal",input}]}});

describe("tool answers are decoded at the provider boundary",()=>{
  it("decodes the exact October 9 case: priors sent as a JSON string",()=>{
    const priors=[{assignmentId:"hw",word:"sheep",probability:0.6,rationale:"Long-e with ee."},{assignmentId:"hw",word:"beach",probability:0.4,rationale:"[ea] is less familiar."}];
    const log=vi.spyOn(console,"log").mockImplementation(()=>{});
    const read=(transport.readPlannerToolReceipt as unknown as (raw:unknown,tool:string,schema?:unknown)=>{priors:unknown;tags:unknown})(message({tags:{assignmentId:"hw"},priors:JSON.stringify(priors)}),"submit_spelling_proposal",z.toJSONSchema(priorProposal));
    expect(read.priors).toEqual(priors);
    expect(read.tags).toEqual({assignmentId:"hw"});
    expect(log.mock.calls.some(call=>String(call[0]).includes("[provider] [tool-input] [decoded] path=$.priors"))).toBe(true);
  });
  it("decodes nested lists and objects through items, alternatives and references",()=>{
    const schema={type:"object",properties:{journey:{$ref:"#/$defs/journey"},activities:{type:"array",items:{anyOf:[{type:"object",properties:{targets:{type:"array",items:{type:"string"}}}},{type:"null"}]}}},$defs:{journey:{type:"object",properties:{opening:{type:"array",items:{type:"string"}}}}}};
    expect(decode({journey:'{"opening":"[\\"a\\"]"}',activities:'[{"targets":"[\\"night\\"]"}]'},schema)).toEqual({journey:{opening:["a"]},activities:[{targets:["night"]}]});
    expect(decode('```json\n{"journey":{"opening":["a"]}}\n```',schema)).toEqual({journey:{opening:["a"]}});
  });
  it("leaves real text alone, and leaves broken JSON for the normal check to refuse",()=>{
    const schema={type:"object",properties:{note:{type:"string"},either:{anyOf:[{type:"string"},{type:"array"}]},list:{type:"array"}}};
    expect(decode({note:'["looks like json"]',either:'["kept"]',list:"[not json"},schema)).toEqual({note:'["looks like json"]',either:'["kept"]',list:"[not json"});
    expect(decode({list:'{"an":"object"}'},schema)).toEqual({list:'{"an":"object"}'});
  });
  it("is the one place this is handled for every Planner and Creator tool",()=>{
    const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),"utf8");
    expect(read("src/chart/spelling/journey.ts")).toContain("readPlannerToolReceipt(raw, 'submit_spelling_proposal', z.toJSONSchema(");
    expect(read("src/chart/spelling/originalForecast.ts")).toContain("readPlannerToolReceipt(raw,'submit_spelling_proposal',z.toJSONSchema(");
    for(const file of ["src/chart/spelling/journey.ts","src/chart/spelling/originalForecast.ts"])expect(read(file)).not.toContain("JSON.parse(proposal");
    expect(read("src/engine/assignmentPlanner.ts")).not.toContain("const listed=");
    expect(read("src/engine/directMathExperience.ts")).toContain("decodeToolInput(");
  });
});
