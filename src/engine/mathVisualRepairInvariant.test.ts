import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runDirectBrowserSmokeCheck } from "./directMathExperience";
import { selectChildFacingJourneyScreens } from "./childFacingVisualGate";
import {
  DiscoveryRuntimeVerificationError,
  verifyMathJourneyAtReleaseViewports,
} from "./discoveryVisualReview";

const brokenClockHtml = `<!doctype html>
<html><body>
<svg width="320" height="320" viewBox="0 0 320 320">
  <rect id="hand-long" x="145" y="40" width="30" height="120" fill="transparent"></rect>
</svg>
<script>
window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:"item-02-which-hand",steps:[{action:"click",selector:"#hand-long"}]}]};
document.querySelector("#hand-long").addEventListener("click",()=>{
  parent.postMessage({type:"evaluation_attempt",attemptId:"a-1",itemId:"item-02-which-hand",attemptedValue:"long_hand",supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()},"*");
  parent.postMessage({type:"evaluation_complete"},"*");
});
</script></body></html>`;

describe("generated math control diagnostics", () => {
  it("keeps Saori's missing-hand clock as immutable journey-review evidence", async () => {
    const fixture = path.join(process.cwd(), "outputs/saori-session-readiness-20260919/saved-clock/original.html");
    const html = fs.readFileSync(fixture);
    expect(createHash("sha256").update(html).digest("hex")).toBe(
      "40a7a0c84ff1405a6eba339dcce9f083a50b0d0b5f7b768efba368813c98e1c7",
    );

    const report = await runDirectBrowserSmokeCheck({
      rootDir: process.cwd(),
      artifacts: [{
        nodeId: "act-two-scales-intro",
        childId: "fixture-child",
        homeworkId: "fixture-clock",
        title: "Lamp Room",
        htmlPath: fixture,
        htmlHash: createHash("sha256").update(html).digest("hex"),
        artworkUrl: "",
        creatorPrompt: "immutable recorded fixture",
        promptHash: "fixture",
        plannerModel: "recorded",
        creatorModel: "recorded",
        itemIds: ["it-intro-01", "it-intro-02", "it-intro-03", "it-intro-04"],
      }],
    });

    expect(report.passed).toBe(true);
    // The activity announces item 1 during its "Tap the silver ring" opening, before
    // the question is visible. That opening is a transition, never item 1; the real
    // question is captured once the browser sees its prompt.
    expect(selectChildFacingJourneyScreens(report.screenshots).map(file => path.basename(file))).toEqual([
      "act-two-scales-intro-sunny-transition-to-01-it-intro-01.png",
      "act-two-scales-intro-sunny-item-01-it-intro-01.png",
      "act-two-scales-intro-sunny-item-02-it-intro-02.png",
      "act-two-scales-intro-sunny-item-03-it-intro-03.png",
      "act-two-scales-intro-sunny-item-04-it-intro-04.png",
      "act-two-scales-intro-sunny-completion.png",
    ]);
  }, 60_000);

  it("reports perpetual geometry animation before a repair wastes its only attempt", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-moving-control-"));
    const html = `<!doctype html><html><head><style>
      @keyframes breathe { 50% { transform: scale(1.03); } }
      #answer { animation: breathe 3s ease-in-out infinite; }
    </style></head><body>
      <div id="answer" role="button" aria-label="20">20</div>
      <script>
      window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:"item-01",steps:[{action:"click",selector:"#answer"}]}]};
      document.querySelector("#answer").onclick=()=>{
        parent.postMessage({type:"evaluation_attempt",attemptId:"a-1",itemId:"item-01",attemptedValue:"20",supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()},"*");
        parent.postMessage({type:"evaluation_complete"},"*");
      };
      </script></body></html>`;
    let failure: unknown;
    try {
      await verifyMathJourneyAtReleaseViewports({
        html,
        outputDir,
        completionType: "evaluation_complete",
        itemIds: ["item-01"],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(DiscoveryRuntimeVerificationError);
    expect((failure as DiscoveryRuntimeVerificationError).issues.every(
      (issue) => issue.includes("item=item-01") && issue.includes("selector=#answer")
        && issue.includes("missing=interaction_stability"),
    )).toBe(true);
    fs.rmSync(outputDir, { recursive: true, force: true });
  }, 15_000);

  it("names the item and SVG selector and captures both failure viewports", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-clock-control-"));
    let failure: unknown;
    try {
      await verifyMathJourneyAtReleaseViewports({
        html: brokenClockHtml,
        outputDir,
        completionType: "evaluation_complete",
        itemIds: ["item-02-which-hand"],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(DiscoveryRuntimeVerificationError);
    const diagnostic = failure as DiscoveryRuntimeVerificationError;
    expect(diagnostic.issues).toHaveLength(2);
    expect(diagnostic.issues.every((issue) => issue.includes("item=item-02-which-hand"))).toBe(true);
    expect(diagnostic.issues.every((issue) => issue.includes("selector=#hand-long"))).toBe(true);
    expect(diagnostic.issues.every((issue) => issue.includes("tag=rect"))).toBe(true);
    expect(diagnostic.issues.every((issue) => issue.includes("missing=semantic_action_marker"))).toBe(true);
    expect(diagnostic.screenshotPaths).toHaveLength(2);
    expect(diagnostic.screenshotPaths.every((file) => fs.existsSync(file))).toBe(true);
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it("explains when a validation journey tries another action after an item committed", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-post-commit-control-"));
    const html = `<!doctype html><html><body>
      <button id="wrong">Short hand</button><button id="right">Long hand</button>
      <script>
      window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:"item-02-which-hand",steps:[
        {action:"click",selector:"#wrong"},{action:"click",selector:"#right"}
      ]}]};
      document.querySelector("#wrong").addEventListener("click",()=>{
        parent.postMessage({type:"evaluation_attempt",attemptId:"a-1",itemId:"item-02-which-hand",attemptedValue:"short_hand",supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()},"*");
        document.querySelector("#wrong").remove(); document.querySelector("#right").remove();
      });
      </script></body></html>`;
    let failure: unknown;
    try {
      await verifyMathJourneyAtReleaseViewports({
        html,
        outputDir,
        completionType: "evaluation_complete",
        itemIds: ["item-02-which-hand"],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(DiscoveryRuntimeVerificationError);
    expect((failure as Error).message).toContain(
      "math_journey_steps_after_commit;item=item-02-which-hand;committedBy=#wrong;remaining=1",
    );
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it("waits for an animated item transition before judging the next control", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-animated-transition-"));
    const html = `<!doctype html><html><body>
      <button id="first">First answer</button><button id="second" hidden>Second answer</button>
      <script>
      window.SUNNY_VALIDATION_HOOKS={journey:[
        {itemId:"item-1",steps:[{action:"click",selector:"#first"}]},
        {itemId:"item-2",steps:[{action:"click",selector:"#second"}]}
      ]};
      const attempt=(id,value)=>parent.postMessage({type:"evaluation_attempt",payload:{attemptId:"a-"+id,itemId:id,attemptedValue:value,supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()}},"*");
      const state=(id,prompt)=>parent.postMessage({type:"game_state_update",payload:{currentChallenge:{id,prompt}}},"*");
      state("item-1","First answer");
      document.querySelector("#first").onclick=()=>{attempt("item-1","one");setTimeout(()=>{document.querySelector("#first").hidden=true;document.querySelector("#second").hidden=false;state("item-2","Second answer");},300)};
      document.querySelector("#second").onclick=()=>{attempt("item-2","two");parent.postMessage({type:"evaluation_complete"},"*")};
      </script></body></html>`;

    await expect(verifyMathJourneyAtReleaseViewports({
      html,
      outputDir,
      completionType: "evaluation_complete",
      itemIds: ["item-1", "item-2"],
    })).resolves.toHaveLength(6);
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it("does not reuse the previous item's control before delayed evidence commits", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-delayed-commit-"));
    const html = `<!doctype html><html><body>
      <button id="answer">Answer one</button>
      <script>
      window.SUNNY_VALIDATION_HOOKS={journey:[
        {itemId:"item-1",steps:[{action:"click",selector:"#answer"}]},
        {itemId:"item-2",steps:[{action:"click",selector:"#answer"}]}
      ]};
      let current=1, settling=false;
      const attempt=(id)=>parent.postMessage({type:"evaluation_attempt",payload:{attemptId:"a-"+id,itemId:id,attemptedValue:String(id),supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()}},"*");
      const state=(id,prompt)=>parent.postMessage({type:"game_state_update",payload:{currentChallenge:{id,prompt}}},"*");
      state("item-1","Answer one");
      document.querySelector("#answer").onclick=()=>{
        if(settling){ parent.postMessage({type:"premature_second_click"},"*"); return; }
        if(current===1){
          settling=true;
          setTimeout(()=>{ attempt("item-1"); current=2; settling=false; document.querySelector("#answer").textContent="Answer two"; state("item-2","Answer two"); },500);
        } else {
          attempt("item-2"); parent.postMessage({type:"evaluation_complete"},"*");
        }
      };
      </script></body></html>`;

    await expect(verifyMathJourneyAtReleaseViewports({
      html,
      outputDir,
      completionType: "evaluation_complete",
      itemIds: ["item-1", "item-2"],
    })).resolves.toHaveLength(6);
    fs.rmSync(outputDir, { recursive: true, force: true });
  }, 15_000);

  it("waits through a committed acknowledgement overlay before touching the next item", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-ack-transition-"));
    const html = `<!doctype html><html><head><style>
      #ack { position:fixed; inset:0; z-index:10; background:white; }
    </style></head><body>
      <button id="answer">Answer one</button>
      <script>
      window.SUNNY_VALIDATION_HOOKS={journey:[
        {itemId:"item-1",steps:[{action:"click",selector:"#answer"}]},
        {itemId:"item-2",steps:[{action:"click",selector:"#answer"}]}
      ]};
      let current=1;
      const attempt=(id)=>parent.postMessage({type:"evaluation_attempt",payload:{attemptId:"a-"+id,itemId:id,attemptedValue:String(id),supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()}},"*");
      const state=(id,prompt)=>parent.postMessage({type:"game_state_update",payload:{currentChallenge:{id,prompt}}},"*");
      state("item-1","Answer one");
      document.querySelector("#answer").onclick=()=>{
        if(current===1){
          attempt("item-1");
          const ack=document.createElement("div"); ack.id="ack"; document.body.appendChild(ack);
          setTimeout(()=>{ current=2; document.querySelector("#answer").textContent="Answer two"; ack.remove(); state("item-2","Answer two"); },500);
        } else {
          attempt("item-2"); parent.postMessage({type:"evaluation_complete"},"*");
        }
      };
      </script></body></html>`;

    await expect(verifyMathJourneyAtReleaseViewports({
      html,
      outputDir,
      completionType: "evaluation_complete",
      itemIds: ["item-1", "item-2"],
    })).resolves.toHaveLength(6);
    fs.rmSync(outputDir, { recursive: true, force: true });
  }, 15_000);

  it("crosses a newly visible evidence-free interstitial before verifying the next item", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-entry-transition-"));
    const html = `<!doctype html><html><body>
      <button id="answer-one">Answer one</button>
      <button id="continue" hidden>Continue</button>
      <button id="answer-two" hidden>Answer two</button>
      <script>
      window.SUNNY_VALIDATION_HOOKS={journey:[
        {itemId:"item-1",steps:[{action:"click",selector:"#answer-one"}]},
        {itemId:"item-2",steps:[{action:"click",selector:"#continue"},{action:"click",selector:"#answer-two"}]}
      ]};
      const attempt=(id)=>parent.postMessage({type:"evaluation_attempt",payload:{attemptId:"a-"+id,itemId:id,attemptedValue:id,supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()}},"*");
      const state=(id,prompt)=>parent.postMessage({type:"game_state_update",payload:{currentChallenge:{id,prompt}}},"*");
      state("item-1","Answer one");
      document.querySelector("#answer-one").onclick=()=>{
        attempt("item-1");
        document.querySelector("#answer-one").hidden=true;
        document.querySelector("#continue").hidden=false;
      };
      document.querySelector("#continue").onclick=()=>{
        document.querySelector("#continue").hidden=true;
        document.querySelector("#answer-two").hidden=false;
        state("item-2","Answer two");
      };
      document.querySelector("#answer-two").onclick=()=>{
        attempt("item-2");
        parent.postMessage({type:"evaluation_complete"},"*");
      };
      </script></body></html>`;

    await expect(verifyMathJourneyAtReleaseViewports({
      html,
      outputDir,
      completionType: "evaluation_complete",
      itemIds: ["item-1", "item-2"],
    })).resolves.toHaveLength(8);
    fs.rmSync(outputDir, { recursive: true, force: true });
  }, 15_000);

  it("never reports stale completion screenshots from an earlier verification", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-stale-journey-"));
    const working = `<!doctype html><html><body><button id="answer">Answer</button><script>
      window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:"item-1",steps:[{action:"click",selector:"#answer"}]}]};
      document.querySelector("#answer").onclick=()=>{
        parent.postMessage({type:"evaluation_attempt",payload:{attemptId:"a-1",itemId:"item-1",attemptedValue:"1",supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()}},"*");
        parent.postMessage({type:"evaluation_complete"},"*");
      };
    </script></body></html>`;
    const broken = `<!doctype html><html><body><div id="answer">Answer</div><script>
      window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:"item-1",steps:[{action:"click",selector:"#answer"}]}]};
    </script></body></html>`;
    await verifyMathJourneyAtReleaseViewports({
      html: working,
      outputDir,
      completionType: "evaluation_complete",
      itemIds: ["item-1"],
    });

    let failure: unknown;
    try {
      await verifyMathJourneyAtReleaseViewports({
        html: broken,
        outputDir,
        completionType: "evaluation_complete",
        itemIds: ["item-1"],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(DiscoveryRuntimeVerificationError);
    const screenshots = (failure as DiscoveryRuntimeVerificationError).screenshotPaths.map(file => path.basename(file));
    expect(screenshots).toEqual(["journey-generation-failure.png", "journey-sunny-failure.png"]);
    fs.rmSync(outputDir, { recursive: true, force: true });
  }, 15_000);

  it("allows a post-commit transition that appears afterward and emits no second attempt", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-post-commit-transition-"));
    const html = `<!doctype html><html><head><style>#transition{position:fixed;inset:0;z-index:10;background:white}</style></head><body>
      <button id="answer">Answer</button>
      <script>
      window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:"item-1",steps:[
        {action:"click",selector:"#answer"},{action:"click",selector:"#continue"}
      ]}]};
      document.querySelector("#answer").onclick=()=>{
        parent.postMessage({type:"evaluation_attempt",payload:{attemptId:"a-1",itemId:"item-1",attemptedValue:"1",supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()}},"*");
        const transition=document.createElement("div"); transition.id="transition";
        const next=document.createElement("button"); next.id="continue"; next.textContent="Continue";
        next.onclick=()=>parent.postMessage({type:"evaluation_complete"},"*");
        transition.appendChild(next); document.body.appendChild(transition);
      };
      </script></body></html>`;

    await expect(verifyMathJourneyAtReleaseViewports({
      html,
      outputDir,
      completionType: "evaluation_complete",
      itemIds: ["item-1"],
    })).resolves.toHaveLength(4);
    fs.rmSync(outputDir, { recursive: true, force: true });
  });
});
