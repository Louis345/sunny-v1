import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  archiveStaleAssignmentSourceDraft,
  preflightMathIngestion,
  assertFreshResetAllowed,
  classifyIngestionFailure,
  discoveryProgressGuide,
  formatStartSessionCommand,
  initialIngestionProgressLabels,
  shouldPublishDiscoveryFirst,
  shouldDeferToAdaptiveWorker,
} from "./ingestMathDirect";
import { resolveAdaptiveMathDraftDir } from "../engine/adaptiveMathDiscovery";

describe("direct math ingestion checkpoints", () => {
  it("preserves an isolated context root in the printed session command", () => {
    expect(formatStartSessionCommand({
      SUNNY_CONTEXT_ROOT: "/tmp/sunny paid/context",
      SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT: "true",
    })).toBe(
      "SUNNY_CONTEXT_ROOT='/tmp/sunny paid/context' SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT=true npm run sunny",
    );
    expect(formatStartSessionCommand({})).toBe("npm run sunny");
  });

  it("uses one truthful progress scale for initial ingestion", () => {
    expect(initialIngestionProgressLabels()).toEqual({
      reading: "Step 1 — Reading assignment and child evidence",
      discovery: "Step 2 — Preparing the child's independent Discovery",
    });
  });

  it("explains the three resumable Discovery stages in parent language", () => {
    expect(discoveryProgressGuide()).toEqual([
      "1/3 Academic plan — deciding what independent evidence to collect",
      "2/3 Experience design — deciding how the child will interact",
      "3/3 Playable build — creating and browser-checking the activity",
      "Saved stages are reused after interruption.",
    ]);
  });

  it("keeps the current extraction active when a stale source draft is archived", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-source-archive-"));
    const draftDir = path.join(root, "direct-drafts", "hw-1");
    fs.mkdirSync(draftDir, { recursive: true });
    const extraction = {
      sourcePath: "/tmp/current.pdf",
      filename: "current.pdf",
      mediaType: "application/pdf",
      fileHash: "current-hash",
      sourceKind: "scanned_assignment_image" as const,
      extractionMethod: "native_pdf" as const,
      fullText: "current assignment",
      pages: [],
      warnings: [],
    };
    fs.writeFileSync(path.join(draftDir, "assignment-extraction.json"), JSON.stringify(extraction));
    fs.writeFileSync(path.join(draftDir, "assignment-source.json"), JSON.stringify({
      version: 1,
      fileHash: "stale-hash",
      pageCount: 0,
      extractionMethod: "native_pdf",
    }));

    expect(archiveStaleAssignmentSourceDraft({
      draftDir,
      freshRequested: false,
      savedSourceCheckpoint: {
        version: 1,
        fileHash: "stale-hash",
        pageCount: 0,
        extractionMethod: "native_pdf",
      },
      sourceCheckpoint: {
        version: 1,
        fileHash: "current-hash",
        pageCount: 0,
        extractionMethod: "native_pdf",
      },
      extraction,
      now: 123,
    })).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(draftDir, "assignment-extraction.json"), "utf8")).extraction).toEqual(extraction);
    expect(fs.existsSync(path.join(root, "direct-drafts", "audit", "hw-1-123", "assignment-source.json")))
      .toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps protected-child paid acceptance checkpoints inside an explicit isolated context root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-paid-context-"));
    const contextRoot = path.join(root, "context");

    expect(resolveAdaptiveMathDraftDir("reina", "hw-paid", {
      rootDir: root,
      env: {
        SUNNY_CONTEXT_ROOT: contextRoot,
        SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT: "true",
      },
    })).toBe(path.join(contextRoot, "reina", "homework", "direct-drafts", "hw-paid"));
  });

  it("routes a fresh or active evaluation to Discovery before targeted planning", () => {
    expect(shouldPublishDiscoveryFirst(undefined)).toBe(true);
    expect(shouldPublishDiscoveryFirst("evaluation_ready")).toBe(true);
    expect(shouldPublishDiscoveryFirst("evaluation_active")).toBe(true);
    expect(shouldPublishDiscoveryFirst("evidence_ready")).toBe(false);
  });

  it("never starts the legacy synchronous build after Discovery", () => {
    expect(shouldDeferToAdaptiveWorker("evidence_ready")).toBe(true);
    expect(shouldDeferToAdaptiveWorker("board_generating")).toBe(true);
    expect(shouldDeferToAdaptiveWorker(undefined)).toBe(false);
  });

  it("blocks --fresh once a canonical learning cycle exists", () => {
    expect(() => assertFreshResetAllowed(true, "evaluation_active", "hw-1"))
      .toThrow("fresh_reset_blocked_for_active_learning_cycle:hw-1:evaluation_active");
    expect(() => assertFreshResetAllowed(false, "evaluation_active", "hw-1")).not.toThrow();
    expect(() => assertFreshResetAllowed(true, undefined, "hw-1")).not.toThrow();
  });
  it("distinguishes input, provider, and publication failures", () => {
    expect(classifyIngestionFailure(new Error("assignment_source_missing:/tmp/x.pdf"), "reading-assignment"))
      .toBe("INPUT_ERROR");
    expect(classifyIngestionFailure(new Error("request timed out"), "activity-building"))
      .toBe("NEEDS_ATTENTION");
    expect(classifyIngestionFailure(Object.assign(new Error("rate limited"),{status:429}),"discovery-generation")).toBe("PROVIDER_PAUSED");
    expect(classifyIngestionFailure(new Error("disk full"), "atomic-publication"))
      .toBe("PUBLICATION_FAILED");
    expect(classifyIngestionFailure(new Error("Learning profile not found for child: ila"), "reading-assignment"))
      .toBe("INPUT_ERROR");
    expect(classifyIngestionFailure(new Error("Could not resolve authentication method. Expected either apiKey or authToken"), "discovery-generation"))
      .toBe("INPUT_ERROR");
    expect(classifyIngestionFailure(new Error("preflight_missing:OPENAI_API_KEY"), "discovery-generation"))
      .toBe("INPUT_ERROR");
  });


});

it("keeps Discovery chart evidence separate from engagement and leaves targeted generation to the worker", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
  expect(source).toContain("academic: mathPlannerChartContext(chart)");
  expect(source).toContain("engagement: buildMathCreativeChildContext(chart)");
  expect(source).not.toContain("await askDirectMathPlanner(");
  expect(source).not.toContain("await generateDirectArtifacts(");
  expect(source.indexOf("const chart = getChildChart(childId, {rootDir});")).toBeLessThan(
    source.indexOf("loadOrExtractAssignmentSource(pdf, extractionCacheFile)"),
  );
});


it("preflights credentials before extraction or any paid generation", async () => {
  const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),"sunny-preflight-"));
  const dir=path.join(rootDir,"src/context/lab-child");fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"learning_profile.json"),JSON.stringify({childId:"lab-child"}));
  const pdf=path.join(rootDir,"assignment.txt");fs.writeFileSync(pdf,"Count four groups.");
  try { await expect(preflightMathIngestion({rootDir,childId:"lab-child",pdf,env:{}})).rejects.toThrow("ANTHROPIC_API_KEY"); }
  finally {fs.rmSync(rootDir,{recursive:true,force:true});}
});

it("preflights the selected GPT repair credential before buying earlier stages", async () => {
  const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),"sunny-repair-preflight-"));
  const dir=path.join(rootDir,"src/context/lab-child");fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"learning_profile.json"),JSON.stringify({childId:"lab-child"}));
  const pdf=path.join(rootDir,"assignment.txt");fs.writeFileSync(pdf,"Count four groups.");
  try {
    await expect(preflightMathIngestion({rootDir,childId:"lab-child",pdf,env:{ANTHROPIC_API_KEY:"synthetic"}}))
      .rejects.toThrow("OPENAI_API_KEY");
  } finally {fs.rmSync(rootDir,{recursive:true,force:true});}
});


it("preflights the publication directories, not just the draft directory",async()=>{
  const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),"sunny-preflight-publication-"));
  const context=path.join(rootDir,"src/context/lab-child");fs.mkdirSync(path.join(context,"homework"),{recursive:true});
  fs.writeFileSync(path.join(context,"learning_profile.json"),JSON.stringify({childId:"lab-child"}));
  fs.writeFileSync(path.join(context,"homework/games"),"not a directory");
  const pdf=path.join(rootDir,"assignment.txt");fs.writeFileSync(pdf,"Count groups.");
  try {await expect(preflightMathIngestion({rootDir,childId:"lab-child",pdf,env:{ANTHROPIC_API_KEY:"synthetic",OPENAI_API_KEY:"synthetic"}})).rejects.toThrow();}
  finally {fs.rmSync(rootDir,{recursive:true,force:true});}
});
