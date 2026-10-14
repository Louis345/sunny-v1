import {describe,it,expect} from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as planner from "./assignmentPlanner";
import {validateLetterRushConfig} from "./activityEngineConfig";
import {validateSpellingVisualExplainerPlanConfig} from "../shared/visualLearnerArtifactConfig";

// Live runs 2026-10-13: nothing sent the Planner's work back any more, so every rule the
// tool form did not carry became a "not ready" portal (3 of 9, then 6 of 11). The form said
// settings were "any object", let any game be a checkpoint, and let any game skip its
// measurement. Tests had only ever used fixtures that were already valid. The rules now live
// in the form the Planner fills in, and these recorded real tool calls are replayed for free.
const recorded=(run:string)=>JSON.parse(fs.readFileSync(path.join(process.cwd(),"src/scripts/fixtures/plannerToolCalls",`2026-10-13-${run}.json`),"utf8")).input as {activities:Array<Record<string,any>>};
const catalog=["visual-explainer","word-radar","spell-check","monster-stampede","letter-rush","word-builder","speed-catcher","wordle","pronunciation","mystery","wheel-of-fortune"].map(activityId=>({activityId,nodeType:activityId,launchable:true,sentToPlanner:true})) as never;
const form=()=>(planner as unknown as {spellingActivityFormSchema:(types:readonly string[])=>{safeParse:(value:unknown)=>{success:boolean;data?:any}}}).spellingActivityFormSchema(["spell-check","monster-stampede","word-builder","speed-catcher","wordle","pronunciation","wheel-of-fortune"]);
const measurement=(role:string)=>({evidenceType:"practice",supportCriteria:"s",reviseCriteria:"r",falsifyCriteria:"f",spelling:{role,evidenceIds:["e"],reason:"r",uncertainty:"u",expectedAccuracy:{min:0,max:1},confidence:.5,maxDelayDays:1,finalCheck:role==="fresh_checkpoint"}});
const hiddenRecall={recallMode:"hidden_word_recall",inputMode:"keyboard",speakStyle:"option-a",showTimer:false,hideWordDuringResponse:true,requiresCapturedResponse:true};
const explainer={topic:"The ight chunk",learningGoal:"Notice ight.",misconception:"One sound, one letter.",strategy:{title:"Keep the chunk together",steps:["Say it.","Find ight."]},
  words:[{text:"night",chunks:["n","ight"],focusChunk:"ight",tip:"Keep ight together."},{text:"light",chunks:["l","ight"],focusChunk:"ight",tip:"Keep ight together."}],
  check:{targetWord:"night",prompt:"Which chunk stays together?",options:[{id:"ight",label:"ight",correct:true},{id:"ite",label:"ite",correct:false}],correctOptionId:"ight"}};

describe("the Planner's tool form carries the kiosk's rules",()=>{
  it("only lets Word Radar hidden recall be the independent checkpoint",()=>{
    expect(planner).toHaveProperty("spellingActivityFormSchema");
    const checkpoint={id:"check",title:"Final check",type:"word-radar",activityId:"word-radar",targets:["night"],wordRadarConfig:hiddenRecall,measurement:measurement("fresh_checkpoint")};
    expect(form().safeParse(checkpoint).success).toBe(true);
    expect(form().safeParse({...checkpoint,wordRadarConfig:{...hiddenRecall,recallMode:"visible_read"}}).success).toBe(false);
    expect(form().safeParse({id:"check",title:"Final check",type:"spell-check",activityId:"spell-check",targets:["night"],measurement:measurement("fresh_checkpoint")}).success).toBe(false);
  });
  it("requires a measurement for any activity with words, and none for a reward",()=>{
    const game={id:"game",title:"Wordle",type:"wordle",activityId:"wordle",targets:["night"]};
    expect(form().safeParse({...game,measurement:measurement("practice")}).success).toBe(true);
    expect(form().safeParse({...game,measurement:null}).success).toBe(false);
    expect(form().safeParse({id:"reward",title:"Treasure",type:"mystery",activityId:"mystery",targets:[],measurement:null}).success).toBe(true);
    expect(form().safeParse({id:"reward",title:"Treasure",type:"mystery",activityId:"mystery",targets:["night"],measurement:null}).success).toBe(false);
  });
  it("requires the explainer's content, at most 8 words, and does not ask for the words twice",()=>{
    const activity={id:"teach",title:"Spot the chunk",type:"visual-explainer",activityId:"visual-explainer",activityConfig:explainer,measurement:measurement("instruction")};
    expect(form().safeParse(activity).success).toBe(true);
    expect(form().safeParse({...activity,activityConfig:undefined}).success).toBe(false);
    expect(form().safeParse({...activity,activityConfig:{...explainer,words:Array.from({length:9},()=>explainer.words[0])}}).success).toBe(false);
    expect(form().safeParse({...activity,targets:["night","light"]}).success).toBe(false);
  });
  it("would have refused exactly the activities that published not ready in the live runs",()=>{
    const refused=(run:string)=>recorded(run).activities.filter(activity=>!form().safeParse(activity).success).map(activity=>activity.id);
    expect(refused("run1")).toEqual(expect.arrayContaining(["visual-explainer-chunks","spell-check-audio-checkpoint"]));
    expect(refused("run2")).toEqual(expect.arrayContaining(["visual-explainer-y-ly","monster-stampede-recovery","wordle-practice","pronunciation-flow"]));
  });
  // Kiosk run 2026-10-13: the Planner wrote 10,128 tokens in 117 s, much of it paragraphs of
  // justification per activity, while a child sat on the loading screen.
  it("asks for each justification in one short sentence",()=>{
    const schema:any=planner.nativeLearningProgramToolJsonSchema(catalog);
    const practice=(schema.properties.activities.items.anyOf as any[]).find(variant=>variant.properties.type.const==="letter-rush").properties.measurement.properties;
    for(const field of ["supportCriteria","reviseCriteria","falsifyCriteria"])expect(practice[field].description).toContain("One short sentence");
    for(const field of ["reason","uncertainty"])expect(practice.spelling.properties[field].description).toContain("One short sentence");
  });
  it("gives the tool the per-type form instead of one loose activity shape",()=>{
    const schema:any=planner.nativeLearningProgramToolJsonSchema(catalog);
    const variants=schema.properties.activities.items.anyOf as Array<{properties:Record<string,any>}>;
    expect(variants.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(schema)).not.toContain("interventionNodeIds");
    const checkpointVariants=variants.filter(variant=>JSON.stringify(variant.properties.measurement).includes("fresh_checkpoint"));
    expect(checkpointVariants).toHaveLength(1);
    expect(checkpointVariants[0].properties.type.const).toBe("word-radar");
    expect(checkpointVariants[0].properties.wordRadarConfig.properties.recallMode.const).toBe("hidden_word_recall");
    for(const variant of variants)expect(variant.properties).not.toHaveProperty("locked");
  });
});

describe("code derives what the Planner already said once",()=>{
  it("builds runnable Visual Explainer and Letter Rush settings from the authored form",()=>{
    const derive=(planner as unknown as {deriveNativeActivity:(row:unknown)=>Record<string,any>}).deriveNativeActivity;
    expect(derive).toBeTypeOf("function");
    const teach=derive({id:"teach",title:"Spot the chunk",type:"visual-explainer",activityId:"visual-explainer",activityConfig:explainer,measurement:measurement("instruction")});
    expect(teach.targets).toEqual(["night","light"]);
    expect(()=>validateSpellingVisualExplainerPlanConfig(teach.activityConfig)).not.toThrow();
    const race=derive({id:"race",title:"Letter Rush",type:"letter-rush",activityId:"letter-rush",targets:["night","light"],letterRushMode:"read-and-race",measurement:measurement("practice")});
    expect(validateLetterRushConfig(race.activityConfig)).toMatchObject({ok:true});
    expect(race.activityConfig.words.map((word:{text:string})=>word.text)).toEqual(["night","light"]);
    expect(race).not.toHaveProperty("letterRushMode");
  });
  // Kiosk run 2026-10-13: both explainers were authored correctly but their topic ran past the
  // 120-character display limit, so both teaching portals published "Not ready". A title that
  // is too long is trimmed and logged; it never costs her the lesson.
  it("trims display text that runs past its limit instead of losing the activity",()=>{
    const derive=(planner as unknown as {deriveNativeActivity:(row:unknown)=>Record<string,any>}).deriveNativeActivity;
    const long="Why words end in -y and -ly ".repeat(8);
    const teach=derive({id:"teach",title:"Spot the chunk",type:"visual-explainer",activityId:"visual-explainer",activityConfig:{...explainer,topic:long,learningGoal:long.repeat(2)},measurement:measurement("instruction")});
    expect(teach.activityConfig.topic.length).toBeLessThanOrEqual(120);
    expect(teach.activityConfig.learningGoal.length).toBeLessThanOrEqual(220);
    expect(()=>validateSpellingVisualExplainerPlanConfig(teach.activityConfig)).not.toThrow();
  });
});
