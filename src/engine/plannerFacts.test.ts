import {it,expect} from "vitest";
import fs from "node:fs";import path from "node:path";
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
it("sends the Planner the compact facts",()=>{
  const source=fs.readFileSync(path.join(process.cwd(),"src/engine/directMathExperience.ts"),"utf8");
  expect(source).toContain("Homework and child-chart context:\n${JSON.stringify(compactPlannerFacts(packet!))}");
});
