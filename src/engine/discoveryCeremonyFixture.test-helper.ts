/**
 * Test-only Discovery fixture reproducing the September 23 incident shape:
 * an evidence-free opening ceremony, a later Continue interstitial, and
 * frozen items the runtime scorer can answer. No family content.
 */
export const FIXTURE_PROMPTS = {
  one: "How many apples are in three baskets of four?",
  two: "How many pears are in two baskets of five?",
} as const;

export function discoveryFixtureAcademic() {
  const item = (itemId: "one" | "two", accepted: string) => ({
    itemId,
    constructId: "math.multiplication.equal_groups",
    prompt: FIXTURE_PROMPTS[itemId],
    representationSpec: "Baskets drawn with equal counts of fruit.",
    responseContract: { mode: "tap_numeric_pad" as const, representationId: `baskets-${itemId}` },
    correctAnswerContract: { acceptedValues: [accepted] },
    difficultyBoundary: "grade 3",
    exposureId: `eval-fixture:${itemId}`,
    possibleConfounds: [],
    falsifyingEvidence: [],
    measurementKeys: ["independent_correct"],
  });
  return {
    evaluationId: "eval-fixture",
    title: "Market Baskets",
    assignmentEvidenceIds: ["assignment:fixture"],
    constructs: [{ constructId: "math.multiplication.equal_groups", prerequisiteIds: [] }],
    items: [item("one", "12"), item("two", "10")],
  };
}

export function discoveryCeremonyHtml(options: { runtimeContract?: boolean } = {}): string {
  const academic = discoveryFixtureAcademic();
  const runtime = {
    items: academic.items.map(item => ({
      itemId: item.itemId,
      constructId: item.constructId,
      acceptedValues: item.correctAnswerContract.acceptedValues,
    })),
  };
  const binding = options.runtimeContract
    ? `<script id="sunny-discovery-contract" type="application/json">${JSON.stringify(runtime)}</script>
       <script>window.__SUNNY_DISCOVERY_TEST__={evaluate(itemId,value){const row=${JSON.stringify(runtime.items)}.find(r=>r.itemId===itemId);return {itemId,constructId:row?.constructId,correct:Boolean(row&&row.acceptedValues.includes(value))};}};</script>`
    : "";
  return `<!doctype html><html><body>
    <section id="opening"><h2>Opening the market</h2><button id="begin">Begin</button></section>
    <section id="question" hidden><h2 id="prompt"></h2><button id="answer">Answer</button><button id="wrong">Different answer</button></section>
    <section id="between" hidden><h2>Great work. Ready for the next basket?</h2><button id="next">Continue</button></section>
    ${binding}
    <script>
    const prompts=${JSON.stringify(FIXTURE_PROMPTS)};
    let active=null, count=0;
    const el=id=>document.getElementById(id);
    window.SUNNY_VALIDATION_HOOKS={journey:[
      {itemId:'one',steps:[{action:'click',selector:'#begin'},{action:'click',selector:'#answer'}]},
      {itemId:'two',steps:[{action:'click',selector:'#next'},{action:'click',selector:'#answer'}]}
    ],incorrectJourney:[
      {itemId:'one',steps:[{action:'click',selector:'#begin'},{action:'click',selector:'#wrong'}]},
      {itemId:'two',steps:[{action:'click',selector:'#next'},{action:'click',selector:'#wrong'}]}
    ]};
    const show=id=>{
      active=id;el('opening').hidden=true;el('between').hidden=true;el('question').hidden=false;
      el('prompt').textContent=prompts[id];
      parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id,prompt:prompts[id]}}},'*');
    };
    el('begin').onclick=()=>show('one');
    el('next').onclick=()=>show('two');
    const commit=attemptedValue=>{
      count+=1;
      const scoring=window.__SUNNY_DISCOVERY_TEST__?.evaluate(active,attemptedValue);
      if(scoring)el('question').dataset.correct=String(scoring.correct);
      parent.postMessage({type:'evaluation_attempt',payload:{attemptId:'attempt-'+count,itemId:active,attemptedValue,supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()}},'*');
      if(active==='one'){el('question').hidden=true;el('between').hidden=false;}
      else parent.postMessage({type:'evaluation_complete',payload:{}},'*');
    };
    el('answer').onclick=()=>commit(active==='one'?'12':'10');
    el('wrong').onclick=()=>commit('0');
    parent.postMessage({type:'evaluation_ready'},'*');
    </script></body></html>`;
}
