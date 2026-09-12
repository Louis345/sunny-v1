// Synthetic academic fixtures; never child evidence.
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


/** Provider output for local browser tests: every result originates in a DOM action. */
export function releaseActivityHtml(nodeId: string, title = "Lab activity", itemPrefix = ""): string {
  return `<!doctype html><html><head><style>html,body{background:white;color:#172033;font:20px system-ui;margin:0;padding:16px}button,input{font:20px system-ui;padding:12px;margin:8px}</style></head><body><h1>${title}</h1><p id="prompt">What is 5 × 2?</p>
<button id="tap">10</button><section id="numeric" hidden><label>What is 2 × 3? <input id="value" type="text"></label><button id="submit">Submit</button></section>
<section id="construct" hidden><p>Move the 10-counter group to the total.</p><div id="piece" draggable="true" style="width:100px;height:60px;background:skyblue">10 counters</div><div id="target" style="width:150px;height:80px;border:2px solid">Total</div></section>
<script>const results=[];const save=(target,attemptedValue,correct)=>{const row={target,attemptedValue,correct,scaffoldLevel:0,responseTimeMs:100};results.push(row);parent.postMessage({type:'attempt_event',payload:{domain:'math',...row}},'*');};
window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'q1',steps:[{action:'click',selector:'#tap'}]},{itemId:'q2',steps:[{action:'fill',selector:'#value',value:'6'},{action:'click',selector:'#submit'}]},{itemId:'q3',steps:[{action:'drag',selector:'#piece',target:'#target'}]}]};
document.querySelector('#tap').onclick=()=>{save('q1','ten',true);document.querySelector('#tap').hidden=true;document.querySelector('#numeric').hidden=false;};
document.querySelector('#submit').onclick=()=>{const value=document.querySelector('#value').value;save('q2',value,value==='6');document.querySelector('#numeric').hidden=true;document.querySelector('#construct').hidden=false;};
document.querySelector('#piece').ondragstart=e=>e.dataTransfer.setData('text/plain','10');document.querySelector('#target').ondragover=e=>e.preventDefault();document.querySelector('#target').ondrop=e=>{e.preventDefault();save('q3',JSON.stringify({total:Number(e.dataTransfer.getData('text/plain'))}),e.dataTransfer.getData('text/plain')==='10');parent.postMessage({type:'node_complete',payload:{nodeId:${JSON.stringify(nodeId)},completed:true,accuracy:1,timeSpent_ms:1000,targetResults:results}},'*');document.querySelector('#construct').hidden=true;};parent.postMessage({type:'activity_ready'},'*');
</script></body></html>`.replaceAll("'q1'",JSON.stringify(itemPrefix+"q1")).replaceAll("'q2'",JSON.stringify(itemPrefix+"q2")).replaceAll("'q3'",JSON.stringify(itemPrefix+"q3"));
}


export const graphAuditExamples = {
  invalid: {prompt:"Cleo’s bar reaches 3. How many books did Cleo read?",representationSpec:"Bar graph, unit scale, Cleo=3",acceptedValues:["3"],failure:"Question supplies the measured answer."},
  corrected: {prompt:"How many books did Cleo read?",representationSpec:"Bar graph labeled Books read; Cleo bar reaches 3; axis ticks 0,1,2,3,4 with equal spacing.",acceptedValues:["3"]},
  inconsistent: {prompt:"Each grid line represents 2 books. How many books did Cleo read?",representationSpec:"Cleo bar reaches the third grid line.",acceptedValues:["3"],failure:"Diagram scale requires 6, but accepted answer is 3."},
};
