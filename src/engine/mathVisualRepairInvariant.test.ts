import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
  });

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
      document.querySelector("#first").onclick=()=>{attempt("item-1","one");setTimeout(()=>{document.querySelector("#first").hidden=true;document.querySelector("#second").hidden=false;},300)};
      document.querySelector("#second").onclick=()=>{attempt("item-2","two");parent.postMessage({type:"evaluation_complete"},"*")};
      </script></body></html>`;

    await expect(verifyMathJourneyAtReleaseViewports({
      html,
      outputDir,
      completionType: "evaluation_complete",
      itemIds: ["item-1", "item-2"],
    })).resolves.toHaveLength(2);
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
      document.querySelector("#answer").onclick=()=>{
        if(settling){ parent.postMessage({type:"premature_second_click"},"*"); return; }
        if(current===1){
          settling=true;
          setTimeout(()=>{ attempt("item-1"); current=2; settling=false; document.querySelector("#answer").textContent="Answer two"; },500);
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
    })).resolves.toHaveLength(2);
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
      document.querySelector("#answer").onclick=()=>{
        if(current===1){
          attempt("item-1");
          const ack=document.createElement("div"); ack.id="ack"; document.body.appendChild(ack);
          setTimeout(()=>{ current=2; document.querySelector("#answer").textContent="Answer two"; ack.remove(); },500);
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
    })).resolves.toHaveLength(2);
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
    })).resolves.toHaveLength(2);
    fs.rmSync(outputDir, { recursive: true, force: true });
  });
});
