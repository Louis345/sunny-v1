import {describe,it,expect,vi} from "vitest";
import * as planner from "./assignmentPlanner";
import {validateLetterRushConfig} from "./activityEngineConfig";
import {validateSpellingVisualExplainerPlanConfig} from "../shared/visualLearnerArtifactConfig";

// Live run 2026-10-13: the Planner authored a Visual Explainer and a Letter Rush with no
// settings and chose Spell Check as the final checkpoint, because the catalog said
// "requiredConfig: none" and nothing told it which instrument can be a checkpoint. Three of
// nine portals published not ready. Tests only used fixtures that already had valid settings.
describe("the Planner is told what each spelling instrument needs before it plans",()=>{
  const requirements=()=>(planner as unknown as {SPELLING_INSTRUMENT_REQUIREMENTS:string;SPELLING_INSTRUMENT_EXAMPLES:{letterRush:unknown;visualExplainer:unknown}});
  it("states the checkpoint rule and the two instruments that need authored settings",()=>{
    expect(planner).toHaveProperty("SPELLING_INSTRUMENT_REQUIREMENTS");
    const text=requirements().SPELLING_INSTRUMENT_REQUIREMENTS;
    expect(text).toContain("fresh_checkpoint");expect(text).toContain("word-radar");expect(text).toContain("hidden_word_recall");
    expect(text).toContain("visual-explainer");expect(text).toContain("letter-rush");expect(text).toContain("activityConfig");
  });
  it("shows examples the kiosk actually accepts, so the instruction cannot drift from the runtime",()=>{
    const {letterRush,visualExplainer}=requirements().SPELLING_INSTRUMENT_EXAMPLES;
    expect(validateLetterRushConfig(letterRush)).toMatchObject({ok:true});
    expect(()=>validateSpellingVisualExplainerPlanConfig(visualExplainer)).not.toThrow();
    const text=requirements().SPELLING_INSTRUMENT_REQUIREMENTS;
    expect(text).toContain(JSON.stringify(letterRush));expect(text).toContain(JSON.stringify(visualExplainer));
  });
  // Live run 2: five practice games with target words came back with measurement null, and the
  // explainer listed 10 words where the kiosk accepts at most 8. Six of eleven portals not ready.
  it("says every activity with target words needs a measurement, and gives the explainer's word limit",()=>{
    const text=requirements().SPELLING_INSTRUMENT_REQUIREMENTS;
    expect(text).toContain("Every activity that has target words needs a measurement");
    expect(text).toContain("at most 8 words");
    const tooMany={...(requirements().SPELLING_INSTRUMENT_EXAMPLES.visualExplainer as {words:unknown[]}),words:Array.from({length:9},(_,i)=>({id:`w${i}`,text:"night",chunks:["n","ight"],focusChunk:"ight",tip:"t"}))};
    expect(()=>validateSpellingVisualExplainerPlanConfig(tooMany)).toThrow();
  });
  it("puts the requirements in the spelling Planner's request",async()=>{
    const source=(await import("node:fs")).readFileSync(`${process.cwd()}/src/engine/directMathExperience.ts`,"utf8");
    expect(source).toContain("${SPELLING_INSTRUMENT_REQUIREMENTS}");
    vi.restoreAllMocks();
  });
});
