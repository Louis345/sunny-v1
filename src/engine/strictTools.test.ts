import {describe,it,expect,vi,afterEach} from "vitest";
import {z} from "zod";
import * as transport from "./plannerTransport";
import * as planner from "./assignmentPlanner";
import {priorProposal,planProposal} from "../chart/spelling/journey";
import {schemas} from "../chart/spelling/schemas";

// Saori 2026-10-18: Sonnet packed the whole spelling answer inside `priors` — the third format slip
// in a week, each patched after it arrived. The schema was only text in the prompt; nothing made
// the model follow it. Strict tools lock the model's output to the schema while it is written.
// The API rejects schemas it cannot lock, and caps optional and either-or fields per request,
// so every strict request is measured here against those documented limits.
const strict=transport as unknown as {
  strictToolSchema:(schema:unknown)=>Record<string,any>;
  strictTool:<T extends {input_schema:unknown}>(tool:T)=>T&{strict:true};
  strictBudget:(tools:Array<{input_schema:unknown;strict?:boolean}>)=>{optional:number;unions:number;unsupported:string[]};
};
const catalog=["visual-explainer","word-radar","spell-check","monster-stampede","letter-rush","word-builder","speed-catcher","wordle","pronunciation","mystery","wheel-of-fortune"].map(activityId=>({activityId,nodeType:activityId,launchable:true,sentToPlanner:true})) as never;
afterEach(()=>vi.restoreAllMocks());

describe("strict tools lock the model to the schema",()=>{
  it("turns a Zod schema into one the API can lock, keeping each rule as words",()=>{
    const schema=strict.strictToolSchema({type:"object",properties:{name:{type:"string",minLength:1,maxLength:40},score:{type:"number",minimum:0,maximum:1},steps:{type:"array",minItems:2,maxItems:4,items:{type:"object",properties:{text:{type:"string"}},required:["text"]}},pick:{oneOf:[{type:"string"},{type:"null"}]}},required:["name"]});
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.steps.items.additionalProperties).toBe(false);
    expect(schema.properties.name).toEqual({type:"string",description:"At most 40 characters."});
    expect(schema.properties.score).toEqual({type:"number",description:"From 0 to 1."});
    expect(schema.properties.steps.minItems).toBe(1);
    expect(schema.properties.steps.description).toBe("At least 2 items. At most 4 items.");
    expect(schema.properties.pick).toEqual({anyOf:[{type:"string"},{type:"null"}]});
    expect(strict.strictTool({name:"t",input_schema:{type:"object",properties:{}}})).toMatchObject({strict:true,input_schema:{additionalProperties:false}});
  });

  // Live compile check 2026-10-18: the lesson Planner and every map tool came back "too complex"
  // or "too large". Each carried the trim rule ^\S(?:[\s\S]*\S)?$ (11 times in the Planner), a
  // pattern that is costly to lock. Text rules are checked by Zod on arrival instead.
  it("leaves text patterns to the check on arrival",()=>{
    const schema=strict.strictToolSchema({type:"object",properties:{id:{type:"string",pattern:"^\\S(?:[\\s\\S]*\\S)?$"}},required:["id"]});
    expect(schema.properties.id).toEqual({type:"string"});
    expect(strict.strictBudget([{input_schema:{type:"object",additionalProperties:false,properties:{id:{type:"string",pattern:"x"}}}}]).unsupported).toEqual(["$.id.pattern"]);
  });
  // 2026-10-19: the map artist's field named "pattern" was reported as the regex keyword pattern.
  it("tells a property named like a keyword from the keyword itself",()=>{
    const schema={type:"object",additionalProperties:false,required:["pattern","minLength"],properties:{pattern:{type:"string"},minLength:{type:"number"}}};
    expect(strict.strictBudget([{input_schema:schema}]).unsupported).toEqual([]);
  });
  it("refuses a free-form map, which no grammar can lock",()=>{
    expect(()=>strict.strictToolSchema({type:"object",additionalProperties:{type:"string"}})).toThrow("strict_schema_free_form");
  });

  it.each([
    ["spelling prior",z.toJSONSchema(priorProposal)],
    ["spelling plan",z.toJSONSchema(planProposal)],
    ["spelling forecast",z.toJSONSchema(schemas["readiness.forecast"])],
  ])("%s fits the documented strict limits",(_name,schema)=>{
    expect(strict.strictBudget([strict.strictTool({input_schema:schema})])).toMatchObject({unsupported:[]});
    const budget=strict.strictBudget([strict.strictTool({input_schema:schema})]);
    expect(budget.optional).toBeLessThanOrEqual(24);
    expect(budget.unions).toBeLessThanOrEqual(16);
  });

  it("sends the spelling sheet reader's tool as strict",async()=>{
    const sent:unknown[]=[];
    vi.spyOn(transport,"requestPlannerMessage").mockImplementation(async(_client,params)=>{sent.push(params);return {content:[]} as never;});
    vi.stubEnv("ANTHROPIC_API_KEY","recorded-not-a-key");vi.stubEnv("SUNNY_EXPERIENCE_PLANNER_MODEL","claude-sonnet-5-5");
    const {spellingPlanner}=await import("../chart/spelling/provider");
    await spellingPlanner("prior",{} as never);
    const tool=(sent[0] as {tools:Array<{strict?:boolean;input_schema:Record<string,unknown>}>}).tools[0];
    expect(tool.strict).toBe(true);
    expect(strict.strictBudget([tool]).unsupported).toEqual([]);
    vi.unstubAllEnvs();
  });

  // Live compile check 2026-10-18 (claude-sonnet-5-5, claude-fable-5): the API rejected the lesson
  // Planner's tool and the map artist's tools together as "compiled grammar is too large", although
  // they fit the documented field counts. A rejected request produces no map at all, so these stay
  // unlocked, with the decoder, until their forms are slimmed and pass a live compile check.
  it("keeps the lesson Planner and map artist unlocked until their forms pass a live compile check",async()=>{
    const fs=await import("node:fs"),path=await import("node:path");
    const source=fs.readFileSync(path.join(__dirname,"directMathExperience.ts"),"utf8");
    expect(source).not.toContain("strictTool(");
    expect(source).not.toMatch(/strict:\s*true/);
    expect(planner.nativeLearningProgramToolJsonSchema(catalog)).toBeDefined();
  });
});
