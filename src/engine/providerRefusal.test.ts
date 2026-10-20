import {it,expect} from "vitest";
import fs from "node:fs";import os from "node:os";import path from "node:path";
import {runMathProviderStage} from "./adaptiveMathDiscovery";

// Live run 8 (2026-10-13): the provider refused with "Your credit balance is too low" and
// Sunny recorded an uncertain outcome, which blocks retry until a person authorises it. A
// clear refusal is a rejection: nothing was bought and trying again later is safe.
it("records an out-of-credit refusal as rejected, not uncertain",async()=>{
  const draftDir=fs.mkdtempSync(path.join(os.tmpdir(),"sunny-refusal-"));
  try{
    await expect(runMathProviderStage({draftDir,stage:"targeted-planner",model:"claude-sonnet-5",request:{any:"request"},execute:async()=>{throw new Error('{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}');}})).rejects.toThrow("provider_request_rejected");
    const receipts=path.join(draftDir,"provider-receipts");
    const receipt=fs.readdirSync(receipts).filter(file=>!file.endsWith(".stage.json")).map(file=>JSON.parse(fs.readFileSync(path.join(receipts,file),"utf8")))[0];
    expect(receipt.status).toBe("rejected");
  }finally{fs.rmSync(draftDir,{recursive:true,force:true});}
});
