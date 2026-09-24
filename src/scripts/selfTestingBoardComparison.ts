import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { hashDirectory } from "./sunnyCertification";

type CandidateRole = "saved_control" | "self_testing_candidate";

type CandidateInput = {
  runDir: string;
  role: CandidateRole;
  requireCreatorTests: boolean;
};

type Artifact = {
  nodeId: string;
  htmlPath: string;
  htmlHash?: string;
  creatorContractVersion?: number;
  creatorTestPath?: string;
  creatorTestHash?: string;
  plannerModel?: string;
  architectModel?: string;
  builderModel?: string;
  academicContractHash?: string;
  designArtifactHash?: string;
  itemIds?: string[];
};

type BrowserReport = {
  passed?: boolean;
  failures?: string[];
  htmlHash?: string;
  verifierVersion?: number;
  screenshots?: string[];
  captures?: Array<{ viewport?: string; kind?: string }>;
  verification?: { runtime?: boolean; scoring?: boolean; contracts?: boolean };
  creatorTests?: { passed?: boolean; manifestHash?: string; viewports?: string[]; failures?: string[] };
  visualReview?: { findings?: unknown[]; attribution?: unknown | null; repairAuthorized?: boolean };
};

type FullBoardAcceptance = {
  version?: number;
  evidenceAuthority?: string;
  passed?: boolean;
  certificationRunId?: string;
  assignmentFingerprint?: string;
  sourceSnapshotHash?: string;
  programHash?: string;
  designHash?: string;
  nodeCount?: number;
  plannerNodeIds?: string[];
  readyNodeIds?: string[];
  launchedNodeIds?: string[];
  completedNodeIds?: string[];
  boardLoaded?: boolean;
  companionHostVisible?: boolean;
  navigationPassed?: boolean;
  boardVersion?: number;
  verifierVersion?: number;
  artifactHashes?: Array<{ nodeId?: string; htmlHash?: string }>;
  nodes?: Array<{
    nodeId?: string;
    htmlHash?: string;
    manifestHash?: string | null;
    launchPassed?: boolean;
    completionPassed?: boolean;
    runtimeErrors?: string[];
    capturePaths?: string[];
  }>;
  preparingNodeIds?: string[];
  needsAttentionNodeIds?: string[];
  sourceInventoryHashBefore?: string;
  sourceInventoryHashAfter?: string;
  startedAt?: string;
  endedAt?: string;
  receiptHash?: string;
};

type CandidateSnapshot = {
  role: CandidateRole;
  runDir: string;
  certificationRunId: string;
  sourceChildDir: string;
  sourceCurrentHash: string;
  assignmentFingerprint: string;
  sourceSnapshotHash: string;
  programHash: string;
  designHash: string;
  nodeIds: string[];
  modelSettings: Array<{ nodeId: string; planner: string; architect: string; builder: string }>;
  contractIdentities: Array<{ nodeId: string; academic: string; design: string; items: string[] }>;
  artifacts: Array<Artifact & { resolvedHtmlPath: string; resolvedCreatorTestPath?: string }>;
  reports: Record<string, BrowserReport>;
  ready: boolean;
  blockedNodeIds: string[];
  fullBoardAcceptance: FullBoardAcceptance;
};

export type HumanBoardScores = {
  overall: number;
  mathematicalValidity: number;
  firstActionClarity: number;
  recovery: number;
  abilityToContinue: number;
};

export type BoardComparisonResult = {
  outputDir: string;
  reportPath: string;
  manifestPath: string;
  nodeCount: number;
  readyForSaori: true;
};

const REQUIRED_VIEWPORTS = ["1365x768", "1280x720"] as const;

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function walk(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else files.push(full);
    }
  };
  visit(root);
  return files;
}

function candidateBuildFile(root: string, role: CandidateRole): string {
  const matches = walk(root).filter((file) => path.basename(file) === "candidate-build-v3.json");
  if (matches.length === 0) {
    throw new Error(role === "saved_control" ? "comparison_candidate_a_full_board_missing" : "comparison_candidate_b_full_board_missing");
  }
  if (matches.length > 1) throw new Error(`comparison_candidate_build_ambiguous:${role}:${matches.length}`);
  return matches[0]!;
}

function resolveArtifactPath(runDir: string, savedPath: string): string {
  if (fs.existsSync(savedPath) && fs.statSync(savedPath).isFile()) return path.resolve(savedPath);
  const matches = walk(runDir).filter((file) => path.basename(file) === path.basename(savedPath));
  if (matches.length !== 1) throw new Error(`comparison_artifact_unavailable:${path.basename(savedPath)}`);
  return matches[0]!;
}

function programNodeIds(program: Record<string, unknown>): string[] {
  const activities = Array.isArray(program.activities) ? program.activities : [];
  return activities.map((activity) => String((activity as Record<string, unknown>).id ?? "")).filter(Boolean);
}

function modelSettings(artifacts: Artifact[]): CandidateSnapshot["modelSettings"] {
  return artifacts.map((artifact) => ({
    nodeId: artifact.nodeId,
    planner: artifact.plannerModel ?? "",
    architect: artifact.architectModel ?? "",
    builder: artifact.builderModel ?? "",
  }));
}

function contractIdentities(artifacts: Artifact[]): CandidateSnapshot["contractIdentities"] {
  return artifacts.map((artifact) => ({
    nodeId: artifact.nodeId,
    academic: artifact.academicContractHash ?? "",
    design: artifact.designArtifactHash ?? "",
    items: artifact.itemIds ?? [],
  }));
}

function hasBothViewports(report: BrowserReport): boolean {
  const creatorViewports = new Set(report.creatorTests?.viewports ?? []);
  const captureViewports = new Set((report.captures ?? []).map((capture) => capture.viewport).filter(Boolean));
  return REQUIRED_VIEWPORTS.every((viewport) => creatorViewports.has(viewport) && captureViewports.has(viewport));
}

function validateStrictNode(
  artifact: CandidateSnapshot["artifacts"][number],
  report: BrowserReport | undefined,
  status: string | undefined,
): boolean {
  if (status !== "ready" || !artifact.htmlHash || !artifact.creatorTestHash || !artifact.resolvedCreatorTestPath || !report) return false;
  const htmlHash = sha256(fs.readFileSync(artifact.resolvedHtmlPath));
  const manifestHash = sha256(fs.readFileSync(artifact.resolvedCreatorTestPath));
  return htmlHash === artifact.htmlHash
    && manifestHash === artifact.creatorTestHash
    && report.passed === true
    && report.htmlHash === artifact.htmlHash
    && report.verification?.runtime === true
    && report.verification?.scoring === true
    && report.verification?.contracts === true
    && report.creatorTests?.passed === true
    && report.creatorTests.manifestHash === artifact.creatorTestHash
    && hasBothViewports(report)
    && Array.isArray(report.screenshots)
    && report.screenshots.length > 0
    && Boolean(report.visualReview)
    && Array.isArray(report.visualReview?.findings)
    && report.visualReview!.findings!.length === 0
    && report.visualReview?.repairAuthorized === false
    && report.visualReview?.attribution == null;
}

function sameOrderedValues(actual: unknown, expected: string[]): boolean {
  return Array.isArray(actual) && stable(actual) === stable(expected);
}

function validateFullBoardAcceptance(
  value: FullBoardAcceptance,
  input: {
    certificationRunId: string;
    assignmentFingerprint: string;
    sourceSnapshotHash: string;
    programHash: string;
    designHash: string;
    nodeIds: string[];
    artifacts: CandidateSnapshot["artifacts"];
    requireCreatorTests: boolean;
  },
): boolean {
  const expectedHashes = input.nodeIds.map((nodeId) => {
    const artifact = input.artifacts.find((candidate) => candidate.nodeId === nodeId);
    return { nodeId, htmlHash: artifact?.htmlHash };
  });
  const receiptBody = { ...value };
  delete receiptBody.receiptHash;
  const nodeProofsValid = input.nodeIds.every((nodeId) => {
    const artifact = input.artifacts.find((candidate) => candidate.nodeId === nodeId);
    const proof = value.nodes?.find((candidate) => candidate.nodeId === nodeId);
    return Boolean(artifact && proof
      && proof.htmlHash === artifact.htmlHash
      && proof.manifestHash === (input.requireCreatorTests ? artifact.creatorTestHash : null)
      && proof.launchPassed === true
      && proof.completionPassed === true
      && Array.isArray(proof.runtimeErrors) && proof.runtimeErrors.length === 0
      && Array.isArray(proof.capturePaths) && proof.capturePaths.length > 0);
  });
  return value.version === 1
    && value.evidenceAuthority === "simulation"
    && value.passed === true
    && value.certificationRunId === input.certificationRunId
    && value.assignmentFingerprint === input.assignmentFingerprint
    && value.sourceSnapshotHash === input.sourceSnapshotHash
    && value.programHash === input.programHash
    && value.designHash === input.designHash
    && value.nodeCount === input.nodeIds.length
    && sameOrderedValues(value.plannerNodeIds, input.nodeIds)
    && sameOrderedValues(value.readyNodeIds, input.nodeIds)
    && sameOrderedValues(value.launchedNodeIds, input.nodeIds)
    && sameOrderedValues(value.completedNodeIds, input.nodeIds)
    && value.boardLoaded === true
    && value.companionHostVisible === true
    && value.navigationPassed === true
    && typeof value.boardVersion === "number"
    && typeof value.verifierVersion === "number"
    && stable(value.artifactHashes) === stable(expectedHashes)
    && nodeProofsValid
    && sameOrderedValues(value.preparingNodeIds, [])
    && sameOrderedValues(value.needsAttentionNodeIds, [])
    && value.sourceInventoryHashBefore === input.sourceSnapshotHash
    && value.sourceInventoryHashAfter === input.sourceSnapshotHash
    && typeof value.startedAt === "string"
    && typeof value.endedAt === "string"
    && value.receiptHash === sha256(stable(receiptBody));
}

function loadCandidate(input: CandidateInput): CandidateSnapshot {
  const runDir = path.resolve(input.runDir);
  if (!fs.existsSync(runDir) || !fs.statSync(runDir).isDirectory()) {
    throw new Error(`comparison_candidate_${input.role === "saved_control" ? "a" : "b"}_missing`);
  }
  const certificationFile = path.join(runDir, "certification-run.json");
  if (!fs.existsSync(certificationFile)) throw new Error(`comparison_certification_manifest_missing:${input.role}`);
  const certification = readJson<Record<string, unknown>>(certificationFile);
  if (certification.evidenceAuthority !== "simulation") throw new Error(`comparison_not_isolated:${input.role}`);
  const sourceSnapshotHash = String(certification.sourceSnapshotHash ?? "");
  const sourceChildDir = path.resolve(String(certification.sourceChildDir ?? ""));
  if (!sourceChildDir || !fs.existsSync(sourceChildDir) || !fs.statSync(sourceChildDir).isDirectory()) {
    throw new Error(`comparison_source_child_missing:${input.role}`);
  }
  const sourceCurrentHash = hashDirectory(sourceChildDir);
  const reportFile = path.join(runDir, "report", "report.json");
  if (!fs.existsSync(reportFile)) throw new Error(`comparison_isolation_report_missing:${input.role}`);
  const isolation = readJson<Record<string, unknown>>(reportFile);
  if (isolation.sourceChildUnchanged !== true
    || isolation.sourceSnapshotHash !== sourceSnapshotHash
    || isolation.currentSourceSnapshotHash !== sourceSnapshotHash
    || sourceCurrentHash !== sourceSnapshotHash) {
    throw new Error(`comparison_family_data_changed:${input.role === "saved_control" ? "candidate_a" : "candidate_b"}`);
  }

  const buildFile = candidateBuildFile(runDir, input.role);
  const draft = path.dirname(buildFile);
  const programFile = path.join(draft, "math-learning-program.json");
  const designFile = path.join(draft, "design-packet.json");
  const sourceFile = path.join(draft, "assignment-source.json");
  const jobFile = path.join(draft, "adaptive-generation-job.json");
  const reportsFile = path.join(draft, "browser-verification.json");
  for (const [file, label] of [[programFile, "planner_program"], [designFile, "design_packet"], [sourceFile, "assignment_source"], [jobFile, "generation_job"], [reportsFile, "browser_verification"]] as const) {
    if (!fs.existsSync(file)) throw new Error(`comparison_${label}_missing:${input.role}`);
  }
  const program = readJson<Record<string, unknown>>(programFile);
  const design = readJson<Record<string, unknown>>(designFile);
  const programHash = sha256(stable(program));
  const designHash = sha256(stable(design));
  const source = readJson<Record<string, unknown>>(sourceFile);
  const build = readJson<{ artifacts?: Artifact[] }>(buildFile);
  const job = readJson<{ phase?: string; nodes?: Array<{ nodeId?: string; status?: string }> }>(jobFile);
  const reports = readJson<Record<string, BrowserReport>>(reportsFile);
  const artifacts = (build.artifacts ?? []).map((artifact) => ({
    ...artifact,
    resolvedHtmlPath: resolveArtifactPath(runDir, artifact.htmlPath),
    ...(artifact.creatorTestPath ? { resolvedCreatorTestPath: resolveArtifactPath(runDir, artifact.creatorTestPath) } : {}),
  }));
  const nodeIds = programNodeIds(program);
  const artifactByNode = new Map(artifacts.map((artifact) => [artifact.nodeId, artifact]));
  const statusByNode = new Map((job.nodes ?? []).map((node) => [String(node.nodeId ?? ""), node.status]));
  const blockedNodeIds = input.requireCreatorTests
    ? nodeIds.filter((nodeId) => {
      const artifact = artifactByNode.get(nodeId);
      return !artifact || !validateStrictNode(artifact, reports[nodeId], statusByNode.get(nodeId));
    })
    : nodeIds.filter((nodeId) => !artifactByNode.has(nodeId));
  const assignmentFingerprint = String(source.fileHash ?? certification.assignmentFingerprint ?? "");
  if (!assignmentFingerprint || assignmentFingerprint !== certification.assignmentFingerprint) {
    throw new Error(`comparison_assignment_identity_invalid:${input.role}`);
  }
  const boardAcceptanceFile = path.join(runDir, "report", "full-board-acceptance.json");
  if (!fs.existsSync(boardAcceptanceFile)) throw new Error(`comparison_full_board_acceptance_missing:${input.role}`);
  const fullBoardAcceptance = readJson<FullBoardAcceptance>(boardAcceptanceFile);
  const certificationRunId = String(certification.certificationRunId ?? "");
  if (!validateFullBoardAcceptance(fullBoardAcceptance, {
    certificationRunId,
    assignmentFingerprint,
    sourceSnapshotHash,
    programHash,
    designHash,
    nodeIds,
    artifacts,
    requireCreatorTests: input.requireCreatorTests,
  })) {
    throw new Error(`comparison_full_board_acceptance_invalid:${input.role}`);
  }
  return {
    role: input.role,
    runDir,
    certificationRunId,
    sourceChildDir,
    sourceCurrentHash,
    assignmentFingerprint,
    sourceSnapshotHash,
    programHash,
    designHash,
    nodeIds,
    modelSettings: modelSettings(artifacts),
    contractIdentities: contractIdentities(artifacts),
    artifacts,
    reports,
    ready: blockedNodeIds.length === 0 && (!input.requireCreatorTests || (job.phase === "board_ready" && nodeIds.length > 0)),
    blockedNodeIds,
    fullBoardAcceptance,
  };
}

function frozenIdentityMismatches(a: CandidateSnapshot, b: CandidateSnapshot): string[] {
  const mismatches: string[] = [];
  if (a.assignmentFingerprint !== b.assignmentFingerprint) mismatches.push("assignment");
  if (a.sourceSnapshotHash !== b.sourceSnapshotHash) mismatches.push("child_snapshot");
  if (a.programHash !== b.programHash) mismatches.push("planner_program");
  if (a.designHash !== b.designHash) mismatches.push("design_packet");
  if (stable(a.nodeIds) !== stable(b.nodeIds)) mismatches.push("node_ids");
  if (a.nodeIds.length !== b.nodeIds.length) mismatches.push("node_count");
  if (stable(a.modelSettings) !== stable(b.modelSettings)) mismatches.push("model_settings");
  if (stable(a.contractIdentities) !== stable(b.contractIdentities)) mismatches.push("frozen_contracts");
  return mismatches;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;",
  }[character]!));
}

function candidateCard(label: string, candidate: CandidateSnapshot): string {
  const nodes = candidate.artifacts
    .filter((artifact) => candidate.nodeIds.includes(artifact.nodeId))
    .map((artifact, index) => `<button class="node" data-frame="${escapeHtml(label)}" data-node="${escapeHtml(artifact.nodeId)}" data-url="${escapeHtml(pathToFileURL(artifact.resolvedHtmlPath).href)}">${index + 1}. ${escapeHtml(artifact.nodeId)}</button>`)
    .join("");
  const first = candidate.artifacts.find((artifact) => candidate.nodeIds.includes(artifact.nodeId));
  return `<section class="candidate"><h2>${escapeHtml(label)}</h2><p>${candidate.nodeIds.length} Planner-authored activities. Open and complete every node.</p><div class="nodes">${nodes}</div><iframe data-candidate-frame="${escapeHtml(label)}" data-current-node="" src="${escapeHtml(first ? pathToFileURL(first.resolvedHtmlPath).href : "about:blank")}"></iframe><div class="scores">${scoreInputs(label)}</div><label>Notes<textarea data-note="${escapeHtml(label)}"></textarea></label></section>`;
}

function scoreInputs(label: string): string {
  const criteria = [
    ["overall", "Overall quality"],
    ["mathematicalValidity", "Mathematical validity"],
    ["firstActionClarity", "First-action clarity"],
    ["recovery", "Recovery after uncertainty"],
    ["abilityToContinue", "Ability to continue"],
  ];
  return criteria.map(([key, title]) => `<label>${title}<input type="range" min="1" max="5" value="3" data-score="${escapeHtml(label)}" data-key="${key}"><output>3</output></label>`).join("");
}

function reportHtml(display: Array<{ label: string; candidate: CandidateSnapshot }>, provenance: unknown): string {
  const encoded = Buffer.from(JSON.stringify(provenance)).toString("base64");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sunny board comparison</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef2fb;color:#17203a;font:16px system-ui}.hero{padding:24px 30px;background:linear-gradient(135deg,#17234a,#643db2);color:white}.hero h1{margin:0 0 8px}.notice{padding:10px 14px;border-radius:10px;background:#fff3c9;color:#17203a;font-weight:750}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:18px;max-width:1900px;margin:auto}.candidate,.panel{background:white;border-radius:18px;padding:16px;box-shadow:0 10px 28px #1d2a4d1a}.nodes{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.node,button{border:0;border-radius:999px;padding:10px 14px;background:#5d42bd;color:white;font-weight:800;cursor:pointer}.node.complete{background:#24784b}button:disabled{cursor:not-allowed;opacity:.45}.candidate iframe{width:100%;aspect-ratio:1365/768;border:2px solid #c2cade;border-radius:13px;background:#10162c}.scores{display:grid;gap:8px;margin:12px 0}.scores label{display:grid;grid-template-columns:1fr 130px 24px;gap:8px;align-items:center}textarea{display:block;width:100%;min-height:70px}.panel{grid-column:1/-1}.hidden{display:none}pre{white-space:pre-wrap;word-break:break-word;background:#121a30;color:#eef3ff;padding:14px;border-radius:12px}@media(max-width:1000px){.grid{grid-template-columns:1fr}.panel{grid-column:auto}}</style></head><body><header class="hero"><h1>Blinded full-board comparison</h1><p>Both candidates use the same assignment, child snapshot, Planner program, design packet, models, contracts, and node count.</p><div class="notice">Complete every node in both candidates before revealing provenance. This isolated review writes no child evidence.</div></header><main class="grid">${display.map(({ label, candidate }) => candidateCard(label, candidate)).join("")}<section class="panel"><h2>Saori acceptance</h2><p>The self-testing board may be accepted only when its overall score is at least the saved board's and it does not regress on mathematical validity, first-action clarity, recovery, or ability to continue.</p><button id="download" disabled>Download human review</button> <button id="reveal" disabled>Reveal provenance</button><pre id="verdict">Review incomplete</pre><pre id="provenance" class="hidden"></pre></section></main><script>
const visitedNodes=new Set(),completedNodes=new Set(),touchedScores=new Set();
document.querySelectorAll('.node').forEach(button=>button.addEventListener('click',()=>{const frame=document.querySelector('[data-candidate-frame="'+button.dataset.frame+'"]');frame.src=button.dataset.url;frame.dataset.currentNode=button.dataset.node;visitedNodes.add(button.dataset.frame+':'+button.dataset.node);update();}));
document.querySelectorAll('input[type=range]').forEach(input=>input.addEventListener('input',()=>{input.nextElementSibling.value=input.value;touchedScores.add(input.dataset.score+':'+input.dataset.key);update();}));
window.addEventListener('message',event=>{if(event.data?.type!=='node_complete')return;const frame=[...document.querySelectorAll('[data-candidate-frame]')].find(candidate=>candidate.contentWindow===event.source);if(!frame?.dataset.currentNode)return;completedNodes.add(frame.dataset.candidateFrame+':'+frame.dataset.currentNode);document.querySelector('.node[data-frame="'+frame.dataset.candidateFrame+'"][data-node="'+frame.dataset.currentNode+'"]').classList.add('complete');update();});
const read=label=>Object.fromEntries([...document.querySelectorAll('[data-score="'+label+'"]')].map(input=>[input.dataset.key,Number(input.value)]));
const provenance=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${encoded}'),c=>c.charCodeAt(0))));
const controlLabel=Object.keys(provenance).find(label=>provenance[label].role==='saved_control');const selfTestingLabel=Object.keys(provenance).find(label=>provenance[label].role==='self_testing_candidate');
const requiredNodes=[...document.querySelectorAll('.node')].map(button=>button.dataset.frame+':'+button.dataset.node);const requiredScores=[...document.querySelectorAll('[data-score]')].map(input=>input.dataset.score+':'+input.dataset.key);
const judge=()=>{const missingNodes=requiredNodes.filter(key=>!completedNodes.has(key)),missingScores=requiredScores.filter(key=>!touchedScores.has(key));if(missingNodes.length||missingScores.length)return{accepted:false,incomplete:true,missingNodes,missingScores};const control=read(controlLabel),candidate=read(selfTestingLabel),protectedKeys=['mathematicalValidity','firstActionClarity','recovery','abilityToContinue'];const regressions=protectedKeys.filter(key=>candidate[key]<control[key]);if(candidate.overall<control.overall)regressions.unshift('overall');return{accepted:regressions.length===0,incomplete:false,regressions};};
const update=()=>{const verdict=judge();document.getElementById('verdict').textContent=verdict.incomplete?'Review incomplete\n'+JSON.stringify(verdict,null,2):JSON.stringify(verdict,null,2);document.getElementById('download').disabled=verdict.incomplete;document.getElementById('reveal').disabled=verdict.incomplete;};update();
document.getElementById('reveal').addEventListener('click',()=>{const target=document.getElementById('provenance');target.classList.remove('hidden');target.textContent=JSON.stringify(provenance,null,2);});
document.getElementById('download').addEventListener('click',()=>{const review={createdAt:new Date().toISOString(),scores:{'Candidate A':read('Candidate A'),'Candidate B':read('Candidate B')},notes:Object.fromEntries([...document.querySelectorAll('[data-note]')].map(area=>[area.dataset.note,area.value])),verdict:judge(),claim:'Human product-quality review; not learning evidence.'};const anchor=document.createElement('a');anchor.href=URL.createObjectURL(new Blob([JSON.stringify(review,null,2)],{type:'application/json'}));anchor.download='saori-board-review.json';anchor.click();URL.revokeObjectURL(anchor.href);});
</script></body></html>`;
}

export function evaluateHumanBoardScores(input: { candidateA: HumanBoardScores; candidateB: HumanBoardScores }): { accepted: boolean; regressions: string[] } {
  const regressions: string[] = (["mathematicalValidity", "firstActionClarity", "recovery", "abilityToContinue"] as const)
    .filter((key) => input.candidateB[key] < input.candidateA[key]);
  if (input.candidateB.overall < input.candidateA.overall) regressions.unshift("overall");
  return { accepted: regressions.length === 0, regressions: [...regressions] };
}

function materializeBlindedCandidate(candidate: CandidateSnapshot, label: string, outputDir: string): CandidateSnapshot {
  const blindedDir = path.join(outputDir, label.toLowerCase().replace(/\s+/g, "-"));
  fs.mkdirSync(blindedDir, { recursive: true });
  const artifacts = candidate.artifacts.map((artifact, index) => {
    const destination = path.join(blindedDir, `activity-${String(index + 1).padStart(2, "0")}.html`);
    fs.copyFileSync(artifact.resolvedHtmlPath, destination);
    if (artifact.htmlHash && sha256(fs.readFileSync(destination)) !== artifact.htmlHash) {
      throw new Error(`comparison_blinded_copy_hash_mismatch:${artifact.nodeId}`);
    }
    return { ...artifact, resolvedHtmlPath: destination };
  });
  return { ...candidate, artifacts };
}

export function prepareSelfTestingBoardComparison(input: {
  candidateARunDir: string;
  candidateBRunDir: string;
  outputDir: string;
}): BoardComparisonResult {
  const outputDir = path.resolve(input.outputDir);
  const approvedOutputRoot = path.resolve(process.env.SUNNY_COMPARISON_ROOT ?? path.join(os.homedir(), ".sunny", "comparisons"));
  const relativeToApprovedRoot = path.relative(approvedOutputRoot, outputDir);
  if (relativeToApprovedRoot.startsWith("..") || path.isAbsolute(relativeToApprovedRoot)) {
    throw new Error("comparison_output_outside_approved_root");
  }
  const candidateA = loadCandidate({ runDir: input.candidateARunDir, role: "saved_control", requireCreatorTests: false });
  const candidateB = loadCandidate({ runDir: input.candidateBRunDir, role: "self_testing_candidate", requireCreatorTests: true });
  const mismatches = frozenIdentityMismatches(candidateA, candidateB);
  if (mismatches.length > 0) throw new Error(`comparison_frozen_identity_mismatch:${mismatches.join(",")}`);
  if (!candidateA.ready) throw new Error(`comparison_candidate_a_not_playable:${candidateA.blockedNodeIds.join(",")}`);
  if (!candidateB.ready) throw new Error(`comparison_candidate_b_not_ready:${candidateB.blockedNodeIds.join(",")}`);

  const insideFamilyData = [candidateA.sourceChildDir, candidateB.sourceChildDir].some((sourceDir) => {
    const relative = path.relative(sourceDir, outputDir);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
  if (insideFamilyData) throw new Error("comparison_output_inside_family_data");

  const identity = sha256(`${candidateA.programHash}:${candidateA.designHash}:${candidateB.artifacts.map((artifact) => artifact.htmlHash).join(":")}`);
  const swap = Number.parseInt(identity.slice(0, 2), 16) % 2 === 1;
  const ordered = swap
    ? [{ label: "Candidate A", candidate: candidateB }, { label: "Candidate B", candidate: candidateA }]
    : [{ label: "Candidate A", candidate: candidateA }, { label: "Candidate B", candidate: candidateB }];
  const provenance = Object.fromEntries(ordered.map(({ label, candidate }) => [label, {
    role: candidate.role,
    certificationRunId: candidate.certificationRunId,
    programHash: candidate.programHash,
    designHash: candidate.designHash,
    artifactHashes: candidate.artifacts.map((artifact) => ({ nodeId: artifact.nodeId, htmlHash: artifact.htmlHash, creatorTestHash: artifact.creatorTestHash ?? null })),
  }]));
  fs.mkdirSync(outputDir, { recursive: true });
  const display = ordered.map(({ label, candidate }) => ({
    label,
    candidate: materializeBlindedCandidate(candidate, label, outputDir),
  }));
  const reportPath = path.join(outputDir, "report.html");
  const manifestPath = path.join(outputDir, "comparison-manifest.json");
  fs.writeFileSync(reportPath, reportHtml(display, provenance), "utf8");
  if (hashDirectory(candidateA.sourceChildDir) !== candidateA.sourceCurrentHash
    || hashDirectory(candidateB.sourceChildDir) !== candidateB.sourceCurrentHash) {
    throw new Error("comparison_family_data_changed_during_run");
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    version: 1,
    readyForSaori: true,
    evidenceAuthority: "simulation",
    assignmentFingerprint: candidateA.assignmentFingerprint,
    sourceSnapshotHash: candidateA.sourceSnapshotHash,
    programHash: candidateA.programHash,
    designHash: candidateA.designHash,
    nodeCount: candidateA.nodeIds.length,
    nodeIds: candidateA.nodeIds,
    requiredViewports: REQUIRED_VIEWPORTS,
    blindedMappingHash: sha256(stable(provenance)),
    familyDataUnchanged: true,
  }, null, 2)}\n`, "utf8");
  console.log(` 🎮 [board-comparison] [ready] nodes=${candidateA.nodeIds.length} report=${reportPath}`);
  return { outputDir, reportPath, manifestPath, nodeCount: candidateA.nodeIds.length, readyForSaori: true };
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (require.main === module) {
  try {
    const candidateARunDir = arg("candidate-a");
    const candidateBRunDir = arg("candidate-b");
    const outputDir = arg("output");
    if (!candidateARunDir || !candidateBRunDir || !outputDir) throw new Error("comparison_arguments_required:candidate-a,candidate-b,output");
    prepareSelfTestingBoardComparison({ candidateARunDir, candidateBRunDir, outputDir });
  } catch (error) {
    console.error(`Board comparison failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
