import fs from "node:fs";
import path from "node:path";

// Synthetic academic fixtures; never child evidence.
export function writeMathPdfFixture(rootDir: string): string {
  const content = "BT /F1 18 Tf 72 720 Td (Books read: Cleo 3, Nia 4, Sol 2. Read and compare the graph.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const filePath = path.join(rootDir, "school-math.pdf");
  fs.writeFileSync(filePath, pdf);
  return filePath;
}

export function plan(activityCount = 3): any {
  const activities = Array.from({ length: activityCount }, (_, index) => ({
    id: `activity-${index + 1}`,
    title: `Adventure ${index + 1}`,
    routeId: index % 2 === 0 ? "route-a" : "route-b",
    academicTarget: "multiplication",
    mechanic: `mechanic-${index + 1}`,
    engagementVariable: index % 2 === 0 ? "strategy" : "visual",
    responsibilityId: "equal-groups",
    visualMock: { scene: "A vivid interactive world", layout: "Clear play area", artworkPrompt: "Vibrant child-safe game icon" },
    experience: {
      objective: "Practice multiplication",
      childAction: "Manipulate the world",
      worldReaction: "The world visibly transforms",
      anticipation: "A mystery is gradually revealed",
      progress: "The scene grows",
      recovery: "A clue appears without revealing the answer",
      reward: "A finale animation appears",
    },
    items: [{
      id: "q1",
      prompt: "5 x 2 = ?",
      lineage: { sourceEvidenceIds: ["assignment:q1"], exposure: "unseen", measurementRole: "fresh_checkpoint" },
      response: { mode: "selection", options: [{ id: "ten", label: "10", correct: true }, { id: "fifteen", label: "15", correct: false }] },
    }],
    acceptanceSteps: ["launch", "answer incorrectly", "recover", "answer correctly", "complete"],
    creatorPrompt: `Create a distinct ${index % 2 === 0 ? "strategy" : "visual"} multiplication experience.`,
    designPrediction: "The child will understand the first action without adult help.",
    academicPrediction: {
      constructId: "math.multiplication.equal_groups",
      context: "unassisted returned schoolwork",
      horizon: "within_7_days",
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 },
      predictedErrorPatterns: ["operation_selection"],
      confidence: 0.65,
      evidenceIds: ["chart:reina"],
      intervention: "equal-groups practice",
      evidenceLimit: "practice_only",
    },
    preserve: ["clear progress"],
    change: ["make the learning target larger"],
    explore: ["short optional demonstration"],
    avoid: ["hidden drag mechanics"],
    measurementKeys: ["interaction.timeToFirstValidActionMs", "interaction.demoRequested"],
  }));
  return {
    planId: "direct-plan-1",
    title: "Multiplication Adventure",
    contentScopeRationale: "Three focused instruments are sufficient to teach and observe this assignment without duplicating work.",
    concept: {
      conceptId: "multiplication_as_equal_groups",
      name: "Multiplication as equal groups",
      statement: "A multiplication tells you how many you get when the same amount is repeated a set number of times.",
      instanceScope: "factors of two, five and ten within fifty",
      prerequisites: ["skip counting", "repeated addition"],
      assumptions: ["The child can skip-count aloud but may not connect it to notation."],
    },
    academicTheory: "Measure multiplication understanding through meaningful play.",
    profileEvidence: ["chart:reina"],
    learningResponsibilities: [{
      id: "equal-groups",
      title: "Equal Groups",
      purpose: "Connect equal groups to multiplication and solve the resulting quantity.",
      academicTarget: "multiplication",
    }],
    boardWorld: { title: "The Hidden Signal", narrative: "Choose a route to restore the signal.", backgroundPrompt: "Magical strategy landscape" },
    fork: {
      question: "Which route should we explore?",
      hypothesis: "Compare strategy with visual construction.",
      heldConstant: ["multiplication targets"],
      routes: [
        { id: "route-a", label: "Strategy Trail", promise: "Outthink the challenge", childFacingActionCue: "Choose moves that restore the signal.", previewNodeId: activities.find((a) => a.routeId === "route-a")?.id, engagementVariable: "strategy", nodeIds: activities.filter((a) => a.routeId === "route-a").map((a) => a.id) },
        { id: "route-b", label: "Builder Trail", promise: "Build the solution", childFacingActionCue: "Arrange pieces to power the trail.", previewNodeId: activities.find((a) => a.routeId === "route-b")?.id, engagementVariable: "visual", nodeIds: activities.filter((a) => a.routeId === "route-b").map((a) => a.id) },
      ],
    },
    activities,
    quest: { title: "Quest", locked: true, teaser: "A hidden expedition awaits.", artworkPrompt: "Mysterious portal adventure icon" },
    boss: { title: "Boss", locked: true, teaser: "A legendary finale waits beyond the Quest.", artworkPrompt: "Epic child-safe fantasy guardian icon" },
  };
}

export function learningProgram(activityCount = 3): any {
  const legacy = plan(activityCount);
  return {
    planId: legacy.planId,
    contentScopeRationale: legacy.contentScopeRationale,
    concept: {
      conceptId: legacy.concept.conceptId,
      name: legacy.concept.name,
      statement: legacy.concept.statement,
      instanceScope: legacy.concept.instanceScope,
      prerequisites: legacy.concept.prerequisites,
    },
    assumptions: [{
      assumptionId: "assumption-equal-groups",
      claim: legacy.concept.assumptions[0],
      evidenceIds: ["chart:reina"],
      confidence: 0.6,
      uncertainty: "No returned graded work yet.",
    }],
    academicTheory: legacy.academicTheory,
    profileEvidence: legacy.profileEvidence,
    learningResponsibilities: legacy.learningResponsibilities,
    fork: {
      hypothesis: legacy.fork.hypothesis,
      heldConstant: legacy.fork.heldConstant,
      routes: legacy.fork.routes.map((route: any) => ({
        id: route.id,
        academicRationale: `A valid route for ${route.label}.`,
        nodeIds: route.nodeIds,
      })),
    },
    activities: legacy.activities.map((activity: any) => ({
      purpose: "baseline",
      id: activity.id,
      routeId: activity.routeId,
      responsibilityId: activity.responsibilityId,
      academicTarget: activity.academicTarget,
      difficultyBoundary: {
        allowedConcepts: ["equal groups", "arrays"],
        allowedRepresentations: ["objects", "rows and columns", "equations"],
        excludedExtensions: ["division", "fractions"],
        startingSupport: "visual grouping",
        expectedIndependence: "independent equivalent practice",
      },
      items: activity.items,
      academicPrediction: activity.academicPrediction,
      measurementKeys: activity.measurementKeys,
      catalogDecision: { action: "generate_new", reason: "Fresh assignment requires a grounded instrument." },
    })),
  };
}

export function graphTargetedPlan(activityCount: number, evidenceIds: string[]): any {
  const assignmentEvidenceId = evidenceIds.find((evidenceId) => evidenceId.startsWith("assignment:")) ?? "assignment:graph";
  const observationEvidenceIds = evidenceIds.filter((evidenceId) => evidenceId.startsWith("observation_"));
  const citedEvidenceIds = observationEvidenceIds.length > 0 ? observationEvidenceIds : evidenceIds;
  const activities = Array.from({ length: activityCount }, (_, index) => ({
    id: `activity-${index + 1}`,
    title: `Graph Mission ${index + 1}`,
    routeId: index % 2 === 0 ? "route-a" : "route-b",
    academicTarget: "reading and comparing a unit-scale bar graph",
    mechanic: index % 2 === 0 ? "graph investigator" : "bar builder",
    engagementVariable: index % 2 === 0 ? "strategy" : "visual",
    responsibilityId: "graph-reading",
    visualMock: { scene: "A bright library graph station", layout: "Large graph beside clear controls", artworkPrompt: "Child-safe library graph adventure icon" },
    experience: {
      objective: "Read labels and values from a unit-scale bar graph",
      childAction: "Inspect, select, enter, and arrange graph values",
      worldReaction: "The matching graph evidence lights up",
      anticipation: "A library clue is gradually revealed",
      progress: "Each verified graph clue fills the scene",
      recovery: "The relevant axis and label glow without revealing the answer",
      reward: "The library signal is restored",
    },
    items: [
      {
        id: "q1",
        prompt: "Which child read 3 books?",
        lineage: { sourceEvidenceIds: [assignmentEvidenceId, ...citedEvidenceIds], exposure: "unseen", measurementRole: "fresh_checkpoint" },
        response: { mode: "selection", options: [{ id: "cleo", label: "Cleo", correct: true }, { id: "nia", label: "Nia", correct: false }, { id: "sol", label: "Sol", correct: false }] },
      },
      {
        id: "q2",
        prompt: "How many books did Nia read?",
        lineage: { sourceEvidenceIds: [assignmentEvidenceId, ...citedEvidenceIds], exposure: "practiced", measurementRole: "practice" },
        response: { mode: "numeric", expected: 4 },
      },
      {
        id: "q3",
        prompt: "Move Nia's 4-book bar to Highest.",
        lineage: { sourceEvidenceIds: [assignmentEvidenceId, ...citedEvidenceIds], exposure: "unseen", measurementRole: "fresh_checkpoint" },
        response: { mode: "construction", expectedState: { highest: 4 }, successDescription: "Nia's 4-book bar is in Highest" },
      },
    ],
    acceptanceSteps: ["launch", "inspect the graph", "make a selection", "enter a value", "complete the construction"],
    creatorPrompt: "Create a distinct graph-reading experience grounded in the frozen unit-scale library graph.",
    designPrediction: "The child will use labels and axis values without adult help.",
    academicPrediction: {
      constructId: "math.graph_reading",
      context: "fresh unassisted unit-scale bar graph",
      horizon: "within_7_days",
      eligibility: { sources: ["independent_probe", "graded_work"], maxDelayDays: 7 },
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 },
      predictedErrorPatterns: ["label_value_mismatch", "axis_scale_misread"],
      confidence: 0.65,
      evidenceIds: citedEvidenceIds,
      intervention: "label-and-axis graph reading practice",
      evidenceLimit: "practice_only",
    },
    preserve: ["large graph labels", "clear progress"],
    change: ["connect each answer to visible graph evidence"],
    explore: ["short optional axis highlight"],
    avoid: ["answer-revealing narration", "hidden drag mechanics"],
    measurementKeys: ["interaction.timeToFirstValidActionMs", "interaction.demoRequested"],
  }));
  return {
    planId: "graph-plan-1",
    title: "Library Graph Missions",
    contentScopeRationale: "Two focused instruments revisit the observed graph-reading uncertainty without duplicating the school worksheet.",
    concept: {
      conceptId: "unit_scale_bar_graph_reading",
      name: "Reading a unit-scale bar graph",
      statement: "A bar's label identifies the category and its height matches a value on the numbered axis.",
      instanceScope: "single-series bar graphs with a unit scale from zero to four",
      prerequisites: ["counting to four", "matching labels"],
      assumptions: ["Reading friction may have affected the first graph response."],
    },
    academicTheory: "Use fresh label-to-value and value-to-label prompts to separate graph understanding from reading friction.",
    profileEvidence: citedEvidenceIds,
    learningResponsibilities: [{ id: "graph-reading", title: "Graph Reading", purpose: "Connect bar labels and heights to axis values.", academicTarget: "unit-scale bar graph reading" }],
    boardWorld: { title: "The Library Signal", narrative: "Choose a route and restore the missing graph clues.", backgroundPrompt: "Magical library hills with glowing graphs" },
    fork: {
      question: "Which graph route should we explore?",
      hypothesis: "Compare investigator and builder interactions while holding graph targets constant.",
      heldConstant: ["unit-scale graph targets", "frozen answers"],
      routes: [
        { id: "route-a", label: "Investigator Trail", promise: "Find the graph clues", childFacingActionCue: "Inspect labels and values.", previewNodeId: activities.find((activity) => activity.routeId === "route-a")?.id, engagementVariable: "strategy", nodeIds: activities.filter((activity) => activity.routeId === "route-a").map((activity) => activity.id) },
        { id: "route-b", label: "Builder Trail", promise: "Arrange the graph evidence", childFacingActionCue: "Build with bars and values.", previewNodeId: activities.find((activity) => activity.routeId === "route-b")?.id, engagementVariable: "visual", nodeIds: activities.filter((activity) => activity.routeId === "route-b").map((activity) => activity.id) },
      ],
    },
    activities,
    quest: { title: "Quest", locked: true, teaser: "A hidden graph expedition awaits.", artworkPrompt: "Mysterious graph portal icon" },
    boss: { title: "Boss", locked: true, teaser: "A graph-reading finale waits beyond the Quest.", artworkPrompt: "Epic child-safe library guardian" },
  };
}

export function graphLearningProgram(activityCount: number, evidenceIds: string[]): any {
  const designed = graphTargetedPlan(activityCount, evidenceIds);
  return {
    planId: designed.planId,
    contentScopeRationale: designed.contentScopeRationale,
    concept: {
      conceptId: designed.concept.conceptId,
      name: designed.concept.name,
      statement: designed.concept.statement,
      instanceScope: designed.concept.instanceScope,
      prerequisites: designed.concept.prerequisites,
    },
    assumptions: [{
      assumptionId: "assumption-reading-friction",
      claim: designed.concept.assumptions[0],
      evidenceIds: designed.profileEvidence,
      confidence: 0.6,
      uncertainty: "One response also contained a reading-friction signal.",
    }],
    academicTheory: designed.academicTheory,
    profileEvidence: designed.profileEvidence,
    learningResponsibilities: designed.learningResponsibilities,
    fork: {
      hypothesis: designed.fork.hypothesis,
      heldConstant: designed.fork.heldConstant,
      routes: designed.fork.routes.map((route: any) => ({ id: route.id, academicRationale: `A valid graph-reading route for ${route.label}.`, nodeIds: route.nodeIds })),
    },
    activities: designed.activities.map((activity: any) => ({
      purpose: "baseline",
      id: activity.id,
      routeId: activity.routeId,
      responsibilityId: activity.responsibilityId,
      academicTarget: activity.academicTarget,
      difficultyBoundary: {
        allowedConcepts: ["bar labels", "unit-scale axis values", "comparing bar heights"],
        allowedRepresentations: ["single-series vertical bar graph", "labeled bars", "numbered axis"],
        excludedExtensions: ["multi-series graphs", "non-unit scales", "fractions"],
        startingSupport: "highlight a relevant label or axis without exposing the answer",
        expectedIndependence: "independent equivalent graph reading",
      },
      items: activity.items,
      academicPrediction: activity.academicPrediction,
      measurementKeys: activity.measurementKeys,
      catalogDecision: { action: "generate_new", reason: "Fresh graph evidence requires a grounded instrument.", evidenceIds: designed.profileEvidence },
    })),
  };
}

/** Recorded Creator output for graph-targeted browser acceptance. */
export function graphActivityHtml(nodeId: string, itemPrefix = "", title = "Library Graph Mission"): string {
  return `<!doctype html><html><head><style>html,body{background:#f7fbff;color:#172033;font:20px system-ui;margin:0;padding:14px}button,input{font:20px system-ui;padding:12px;margin:8px}svg{display:block;margin:8px 0}.bar{fill:#56a3e8}.drop{width:180px;height:72px;border:3px dashed #345;display:grid;place-items:center}</style></head><body><h1>${title}</h1>
<svg width="360" height="210" role="img" aria-label="Books read: Cleo 3, Nia 4, Sol 2"><line x1="35" y1="10" x2="35" y2="180" stroke="#172033"/><line x1="35" y1="180" x2="335" y2="180" stroke="#172033"/><text x="12" y="182">0</text><text x="12" y="142">1</text><text x="12" y="102">2</text><text x="12" y="62">3</text><text x="12" y="22">4</text><rect class="bar" x="70" y="60" width="55" height="120"/><text x="74" y="202">Cleo</text><rect class="bar" x="155" y="20" width="55" height="160"/><text x="164" y="202">Nia</text><rect class="bar" x="240" y="100" width="55" height="80"/><text x="249" y="202">Sol</text></svg>
<section id="select"><p>Which child read 3 books?</p><button id="cleo">Cleo</button><button id="nia">Nia</button><button id="sol">Sol</button></section>
<section id="numeric" hidden><label>How many books did Nia read? <input id="value" inputmode="numeric"></label><button id="submit">Submit</button></section>
<section id="construct" hidden><p>Move Nia's 4-book bar to Highest.</p><div id="niaBar" draggable="true" style="width:140px;height:56px;background:#56a3e8;padding:8px">Nia: 4 books</div><div id="highest" class="drop">Highest</div></section>
<script>const results=[];const ids={q1:${JSON.stringify(itemPrefix + "q1")},q2:${JSON.stringify(itemPrefix + "q2")},q3:${JSON.stringify(itemPrefix + "q3")}};const prompts={[ids.q1]:'Which child read 3 books?',[ids.q2]:'How many books did Nia read?',[ids.q3]:"Move Nia's 4-book bar to Highest."};const roles={[ids.q1]:'fresh_checkpoint',[ids.q2]:'practice',[ids.q3]:'fresh_checkpoint'};const emitState=id=>{const guided=roles[id]!=='fresh_checkpoint';parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id,prompt:prompts[id],measurementRole:roles[id],readAloudRequested:guided,readAloudCount:guided?1:0,companionSupportTrigger:guided?'guided_prompt':undefined}}},'*');};const save=(target,attemptedValue,correct)=>{const row={target,attemptedValue,correct,scaffoldLevel:0,responseTimeMs:100};results.push(row);parent.postMessage({type:'attempt_event',payload:{domain:'math',...row}},'*');};
window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:ids.q1,steps:[{action:'click',selector:'#cleo'}]},{itemId:ids.q2,steps:[{action:'fill',selector:'#value',value:'4'},{action:'click',selector:'#submit'}]},{itemId:ids.q3,steps:[{action:'drag',selector:'#niaBar',target:'#highest'}]}]};
const choose=value=>{save(ids.q1,value,value==='cleo');document.querySelector('#select').hidden=true;document.querySelector('#numeric').hidden=false;emitState(ids.q2);};document.querySelector('#cleo').onclick=()=>choose('cleo');document.querySelector('#nia').onclick=()=>choose('nia');document.querySelector('#sol').onclick=()=>choose('sol');
document.querySelector('#submit').onclick=()=>{const value=document.querySelector('#value').value;save(ids.q2,value,value==='4');document.querySelector('#numeric').hidden=true;document.querySelector('#construct').hidden=false;emitState(ids.q3);};document.querySelector('#niaBar').ondragstart=e=>e.dataTransfer.setData('text/plain','4');document.querySelector('#highest').ondragover=e=>e.preventDefault();document.querySelector('#highest').ondrop=e=>{e.preventDefault();const value=Number(e.dataTransfer.getData('text/plain'));save(ids.q3,JSON.stringify({highest:value}),value===4);parent.postMessage({type:'node_complete',payload:{nodeId:${JSON.stringify(nodeId)},completed:true,accuracy:1,timeSpent_ms:1000,targetResults:results}},'*');document.querySelector('#construct').hidden=true;};emitState(ids.q1);parent.postMessage({type:'activity_ready'},'*');</script></body></html>`;
}


/** Provider output for local browser tests: every result originates in a DOM action. */
export function releaseActivityHtml(nodeId: string, title = "Lab activity", itemPrefix = ""): string {
  return `<!doctype html><html><head><style>html,body{background:white;color:#172033;font:20px system-ui;margin:0;padding:16px}button,input{font:20px system-ui;padding:12px;margin:8px}</style></head><body><h1>${title}</h1><p id="prompt">What is 5 × 2?</p>
<button id="tap">10</button><section id="numeric" hidden><label>What is 2 × 3? <input id="value" type="text"></label><button id="submit">Submit</button></section>
<section id="construct" hidden><p>Move the 10-counter group to the total.</p><div id="piece" draggable="true" style="width:100px;height:60px;background:skyblue">10 counters</div><div id="target" style="width:150px;height:80px;border:2px solid">Total</div></section>
<script>const results=[];const prompts={'q1':'What is 5 × 2?','q2':'What is 2 × 3?','q3':'Move the 10-counter group to the total.'};const emitState=(id)=>parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id,prompt:prompts[id],measurementRole:'fresh_checkpoint',readAloudRequested:false,readAloudCount:0}}},'*');const save=(target,attemptedValue,correct)=>{const row={target,attemptedValue,correct,scaffoldLevel:0,responseTimeMs:100};results.push(row);parent.postMessage({type:'attempt_event',payload:{domain:'math',...row}},'*');};
window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'q1',steps:[{action:'click',selector:'#tap'}]},{itemId:'q2',steps:[{action:'fill',selector:'#value',value:'6'},{action:'click',selector:'#submit'}]},{itemId:'q3',steps:[{action:'drag',selector:'#piece',target:'#target'}]}]};
document.querySelector('#tap').onclick=()=>{save('q1','ten',true);document.querySelector('#tap').hidden=true;document.querySelector('#numeric').hidden=false;emitState('q2');};
document.querySelector('#submit').onclick=()=>{const value=document.querySelector('#value').value;save('q2',value,value==='6');document.querySelector('#numeric').hidden=true;document.querySelector('#construct').hidden=false;emitState('q3');};
document.querySelector('#piece').ondragstart=e=>e.dataTransfer.setData('text/plain','10');document.querySelector('#target').ondragover=e=>e.preventDefault();document.querySelector('#target').ondrop=e=>{e.preventDefault();save('q3',JSON.stringify({total:Number(e.dataTransfer.getData('text/plain'))}),e.dataTransfer.getData('text/plain')==='10');parent.postMessage({type:'node_complete',payload:{nodeId:${JSON.stringify(nodeId)},completed:true,accuracy:1,timeSpent_ms:1000,targetResults:results}},'*');document.querySelector('#construct').hidden=true;};emitState('q1');parent.postMessage({type:'activity_ready'},'*');
</script></body></html>`.replaceAll("'q1'",JSON.stringify(itemPrefix+"q1")).replaceAll("'q2'",JSON.stringify(itemPrefix+"q2")).replaceAll("'q3'",JSON.stringify(itemPrefix+"q3"));
}


export const graphAuditExamples = {
  invalid: {prompt:"Cleo’s bar reaches 3. How many books did Cleo read?",representationSpec:"Bar graph, unit scale, Cleo=3",acceptedValues:["3"],failure:"Question supplies the measured answer."},
  corrected: {prompt:"How many books did Cleo read?",representationSpec:"Bar graph labeled Books read; Cleo bar reaches 3; axis ticks 0,1,2,3,4 with equal spacing.",acceptedValues:["3"]},
  inconsistent: {prompt:"Each grid line represents 2 books. How many books did Cleo read?",representationSpec:"Cleo bar reaches the third grid line.",acceptedValues:["3"],failure:"Diagram scale requires 6, but accepted answer is 3."},
};
