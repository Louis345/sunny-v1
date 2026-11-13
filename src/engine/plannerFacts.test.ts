import {it,expect} from "vitest";
import * as creator from "./directMathExperience";

// 2026-10-14: a full run read about 187,000 tokens. The Planner's biggest input was her
// evaluation stored with full record-keeping detail (44,700 characters) and the whole activity
// catalogue (24,700). It needs, per word, what she typed and whether it was right.
const packet=()=>({childId:"lab",capturedHomework:{title:"Unit 9",words:["shiny","lucky"],wordGroups:[]},childChart:{name:"Lab"},masteryContext:{daysUntilTest:3},
 activityCatalog:[
  {activityId:"word-radar",label:"Word Radar",domains:["spelling"],purposes:["recall"],bestFor:["hidden recall"],evidenceRole:"measure",capabilityModes:[{id:"hidden_word_recall",label:"Hidden",purpose:"evaluate",config:{recallMode:"hidden_word_recall"}}],modeEvidenceNotes:"long notes ".repeat(40),contaminationRisks:["x"],status:"ready",sentToPlanner:true,launchable:true},
  {activityId:"quest",label:"Quest",domains:["spelling"],purposes:["quest"],capabilityModes:[],sentToPlanner:true,launchable:true},
 ],
 discoveryEvidence:{summary:{constructs:[],coverage:{assigned:2,attempted:2,complete:true},spellingTargets:[{word:"shiny",itemId:"item-0"},{word:"lucky",itemId:"item-1"}]},history:{constructs:{}},observations:["shiny","lucky"].map((word,i)=>({observationId:`obs-${i}`,itemId:`item-${i}`,sourceId:"evaluation",constructLinks:[{constructId:`spelling.word.${i}`,role:"primary",confidence:1}],result:{correct:i===0,score:i===0?1:0},assistance:{status:"unassisted",scaffolds:[]},exposure:"unseen",provenance:"independent_probe",observedAt:"2026-10-14T03:19:02.840Z",confounds:["word_id:x","response_mode:spelling_letters","measurement_role:fresh_checkpoint","first_response"],childResponse:i===0?word:"luky"}))},
});
it("gives the Planner her answers per word, with every evidence ID, and only the activities it may plan",()=>{
  expect(creator).toHaveProperty("compactPlannerFacts");
  const facts=(creator as any).compactPlannerFacts(packet());
  const text=JSON.stringify(facts);
  expect(facts.evaluation).toEqual([{observationId:"obs-0",word:"shiny",typed:"shiny",correct:true,assisted:false},{observationId:"obs-1",word:"lucky",typed:"luky",correct:false,assisted:false}]);
  for(const noise of ["provenance","confounds","constructLinks","observedAt","modeEvidenceNotes","contaminationRisks"])expect(text).not.toContain(noise);
  expect(facts.activityCatalog.map((card:{activityId:string})=>card.activityId)).toEqual(["word-radar"]);
  expect(facts.activityCatalog[0].capabilityModes[0].config).toEqual({recallMode:"hidden_word_recall"});
  expect(text.length).toBeLessThan(JSON.stringify(packet()).length/2);
});
// The Teaching Planner now works through tools; its prompt carries exactly the compact facts.
it("sends the Planner the compact facts",()=>{
  const prompt=(creator as any).spellingTeachingToolPrompt(packet());
  expect(prompt.endsWith(`Homework and child-chart context:\n${JSON.stringify((creator as any).compactPlannerFacts(packet()))}`)).toBe(true);
});

// Contract 54: words the opening did not check reach the teaching Planner as not checked yet, never as known.
it("tells the Planner which words were not checked yet",()=>{
  const base=packet() as any;
  base.discoveryEvidence.summary.coverage={assigned:1,attempted:1,untestedItemIds:[],complete:true,notCheckedItemIds:["item-1"]};
  const facts=(creator as any).compactPlannerFacts(base);
  expect(facts.notCheckedYet).toEqual(["lucky"]);
  expect((creator as any).compactPlannerFacts(packet()).notCheckedYet).toBeUndefined();
});

// Owner, 2026-11-07: trim every Planner request. Her teaching-board request was 91k characters, 66k of them the
// history of every word she ever practiced. The Planner keeps full history for this list's words and one summary
// line for the rest.
it("keeps full history only for this list's words and summarizes the rest",()=>{
  const base=packet() as any;
  base.discoveryEvidence.summary.spellingTargets=[{word:"shiny",itemId:"item-0",constructId:"spelling.word.0"},{word:"lucky",itemId:"item-1",constructId:"spelling.word.1"}];
  base.discoveryEvidence.history={constructs:{
    "spelling.word.0":{observations:[{observationId:"h1",result:{correct:true},childResponse:"shiny"}],evaluations:[]},
    "spelling.word.old":{observations:[{observationId:"h2",result:{correct:false},childResponse:"bote"},{observationId:"h3",result:{correct:true},childResponse:"boat"}],evaluations:[]},
  }};
  const facts=(creator as any).compactPlannerFacts(base);
  expect(Object.keys(facts.history)).toEqual(["spelling.word.0"]);
  expect(facts.earlierWords).toEqual({words:1,answers:2,correct:1});
});
