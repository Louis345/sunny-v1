import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  compareAdaptiveMathEvidence,
  adaptiveMathSnapshotHash,
  createMathBoardWorkerJob,
  createMathEvaluationFindings,
  createMathInterventionDecision,
  createMathOpeningEvaluation,
  mathEvaluationFindingsHash,
  mathQuestionFingerprint,
  runMathBoardWorker,
  type MathEvaluationAttempt,
  type MathInterventionDecision,
  type MathOpeningEvaluation,
  type MathOpeningEvaluationAssignment,
} from "../engine/adaptiveMathTwoPhase";

type LabSummary = {
  verdict: "CONTRACT_PASS" | "FAIL";
  outcome: "improved" | "unchanged" | "weaker" | "inconclusive";
  paidCalls: number;
  costUsd: number;
  costAccountingComplete: boolean;
  realChildDataChanged: boolean;
  workerHistory: string[];
  findingsHash: string;
  artifactHashes: Record<string, string>;
  elapsedMs: number;
};

function write(file: string, value: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, "utf8");
}

function writeJson(file: string, value: unknown): void {
  write(file, `${JSON.stringify(value, null, 2)}\n`);
}

function fileHash(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function treeHash(root: string): string {
  if (!fs.existsSync(root)) return "missing";
  const entries: string[] = [];
  const visit = (current: string): void => {
    for (const name of fs.readdirSync(current).sort()) {
      const target = path.join(current, name);
      const stat = fs.lstatSync(target);
      if (stat.isDirectory()) visit(target);
      else if (stat.isFile()) entries.push(`${path.relative(root, target)}:${fileHash(target)}`);
    }
  };
  visit(root);
  return crypto.createHash("sha256").update(entries.join("\n")).digest("hex");
}

function shell(title: string, body: string, script = ""): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
:root{font-family:Inter,ui-rounded,system-ui,sans-serif;color:#eef6ff;background:#07142e}*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 10%,#244a83 0,#0b1a3d 48%,#050b1c 100%);display:grid;place-items:center;padding:24px}
main{width:min(1120px,100%);min-height:650px;border:2px solid #69d8ff;border-radius:28px;background:rgba(7,20,46,.93);box-shadow:0 30px 90px #0009;overflow:hidden}
header{padding:24px 30px;border-bottom:1px solid #71ddff55;background:linear-gradient(90deg,#102b5b,#172057)}h1{margin:0;font-size:clamp(30px,4vw,52px)}
.sub{color:#b8d9ff;font-size:20px;margin:8px 0 0}.stage{padding:30px;display:grid;gap:24px}.card{background:#f8fbff;color:#0b1733;border-radius:22px;padding:24px;box-shadow:0 12px 30px #0005}
.choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.choice,button,.node{font:inherit;font-weight:800;border:0;border-radius:18px;padding:20px;cursor:pointer;transition:.18s transform,.18s box-shadow}
.choice{background:#dff6ff;border:4px solid transparent;color:#102548;font-size:22px}.choice:hover,.choice:focus{transform:translateY(-3px);border-color:#32c8ff;box-shadow:0 12px 24px #147ab644}
.primary{background:#ffcb45;color:#19142e;font-size:22px}.primary:hover{transform:translateY(-2px);box-shadow:0 8px 0 #9f5e00}.feedback{min-height:72px;border-radius:16px;padding:18px;font-size:20px;font-weight:750;background:#111f43;color:#d9ecff}
.wagons{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.wagon{border-radius:18px;background:#168ab1;padding:16px;display:flex;gap:7px;flex-wrap:wrap;justify-content:center;box-shadow:inset 0 -8px #07506d}.lantern{width:28px;height:38px;border-radius:14px 14px 8px 8px;background:#ffd858;box-shadow:0 0 18px #ffcb45}.meter{height:20px;border-radius:12px;background:#132245;overflow:hidden}.meter>i{display:block;height:100%;background:linear-gradient(90deg,#3ae6b3,#ffd54d);width:0;transition:width .7s}
.links{display:flex;gap:14px;flex-wrap:wrap}.links a{color:#061227;background:#7fe7ff;padding:12px 18px;border-radius:999px;font-weight:850;text-decoration:none}.tag{display:inline-flex;padding:7px 12px;border-radius:999px;background:#203666;color:#bde9ff;font-weight:800}
@media(max-width:760px){.choices,.wagons{grid-template-columns:1fr 1fr}.stage{padding:18px}}
</style></head><body><main>${body}</main><script>${script}</script></body></html>`;
}

function wagons(groups: number, perGroup: number): string {
  return `<div class="wagons">${Array.from({ length: groups }, (_, group) =>
    `<div class="wagon" aria-label="wagon ${group + 1}">${Array.from({ length: perGroup }, () => '<span class="lantern"></span>').join("")}</div>`).join("")}</div>`;
}

function openingHtml(): string {
  return shell("Opening evaluation", `<header><span class="tag">Independent opening evaluation</span><h1>Show what you know</h1><p class="sub">Wake the lantern dock with one move.</p></header>
  <section class="stage" data-independent="true"><div class="card"><h2>Eight wagons carry five lanterns each.</h2>${wagons(8, 5)}<p>Tap what the numbers mean.</p></div>
  <div class="choices"><button class="choice" data-answer="correct">8 wagons · 5 on each wagon</button><button class="choice" data-answer="incorrect">5 wagons · 8 on each wagon</button></div>
  <div id="feedback" class="feedback">No hint yet—make your own first move.</div></section>`,
  `document.querySelectorAll('.choice').forEach(b=>b.addEventListener('click',()=>{document.getElementById('feedback').textContent=b.dataset.answer==='correct'?'Recorded: your independent model matches the scene.':'Recorded: the factor roles were reversed. Sunny will use the evidence without trapping you.';document.querySelectorAll('.choice').forEach(x=>x.disabled=true)}));`);
}

function explainerHtml(): string {
  return shell("Visual Explainer", `<header><span class="tag">Teaching-only bridge · not mastery</span><h1>What does each factor count?</h1><p class="sub">Watch groups and group size stay in different jobs.</p></header>
  <section class="stage"><div class="card"><div id="model">${wagons(2, 5)}</div><h2 id="caption">2 groups. 5 lanterns in each group.</h2><div class="meter"><i id="meter"></i></div></div>
  <button class="primary" id="play">Build all 8 wagons</button><div id="feedback" class="feedback">This explains the idea. A fresh question later measures independence.</div></section>`,
  `document.getElementById('play').addEventListener('click',()=>{document.getElementById('model').innerHTML=${JSON.stringify(wagons(8, 5))};document.getElementById('caption').textContent='8 counts the wagons. 5 counts the lanterns in each wagon. Together: 40.';document.getElementById('meter').style.width='100%';document.getElementById('play').textContent='Model complete';document.getElementById('play').disabled=true});`);
}

function baselineHtml(): string {
  return shell("Targeted intervention", `<header><span class="tag">Baseline intervention</span><h1>Charge four cargo bays</h1><p class="sub">Add six lights to each bay. Every click changes the world.</p></header>
  <section class="stage"><div id="bays" class="wagons">${Array.from({ length: 4 }, (_, i) => `<button class="wagon" data-bay="${i}" aria-label="cargo bay ${i + 1}"></button>`).join("")}</div>
  <div class="meter"><i id="meter"></i></div><div id="feedback" class="feedback">Tap a bay to add one light. Build 4 equal groups of 6.</div></section>`,
  `const counts=[0,0,0,0];document.querySelectorAll('[data-bay]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.bay;if(counts[i]>=6)return;counts[i]++;b.insertAdjacentHTML('beforeend','<span class="lantern"></span>');const total=counts.reduce((a,c)=>a+c,0);document.getElementById('meter').style.width=(total/24*100)+'%';document.getElementById('feedback').textContent=total===24?'All four equal groups are charged. Fresh check unlocked.':total+' of 24 lights placed.';}));`);
}

function exitHtml(): string {
  return shell("Fresh independent check", `<header><span class="tag">Fresh independent check</span><h1>Open the moon gate</h1><p class="sub">This is a new scene. No answer from the lesson is reused.</p></header>
  <section class="stage" data-exposure="unseen:exit-item-1"><div class="card"><h2>Six racks hold four moonstones each.</h2><div class="wagons">${Array.from({ length: 6 }, () => '<div class="wagon">💠 💠 💠 💠</div>').join("")}</div><p>What does each number count?</p></div>
  <div class="choices"><button class="choice" data-answer="correct">6 racks · 4 on each rack</button><button class="choice" data-answer="incorrect">4 racks · 6 on each rack</button></div><div id="feedback" class="feedback">Choose independently.</div></section>`,
  `document.querySelectorAll('.choice').forEach(b=>b.addEventListener('click',()=>{document.getElementById('feedback').textContent=b.dataset.answer==='correct'?'Fresh evidence recorded. The factor meanings held in a new scene.':'Fresh evidence recorded. Sunny still needs more evidence.';document.querySelectorAll('.choice').forEach(x=>x.disabled=true)}));`);
}

function boardHtml(): string {
  return shell("Evidence-informed board", `<header><span class="tag">Evidence-informed board</span><h1>Lantern Bridge</h1><p class="sub">One targeted intervention, then one fresh independent check.</p></header>
  <section class="stage"><div class="choices"><a class="node choice" href="baseline-intervention.html"><strong>1 · Cargo Bay Builder</strong><br><small>Build equal groups and see the station react.</small></a><a class="node choice" href="fresh-exit-evaluation.html"><strong>2 · Moon Gate Check</strong><br><small>Use the idea independently in a new scene.</small></a></div>
  <div class="feedback">The board was built from the frozen findings packet. Quest, Boss, rewards, and agency are intentionally absent from this proof.</div></section>`);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] ?? character));
}

function reportHtml(
  summary: LabSummary,
  comparison: ReturnType<typeof compareAdaptiveMathEvidence>,
  evaluation: MathOpeningEvaluation,
  decision: MathInterventionDecision,
): string {
  const audit = JSON.stringify(summary, null, 2);
  const verdictLabel = summary.verdict === "CONTRACT_PASS" ? "PASS" : "FAIL";
  return shell("Adaptive Math Proof", `<header><span class="tag">Zero-cost deterministic fixture</span><h1>ADAPTIVE MATH CONTRACT PROOF: ${verdictLabel}</h1><p class="sub">Recorded fixture evidence exercises the independent-evaluation, intervention, fresh-check, and resumable-worker contracts. Human learning was not measured.</p></header>
  <section class="stage"><div class="card"><h2>Thirty-second verdict</h2><p><strong>Fixture outcome:</strong> ${comparison.outcome}</p><p>${comparison.claim}</p><p><strong>Real child data changed:</strong> ${summary.realChildDataChanged ? "Yes" : "No"} · <strong>Paid calls:</strong> ${summary.paidCalls} · <strong>Cost:</strong> $${summary.costUsd.toFixed(2)} · <strong>Cost accounting:</strong> ${summary.costAccountingComplete ? "complete" : "unavailable"} · <strong>Elapsed:</strong> ${summary.elapsedMs} ms</p></div>
  <div class="choices"><div class="card"><h2>Starting hypothesis</h2><p>${escapeHtml(evaluation.assumptions[0]?.claim ?? "No starting assumption recorded.")}</p><p><strong>Uncertainty:</strong> ${escapeHtml(evaluation.assumptions[0]?.uncertainty ?? "Unknown")}</p></div><div class="card"><h2>Why Sunny chose this intervention</h2><p>${escapeHtml(decision.rationale)}</p><p><strong>Evidence:</strong> ${decision.evidenceIds.map(escapeHtml).join(", ")}</p></div></div>
  <div class="choices"><div class="card"><h2>1 · Opening evaluation</h2><p>Fresh independent evidence showed a factor-role reversal.</p><a href="opening-evaluation.html">Play opening evaluation</a></div><div class="card"><h2>2 · Visual Explainer</h2><p>A teaching-only mental model separated number of groups from amount in each group.</p><a href="visual-explainer.html">Play teaching bridge</a></div></div>
  <div class="choices"><div class="card"><h2>3 · Targeted intervention</h2><p>The child constructs equal groups while the world visibly charges.</p><a href="baseline-intervention.html">Play intervention</a></div><div class="card"><h2>4 · Fresh independent check</h2><p>An unexposed scene measures the same construct without lesson answers.</p><a href="fresh-exit-evaluation.html">Play fresh check</a></div></div>
  <div class="card"><h2>Complete proof board</h2><p><a href="board.html">Open the two-node board</a></p><p><strong>Before:</strong> ${comparison.before.correct}/${comparison.before.eligible} independent correct · <strong>After:</strong> ${comparison.after.correct}/${comparison.after.eligible} independent correct.</p></div>
  <details class="card"><summary><strong>Audit, hashes, interruption and cost</strong></summary><pre>${audit}</pre></details></section>`);
}

export async function runAdaptiveMathTwoPhaseLab(input: {
  rootDir: string;
  now?: Date;
  protectedChildDirs?: string[];
}): Promise<{ outputDir: string; summary: LabSummary }> {
  const startedAt = Date.now();
  const now = input.now ?? new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(input.rootDir, "outputs", "adaptive-math-two-phase", timestamp);
  fs.mkdirSync(outputDir, { recursive: true });
  const protectedDirs = input.protectedChildDirs ?? [];
  const protectedBefore = Object.fromEntries(protectedDirs.map((dir) => [dir, treeHash(dir)]));

  const assignment: MathOpeningEvaluationAssignment = {
    homeworkId: "hw-lab-equal-groups",
    cycleId: "cycle-lab-equal-groups",
    sourceHash: "fixture-source-hash",
    extractionHash: "fixture-extraction-hash",
    academicContractHash: "academic-contract-fixture",
    fullText: "Grade 3 equal-groups and factor-meaning assignment fixture.",
    sourceEvidenceIds: ["assignment:fixture:page-1"],
    contextEvidenceIds: ["history:fixture:assisted-groups"],
    sourceQuestionTexts: ["A school worksheet asks what 8 and 5 count in an array."],
    sourceQuestionFingerprints: [mathQuestionFingerprint("A school worksheet asks what 8 and 5 count in an array.")],
  };
  const evaluation = createMathOpeningEvaluation({
    version: 1,
    evaluationId: "evaluation:opening:factor-meaning",
    artifactId: "artifact:opening-evaluation",
    evaluationHash: "computed-by-validator",
    homeworkId: assignment.homeworkId,
    cycleId: assignment.cycleId,
    academicContractHash: "academic-contract-fixture",
    title: "Power the Lantern Dock",
    openingPromise: "Show what you already know to light the dock.",
    firstAction: "Choose what the two numbers count.",
    assumptions: [{
      assumptionId: "assumption:factor-meaning",
      claim: "The child may calculate a product without distinguishing factor roles.",
      evidenceIds: ["history:fixture:assisted-groups"],
      confidence: 0.61,
      uncertainty: "No fresh independent factor-meaning evidence exists.",
      falsifyingEvidence: ["Fresh independent factor-role interpretation succeeds."],
    }],
    predictions: [{
      predictionId: "prediction:opening-factor-meaning",
      constructId: "math.multiplication.factor_meaning",
      claim: "Factor roles may reverse in a contextual model.",
      evidenceIds: ["history:fixture:assisted-groups"],
      confidence: 0.61,
      uncertainty: "Prior evidence used support.",
      falsifyingEvidence: ["Fresh independent factor-role interpretation succeeds."],
      measurementKeys: ["independent.factor_role"],
    }],
    items: [{
      itemId: "opening-item-1",
      constructId: "math.multiplication.factor_meaning",
      prerequisiteConstructIds: ["math.multiplication.equal_groups"],
      prompt: "Eight wagons carry five lanterns each. What does each number count?",
      sourceEvidenceIds: ["assignment:fixture:page-1"],
      sourceQuestionFingerprint: "fresh-opening-fingerprint",
      exposureIdentity: "unseen:opening-item-1",
      difficultyBoundary: {
        allowedConcepts: ["equal groups", "factor meaning"],
        allowedRepresentations: ["objects in equal groups"],
        excludedExtensions: ["division", "multi-step equations"],
      },
      response: {
        mode: "construction",
        expectedState: { groups: 8, perGroup: 5 },
        successDescription: "Eight groups with five in each group.",
      },
    }],
  }, assignment);
  const before: MathEvaluationAttempt[] = [{
    attemptId: "attempt:opening-item-1",
    itemId: "opening-item-1",
    constructId: "math.multiplication.factor_meaning",
    result: "incorrect",
    attemptedValue: { groups: 5, perGroup: 8 },
    observedErrorType: "factor_role_reversal",
    assistance: "none",
    exposure: "unseen",
    responseMode: "construction",
    device: { kind: "desktop", inputMethods: ["pointer"] },
    artifactId: "artifact:opening-evaluation",
    occurredAt: "2026-08-16T15:01:00.000Z",
  }];
  const findings = createMathEvaluationFindings({ evaluation, attempts: before, completedAt: "2026-08-16T15:02:00.000Z" });
  const decision = createMathInterventionDecision({
    version: 1,
    decisionId: "decision:visual-factor-meaning",
    findingsHash: mathEvaluationFindingsHash(findings),
    action: "visual_explainer",
    targetConstructIds: ["math.multiplication.factor_meaning"],
    evidenceIds: ["attempt:opening-item-1"],
    rationale: "A concrete model can distinguish number of groups from amount in each group.",
    confidence: 0.72,
    uncertainty: "One reversal may be transient or instrument-specific.",
    falsifyingEvidence: ["Fresh post-intervention evidence remains reversed."],
    measurementKeys: ["post.independent.factor_role"],
    nextEvidenceRequired: ["Fresh unassisted factor-role interpretation."],
  }, findings);

  write(path.join(outputDir, "opening-evaluation.html"), openingHtml());
  write(path.join(outputDir, "visual-explainer.html"), explainerHtml());
  writeJson(path.join(outputDir, "evidence/opening-evaluation.json"), evaluation);
  writeJson(path.join(outputDir, "evidence/findings.json"), findings);
  writeJson(path.join(outputDir, "decisions/intervention-decision.json"), decision);

  const workerRoot = path.join(outputDir, "worker-root");
  const job = createMathBoardWorkerJob({
    rootDir: workerRoot,
    childId: "lab-child",
    homeworkId: assignment.homeworkId,
    cycleId: assignment.cycleId,
    assignmentSourceHash: assignment.sourceHash,
    frozenExtractionHash: assignment.extractionHash,
    childChartSnapshotHash: "fixture-chart-snapshot-hash",
    findings,
    decision,
    academicContractHash: evaluation.academicContractHash,
    expectedArtifactIds: ["baseline-intervention", "fresh-exit-evaluation"],
  });
  try {
    await runMathBoardWorker(job.jobFile, {
      build: async ({ reportArtifact, reportPhase, reportUsage }) => {
        reportPhase("planning");
        reportPhase("designing");
        reportPhase("building");
        const baselineFile = path.join(outputDir, "baseline-intervention.html");
        write(baselineFile, baselineHtml());
        reportArtifact("baseline-intervention", fileHash(baselineFile));
        reportUsage({ calls: 0, tokens: 0, costUsd: 0, costAccountingComplete: true });
        throw new Error("fixture_provider_pause_after_baseline");
      },
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "fixture_provider_pause_after_baseline") throw error;
  }
  await runMathBoardWorker(job.jobFile, {
    build: async ({ findingsHash, completedArtifactIds, reportArtifact, reportPhase }) => {
      reportPhase("building");
      if (!completedArtifactIds.includes("baseline-intervention")) throw new Error("fixture_resume_lost_baseline");
      const exitFile = path.join(outputDir, "fresh-exit-evaluation.html");
      write(exitFile, exitHtml());
      reportArtifact("fresh-exit-evaluation", fileHash(exitFile));
      return {
        completedArtifactIds: ["fresh-exit-evaluation"],
        artifactHashes: { "fresh-exit-evaluation": fileHash(exitFile) },
        calls: 0,
        tokens: 0,
        costUsd: 0,
        costAccountingComplete: true,
        inputFindingsHash: findingsHash,
      };
    },
  });
  const readyJob = JSON.parse(fs.readFileSync(job.jobFile, "utf8")) as {
    state: string;
    history: Array<{ state: string }>;
    artifactHashes: Record<string, string>;
    costAccountingComplete: boolean;
  };
  write(path.join(outputDir, "board.html"), boardHtml());
  const after: MathEvaluationAttempt[] = [{
    ...before[0]!,
    attemptId: "attempt:exit-item-1",
    itemId: "exit-item-1",
    result: "correct",
    attemptedValue: { groups: 6, perGroup: 4 },
    observedErrorType: undefined,
    artifactId: "artifact:fresh-exit-evaluation",
    occurredAt: "2026-08-16T15:12:00.000Z",
  }];
  const exitEvaluation = createMathOpeningEvaluation({
    ...evaluation,
    evaluationId: "evaluation:exit:factor-meaning",
    artifactId: "artifact:fresh-exit-evaluation",
    title: "Open the Moon Gate",
    openingPromise: "Use the idea in a fresh scene.",
    firstAction: "Choose what each number counts.",
    items: [{
      ...evaluation.items[0]!,
      itemId: "exit-item-1",
      prompt: "Six racks hold four moonstones each. What does each number count?",
      sourceQuestionFingerprint: "fresh-exit-fingerprint",
      exposureIdentity: "unseen:exit-item-1",
      response: {
        mode: "construction",
        expectedState: { groups: 6, perGroup: 4 },
        successDescription: "Six groups with four in each group.",
      },
    }],
  }, assignment);
  const comparison = compareAdaptiveMathEvidence({
    constructId: "math.multiplication.factor_meaning",
    findings,
    decision,
    beforeEvaluation: evaluation,
    before,
    intervention: {
      artifactId: "visual-explainer:factor-meaning",
      decisionId: decision.decisionId,
      decisionHash: adaptiveMathSnapshotHash(decision),
      targetConstructIds: decision.targetConstructIds,
      evidenceIds: ["support:visual-complete"],
      completed: true,
      completedAt: "2026-08-16T15:08:00.000Z",
    },
    interventionEvidence: [{
      evidenceId: "support:visual-complete",
      artifactId: "visual-explainer:factor-meaning",
      decisionId: decision.decisionId,
      decisionHash: adaptiveMathSnapshotHash(decision),
      targetConstructIds: decision.targetConstructIds,
      occurredAt: "2026-08-16T15:08:00.000Z",
    }],
    afterEvaluation: exitEvaluation,
    after,
  });
  writeJson(path.join(outputDir, "evidence/fresh-exit-evaluation.json"), exitEvaluation);
  writeJson(path.join(outputDir, "evidence/fresh-exit-attempts.json"), after);
  writeJson(path.join(outputDir, "evidence/before-after.json"), comparison);

  const protectedAfter = Object.fromEntries(protectedDirs.map((dir) => [dir, treeHash(dir)]));
  const realChildDataChanged = JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter);
  const summary: LabSummary = {
    verdict: comparison.outcome === "improved" && readyJob.state === "ready" && !realChildDataChanged ? "CONTRACT_PASS" : "FAIL",
    outcome: comparison.outcome,
    paidCalls: 0,
    costUsd: 0,
    costAccountingComplete: readyJob.costAccountingComplete,
    realChildDataChanged,
    workerHistory: readyJob.history.map((entry) => entry.state),
    findingsHash: mathEvaluationFindingsHash(findings),
    artifactHashes: {
      opening: fileHash(path.join(outputDir, "opening-evaluation.html")),
      visualExplainer: fileHash(path.join(outputDir, "visual-explainer.html")),
      board: fileHash(path.join(outputDir, "board.html")),
      ...readyJob.artifactHashes,
    },
    elapsedMs: Date.now() - startedAt,
  };
  writeJson(path.join(outputDir, "summary.json"), summary);
  writeJson(path.join(outputDir, "audit/protected-before.json"), protectedBefore);
  writeJson(path.join(outputDir, "audit/protected-after.json"), protectedAfter);
  writeJson(path.join(outputDir, "audit/worker-job.json"), readyJob);
  writeJson(path.join(outputDir, "catalog/manifest.json"), {
    version: 1,
    artifacts: [
      {
        artifactId: "artifact:opening-evaluation",
        type: "independent_evaluation",
        algorithmTargets: ["prerequisite diagnosis", "retrieval practice"],
        evidenceUsed: assignment.sourceEvidenceIds,
        measurementKeys: evaluation.predictions.flatMap((prediction) => prediction.measurementKeys),
        reuseDecision: "candidate",
        reuseReason: "Fixture instrument requires repeated and externally calibrated evidence before reuse.",
      },
      {
        artifactId: "visual-explainer:factor-meaning",
        type: "teaching_intervention",
        algorithmTargets: ["error-pattern remediation"],
        evidenceUsed: decision.evidenceIds,
        measurementKeys: decision.measurementKeys,
        reuseDecision: "candidate",
        reuseReason: "One fixture episode cannot establish effectiveness.",
      },
      {
        artifactId: "artifact:baseline-intervention",
        type: "practice_intervention",
        algorithmTargets: ["desirable difficulty", "error-pattern remediation"],
        evidenceUsed: decision.evidenceIds,
        measurementKeys: decision.measurementKeys,
        reuseDecision: "candidate",
        reuseReason: "Runtime and learning effectiveness require child evidence.",
      },
      {
        artifactId: "artifact:fresh-exit-evaluation",
        type: "independent_evaluation",
        algorithmTargets: ["retrieval practice", "mastery gating"],
        evidenceUsed: ["attempt:exit-item-1"],
        measurementKeys: ["post.independent.factor_role"],
        reuseDecision: "candidate",
        reuseReason: "Fresh fixture evidence is not sufficient for catalog promotion.",
      },
    ].map((artifact) => ({
      childId: "lab-child",
      homeworkId: assignment.homeworkId,
      cycleId: assignment.cycleId,
      source: "LAB-MATH adaptive two-phase fixture",
      title: ({
        "artifact:opening-evaluation": "Power the Lantern Dock",
        "visual-explainer:factor-meaning": "Factor Meaning Visual Explainer",
        "artifact:baseline-intervention": "Cargo Bay Builder",
        "artifact:fresh-exit-evaluation": "Open the Moon Gate",
      } as Record<string, string>)[artifact.artifactId],
      ...artifact,
    })),
  });
  write(path.join(outputDir, "report.html"), reportHtml(summary, comparison, evaluation, decision));
  return { outputDir, summary };
}

async function main(): Promise<void> {
  const result = await runAdaptiveMathTwoPhaseLab({
    rootDir: process.cwd(),
    protectedChildDirs: ["reina", "ila"].map((childId) => path.join(process.cwd(), "src/context", childId)),
  });
  console.log(` 🎮 [adaptive-math-lab] [complete] [${result.summary.verdict}] report=${path.join(result.outputDir, "report.html")}`);
}

export function isAdaptiveMathLabEntrypoint(argvFile: string | undefined, moduleFile: string): boolean {
  if (!argvFile) return false;
  return path.resolve(argvFile) === path.resolve(moduleFile);
}

if (isAdaptiveMathLabEntrypoint(process.argv[1], __filename)) {
  main().catch((error) => {
    console.error(` 🎮 [adaptive-math-lab] [failed] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
