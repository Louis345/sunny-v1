import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Frame, type Page } from "playwright";
import { MATH_BROWSER_VERIFIER_VERSION } from "../engine/directMathExperience";
import { healthMatchesCertificationRun } from "../server/certificationRuntime";
import { hashDirectory } from "./sunnyCertification";

type NodeProof = {
  nodeId: string;
  htmlHash: string;
  manifestHash: string | null;
  launchPassed: boolean;
  completionPassed: boolean;
  runtimeErrors: string[];
  capturePaths: string[];
};

export type FullBoardAcceptanceInput = {
  runDir: string;
  certificationRunId: string;
  assignmentFingerprint: string;
  sourceSnapshotHash: string;
  programHash: string;
  designHash: string;
  nodeIds: string[];
  boardVersion: number;
  verifierVersion: number;
  sourceInventoryHashBefore: string;
  sourceInventoryHashAfter: string;
  startedAt: string;
  endedAt: string;
  nodes: NodeProof[];
  boardLoaded: boolean;
  companionHostVisible: boolean;
  navigationPassed: boolean;
  readyNodeIds: string[];
  preparingNodeIds: string[];
  needsAttentionNodeIds: string[];
};

type CreatorManifest = {
  journey?: Array<{ itemId?: string; steps?: Array<{ action?: string; selector?: string; value?: string; target?: string }> }>;
};

type Artifact = {
  nodeId: string;
  htmlPath: string;
  htmlHash?: string;
  creatorTestPath?: string;
  creatorTestHash?: string;
};

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

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sameOrdered(actual: string[], expected: string[]): boolean {
  return stable(actual) === stable(expected);
}

function receiptBody(input: FullBoardAcceptanceInput): Record<string, unknown> {
  return {
    version: 1,
    evidenceAuthority: "simulation",
    passed: true,
    certificationRunId: input.certificationRunId,
    assignmentFingerprint: input.assignmentFingerprint,
    sourceSnapshotHash: input.sourceSnapshotHash,
    programHash: input.programHash,
    designHash: input.designHash,
    nodeCount: input.nodeIds.length,
    plannerNodeIds: input.nodeIds,
    readyNodeIds: input.readyNodeIds,
    launchedNodeIds: input.nodes.filter((node) => node.launchPassed).map((node) => node.nodeId),
    completedNodeIds: input.nodes.filter((node) => node.completionPassed).map((node) => node.nodeId),
    boardVersion: input.boardVersion,
    verifierVersion: input.verifierVersion,
    boardLoaded: input.boardLoaded,
    companionHostVisible: input.companionHostVisible,
    navigationPassed: input.navigationPassed,
    artifactHashes: input.nodes.map((node) => ({ nodeId: node.nodeId, htmlHash: node.htmlHash })),
    nodes: input.nodes,
    preparingNodeIds: input.preparingNodeIds,
    needsAttentionNodeIds: input.needsAttentionNodeIds,
    sourceInventoryHashBefore: input.sourceInventoryHashBefore,
    sourceInventoryHashAfter: input.sourceInventoryHashAfter,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
  };
}

/** Called only by the trusted host/browser harness after it independently confirms the full isolated route. */
export function writeFullBoardAcceptanceReceipt(input: FullBoardAcceptanceInput): string {
  if (input.sourceInventoryHashBefore !== input.sourceSnapshotHash
    || input.sourceInventoryHashAfter !== input.sourceSnapshotHash) {
    throw new Error("full_board_acceptance_family_data_changed");
  }
  if (input.preparingNodeIds.length > 0 || input.needsAttentionNodeIds.length > 0) {
    throw new Error("full_board_acceptance_pending_nodes");
  }
  if (!input.boardLoaded || !input.companionHostVisible || !input.navigationPassed
    || !sameOrdered(input.readyNodeIds, input.nodeIds)
    || !sameOrdered(input.nodes.map((node) => node.nodeId), input.nodeIds)) {
    throw new Error("full_board_acceptance_host_failed");
  }
  for (const node of input.nodes) {
    if (!node.launchPassed || !node.completionPassed || node.runtimeErrors.length > 0) {
      throw new Error(`full_board_acceptance_node_failed:${node.nodeId}`);
    }
    if (node.capturePaths.length === 0 || node.capturePaths.some((file) => !fs.existsSync(file))) {
      throw new Error(`full_board_acceptance_capture_missing:${node.nodeId}`);
    }
  }
  const body = receiptBody(input);
  const receipt = { ...body, receiptHash: sha256(stable(body)) };
  const file = path.join(path.resolve(input.runDir), "report", "full-board-acceptance.json");
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, "utf8"));
    if (stable(existing) !== stable(receipt)) throw new Error("full_board_acceptance_receipt_conflict");
    return file;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
  console.log(` 🎮 [full-board-acceptance] [saved] run=${input.certificationRunId} nodes=${input.nodeIds.length}`);
  return file;
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

function oneFile(runDir: string, name: string): string {
  const matches = walk(runDir).filter((file) => path.basename(file) === name);
  if (matches.length !== 1) throw new Error(`full_board_acceptance_file_${matches.length ? "ambiguous" : "missing"}:${name}`);
  return matches[0]!;
}

function resolvedFile(runDir: string, saved: string): string {
  if (fs.existsSync(saved)) return saved;
  const matches = walk(runDir).filter((file) => path.basename(file) === path.basename(saved));
  if (matches.length !== 1) throw new Error(`full_board_acceptance_artifact_missing:${path.basename(saved)}`);
  return matches[0]!;
}

async function performSteps(frame: Frame, manifest: CreatorManifest): Promise<void> {
  for (const item of manifest.journey ?? []) {
    if (!Array.isArray(item.steps) || item.steps.length === 0) throw new Error(`full_board_acceptance_steps_missing:${item.itemId ?? "unknown"}`);
    for (const step of item.steps) {
      if (!step.selector) throw new Error(`full_board_acceptance_selector_missing:${item.itemId ?? "unknown"}`);
      const control = frame.locator(step.selector).first();
      if (step.action === "click") await control.click();
      else if (step.action === "fill") await control.fill(step.value ?? "");
      else if (step.action === "press") await control.press(step.value ?? "Enter");
      else if (step.action === "drag" && step.target) await control.dragTo(frame.locator(step.target).first());
      else throw new Error(`full_board_acceptance_action_invalid:${step.action ?? "missing"}`);
    }
  }
}

async function legacyJourney(frame: Frame): Promise<CreatorManifest> {
  return frame.evaluate("() => ({ journey: window.SUNNY_VALIDATION_HOOKS?.journey })") as Promise<CreatorManifest>;
}

async function dismissCompletion(page: Page): Promise<void> {
  for (const name of [/Skip fun rating/i, /Back to map/i]) {
    const button = page.getByRole("button", { name }).first();
    if (await button.isVisible().catch(() => false)) await button.click();
  }
}

export async function verifySelfTestingBoardAcceptance(input: { runDir: string; baseUrl: string }): Promise<string> {
  const runDir = path.resolve(input.runDir);
  const certification = readJson<Record<string, unknown>>(path.join(runDir, "certification-run.json"));
  if (certification.evidenceAuthority !== "simulation") throw new Error("full_board_acceptance_not_isolated");
  const childId = String(certification.sourceChildId ?? "");
  const certificationRunId = String(certification.certificationRunId ?? "");
  const assignmentFingerprint = String(certification.assignmentFingerprint ?? "");
  const sourceSnapshotHash = String(certification.sourceSnapshotHash ?? "");
  const sourceChildDir = path.resolve(String(certification.sourceChildDir ?? ""));
  if (!childId || !certificationRunId || !assignmentFingerprint || !fs.existsSync(sourceChildDir)) {
    throw new Error("full_board_acceptance_certification_invalid");
  }
  const sourceInventoryHashBefore = hashDirectory(sourceChildDir);
  if (sourceInventoryHashBefore !== sourceSnapshotHash) throw new Error("full_board_acceptance_family_data_changed");

  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const healthResponse = await fetch(`${baseUrl}/api/health`).catch(() => null);
  if (!healthResponse?.ok) throw new Error("full_board_acceptance_host_identity_unavailable");
  const health = await healthResponse.json().catch(() => null);
  if (!healthMatchesCertificationRun(health, { SUNNY_CERTIFICATION_RUN_ID: certificationRunId })) {
    throw new Error("full_board_acceptance_host_identity_mismatch");
  }

  const buildFile = oneFile(runDir, "candidate-build-v3.json");
  const draft = path.dirname(buildFile);
  const program = readJson<{ activities?: Array<{ id?: string }> }>(path.join(draft, "math-learning-program.json"));
  const design = readJson<unknown>(path.join(draft, "design-packet.json"));
  const job = readJson<{ phase?: string; nodes?: Array<{ nodeId?: string; status?: string }> }>(path.join(draft, "adaptive-generation-job.json"));
  const build = readJson<{ artifacts?: Artifact[] }>(buildFile);
  const nodeIds = (program.activities ?? []).map((activity) => String(activity.id ?? "")).filter(Boolean);
  const artifacts = (build.artifacts ?? []).map((artifact) => ({
    ...artifact,
    htmlPath: resolvedFile(runDir, artifact.htmlPath),
    ...(artifact.creatorTestPath ? { creatorTestPath: resolvedFile(runDir, artifact.creatorTestPath) } : {}),
  }));
  const statusByNode = new Map((job.nodes ?? []).map((node) => [String(node.nodeId ?? ""), String(node.status ?? "")]));
  const readyNodeIds = nodeIds.filter((nodeId) => statusByNode.get(nodeId) === "ready");
  const preparingNodeIds = nodeIds.filter((nodeId) => statusByNode.get(nodeId) === "preparing");
  const needsAttentionNodeIds = nodeIds.filter((nodeId) => statusByNode.get(nodeId) === "needs_attention");
  if (job.phase !== "board_ready" || readyNodeIds.length !== nodeIds.length) throw new Error("full_board_acceptance_pending_nodes");

  const packetResponse = await fetch(`${baseUrl}/api/child-experience/${encodeURIComponent(childId)}`);
  if (!packetResponse.ok) throw new Error(`full_board_acceptance_packet_http_${packetResponse.status}`);
  const packet = await packetResponse.json() as Record<string, unknown>;
  const activePlan = packet.activeSessionPlan as Record<string, unknown> | undefined;
  const board = activePlan?.adventureBoard as { version?: number; nodes?: Array<{ id?: string; label?: string }> } | undefined;
  if (!board || !Array.isArray(board.nodes)) throw new Error("full_board_acceptance_board_missing");
  const boardNodeById = new Map(board.nodes.map((node) => [String(node.id ?? ""), node]));
  if (nodeIds.some((nodeId) => !boardNodeById.has(nodeId))) throw new Error("full_board_acceptance_board_node_missing");

  const startedAt = new Date().toISOString();
  const captureDir = path.join(runDir, "report", "full-board-captures");
  fs.mkdirSync(captureDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const proofs: NodeProof[] = [];
  let boardLoaded = false;
  let companionHostVisible = false;
  let navigationPassed = true;
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.evaluate("() => { window.__sunnyAcceptanceMessages = []; window.addEventListener('message', event => window.__sunnyAcceptanceMessages.push(event.data)); }");
    companionHostVisible = await page.locator('[data-testid="companion-layer-stack"], [data-testid="companion-portrait"]').first()
      .waitFor({ state: "visible", timeout: 120_000 }).then(() => true).catch(() => false);
    for (const nodeId of nodeIds) {
      const artifact = artifacts.find((candidate) => candidate.nodeId === nodeId);
      const boardNode = boardNodeById.get(nodeId);
      if (!artifact?.htmlHash || !boardNode?.label) throw new Error(`full_board_acceptance_artifact_invalid:${nodeId}`);
      if (sha256(fs.readFileSync(artifact.htmlPath)) !== artifact.htmlHash) throw new Error(`full_board_acceptance_html_hash_changed:${nodeId}`);
      const runtimeErrors: string[] = [];
      const onPageError = (error: Error) => runtimeErrors.push(error.message);
      page.on("pageerror", onPageError);
      const capturePaths: string[] = [];
      let launchPassed = false;
      let completionPassed = false;
      try {
        const nodeButton = page.getByRole("button", { name: new RegExp(`^${boardNode.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).first();
        await nodeButton.waitFor({ state: "visible", timeout: 120_000 });
        boardLoaded = true;
        await nodeButton.click();
        const iframe = page.locator('iframe[title="generated-baseline"]').last();
        await iframe.waitFor({ state: "visible", timeout: 30_000 });
        const src = await iframe.getAttribute("src");
        if (!src?.includes(path.basename(artifact.htmlPath))) throw new Error(`full_board_acceptance_wrong_artifact:${nodeId}`);
        launchPassed = true;
        const frame = page.frames().find((candidate) => candidate.url().includes(path.basename(artifact.htmlPath)));
        if (!frame) throw new Error(`full_board_acceptance_frame_missing:${nodeId}`);
        const manifest = artifact.creatorTestPath
          ? readJson<CreatorManifest>(artifact.creatorTestPath)
          : await legacyJourney(frame);
        await performSteps(frame, manifest);
        await page.waitForFunction(`() => window.__sunnyAcceptanceMessages?.some(message => message?.type === "node_complete" && message.payload?.nodeId === ${JSON.stringify(nodeId)}) === true`, undefined, { timeout: 30_000 });
        const packetAfter = await fetch(`${baseUrl}/api/child-experience/${encodeURIComponent(childId)}`).then((response) => response.json()) as { learningCycle?: { nodes?: Array<{ nodeId?: string; state?: string }> } };
        completionPassed = packetAfter.learningCycle?.nodes?.some((node) => node.nodeId === nodeId && node.state === "completed") === true;
        if (!completionPassed) throw new Error(`full_board_acceptance_host_completion_missing:${nodeId}`);
        const capture = path.join(captureDir, `${String(proofs.length + 1).padStart(2, "0")}-${nodeId.replace(/[^a-z0-9_-]/gi, "_")}.png`);
        await page.screenshot({ path: capture, fullPage: false });
        capturePaths.push(capture);
        await dismissCompletion(page);
        await nodeButton.waitFor({ state: "visible", timeout: 30_000 });
      } catch (error) {
        runtimeErrors.push(error instanceof Error ? error.message : String(error));
        navigationPassed = false;
      } finally {
        page.off("pageerror", onPageError);
      }
      proofs.push({
        nodeId,
        htmlHash: artifact.htmlHash,
        manifestHash: artifact.creatorTestHash ?? null,
        launchPassed,
        completionPassed,
        runtimeErrors,
        capturePaths,
      });
      if (runtimeErrors.length > 0) break;
    }
    await page.close();
  } finally {
    await browser.close();
  }
  const sourceInventoryHashAfter = hashDirectory(sourceChildDir);
  return writeFullBoardAcceptanceReceipt({
    runDir,
    certificationRunId,
    assignmentFingerprint,
    sourceSnapshotHash,
    programHash: sha256(stable(program)),
    designHash: sha256(stable(design)),
    nodeIds,
    boardVersion: Number(board.version ?? 1),
    verifierVersion: MATH_BROWSER_VERIFIER_VERSION,
    sourceInventoryHashBefore,
    sourceInventoryHashAfter,
    startedAt,
    endedAt: new Date().toISOString(),
    nodes: proofs,
    boardLoaded,
    companionHostVisible,
    navigationPassed,
    readyNodeIds,
    preparingNodeIds,
    needsAttentionNodeIds,
  });
}

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

if (require.main === module) {
  void (async () => {
    const runDir = option("run");
    const baseUrl = option("base-url");
    if (!runDir || !baseUrl) throw new Error("full_board_acceptance_arguments_required:run,base-url");
    const receipt = await verifySelfTestingBoardAcceptance({ runDir, baseUrl });
    console.log(`Full-board acceptance passed: ${receipt}`);
  })().catch((error) => {
    console.error(`Full-board acceptance failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
