import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import {assignmentPlannerContent, type AssignmentSourceExtraction} from "./assignmentSourceExtraction";
import { assertChildPublicationCommitted, resolveChildContextDir, resolveContextRoot, type ContextRootOptions } from "../utils/contextRoot";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import {
  createLearningCycle,
  getLearningCycle,
  projectLearningCycle,
  transitionLearningCycle,
  type AcademicPrediction,
  type LearningAssumption,
  type LearningCycleAgencyExperiment,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
  type LearningObservation,
  type LearningCycleSpellingItem,
} from "./learningCycleRepository";
import { createSpellingDiscoveryCycle } from "./learningCycleIngest";
import {
  renderDiscoveryCandidate, DISCOVERY_VERIFIER_VERSION,
  MATH_JOURNEY_CONTRACT, MATH_IMPLEMENTATION_REPAIR_CONTRACT, verifyMathJourneyAtReleaseViewports, DISCOVERY_RELEASE_VIEWPORTS,
  reviewDiscoveryCandidate,
  withDiscoveryBrowserPage,
  parseEngineeringLessonProposal, recordEngineeringRepairEvidence, verifyEngineeringRepairEvidence, invalidateEngineeringRepairEvidence, freezeEngineeringLessonSnapshot, engineeringFeatures, engineeringLessonContext,
} from "./discoveryVisualReview";
import { readOpenAiResponseStream } from "./openAiResponses";
import {
  validateBoardChoices,
  validateBoardGraph,
  validateBoardVisualContract,
} from "../shared/adventureBoardValidation";

export function resolveDiscoveryRepairModel(input: {
  builderModel: string;
  environment: Record<string, string | undefined>;
}): { provider: "anthropic" | "openai"; model: string } {
  const model = input.environment.SUNNY_DISCOVERY_REPAIR_MODEL?.trim() || "gpt-5.6";
  return { provider: model.startsWith("gpt-") ? "openai" : "anthropic", model };
}

export function buildOpenAiDiscoveryRepairInput(content: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return content.map((block) => {
    if (block.type === "text") return { type: "input_text", text: block.text };
    const source = block.source as { media_type?: string; data?: string } | undefined;
    if (block.type === "image" && source?.media_type && source.data) {
      return { type: "input_image", image_url: `data:${source.media_type};base64,${source.data}` };
    }
    throw new Error(`discovery_repair_content_unsupported:${String(block.type ?? "unknown")}`);
  });
}

export function estimateDiscoveryRepairCost(input: {
  provider: "anthropic" | "openai";
  inputTokens: number;
  outputTokens: number;
}): number {
  const rates = input.provider === "openai" ? { input: 4, output: 20 } : { input: 3, output: 15 };
  return input.inputTokens / 1_000_000 * rates.input + input.outputTokens / 1_000_000 * rates.output;
}

export type DiscoveryResponseContract = {
  mode: "tap_selection" | "tap_numeric_pad" | "drag_construct";
  representationId: string;
};

export function buildDiscoveryRepairMessageContent(screenshotPaths: string[], prompt: string): Array<Record<string, unknown>> {
  return [
    ...screenshotPaths.map((screenshotPath) => ({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: fs.readFileSync(screenshotPath).toString("base64") },
    })),
    { type: "text", text: prompt },
  ];
}

export function buildDiscoveryRepairDiagnostic(input: {
  response: { stop_reason?: string | null; usage?: unknown };
  textCharacters: number;
  screenshotPaths: string[];
  issues: string[];
  startedAt: number;
  finishedAt: number;
}): Record<string, unknown> {
  return {
    stopReason: input.response.stop_reason ?? "unknown",
    usage: input.response.usage ?? {},
    textCharacters: input.textCharacters,
    screenshotCount: input.screenshotPaths.length,
    screenshotPaths: input.screenshotPaths,
    issues: input.issues,
    latencyMs: Math.max(0, input.finishedAt - input.startedAt),
  };
}

export function applyDiscoveryHtmlPatch(originalHtml: string, responseText: string): {
  html: string;
  replacementCount: number;
  changedOriginalCharacters: number;
  engineeringLesson?: ReturnType<typeof parseEngineeringLessonProposal>;
} {
  const source = responseText.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? responseText;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.trim());
  } catch {
    throw new Error("discovery_repair_patch_invalid_json");
  }
  const replacements = (parsed as { replacements?: unknown })?.replacements;
  if (!Array.isArray(replacements) || replacements.length < 1 || replacements.length > 8) {
    throw new Error("discovery_repair_patch_replacement_count_invalid");
  }
  const ranges = replacements.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") throw new Error(`discovery_repair_patch_invalid:${index}`);
    const { oldText, newText, reason } = candidate as Record<string, unknown>;
    if (typeof oldText !== "string" || !oldText || typeof newText !== "string" || typeof reason !== "string" || !reason.trim()) {
      throw new Error(`discovery_repair_patch_invalid:${index}`);
    }
    if (oldText === newText) throw new Error(`discovery_repair_patch_noop:${index}`);
    if (/<\/?(?:html|body)\b|<!doctype/i.test(oldText) || /<\/?(?:html|body)\b|<!doctype/i.test(newText)) {
      throw new Error(`discovery_repair_patch_document_replacement_forbidden:${index}`);
    }
    const start = originalHtml.indexOf(oldText);
    if (start < 0) throw new Error(`discovery_repair_patch_old_text_missing:${index}`);
    if (originalHtml.indexOf(oldText, start + 1) >= 0) throw new Error(`discovery_repair_patch_old_text_not_unique:${index}`);
    return { start, end: start + oldText.length, oldText, newText };
  });
  const changedOriginalCharacters = ranges.reduce((sum, range) => sum + range.oldText.length, 0);
  if (changedOriginalCharacters > Math.max(1_000, Math.floor(originalHtml.length * 0.2))) {
    throw new Error("discovery_repair_patch_scope_exceeded");
  }
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1]!.start < sorted[index]!.end) throw new Error("discovery_repair_patch_overlap");
  }
  let html = originalHtml;
  for (const range of sorted) html = `${html.slice(0, range.start)}${range.newText}${html.slice(range.end)}`;
  let engineeringLesson: ReturnType<typeof parseEngineeringLessonProposal> | undefined;
  if ((parsed as { engineeringLesson?: unknown }).engineeringLesson != null) {
    try { engineeringLesson = parseEngineeringLessonProposal((parsed as { engineeringLesson: unknown }).engineeringLesson); }
    catch (error) { console.warn(" 🎮 [engineering-evidence] [proposal] [ignored-invalid]", error instanceof Error ? error.message : String(error)); }
  }
  return { html, replacementCount: ranges.length, changedOriginalCharacters, ...(engineeringLesson ? { engineeringLesson } : {}) };
}

export function buildDiscoveryRepairPrompt(input: {
  issues: string[];
  runtimeContractJson: string;
  contractHash: string;
  academic: unknown;
  designHash: string;
  design: unknown;
  html: string;
}): string {
  return `You are Sunny's Experience Creator repairing only the implementation of a frozen Discovery experience. The attached images include the opening screens and exact failed journey states. Preserve #sunny-discovery-contract JSON and window.__SUNNY_DISCOVERY_TEST__.evaluate: this side-effect-free bridge must use the same scoring logic as the child-facing controls. Do not add child-state, API, storage, currency, speech-synthesis, or oscillator access. ${MATH_IMPLEMENTATION_REPAIR_CONTRACT} ${MATH_JOURNEY_CONTRACT}

RENDERING AND RUNTIME DEFECTS:
${input.issues.map((issue) => `- ${issue}`).join("\n")}

RUNTIME CONTRACT JSON:
${input.runtimeContractJson}

ACADEMIC CONTRACT HASH: ${input.contractHash}
${JSON.stringify(input.academic, null, 2)}

DESIGN HASH: ${input.designHash}
${JSON.stringify(input.design, null, 2)}

CURRENT HTML:
${input.html}`;
}

export type MathDiscoveryEvaluationItem = {
  itemId: string;
  constructId: string;
  prompt: string;
  representationSpec?: string;
  responseContract: DiscoveryResponseContract;
  correctAnswerContract: { acceptedValues: string[] };
  difficultyBoundary: string;
  exposureId: string;
  possibleConfounds: string[];
  falsifyingEvidence: string[];
  measurementKeys: string[];
};

export type MathDiscoveryEvaluationContract = {
  evaluationId: string;
  title: string;
  assignmentEvidenceIds: string[];
  constructs: Array<{ constructId: string; prerequisiteIds: string[] }>;
  items: MathDiscoveryEvaluationItem[];
  artifact: {
    artifactId: string;
    htmlPath: string;
    artworkPath: string;
    contractHash: string;
    artifactHash: string;
  };
};

type DiscoveryAcademicContract = Omit<MathDiscoveryEvaluationContract, "artifact">;

const DISCOVERY_RESPONSE_MODES = new Set<DiscoveryResponseContract["mode"]>([
  "tap_selection",
  "tap_numeric_pad",
  "drag_construct",
]);

function assertDiscoveryResponseContracts(
  contract: Pick<DiscoveryAcademicContract, "items">,
): void {
  for (const item of contract.items) {
    const response = item.responseContract as unknown;
    if (
      !response
      || typeof response !== "object"
      || !DISCOVERY_RESPONSE_MODES.has((response as DiscoveryResponseContract).mode)
      || typeof (response as DiscoveryResponseContract).representationId !== "string"
      || !(response as DiscoveryResponseContract).representationId.trim()
    ) {
      throw new Error(`discovery_response_contract_invalid:${item.itemId}`);
    }
  }
}

const DISCOVERY_NUMBER_WORDS = new Map<string, number>([
  ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6],
  ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10], ["eleven", 11], ["twelve", 12],
  ["ones", 1], ["twos", 2], ["threes", 3], ["fours", 4], ["fives", 5], ["sixes", 6],
  ["sevens", 7], ["eights", 8], ["nines", 9], ["tens", 10], ["elevens", 11], ["twelves", 12],
]);

function namedInterval(constructId: string): number | undefined {
  const normalized = constructId.toLowerCase();
  const numeric = normalized.match(/(?:by|interval)[-_:](\d{1,3})(?:\D|$)/)?.[1];
  if (numeric) return Number(numeric);
  const word = normalized.match(/(?:by|interval)[-_:]([a-z]+)(?:\D|$)/)?.[1];
  return word ? DISCOVERY_NUMBER_WORDS.get(word) : undefined;
}

function representedInterval(representationSpec: string): number | undefined {
  const explicit = representationSpec.match(/\binterval(?:\s+of)?\s*[:=(]?\s*(\d{1,3})\b/i)?.[1];
  return explicit ? Number(explicit) : undefined;
}

/** Rejects obvious contradictions between evidence labels and frozen representations. */
export function assertDiscoveryConstructSemantics(
  contract: { items: Array<Pick<MathDiscoveryEvaluationItem, "itemId" | "constructId" | "representationSpec">> },
): void {
  for (const item of contract.items) {
    const claimed = namedInterval(item.constructId);
    const observed = representedInterval(item.representationSpec ?? "");
    if (claimed !== undefined && observed !== undefined && claimed !== observed) {
      throw new Error(
        `discovery_construct_representation_mismatch:${item.itemId}:claimed=${claimed}:observed=${observed}`,
      );
    }
  }
}

type DiscoveryRuntimeContract = {
  items: Array<{
    itemId: string;
    constructId: string;
    acceptedValues: string[];
  }>;
};

function expectedDiscoveryRuntimeContract(
  academic: Pick<DiscoveryAcademicContract, "items">,
): DiscoveryRuntimeContract {
  return {
    items: academic.items.map((item) => ({
      itemId: item.itemId,
      constructId: item.constructId,
      acceptedValues: [...item.correctAnswerContract.acceptedValues],
    })),
  };
}

function readDiscoveryRuntimeContract(html: string): DiscoveryRuntimeContract {
  const source = html.match(
    /<script\b[^>]*\bid=["']sunny-discovery-contract["'][^>]*>([\s\S]*?)<\/script>/i,
  )?.[1];
  if (!source) throw new Error("discovery_runtime_contract_missing");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("discovery_runtime_contract_invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { items?: unknown }).items)) {
    throw new Error("discovery_runtime_contract_invalid");
  }
  const items = (parsed as { items: unknown[] }).items.map((item) => {
    if (!item || typeof item !== "object") throw new Error("discovery_runtime_contract_invalid_item");
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.itemId !== "string"
      || typeof candidate.constructId !== "string"
      || !Array.isArray(candidate.acceptedValues)
      || candidate.acceptedValues.some((value) => typeof value !== "string")
    ) {
      throw new Error("discovery_runtime_contract_invalid_item");
    }
    return {
      itemId: candidate.itemId,
      constructId: candidate.constructId,
      acceptedValues: candidate.acceptedValues as string[],
    };
  });
  return { items };
}

export function validateDiscoveryAcademicBinding(
  html: string,
  academic: Pick<DiscoveryAcademicContract, "items">,
): void {
  const expected = expectedDiscoveryRuntimeContract(academic);
  const actual = readDiscoveryRuntimeContract(html);
  if (actual.items.length !== expected.items.length) {
    throw new Error("discovery_runtime_contract_item_count_mismatch");
  }
  const actualById = new Map(actual.items.map((item) => [item.itemId, item]));
  if (actualById.size !== actual.items.length) {
    throw new Error("discovery_runtime_contract_duplicate_item");
  }
  for (const item of expected.items) {
    const bound = actualById.get(item.itemId);
    if (!bound) throw new Error(`discovery_runtime_contract_item_missing:${item.itemId}`);
    if (bound.constructId !== item.constructId) {
      throw new Error(`discovery_runtime_contract_construct_mismatch:${item.itemId}`);
    }
    const expectedValues = [...item.acceptedValues].sort();
    const actualValues = [...bound.acceptedValues].sort();
    if (JSON.stringify(actualValues) !== JSON.stringify(expectedValues)) {
      throw new Error(`discovery_runtime_contract_answers_mismatch:${item.itemId}`);
    }
  }
}

export async function verifyDiscoveryRuntimeScoring(input: {
  html: string;
  academic: Pick<DiscoveryAcademicContract, "items">;
  outputDir: string;
}): Promise<void> {
  validateDiscoveryAcademicBinding(input.html, input.academic);
  fs.mkdirSync(input.outputDir, { recursive: true });
  await withDiscoveryBrowserPage(input.html, async (page) => {
    for (const item of input.academic.items) {
      for (const acceptedValue of item.correctAnswerContract.acceptedValues) {
        const result = await page.evaluate(
          ({ itemId, attemptedValue }) => {
            const runtime = (globalThis as unknown as {
              __SUNNY_DISCOVERY_TEST__?: {
                evaluate?: (id: string, value: string) => unknown;
              };
            }).__SUNNY_DISCOVERY_TEST__;
            if (typeof runtime?.evaluate !== "function") {
              throw new Error("discovery_runtime_scoring_bridge_missing");
            }
            return runtime.evaluate(itemId, attemptedValue);
          },
          { itemId: item.itemId, attemptedValue: acceptedValue },
        ) as { itemId?: unknown; constructId?: unknown; correct?: unknown };
        if (
          result?.itemId !== item.itemId
          || result.constructId !== item.constructId
          || result.correct !== true
        ) {
          throw new Error(`discovery_runtime_scoring_mismatch:${item.itemId}:${acceptedValue}`);
        }
      }
      const rejectedValue = `__sunny_reject__${hashDiscoveryContract(item.itemId).slice(0, 12)}`;
      const rejected = await page.evaluate(
        ({ itemId, attemptedValue }) => {
          const runtime = (globalThis as unknown as {
            __SUNNY_DISCOVERY_TEST__?: {
              evaluate?: (id: string, value: string) => unknown;
            };
          }).__SUNNY_DISCOVERY_TEST__;
          if (typeof runtime?.evaluate !== "function") {
            throw new Error("discovery_runtime_scoring_bridge_missing");
          }
          return runtime.evaluate(itemId, attemptedValue);
        },
        { itemId: item.itemId, attemptedValue: rejectedValue },
      ) as { itemId?: unknown; constructId?: unknown; correct?: unknown };
      if (
        rejected?.itemId !== item.itemId
        || rejected.constructId !== item.constructId
        || rejected.correct !== false
      ) {
        throw new Error(`discovery_runtime_reject_mismatch:${item.itemId}`);
      }
    }
  });
  const journeyScreenshots = await verifyMathJourneyAtReleaseViewports({
    html: input.html,
    outputDir: input.outputDir,
    completionType: "evaluation_complete",
    itemIds: input.academic.items.map(item => item.itemId),
  });
  atomicJson(path.join(input.outputDir,"acceptance.json"), {passed:true,verifierVersion:DISCOVERY_VERIFIER_VERSION,htmlHash:hashDiscoveryContract(input.html),academicHash:hashDiscoveryContract(input.academic.items),viewports:DISCOVERY_RELEASE_VIEWPORTS,completedItemIds:input.academic.items.map(item=>item.itemId),screenshots:journeyScreenshots,verifiedAt:new Date().toISOString()});
  console.log(` 🎮 [adaptive-math] [discovery-runtime-scoring] [passed] items=${input.academic.items.length}`);
}

function toolInput(response: unknown, name: string): Record<string, unknown> {
  const content = (response as { content?: Array<{ type?: string; name?: string; input?: unknown }> }).content ?? [];
  const block = content.find((entry) => entry.type === "tool_use" && entry.name === name);
  if (!block?.input || typeof block.input !== "object") throw new Error(`discovery_provider_contract_missing:${name}`);
  return block.input as Record<string, unknown>;
}

function responseText(response: unknown): string {
  return ((response as { content?: Array<{ type?: string; text?: string }> }).content ?? [])
    .filter((entry) => entry.type === "text")
    .map((entry) => entry.text ?? "")
    .join("\n");
}

function standaloneHtml(value: string): string {
  const fenced = value.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1] ?? value;
  const html = fenced.match(/<!doctype html[\s\S]*<\/html>/i)?.[0] ?? fenced.match(/<html[\s\S]*<\/html>/i)?.[0];
  if (!html) throw new Error("discovery_complete_html_missing");
  for (const event of ["evaluation_ready", "evaluation_attempt", "evaluation_complete"]) {
    if (!html.includes(event)) throw new Error(`discovery_runtime_event_missing:${event}`);
  }
  if (/localStorage|sessionStorage|indexedDB|speechSynthesis|OscillatorNode|createOscillator/i.test(html)) {
    throw new Error("discovery_forbidden_runtime_capability");
  }
  return html;
}

function discoveryArtifactLocations(input: { rootDir: string; childId: string; homeworkId: string }) {
  if (!/^[\w.-]+$/.test(input.homeworkId)) throw new Error("discovery_homework_id_invalid");
  const storageDir = path.join(resolveChildContextDir(input.childId, { rootDir: input.rootDir }), "homework", "games", input.homeworkId);
  const launchBase = `/api/homework/game/${encodeURIComponent(input.childId)}/${encodeURIComponent(input.homeworkId)}`;
  return {
    storageDir,
    htmlFile: path.join(storageDir, "discovery.html"),
    artworkFile: path.join(storageDir, "discovery-background.svg"),
    htmlPath: `${launchBase}/discovery.html`,
    artworkPath: `${launchBase}/discovery-background.svg`,
  };
}

export async function ensureDiscoveryArtifactsAreServed(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  contract: MathDiscoveryEvaluationContract;
}): Promise<MathDiscoveryEvaluationContract> {
  const rootDir = input.rootDir ?? process.cwd();
  const locations = discoveryArtifactLocations({ rootDir, childId: input.childId, homeworkId: input.homeworkId });
  fs.mkdirSync(locations.storageDir, { recursive: true });
  const legacyHtml = path.join(rootDir, "public", "games", input.homeworkId, "discovery.html");
  const legacyArtwork = path.join(rootDir, "public", "generated", input.homeworkId, "discovery-background.svg");
  let migrated = false;
  if (!fs.existsSync(locations.htmlFile) && fs.existsSync(legacyHtml)) {
    fs.copyFileSync(legacyHtml, locations.htmlFile);
    migrated = true;
  }
  if (!fs.existsSync(locations.artworkFile) && fs.existsSync(legacyArtwork)) {
    fs.copyFileSync(legacyArtwork, locations.artworkFile);
    migrated = true;
  }
  if (!fs.existsSync(locations.htmlFile) || !fs.existsSync(locations.artworkFile)) {
    throw new Error(`discovery_published_artifact_missing:html=${fs.existsSync(locations.htmlFile)}:artwork=${fs.existsSync(locations.artworkFile)}`);
  }
  const html = fs.readFileSync(locations.htmlFile, "utf8");
  const draftDir = resolveAdaptiveMathDraftDir(input.childId, input.homeworkId, { rootDir });
  try {
    if (hashDiscoveryContract(html) !== input.contract.artifact.artifactHash) throw new Error("discovery_artifact_hash_mismatch");
    await verifyDiscoveryRuntimeScoring({ html, academic: input.contract, outputDir: path.join(draftDir, "runtime-verification") });
  } catch (error) {
    invalidateEngineeringRepairEvidence(path.join(draftDir, "provider-diagnostics/discovery.engineering-repair.json"));
    throw error;
  }
  const contract = {
    ...input.contract,
    artifact: {
      ...input.contract.artifact,
      htmlPath: locations.htmlPath,
      artworkPath: locations.artworkPath,
    },
  };
  atomicJson(path.join(resolveChildContextDir(input.childId, { rootDir }), "homework", "direct-drafts", input.homeworkId, "discovery-contract.json"), contract);
  console.log(` 🎮 [adaptive-math] [discovery-artifacts] [${migrated ? "migrated" : "verified"}] child=${input.childId} homework=${input.homeworkId}`);
  return contract;
}

/** One durable receipt boundary for Discovery and targeted Creator work. */
export function hasReceivedMathProviderStage(draftDir: string, stage: string): boolean {
  const receipts = path.join(draftDir, "provider-receipts");
  const stageFile = path.join(receipts, `${stage}.stage.json`);
  if (!fs.existsSync(stageFile)) return false;
  const saved = JSON.parse(fs.readFileSync(stageFile, "utf8"));
  if (!/^[a-f0-9]{64}$/.test(saved?.requestHash)) throw new Error(`provider_receipt_invalid:${stageFile}`);
  const receiptFile = path.join(receipts, `${saved.requestHash}.json`);
  if (!fs.existsSync(receiptFile)) throw new Error(`provider_receipt_invalid:${receiptFile}`);
  const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
  return receipt.status === "received" && receipt.response != null;
}

export async function runMathProviderStage<T>(input: {
  draftDir: string; stage: string; model: string; request: unknown;
  execute: () => Promise<T>; beforeRequest?: () => void; retryUncertain?: boolean;
}): Promise<T> {
  const provider = input.model.startsWith("gpt-") ? "openai" : "anthropic";
  const requestHash = hashDiscoveryContract({ provider, request: input.request });
  const receipts = path.join(input.draftDir, "provider-receipts");
  const stageFile = path.join(receipts, `${input.stage}.stage.json`);
  const readReceipt = (file: string): {status: string; response?: T; requestHash?: string} | undefined => {
    if (!fs.existsSync(file)) return undefined;
    try { const value=JSON.parse(fs.readFileSync(file,"utf8")); if (!value || typeof value!=="object") throw new Error("invalid"); return value; }
    catch { throw new Error(`provider_receipt_invalid:${file}`); }
  };
  const stage = readReceipt(stageFile);
  if (stage && (typeof stage.requestHash!=="string" || !/^[a-f0-9]{64}$/.test(stage.requestHash))) throw new Error(`provider_receipt_invalid:${stageFile}`);
  const receiptFile = path.join(receipts, `${requestHash}.json`);
  const priorFile = stage?.requestHash ? path.join(receipts,`${stage.requestHash}.json`) : receiptFile;
  const prior = readReceipt(priorFile);
  if (stage && !prior) throw new Error(`provider_receipt_invalid:${priorFile}`);
  if (prior?.status === "received" && priorFile !== receiptFile) throw new Error(`provider_stage_request_changed:${input.stage}`);
  if (prior?.status==="in_flight" && (!input.retryUncertain || priorFile!==receiptFile)) throw new Error(`provider_outcome_uncertain:${priorFile}`);
  const saved = readReceipt(receiptFile);
  if (saved && (!["received","rejected","in_flight"].includes(saved.status) || (saved.status==="received" && !saved.response))) throw new Error(`provider_receipt_invalid:${receiptFile}`);
  if (saved?.status==="received") return saved.response!;
  if (saved?.status==="in_flight" && !input.retryUncertain) throw new Error(`provider_outcome_uncertain:${receiptFile}`);
  input.beforeRequest?.();
  atomicJson(stageFile, {requestHash});
  atomicJson(receiptFile, {status:"in_flight",model:input.model,startedAt:new Date().toISOString()});
  try {
    const response = await input.execute();
    atomicJson(receiptFile, {status:"received",provider,model:input.model,response,receivedAt:new Date().toISOString()});
    return response;
  } catch (error) {
    const status = (error as {status?: number}).status;
    if (status && status>=400 && status<500) atomicJson(receiptFile, {status:"rejected",model:input.model,code:status});
    console.error(` 🎮 [adaptive-math] [provider-request] [${status ? "rejected" : "outcome-uncertain"}] receipt=${receiptFile}`);
    if (!status || status>=500) throw new Error(`provider_outcome_uncertain:${receiptFile}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export async function generateMathDiscoveryExperience(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  assignmentText: string;
  assignmentSource?: AssignmentSourceExtraction;
  assignmentEvidenceIds: string[];
  factualChildContext: unknown;
  client?: Anthropic;
  plannerModel?: string;
  architectModel?: string;
  builderModel?: string;
  repairModel?: string;
  retryUncertain?: boolean;
  visualReview?: (input: { html: string; draftDir: string }) => Promise<string>;
}): Promise<{ contract: MathDiscoveryEvaluationContract; design: Record<string, unknown> }> {
  const rootDir = input.rootDir ?? process.cwd();
  const client = () => input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const draftDir = path.join(resolveChildContextDir(input.childId, { rootDir }), "homework", "direct-drafts", input.homeworkId);
  const academicCheckpointFile = path.join(draftDir, "discovery-academic.json");
  const designCheckpointFile = path.join(draftDir, "discovery-design.json");
  const builderCheckpointFile = path.join(draftDir, "discovery-builder.json");
  const readCheckpoint = <T>(file: string): T | undefined => {
    if (!fs.existsSync(file)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as T;
    } catch (error) {
      console.warn(` 🎮 [adaptive-math] [checkpoint] [invalid] file=${file} reason=${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };
  const create = async (model: string, prompt: string | Array<Record<string, unknown>>, tool?: { name: string; schema: Record<string, unknown> }): Promise<unknown> => {
    const provider = model.startsWith("gpt-") ? "openai" : "anthropic";
    const request = {
      model,
      max_tokens: tool ? 12_000 : 48_000,
      messages: [{ role: "user", content: tool?.name === "create_math_discovery_contract" && input.assignmentSource && typeof prompt === "string" ? assignmentPlannerContent(input.assignmentSource,prompt) : prompt }],
      ...(tool ? { tools: [{ name: tool.name, description: "Return the requested frozen artifact.", input_schema: tool.schema }], tool_choice: { type: "tool", name: tool.name } } : {}),
    };
    return runMathProviderStage({draftDir, stage: tool?.name ?? (Array.isArray(prompt) ? "repair" : "builder"), model, request, retryUncertain: input.retryUncertain, beforeRequest: () => {
      if (provider === "openai" && !process.env.OPENAI_API_KEY?.trim()) throw new Error("preflight_missing:OPENAI_API_KEY");
      if (provider === "anthropic" && !input.client && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new Error("preflight_missing:ANTHROPIC_API_KEY");
    }, execute: async () => {
      let response: unknown;
      if (provider === "openai") {
        if (tool) throw new Error("discovery_openai_text_generation_only");
        const apiResponse = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            input: typeof prompt === "string"
              ? prompt
              : [{ role: "user", content: buildOpenAiDiscoveryRepairInput(prompt) }],
            reasoning: { effort: "high" },
            max_output_tokens: 48_000,
            stream: true,
            store: false,
          }),
          signal: AbortSignal.timeout(Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600_000)),
        });
        if (!apiResponse.ok) {
          const failure = new Error(`discovery_openai_failed:${apiResponse.status}:${(await apiResponse.text()).slice(0, 800)}`) as Error & { status?: number };
          failure.status = apiResponse.status;
          throw failure;
        }
        const streamed = await readOpenAiResponseStream(apiResponse);
        if (streamed.stopReason !== "completed") throw new Error(`discovery_openai_incomplete:${streamed.stopReason}`);
        response = {
          provider,
          model,
          content: [{ type: "text", text: streamed.raw }],
          stop_reason: streamed.stopReason,
          usage: { input_tokens: streamed.inputTokens, output_tokens: streamed.outputTokens },
        };
      } else {
        response = await client().messages.stream(request as never, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600_000), maxRetries: 0 }).finalMessage();
      }
      return response;
    }});
  };
  const common = `ASSIGNMENT EVIDENCE IDS:\n${JSON.stringify(input.assignmentEvidenceIds)}\n\nASSIGNMENT:\n${input.assignmentText}\n\nFACTUAL CHILD CONTEXT:\n${JSON.stringify(input.factualChildContext, null, 2)}`;
  let academic = readCheckpoint<DiscoveryAcademicContract>(academicCheckpointFile);
  if (academic) {
    console.log(` 🎮 [adaptive-math] [discovery-planner] [reused] child=${input.childId} homework=${input.homeworkId}`);
  } else {
    console.log(` 🎮 [adaptive-math] [discovery-planner] [running] child=${input.childId} homework=${input.homeworkId}`);
    const plannerResponse = await create(input.plannerModel ?? process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5", `You are Sunny's Academic Planner. Create one independent opening mathematics evaluation that determines what the child already knows and where evidence is missing. Author fresh items without copying the assignment. Keep visible question text separate from representation specifications: never state the answer or transcribe bar heights into a graph-reading question. The visible question, diagram, axis labels, and accepted answer must be consistent. Use prior academic observations to target missing evidence; do not infer learning styles. For each item ask whether it can be answered without using the claimed construct; revise it before returning if it can. Construct IDs are evidence labels: do not name a numeric strategy or interval (for example, by-tens) unless every linked item actually measures that exact strategy or interval. Before returning, compare each construct ID against each linked prompt, representation, and accepted answer. Each item must identify its construct, response contract, accepted answers, difficulty boundary, exposure identity, possible confounds, falsifying evidence, and measurement keys. Collect independent evidence before teaching or answer exposure. Prefer the lowest-friction response mode that preserves the mathematics. Do not choose presentation, characters, mechanics, sound, rewards, or implementation. Do not declare mastery.\n\n${common}`, {
      name: "create_math_discovery_contract",
      schema: { type: "object", additionalProperties: false, required: ["evaluationId", "title", "assignmentEvidenceIds", "constructs", "items"], properties: {
        evaluationId: { type: "string" }, title: { type: "string" }, assignmentEvidenceIds: { type: "array", items: { type: "string" } },
        constructs: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["constructId", "prerequisiteIds"], properties: { constructId: { type: "string" }, prerequisiteIds: { type: "array", items: { type: "string" } } } } },
        items: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["itemId", "constructId", "prompt", "representationSpec", "responseContract", "correctAnswerContract", "difficultyBoundary", "exposureId", "possibleConfounds", "falsifyingEvidence", "measurementKeys"], properties: { itemId: { type: "string" }, constructId: { type: "string" }, prompt: { type: "string" }, representationSpec: { type: "string", description: "Frozen academic diagram data, axes, labels, and scale. Do not include the answer in visible question text." }, responseContract: { type: "object", additionalProperties: false, required: ["mode", "representationId"], properties: { mode: { type: "string", enum: ["tap_selection", "tap_numeric_pad", "drag_construct"] }, representationId: { type: "string" } } }, correctAnswerContract: { type: "object", additionalProperties: false, required: ["acceptedValues"], properties: { acceptedValues: { type: "array", minItems: 1, items: { type: "string" } } } }, difficultyBoundary: { type: "string" }, exposureId: { type: "string" }, possibleConfounds: { type: "array", items: { type: "string" } }, falsifyingEvidence: { type: "array", items: { type: "string" } }, measurementKeys: { type: "array", items: { type: "string" } } } } },
      } },
    });
    academic = toolInput(plannerResponse, "create_math_discovery_contract") as DiscoveryAcademicContract;
    assertDiscoveryResponseContracts(academic);
    assertDiscoveryConstructSemantics(academic);
    atomicJson(academicCheckpointFile, academic);
  }
  assertDiscoveryResponseContracts(academic);
  assertDiscoveryConstructSemantics(academic);
  const contractHash = hashDiscoveryContract(academic);
  const runtimeContractJson = JSON.stringify(expectedDiscoveryRuntimeContract(academic));
  console.log(` 🎮 [adaptive-math] [discovery-planner] [saved] hash=${contractHash.slice(0, 12)}`);
  let designed = readCheckpoint<Record<string, unknown>>(designCheckpointFile);
  if (designed && designed.contractHash !== contractHash) {
    console.warn(` 🎮 [adaptive-math] [discovery-design] [invalid] reason=contract_hash_mismatch`);
    designed = undefined;
  }
  if (designed) {
    console.log(` 🎮 [adaptive-math] [discovery-design] [reused] child=${input.childId} homework=${input.homeworkId}`);
  } else {
    const architectResponse = await create(input.architectModel ?? process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5", `You are Sunny's Experience Creator. Design the frozen independent evaluation below for the child and device. Choose the presentation, interaction, pacing, stakes, recovery, visual language, motion, sound cues, and payoff. Make the first action immediately understandable and make mathematics visibly control the interaction. Do not teach or reveal an answer before the first committed response to an item. Never trap the child. Preserve the contract exactly.\n\nCONTRACT HASH: ${contractHash}\n${JSON.stringify(academic, null, 2)}\n\n${common}`, {
      name: "create_math_discovery_design",
      schema: { type: "object", additionalProperties: false, required: ["contractHash", "design", "backgroundSvg"], properties: { contractHash: { type: "string" }, design: { type: "object", additionalProperties: true }, backgroundSvg: { type: "string" } } },
    });
    designed = toolInput(architectResponse, "create_math_discovery_design");
    atomicJson(designCheckpointFile, designed);
  }
  if (designed.contractHash !== contractHash) throw new Error("discovery_design_changed_contract_hash");
  const { designHash: _legacyDesignHash, ...stableDesigned } = designed;
  designed = stableDesigned;
  const designHash = hashDiscoveryContract(stableDesigned);
  console.log(` 🎮 [adaptive-math] [discovery-design] [saved] hash=${designHash.slice(0, 12)}`);
  const builderModel = input.builderModel ?? process.env.SUNNY_GENERATION_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5";
  const repair = resolveDiscoveryRepairModel({
    builderModel,
    environment: { ...process.env, ...(input.repairModel ? { SUNNY_DISCOVERY_REPAIR_MODEL: input.repairModel } : {}) },
  });
  const builderPrompt = `You are Sunny's Experience Creator implementing a frozen academic contract and frozen design. Return one complete standalone HTML document usable at both 1365x768 and 1280x720. It must work with touch or mouse without a keyboard and never trap the child. Keep every required action fully visible without scrolling, and keep every mathematical representation large and legible enough for a child to inspect. Post evaluation_ready and evaluation_complete to window.parent. For every committed response post evaluation_attempt with exactly this payload shape: {attemptId,itemId,attemptedValue,supportEventIds:[],instrumentSignals:[],observedAt}. attemptedValue is the selected value or a stable JSON serialization of constructed state. supportEventIds contains only real support events supplied to the activity; otherwise it is empty. instrumentSignals may contain only interface_friction, reading_friction, response_not_captured, scoring_disagreement, or prompt_ambiguity; otherwise it is empty. Do not post construct, correctness, exposure, assistance, or responseMode because the server derives those facts. Post evaluation_friction when relevant without replacing the attempt. ${MATH_JOURNEY_CONTRACT} Accumulate all observed item friction into instrumentSignals on that item's evaluation_attempt. It may not access Sunny APIs, storage, currency, or child state. Do not use browser speech synthesis or oscillator audio. Do not change the contract or answers. Expose the real side-effect-free scoring function through window.__SUNNY_DISCOVERY_TEST__.evaluate(itemId, attemptedValue), returning { itemId, constructId, correct } from the exact same scoring logic as the child-facing controls. Embed this exact JSON without alteration in <script id="sunny-discovery-contract" type="application/json">: ${runtimeContractJson}\n\nACADEMIC CONTRACT HASH: ${contractHash}\n${JSON.stringify(academic, null, 2)}\n\nDESIGN HASH: ${designHash}\n${JSON.stringify(designed.design, null, 2)}`;
  const builderEngineering = freezeEngineeringLessonSnapshot({ snapshotFile: path.join(draftDir, "discovery-builder-engineering.snapshot.json"), auditRoot: resolveContextRoot({ rootDir }), features: engineeringFeatures(JSON.stringify(designed.design)), verifierVersion: DISCOVERY_VERIFIER_VERSION, preserveCompleted: fs.existsSync(builderCheckpointFile) || hasReceivedMathProviderStage(draftDir, "builder") });
  const completedAwareBuilderPrompt = builderPrompt + engineeringLessonContext(builderEngineering);
  const builderPromptHash = hashDiscoveryContract({ model: builderModel, prompt: completedAwareBuilderPrompt });
  type HtmlCheckpoint = { contractHash: string; designHash: string; builderPromptHash: string; html: string };
  let initialHtml: string;
  const savedBuilder = readCheckpoint<HtmlCheckpoint>(builderCheckpointFile);
  if (savedBuilder?.contractHash === contractHash && savedBuilder.designHash === designHash
    && savedBuilder.builderPromptHash === builderPromptHash) {
    validateDiscoveryAcademicBinding(savedBuilder.html, academic);
    initialHtml = savedBuilder.html;
    console.log(` 🎮 [adaptive-math] [discovery-builder] [reused] hash=${hashDiscoveryContract(initialHtml).slice(0, 12)}`);
  } else {
    console.log(` 🎮 [adaptive-math] [discovery-builder] [running] model=${builderModel}`);
    const builderResponse = await create(builderModel, completedAwareBuilderPrompt);
    const builderResult = builderResponse as {
      stop_reason?: string | null;
      usage?: { input_tokens?: number; output_tokens?: number };
      content?: unknown[];
    };
    const rawBuilderText = responseText(builderResponse);
    const builderDiagnosticFile = path.join(draftDir, "provider-diagnostics", "discovery-builder-response.json");
    atomicJson(builderDiagnosticFile, {
      model: builderModel,
      stopReason: builderResult.stop_reason ?? "unknown",
      usage: builderResult.usage ?? {},
      content: builderResult.content ?? [],
      textCharacters: rawBuilderText.length,
    });
    if (builderResult.stop_reason === "max_tokens") {
      throw new Error(`discovery_builder_truncated:stop=max_tokens:chars=${rawBuilderText.length}:diagnostic=${builderDiagnosticFile}`);
    }
    if (!rawBuilderText.trim()) {
      throw new Error(`discovery_builder_contract_failed:stop=${builderResult.stop_reason ?? "unknown"}:chars=0:diagnostic=${builderDiagnosticFile}`);
    }
    initialHtml = standaloneHtml(rawBuilderText);
    validateDiscoveryAcademicBinding(initialHtml, academic);
    atomicJson(builderCheckpointFile, { contractHash, designHash, builderPromptHash, html: initialHtml });
  }
  let html: string;
    console.log(" 🎮 [adaptive-math] [discovery-review] [running] viewports=1365x768,1280x720");
    html = input.visualReview
      ? await input.visualReview({ html: initialHtml, draftDir })
      : (await reviewDiscoveryCandidate({
        html: initialHtml,
        outputDir: path.join(draftDir, "visual-review"),
        render: renderDiscoveryCandidate,
        verificationKey: contractHash,
        verify: html => verifyDiscoveryRuntimeScoring({html, academic, outputDir: path.join(draftDir, "runtime-verification")}),
        repair: async ({ html: rejectedHtml, issues, screenshotPaths }) => {
          console.log(` 🎮 [adaptive-math] [discovery-builder-repair] [running] provider=${repair.provider} model=${repair.model}`);
          const repairPrompt = buildDiscoveryRepairPrompt({
            issues,
            runtimeContractJson,
            contractHash,
            academic,
            designHash,
            design: designed.design,
            html: rejectedHtml,
          });
          const repairStartedAt = Date.now();
          const repairEngineering = freezeEngineeringLessonSnapshot({ snapshotFile: path.join(draftDir, "discovery-repair-engineering.snapshot.json"), auditRoot: resolveContextRoot({ rootDir }), features: engineeringFeatures(rejectedHtml), defects: issues, verifierVersion: DISCOVERY_VERIFIER_VERSION, preserveCompleted: hasReceivedMathProviderStage(draftDir, "repair") });
          const repairedResponse = await create(repair.model, buildDiscoveryRepairMessageContent(screenshotPaths, repairPrompt + engineeringLessonContext(repairEngineering)));
          const repairFinishedAt = Date.now();
          const repairedText = responseText(repairedResponse);
          const inputTokens = Number((repairedResponse as { usage?: { input_tokens?: number } }).usage?.input_tokens ?? 0);
          const outputTokens = Number((repairedResponse as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0);
          const estimatedCostUsd = estimateDiscoveryRepairCost({ provider: repair.provider, inputTokens, outputTokens });
          atomicJson(path.join(draftDir, "provider-diagnostics", "discovery-builder-repair-response.json"), {
            provider: repair.provider,
            model: repair.model,
            estimatedCostUsd,
            ...buildDiscoveryRepairDiagnostic({
              response: repairedResponse as { stop_reason?: string | null; usage?: unknown },
              textCharacters: repairedText.length,
              screenshotPaths,
              issues,
              startedAt: repairStartedAt,
              finishedAt: repairFinishedAt,
            }),
          });
          const appliedPatch = applyDiscoveryHtmlPatch(rejectedHtml, repairedText);
          const repairedHtml = appliedPatch.html;
          validateDiscoveryAcademicBinding(repairedHtml, academic);
          if (appliedPatch.engineeringLesson) recordEngineeringRepairEvidence({ file: path.join(draftDir, "provider-diagnostics/discovery.engineering-repair.json"), verifierVersion: DISCOVERY_VERIFIER_VERSION, originalHash: hashDiscoveryContract(rejectedHtml), repairedHash: hashDiscoveryContract(repairedHtml), academicHash: contractHash, designHash, issues, proposal: appliedPatch.engineeringLesson, inputTokens, outputTokens, latencyMs: repairFinishedAt - repairStartedAt, costUsd: estimatedCostUsd });
          console.log(` 🎮 [adaptive-math] [discovery-builder-repair] [saved] model=${repair.model} replacements=${appliedPatch.replacementCount} changedOriginalCharacters=${appliedPatch.changedOriginalCharacters} hash=${hashDiscoveryContract(repairedHtml).slice(0, 12)} latencyMs=${repairFinishedAt - repairStartedAt} estimatedCostUsd=${estimatedCostUsd.toFixed(6)}`);
          return repairedHtml;
        },
        })).html;
    validateDiscoveryAcademicBinding(html, academic);
  validateDiscoveryAcademicBinding(html, academic);
  console.log(" 🎮 [adaptive-math] [discovery-runtime-verification] [running] scoring=frozen-contract");
  if (input.visualReview) await verifyDiscoveryRuntimeScoring({ html, academic, outputDir: path.join(draftDir, "runtime-verification") });
  if (!input.visualReview) verifyEngineeringRepairEvidence(path.join(draftDir, "provider-diagnostics/discovery.engineering-repair.json"), { artifactHash: hashDiscoveryContract(html), academicHash: contractHash, designHash, verifierVersion: DISCOVERY_VERIFIER_VERSION, runtime: true, scoring: true, contracts: true, viewports: DISCOVERY_RELEASE_VIEWPORTS.map(viewport => `${viewport.width}x${viewport.height}`) });
  const locations = discoveryArtifactLocations({ rootDir, childId: input.childId, homeworkId: input.homeworkId });
  fs.mkdirSync(locations.storageDir, { recursive: true });
  for (const [file,content] of [[locations.htmlFile,html],[locations.artworkFile,String(designed.backgroundSvg)]]) {
    if (fs.existsSync(file)) {
      if (fs.readFileSync(file,"utf8")!==content) throw new Error(`discovery_immutable_artifact_mismatch:${file}`);
    } else {
      const temporary=`${file}.${randomUUID()}.tmp`;
      try {fs.writeFileSync(temporary,content,"utf8");fs.linkSync(temporary,file);}
      finally {fs.rmSync(temporary,{force:true});}
    }
  }
  const contract: MathDiscoveryEvaluationContract = { ...academic, artifact: { artifactId: `${input.homeworkId}:discovery`, htmlPath: locations.htmlPath, artworkPath: locations.artworkPath, contractHash, artifactHash: hashDiscoveryContract(html) } };
  atomicJson(path.join(draftDir, "discovery-contract.json"), contract);
  atomicJson(designCheckpointFile, designed);
  console.log(` 🎮 [adaptive-math] [discovery-builder] [saved] hash=${contract.artifact.artifactHash.slice(0, 12)}`);
  return { contract, design: designed };
}

export type MathDiscoveryAttempt = {
  attemptId: string;
  itemId: string;
  attemptedValue: string;
  supportEventIds: string[];
  instrumentSignals: string[];
  observedAt: string;
};

export type DiscoveryEvidenceSummary = {
  version: 1;
  homeworkId: string;
  evaluationId: string;
  coverage?: { assigned: number; attempted: number; untestedItemIds: string[]; complete: boolean };
  spellingTargets?: Array<{
    word: string;
    itemId: string;
    constructId: string;
    attempts: number;
    independentCorrect: number;
    independentIncorrect: number;
    assisted: number;
    ambiguous: number;
    observationIds: string[];
  }>;
  constructs: Array<{
    constructId: string;
    independentCorrect: number;
    independentIncorrect: number;
    assisted: number;
    ambiguous: number;
    responseModes: string[];
    representationIds: string[];
    representationCount: number;
    confounds: string[];
    observationIds: string[];
  }>;
};

export type TargetedMathNode = {
  nodeId: string;
  title: string;
  academicTarget: string;
  algorithmOwner: string;
  theoryId: string;
  experimentId: string;
  mechanic: string;
  theme: string;
  routeId?: string;
};

export type MathGenerationNodeStatus = "preparing" | "ready" | "evidence_locked" | "completed" | "failed_resumable" | "needs_attention";

export type MathGenerationJob = {
  version: 1;
  childId: string;
  homeworkId: string;
  phase: "targeted_planning" | "board_designing" | "board_generating" | "board_ready" | "needs_attention";
  programHash: string;
  designHash: string;
  startedAt: string;
  updatedAt: string;
  error?: string;
  nodes: Array<{
    nodeId: string;
    status: MathGenerationNodeStatus;
    artifactHash?: string;
    error?: string;
    attemptCount?: number;
    updatedAt: string;
  }>;
};

type RootOptions = Pick<ContextRootOptions, "rootDir" | "contextRoot" | "env">;

export function resolveAdaptiveMathDraftDir(
  childId: string,
  homeworkId: string,
  opts: RootOptions = {},
): string {
  return path.join(
    resolveChildContextDir(childId, opts),
    "homework",
    "direct-drafts",
    homeworkId,
  );
}

function generationJobPath(childId: string, homeworkId: string, opts: RootOptions): string {
  return path.join(resolveAdaptiveMathDraftDir(childId, homeworkId, opts), "adaptive-generation-job.json");
}

function generationLeasePath(childId: string, homeworkId: string, opts: RootOptions): string {
  return `${generationJobPath(childId, homeworkId, opts)}.worker-lock`;
}

export function acquireMathGenerationLease(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  ownerPid?: number;
  staleAfterMs?: number;
}): { acquired: boolean; token?: string; reason?: "worker_already_running" } {
  const file = generationLeasePath(input.childId, input.homeworkId, input);
  const token = randomUUID();
  const payload = { token, ownerPid: input.ownerPid ?? process.pid, acquiredAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tryCreate = (): boolean => {
    try {
      const temporary=`${file}.${token}.tmp`;
      try {fs.writeFileSync(temporary,`${JSON.stringify(payload)}\n`,"utf8");fs.linkSync(temporary,file);}
      finally {fs.rmSync(temporary,{force:true});}
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return false;
    }
  };
  if (tryCreate()) {
    console.log(` 🎮 [adaptive-math] [worker-lease] [acquired] child=${input.childId} homework=${input.homeworkId}`);
    return { acquired: true, token };
  }
  let stale = false, savedBytes = "";
  try {
    savedBytes=fs.readFileSync(file,"utf8");
    const saved = JSON.parse(savedBytes) as { acquiredAt?: string; ownerPid?: number };
    let alive = false;
    if (saved.ownerPid && Number.isInteger(saved.ownerPid) && saved.ownerPid > 0) {
      try { process.kill(saved.ownerPid, 0); alive = true; }
      catch (error) { alive = (error as NodeJS.ErrnoException).code !== "ESRCH"; }
    }
    const ageMs = Date.now() - Date.parse(saved.acquiredAt ?? "");
    stale = !alive && (Boolean(saved.ownerPid) || (Number.isFinite(ageMs) && ageMs > (input.staleAfterMs ?? 30 * 60_000)));
  } catch {console.warn(` 🎮 [adaptive-math] [worker-lease] [unreadable] file=${file}`);}
  if (stale) {
    const reclaim=`${file}.reclaim`;
    let ownsReclaim=false;
    try {
      fs.mkdirSync(reclaim);ownsReclaim=true;
      if (fs.existsSync(file) && fs.readFileSync(file,"utf8")===savedBytes) fs.rmSync(file);
      if (tryCreate()) {
        console.log(` 🎮 [adaptive-math] [worker-lease] [recovered-stale] child=${input.childId} homework=${input.homeworkId}`);
        return { acquired: true, token };
      }
    } catch(error) {if ((error as NodeJS.ErrnoException).code==="EEXIST") throw new Error(`math_generation_reclaim_needs_attention:${reclaim}`); throw error;}
    finally {if(ownsReclaim)fs.rmdirSync(reclaim);}
  }
  console.log(` 🎮 [adaptive-math] [worker-lease] [already-running] child=${input.childId} homework=${input.homeworkId}`);
  return { acquired: false, reason: "worker_already_running" };
}

export function releaseMathGenerationLease(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  token: string;
}): void {
  const file = generationLeasePath(input.childId, input.homeworkId, input);
  if (!fs.existsSync(file)) return;
  const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { token?: string };
  if (saved.token !== input.token) throw new Error("math_generation_worker_lease_owner_mismatch");
  fs.rmSync(file, { force: true });
  console.log(` 🎮 [adaptive-math] [worker-lease] [released] child=${input.childId} homework=${input.homeworkId}`);
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

function evaluationNode(contract: MathDiscoveryEvaluationContract): LearningCycleNodeContract {
  return {
    nodeId: contract.evaluationId,
    role: "evaluation",
    title: contract.title,
    state: "ready",
    academicTarget: {
      domain: "math",
      skill: "independent_discovery",
      targets: contract.constructs.map((construct) => construct.constructId),
    },
    algorithmOwner: "independent-probe",
    theoryId: `${contract.evaluationId}:opening-theory`,
    experimentId: contract.evaluationId,
    mechanic: "ai-authored-independent-evaluation",
    theme: "ai-authored",
    openingScreen: { title: contract.title, purpose: "Show Sunny what you already understand." },
    generationPrompt: null,
    prediction: {
      claim: "The opening evaluation will distinguish prior understanding from interface or support effects.",
      createdAt: new Date().toISOString(),
      evidenceLimit: "independent_performance",
    },
    artifactBinding: {
      contentId: `${contract.evaluationId}:content`,
      artifactId: contract.artifact.artifactId,
      localArtifactPath: contract.artifact.htmlPath,
      localArtworkPath: contract.artifact.artworkPath,
      contractFingerprint: contract.artifact.contractHash,
      validationStatus: "passed",
      creativeProvenance: {
        rationale: "AI-authored independent evaluation.",
        qualityPrediction: "The evaluation will reveal prerequisite evidence without teaching first.",
        creatorPromptHash: contract.artifact.contractHash,
        artworkPromptHash: contract.artifact.artifactHash,
        generatedHtmlHash: contract.artifact.artifactHash,
      },
    },
    artwork: { status: "ready", localPath: contract.artifact.artworkPath, prompt: null },
    sfxContract: ["interaction", "recovery", "completion"],
    companionContract: { events: ["help_requested", "evaluation_complete"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
  };
}

export function buildDiscoveryActiveSessionPlan(input: {
  childId: string;
  homeworkId: string;
  evaluation: MathDiscoveryEvaluationContract;
  companion: { id: string; name: string };
  createdAt?: string;
}): ActiveSessionPlan {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const evaluationId = input.evaluation.evaluationId;
  return {
    planId: `discovery:${input.homeworkId}`,
    childId: input.childId,
    createdAt,
    source: "ingest_human_loop",
    activeHomeworkId: input.homeworkId,
    domain: "math",
    testDate: null,
    nodePlan: [{
      id: evaluationId,
      type: "generated-baseline",
      activityId: "generated-baseline",
      targets: input.evaluation.constructs.map((construct) => construct.constructId),
      difficulty: 1,
      source: "chart_planner",
      locked: false,
      title: input.evaluation.title,
      gameHtmlPath: input.evaluation.artifact.htmlPath,
      date: input.homeworkId,
      thumbnailUrl: input.evaluation.artifact.artworkPath,
      contentId: `${input.homeworkId}:${evaluationId}`,
      targetLane: "independent_discovery",
    }],
    learningRoutes: [],
    adventureBoard: {
      schemaVersion: 1,
      boardId: `discovery:${input.homeworkId}`,
      planId: `discovery:${input.homeworkId}`,
      childId: input.childId,
      domain: "math",
      title: input.evaluation.title,
      theme: {
        background: { type: "image", value: input.evaluation.artifact.artworkPath },
        palette: { path: "#fff4c2", completed: "#34d399", available: "#7c3aed", locked: "#64748b", current: "#f59e0b", preview: "#94a3b8", text: "#ffffff", panel: "rgba(15,23,42,.82)" },
      },
      layout: { preset: "horizontal-adventure-spine", companionSlot: "right" },
      nodes: [
        { id: "start", kind: "start", label: "Start", state: "completed", slot: "1" },
        { id: evaluationId, kind: "activity", activityId: "generated-baseline", label: input.evaluation.title, shortLabel: "Discovery", state: "current", slot: "2", evidenceRole: "baseline", action: { type: "launch-activity", payloadId: evaluationId }, thumbnailUrl: input.evaluation.artifact.artworkPath },
      ],
      edges: [{ id: `start-${evaluationId}`, from: "start", to: evaluationId, state: "available" }],
      companion: input.companion,
      progress: { currentNodeId: evaluationId, completedNodeIds: ["start"] },
    },
    variationPolicy: { avoidExactPreviousNodeOrder: true, avoidExactPreviousWordOrder: true, seed: input.homeworkId, previousCompletedNodeCount: 0 },
    companionPolicy: { companionId: input.companion.id, displayName: input.companion.name, openingLinePolicy: "silent", verbosity: "low", maxMicroProbes: 1 },
    evidenceUsed: input.evaluation.assignmentEvidenceIds.map((id) => ({ id, type: "assignment", summary: "Captured assignment evidence for Discovery." })),
    openQuestions: [],
    approvalStatus: "approved",
    planTheory: { hypothesis: "Discovery will establish the independent starting point.", evidenceSummary: input.evaluation.assignmentEvidenceIds, intervention: "independent Discovery evaluation", supportCriteria: ["Fresh unassisted evidence is observed."], reviseCriteria: ["Instrument confounds limit interpretation."], falsifyCriteria: ["The evaluation cannot distinguish learning from instrument friction."] },
  };
}

export function publishDiscoveryExperience(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  evaluation?: MathDiscoveryEvaluationContract;
  spellingItems?: LearningCycleSpellingItem[];
  activeSessionPlan: ActiveSessionPlan;
  assignment: LearningCycleRecordV2["assignment"];
}): void {
  const rootDir = input.rootDir ?? process.cwd();
  const contextDir = resolveChildContextDir(input.childId, { rootDir });
  const planPath = path.join(contextDir, "plans", "active_session_plan.json");
  const homeworkPath = path.join(contextDir, "homework", "current.json");
  const profilePath = path.join(contextDir, "learning_profile.json");
  const native = input.spellingItems;
  const evaluation = input.evaluation;
  if (Boolean(native) === Boolean(evaluation)) throw new Error("discovery_publication_contract_required");
  const domain = native ? "spelling" : "math";
  const artifactHash = native ? hashDiscoveryContract(native) : evaluation!.artifact.artifactHash;
  if (native) {
    const node = input.activeSessionPlan.nodePlan[0];
    if (!native.length || input.activeSessionPlan.domain !== "spelling" || input.activeSessionPlan.nodePlan.length !== 1
      || node?.activityId !== "word-radar" || node.wordRadarConfig?.recallMode !== "hidden_word_recall"
      || node.wordRadarConfig?.hideWordDuringResponse !== true || node.wordRadarConfig?.showTimer !== false
      || JSON.stringify(node.targets) !== JSON.stringify(native.map(item => item.word))) throw new Error("spelling_discovery_publication_contract_mismatch");
  } else {
  const locations=discoveryArtifactLocations({rootDir,childId:input.childId,homeworkId:input.homeworkId});
  const proofFile=path.join(resolveAdaptiveMathDraftDir(input.childId,input.homeworkId,{rootDir}),"runtime-verification/acceptance.json");
  if (!fs.existsSync(proofFile) || !fs.existsSync(locations.htmlFile)) throw new Error("discovery_publication_acceptance_missing");
  const proof=JSON.parse(fs.readFileSync(proofFile,"utf8"));
  if (proof.passed!==true || proof.verifierVersion!==DISCOVERY_VERIFIER_VERSION || proof.htmlHash!==artifactHash
    || proof.htmlHash!==hashDiscoveryContract(fs.readFileSync(locations.htmlFile,"utf8")) || proof.academicHash!==hashDiscoveryContract(evaluation!.items)) throw new Error("discovery_publication_acceptance_mismatch");
  }
  const existing=getLearningCycle(input.childId,input.homeworkId,{rootDir});
  if (existing && existing.lifecycle!=="evaluation_ready") {
    const binding=existing.nodes.find(node=>node.role==="evaluation")?.artifactBinding;
    if ((native ? binding?.contractFingerprint : binding?.creativeProvenance?.generatedHtmlHash)!==artifactHash) throw new Error("discovery_active_artifact_mismatch");
    console.log(` 🎮 [adaptive-math] [discovery-publication] [active-cycle-preserved] child=${input.childId} homework=${input.homeworkId}`);
    return;
  }
  const journal = path.join(contextDir, "homework", "discovery-publication.json");
  if (fs.existsSync(journal)) {
    const saved = JSON.parse(fs.readFileSync(journal,"utf8")) as {input: typeof input};
    if (saved.input.homeworkId !== input.homeworkId || (saved.input.spellingItems ? hashDiscoveryContract(saved.input.spellingItems) : saved.input.evaluation?.artifact.artifactHash) !== artifactHash) throw new Error("discovery_publication_pending_other_assignment");
  } else atomicJson(journal, {version:1,input:{...input,rootDir},createdAt:new Date().toISOString()});
  const readObject = (file: string): Record<string, unknown> => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>; } catch { return {}; }
  };
  const mergeDomain = (value: unknown, next: unknown): Record<string, unknown> => ({
    ...(value && typeof value === "object" ? value as Record<string, unknown> : {}),
    [domain]: next,
  });
  const now = new Date().toISOString();
  const pending = {
    homeworkId: input.homeworkId,
    weekOf: now.slice(0, 10),
    testDate: null,
    returnTag: `#sunny_${input.childId}_${input.homeworkId}`,
    wordList: native?.map(item => item.word) ?? [],
    contentProfile: { practiceDomain: domain, topic: input.assignment.title },
    capturedContent: { title: input.assignment.title, rawText: "Discovery evidence pending." },
    generatedAt: now,
    nodes: input.activeSessionPlan.nodePlan,
  };
  try {
    if (native) {
      let cycle = createSpellingDiscoveryCycle({ childId: input.childId, homeworkId: input.homeworkId, title: input.assignment.title, contentFingerprint: input.assignment.contentFingerprint, items: native }, { rootDir });
      const configFile = path.join(resolveAdaptiveMathDraftDir(input.childId, input.homeworkId, { rootDir }), "spelling-discovery-config.json");
      atomicJson(configFile, { version: 1, mode: "assessment", items: native, contractHash: artifactHash });
      const node = cycle.nodes.find(node => node.role === "evaluation")!;
      if (!node.artifactBinding) transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, { type: "artifact_bound", nodeId: node.nodeId, artifact: { contentId: node.nodeId, artifactId: `${node.nodeId}:native-v1`, localArtifactPath: configFile, activityConfigPath: configFile, localArtworkPath: "/thumbnails/activities/word-radar.svg", contractFingerprint: artifactHash, validationStatus: "passed" } }, { rootDir });
    } else if (!getLearningCycle(input.childId, input.homeworkId, { rootDir })) {
      createDiscoveryLearningCycle({ ...input, evaluation: evaluation!, rootDir });
    }
    const previousPlan = readObject(planPath);
    const previousHomework = readObject(homeworkPath);
    const profile = readObject(profilePath);
    atomicJson(homeworkPath, {
      version: 1, childId: input.childId, selectedDomain: domain, current: pending,
      activeByDomain: mergeDomain(previousHomework.activeByDomain, pending), updatedAt: now,
    });
    profile.pendingHomework = pending;
    profile.activeSessionPlan = input.activeSessionPlan;
    profile.activeHomeworkByDomain = mergeDomain(profile.activeHomeworkByDomain, pending);
    profile.activeSessionPlanByDomain = mergeDomain(profile.activeSessionPlanByDomain, input.activeSessionPlan);
    atomicJson(profilePath, profile);
    atomicJson(planPath, {
      version: 1, childId: input.childId, selectedDomain: domain, current: input.activeSessionPlan,
      activeByDomain: mergeDomain(previousPlan.activeByDomain, input.activeSessionPlan), updatedAt: now,
    });
    fs.rmSync(journal);
    console.log(` 🎮 [adaptive-math] [discovery-publication] [published] child=${input.childId} homework=${input.homeworkId}`);
  } catch (error) {
    console.error(` 🎮 [adaptive-math] [discovery-publication] [recovery-required] child=${input.childId} homework=${input.homeworkId} journal=${journal}`);
    throw error;
  }
}

/** Finish only the interrupted projection; canonical observations are never rolled back. */
export function recoverDiscoveryPublication(input: {rootDir?: string; childId: string}): void {
  const journal=path.join(resolveChildContextDir(input.childId,input),"homework/discovery-publication.json");
  if (!fs.existsSync(journal)) return;
  const saved=JSON.parse(fs.readFileSync(journal,"utf8")) as {version:number;input:Parameters<typeof publishDiscoveryExperience>[0]};
  if (saved.version!==1 || saved.input.childId!==input.childId) throw new Error("discovery_publication_journal_invalid");
  const cycle=getLearningCycle(input.childId,saved.input.homeworkId,input);
  if (cycle && cycle.lifecycle!=="evaluation_ready") throw new Error("discovery_publication_recovery_conflicts_with_started_cycle");
  publishDiscoveryExperience({...saved.input,...input});
}

export function publishTargetedBoardProjection(input: {
  rootDir?: string;
  childId: string;
  activeSessionPlan: ActiveSessionPlan;
  nodeStatuses: Record<string, MathGenerationNodeStatus>;
}): void {
  const rootDir = input.rootDir ?? process.cwd();
  const contextDir = resolveChildContextDir(input.childId, { rootDir });
  const planPath = path.join(contextDir, "plans", "active_session_plan.json");
  const profilePath = path.join(contextDir, "learning_profile.json");
  const readObject = (file: string): Record<string, unknown> => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>; } catch { return {}; }
  };
  const cycle = getLearningCycle(input.childId, input.activeSessionPlan.activeHomeworkId!, { rootDir });
  if (input.activeSessionPlan.domain === "spelling" && input.activeSessionPlan.adventureBoard) {
    const presentedNodeIds = new Set(input.activeSessionPlan.adventureBoard.nodes.map((node) => node.id));
    const missingNodeIds = input.activeSessionPlan.nodePlan
      .filter((node) => !node.id.endsWith(":discovery"))
      .map((node) => node.id)
      .filter((nodeId) => !presentedNodeIds.has(nodeId));
    if (missingNodeIds.length > 0) {
      throw new Error(`spelling_board_presentation_missing_nodes:${missingNodeIds.join(",")}`);
    }
  }
  const plan = cycle ? projectLearningCycle(cycle, { presentationPlan: input.activeSessionPlan }).activeSessionPlan : structuredClone(input.activeSessionPlan);
  if (!cycle) {
  let currentAssigned = false;
  plan.nodePlan = plan.nodePlan.map((node) => ({ ...node, locked: input.nodeStatuses[node.id] !== "ready" }));
  if (plan.adventureBoard) {
    plan.adventureBoard.nodes = plan.adventureBoard.nodes.map((node) => {
      const status = input.nodeStatuses[node.id];
      if (!status) return node;
      if (status === "ready") {
        const state = currentAssigned ? "available" as const : "current" as const;
        currentAssigned = true;
        return { ...node, state };
      }
      if (status === "preparing" || status === "failed_resumable") {
        return { ...node, state: "preview" as const, action: { type: "show-preparing-status", payloadId: node.id } as never };
      }
      if (status === "needs_attention") {
        return { ...node, state: "locked" as const, action: { type: "show-locked-reason", payloadId: node.id }, lock: { reason: "generation-needs-attention", label: "Parent help needed" } };
      }
      return { ...node, state: "locked" as const };
    });
    plan.adventureBoard.progress = {
      ...(plan.adventureBoard.progress ?? {}),
      completedNodeIds: plan.adventureBoard.progress?.completedNodeIds ?? ["start"],
      currentNodeId: plan.adventureBoard.nodes.find((node) => node.state === "current")?.id,
    };
  }
  }
  const domain = cycle?.domain ?? plan.domain;
  if (domain === "spelling" && plan.adventureBoard) {
    const issues = [
      ...validateBoardGraph(plan.adventureBoard),
      ...validateBoardChoices(plan.adventureBoard),
      ...validateBoardVisualContract(plan.adventureBoard),
    ].filter((issue) => issue.severity === "error");
    if (issues.length > 0) {
      throw new Error(`spelling_board_publication_rejected:${issues.map((issue) => `${issue.code}:${issue.nodeId ?? issue.choiceSetId ?? "board"}`).join("|")}`);
    }
    console.log(` 🎮 [spelling-board] [publication-gate] [passed] nodes=${plan.adventureBoard.nodes.length}`);
  }
  const priorPlan = readObject(planPath);
  const profile = readObject(profilePath);
  const activeByDomain = { ...(priorPlan.activeByDomain && typeof priorPlan.activeByDomain === "object" ? priorPlan.activeByDomain as Record<string, unknown> : {}), [domain]: plan };
  atomicJson(planPath, { version: 1, childId: input.childId, selectedDomain: domain, current: plan, activeByDomain, updatedAt: new Date().toISOString() });
  profile.activeSessionPlan = plan;
  profile.activeSessionPlanByDomain = { ...(profile.activeSessionPlanByDomain && typeof profile.activeSessionPlanByDomain === "object" ? profile.activeSessionPlanByDomain as Record<string, unknown> : {}), [domain]: plan };
  atomicJson(profilePath, profile);
  console.log(` 🎮 [adaptive-math] [targeted-board-projection] [published] child=${input.childId}`);
}

export function createDiscoveryLearningCycle(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  assignment: LearningCycleRecordV2["assignment"];
  evaluation: MathDiscoveryEvaluationContract;
}): LearningCycleRecordV2 {
  assertDiscoveryResponseContracts(input.evaluation);
  const theoryId = `${input.homeworkId}:discovery-theory`;
  return createLearningCycle({
    childId: input.childId,
    homeworkId: input.homeworkId,
    domain: "math",
    assignment: input.assignment,
    academicTheory: {
      theoryId,
      revision: 1,
      hypothesis: "Independent Discovery evidence is required before Sunny selects instruction.",
      supportCriteria: ["Fresh, unassisted observations identify existing understanding."],
      reviseCriteria: ["Assistance, reading, interface, or response-mode confounds limit interpretation."],
      falsifyCriteria: ["The evaluation cannot distinguish conceptual evidence from instrument friction."],
    },
    engagementTheory: null,
    nodes: [evaluationNode(input.evaluation)],
    // Discovery establishes facts. Targeted academic predictions are authored
    // by the Planner only after those facts are committed.
    academicPredictions: [],
    assumptions: [],
    initialLifecycle: "evaluation_ready",
  }, { rootDir: input.rootDir });
}

export function recordDiscoveryAttempt(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  attempt: MathDiscoveryAttempt;
}): LearningCycleRecordV2 {
  assertChildPublicationCommitted(input.childId,input);
  let cycle = getLearningCycle(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const evaluation = cycle.nodes.find((node) => node.role === "evaluation");
  if (!evaluation) throw new Error("learning_cycle_evaluation_node_missing");
  const contractFile = path.join(
    resolveChildContextDir(input.childId, { rootDir: input.rootDir }),
    "homework",
    "direct-drafts",
    input.homeworkId,
    "discovery-contract.json",
  );
  if (!fs.existsSync(contractFile)) throw new Error("discovery_frozen_contract_missing");
  const frozen = JSON.parse(fs.readFileSync(contractFile, "utf8")) as Partial<MathDiscoveryEvaluationContract>;
  if (frozen.evaluationId !== evaluation.nodeId || !Array.isArray(frozen.items)) {
    throw new Error("discovery_frozen_contract_identity_invalid");
  }
  const frozenItem = frozen.items.find((item) => item.itemId === input.attempt.itemId);
  if (!frozenItem) throw new Error(`discovery_attempt_item_not_in_frozen_contract:${input.attempt.itemId}`);
  assertDiscoveryResponseContracts({ items: frozen.items as MathDiscoveryEvaluationItem[] });
  if (!input.attempt.attemptId.trim() || !input.attempt.observedAt.trim()) {
    throw new Error("discovery_attempt_identity_invalid");
  }
  if (!Array.isArray(input.attempt.supportEventIds) || input.attempt.supportEventIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("discovery_support_event_ids_invalid");
  }
  const allowedInstrumentSignals = new Set([
    "interface_friction",
    "reading_friction",
    "response_not_captured",
    "scoring_disagreement",
    "prompt_ambiguity",
  ]);
  if (!Array.isArray(input.attempt.instrumentSignals) || input.attempt.instrumentSignals.some((signal) => !allowedInstrumentSignals.has(signal))) {
    throw new Error("discovery_instrument_signal_invalid");
  }
  if (cycle.lifecycle === "evaluation_ready") {
    cycle = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
      type: "evaluation_started",
      evaluationId: evaluation.nodeId,
    }, { rootDir: input.rootDir });
  }
  const attemptedValue = String(input.attempt.attemptedValue ?? "").trim();
  const ambiguous = !attemptedValue || input.attempt.instrumentSignals.length > 0;
  const assisted = input.attempt.supportEventIds.length > 0;
  const repeated = cycle.observations.some((observation) =>
    observation.sourceId === `evaluation:${evaluation.nodeId}` && observation.itemId === input.attempt.itemId);
  const normalizedValue = attemptedValue.toLocaleLowerCase();
  const correct = !ambiguous && frozenItem.correctAnswerContract.acceptedValues
    .some((value) => value.trim().toLocaleLowerCase() === normalizedValue);
  const observation: LearningObservation = {
    observationId: input.attempt.attemptId,
    sourceId: `evaluation:${evaluation.nodeId}`,
    itemId: input.attempt.itemId,
    ...(attemptedValue ? { childResponse: attemptedValue } : {}),
    constructLinks: [{ constructId: frozenItem.constructId, role: "primary", confidence: 1 }],
    result: ambiguous
      ? { correct: undefined, observedErrorType: "instrument_ambiguous" }
      : { correct, score: correct ? 1 : 0 },
    assistance: {
      status: assisted ? "assisted" : "unassisted",
      scaffolds: [...new Set(input.attempt.supportEventIds)],
    },
    exposure: repeated ? "previously_practiced" : "unseen",
    provenance: assisted || repeated || ambiguous ? "practice" : "independent_probe",
    observedAt: input.attempt.observedAt,
    confounds: [...new Set([
      ...input.attempt.instrumentSignals,
      ...(ambiguous ? ["instrument_ambiguous"] : []),
      ...(assisted ? ["assistance_present"] : []),
      ...(repeated ? ["repeated_attempt"] : []),
      `response_mode:${frozenItem.responseContract.mode}`,
      `representation:${frozenItem.responseContract.representationId}`,
    ])],
  };
  return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    type: "evaluation_attempted",
    evaluationId: evaluation.nodeId,
    nodeId: evaluation.nodeId,
    observations: [observation],
    academicEvidence: [{
      evidenceId: observation.observationId,
      summary: `${observation.itemId}: ${ambiguous ? "instrument ambiguous" : observation.result.correct ? repeated ? "repeated correct" : "independent correct" : "incorrect"}; assistance=${observation.assistance.status}.`,
      ...(typeof observation.result.score === "number" ? { accuracy: observation.result.score } : {}),
    }],
    engagementEvidence: input.attempt.instrumentSignals.length > 0
      ? [{ evidenceId: `${observation.observationId}:interaction`, summary: input.attempt.instrumentSignals.join(", ") }]
      : [],
    companionObservations: [],
  }, { rootDir: input.rootDir });
}

export function buildDiscoveryEvidenceSummary(cycle: LearningCycleRecordV2): DiscoveryEvidenceSummary {
  const evaluation = cycle.nodes.find((node) => node.role === "evaluation");
  if (!evaluation) throw new Error("learning_cycle_evaluation_node_missing");
  const observations = cycle.observations.filter((observation) => observation.sourceId === `evaluation:${evaluation.nodeId}`);
  const spellingItems = Object.values(evaluation.evidenceContract.spellingItems ?? {});
  const untestedItemIds = spellingItems.filter(item => !observations.some(row => row.itemId === item.id)).map(item => item.id);
  const constructIds = [...new Set([...spellingItems.map(item => item.constructId), ...observations.flatMap((observation) => observation.constructLinks.map((link) => link.constructId))])].sort();
  return {
    version: 1,
    homeworkId: cycle.homeworkId,
    evaluationId: evaluation.nodeId,
    ...(spellingItems.length ? { coverage: { assigned: spellingItems.length, attempted: spellingItems.length - untestedItemIds.length, untestedItemIds, complete: untestedItemIds.length === 0 } } : {}),
    ...(spellingItems.length ? {
      spellingTargets: spellingItems.map((item) => {
        const matching = observations.filter((observation) => observation.itemId === item.id);
        return {
          word: item.word,
          itemId: item.id,
          constructId: item.constructId,
          attempts: matching.length,
          independentCorrect: matching.filter((observation) => observation.provenance === "independent_probe" && observation.result.correct === true).length,
          independentIncorrect: matching.filter((observation) => observation.provenance === "independent_probe" && observation.result.correct === false).length,
          assisted: matching.filter((observation) => observation.assistance.status !== "unassisted").length,
          ambiguous: matching.filter((observation) => observation.result.observedErrorType === "instrument_ambiguous").length,
          observationIds: matching.map((observation) => observation.observationId),
        };
      }),
    } : {}),
    constructs: constructIds.map((constructId) => {
      const matching = observations.filter((observation) => observation.constructLinks.some((link) => link.constructId === constructId));
      const responseModes = [...new Set(matching.flatMap((observation) => observation.confounds
        .filter((confound) => confound.startsWith("response_mode:"))
        .map((confound) => confound.slice("response_mode:".length))))].sort();
      const representationIds = [...new Set(matching.flatMap((observation) => observation.confounds
        .filter((confound) => confound.startsWith("representation:"))
        .map((confound) => confound.slice("representation:".length))))].sort();
      return {
        constructId,
        independentCorrect: matching.filter((observation) => observation.provenance === "independent_probe" && observation.result.correct === true).length,
        independentIncorrect: matching.filter((observation) => observation.provenance === "independent_probe" && observation.result.correct === false).length,
        assisted: matching.filter((observation) => observation.assistance.status !== "unassisted").length,
        ambiguous: matching.filter((observation) => observation.result.observedErrorType === "instrument_ambiguous").length,
        responseModes,
        representationIds,
        representationCount: representationIds.length,
        confounds: [...new Set(matching.flatMap((observation) => observation.confounds))].sort(),
        observationIds: matching.map((observation) => observation.observationId),
      };
    }),
  };
}

export function completeDiscoveryEvaluation(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  completedAt: string;
}): LearningCycleRecordV2 {
  assertChildPublicationCommitted(input.childId,input);
  const cycle = getLearningCycle(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const evaluation = cycle.nodes.find((node) => node.role === "evaluation");
  if (!evaluation) throw new Error("learning_cycle_evaluation_node_missing");
  if (cycle.domain === "spelling" && buildDiscoveryEvidenceSummary(cycle).coverage?.complete !== true) throw new Error("spelling_discovery_coverage_incomplete");
  const completed = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    type: "evaluation_completed",
    evaluationId: evaluation.nodeId,
    completedAt: input.completedAt,
  }, { rootDir: input.rootDir });
  const summary = buildDiscoveryEvidenceSummary(completed);
  const draftDir = path.join(
    resolveChildContextDir(input.childId, { rootDir: input.rootDir }),
    "homework",
    "direct-drafts",
    input.homeworkId,
  );
  atomicJson(path.join(draftDir, "discovery-evidence-summary.json"), {
    summaryHash: hashDiscoveryContract(summary),
    summary,
  });
  console.log(` 🎮 [adaptive-math] [discovery-summary] [saved] hash=${hashDiscoveryContract(summary).slice(0, 12)}`);
  return completed;
}

function targetedNode(node: TargetedMathNode): LearningCycleNodeContract {
  return {
    nodeId: node.nodeId,
    ...(node.routeId ? { routeId: node.routeId } : {}),
    role: "baseline",
    title: node.title,
    state: "generating",
    academicTarget: { domain: "math", skill: node.academicTarget, targets: [node.academicTarget] },
    algorithmOwner: node.algorithmOwner,
    theoryId: node.theoryId,
    experimentId: node.experimentId,
    mechanic: node.mechanic,
    theme: node.theme,
    openingScreen: { title: node.title, purpose: "Targeted from committed Discovery evidence." },
    generationPrompt: null,
    artifactBinding: null,
    artwork: { status: "pending", localPath: null, prompt: null },
    sfxContract: ["interaction", "recovery", "progress", "completion"],
    companionContract: { events: ["help_requested", "completion", "frustration"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
  };
}

export function revealTargetedBoard(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  programHash: string;
  designHash: string;
  nodes: TargetedMathNode[];
  nodeContracts?: LearningCycleNodeContract[];
  academicTheory?: LearningCycleRecordV2["academicTheory"];
  academicPredictions?: AcademicPrediction[];
  assumptions?: LearningAssumption[];
  agencyExperiment?: LearningCycleAgencyExperiment;
}): LearningCycleRecordV2 {
  let cycle = getLearningCycle(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if (cycle.lifecycle === "evidence_ready") {
    cycle = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
      type: "targeted_planning_started",
      evaluationId: cycle.nodes.find((node) => node.role === "evaluation")?.nodeId ?? "missing",
    }, { rootDir: input.rootDir });
  }
  if (cycle.lifecycle === "targeted_planning") {
    cycle = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
      type: "board_design_started",
      programHash: input.programHash,
    }, { rootDir: input.rootDir });
  }
  return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    type: "targeted_board_revealed",
    programHash: input.programHash,
    designHash: input.designHash,
    nodes: input.nodeContracts ?? input.nodes.map(targetedNode),
    academicTheory: input.academicTheory ?? {
      theoryId: `${input.homeworkId}:targeted-theory`,
      revision: 1,
      hypothesis: "The targeted program should address the evidence observed during Discovery.",
      supportCriteria: ["Fresh checkpoint evidence improves after the intervention."],
      reviseCriteria: ["Checkpoint evidence is mixed or confounded."],
      falsifyCriteria: ["Fresh independent evidence does not improve."],
    },
    academicPredictions: input.academicPredictions ?? [],
    assumptions: input.assumptions ?? [],
    ...(input.agencyExperiment ? { agencyExperiment: input.agencyExperiment } : {}),
  }, { rootDir: input.rootDir });
}

export function getMathGenerationStatus(
  childId: string,
  homeworkId: string,
  opts: RootOptions = {},
): MathGenerationJob | null {
  const file = generationJobPath(childId, homeworkId, opts);
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as MathGenerationJob;
  if (parsed.version !== 1 || parsed.childId !== childId || parsed.homeworkId !== homeworkId) {
    throw new Error("math_generation_job_identity_invalid");
  }
  return parsed;
}

export function getMathDiscoveryLifecycle(childId: string, homeworkId: string, opts: RootOptions = {}): string | undefined {
  return getLearningCycle(childId, homeworkId, { rootDir: opts.rootDir })?.lifecycle;
}

export function queueTargetedMathGeneration(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
}): MathGenerationJob {
  const existing = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (existing) return existing;
  const now = new Date().toISOString();
  const job: MathGenerationJob = {
    version: 1,
    childId: input.childId,
    homeworkId: input.homeworkId,
    phase: "targeted_planning",
    programHash: "",
    designHash: "",
    startedAt: now,
    updatedAt: now,
    nodes: [],
  };
  atomicJson(generationJobPath(input.childId, input.homeworkId, input), job);
  console.log(` 🎮 [adaptive-math] [targeted-generation] [queued] child=${input.childId} homework=${input.homeworkId}`);
  return job;
}

export function setMathGenerationPhase(input: {rootDir?:string;childId:string;homeworkId:string;phase:MathGenerationJob["phase"];error?:string}): void {
  const job = queueTargetedMathGeneration(input);
  job.phase = input.phase;
  job.updatedAt = new Date().toISOString();
  if (input.error) job.error = input.error;
  else delete job.error;
  atomicJson(generationJobPath(input.childId,input.homeworkId,input),job);
  console.log(` 🎮 [adaptive-math] [phase] [${input.phase}] child=${input.childId} homework=${input.homeworkId}${input.error ? ` reason=${input.error}` : ""}`);
}

export function writeMathGenerationJob(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  programHash: string;
  designHash: string;
  nodeIds: string[];
}): MathGenerationJob {
  const now = new Date().toISOString();
  const existing = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (existing && existing.programHash && existing.designHash
    && (existing.programHash !== input.programHash || existing.designHash !== input.designHash)) {
    throw new Error("math_generation_job_frozen_contract_changed");
  }
  const previous = new Map(existing?.nodes.map((node) => [node.nodeId, node]) ?? []);
  const job: MathGenerationJob = {
    version: 1,
    childId: input.childId,
    homeworkId: input.homeworkId,
    phase: "board_generating",
    programHash: input.programHash,
    designHash: input.designHash,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    nodes: input.nodeIds.map((nodeId) => {
      const saved = previous.get(nodeId);
      if (saved?.status === "ready" || saved?.status === "completed" || saved?.status === "evidence_locked" || saved?.status === "needs_attention") return saved;
      return { nodeId, status: "preparing", attemptCount: saved?.attemptCount ?? 0, updatedAt: now };
    }),
  };
  atomicJson(generationJobPath(input.childId, input.homeworkId, input), job);
  console.log(` 🎮 [adaptive-math] [generation-job] [saved] child=${input.childId} homework=${input.homeworkId} nodes=${job.nodes.length}`);
  return job;
}

export async function runAdaptiveTargetedGeneration(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  concurrency: number;
  plan: (cycle: LearningCycleRecordV2) => Promise<{ programHash: string; nodes: TargetedMathNode[] }>;
  design: (program: { programHash: string; nodes: TargetedMathNode[] }) => Promise<{ designHash: string }>;
  publishPreparingBoard: (input: { programHash: string; designHash: string; nodes: TargetedMathNode[] }) => Promise<void> | void;
  buildNode: (nodeId: string) => Promise<{ artifactHash: string }>;
  publishReadyNode: (nodeId: string, artifactHash: string) => Promise<void> | void;
}): Promise<MathGenerationJob> {
  const cycle = getLearningCycle(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if (cycle.lifecycle !== "evidence_ready" && cycle.lifecycle !== "targeted_planning") {
    throw new Error(`adaptive_targeted_generation_not_ready:${cycle.lifecycle}`);
  }
  console.log(` 🎮 [adaptive-math] [targeted-planner] [running] child=${input.childId} homework=${input.homeworkId}`);
  const program = await input.plan(cycle);
  console.log(` 🎮 [adaptive-math] [targeted-planner] [saved] hash=${program.programHash.slice(0, 12)}`);
  const design = await input.design(program);
  console.log(` 🎮 [adaptive-math] [board-design] [saved] hash=${design.designHash.slice(0, 12)}`);
  revealTargetedBoard({
    rootDir: input.rootDir,
    childId: input.childId,
    homeworkId: input.homeworkId,
    programHash: program.programHash,
    designHash: design.designHash,
    nodes: program.nodes,
  });
  writeMathGenerationJob({
    rootDir: input.rootDir,
    childId: input.childId,
    homeworkId: input.homeworkId,
    programHash: program.programHash,
    designHash: design.designHash,
    nodeIds: program.nodes.map((node) => node.nodeId),
  });
  await input.publishPreparingBoard({ ...program, designHash: design.designHash });
  return buildTargetedNodesResumably({
    rootDir: input.rootDir,
    childId: input.childId,
    homeworkId: input.homeworkId,
    firstNodeId: program.nodes[0]?.nodeId ?? "",
    concurrency: input.concurrency,
    buildNode: input.buildNode,
    onNodeReady: input.publishReadyNode,
  });
}

export function updateMathGenerationNode(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  nodeId: string;
  status: MathGenerationNodeStatus;
  artifactHash?: string;
  error?: string;
}): MathGenerationJob {
  const job = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!job) throw new Error("math_generation_job_missing");
  const node = job.nodes.find((candidate) => candidate.nodeId === input.nodeId);
  if (!node) throw new Error(`math_generation_job_node_missing:${input.nodeId}`);
  if (node.status === "ready" && input.status !== "completed" && input.artifactHash !== node.artifactHash) {
    throw new Error(`math_generation_ready_artifact_immutable:${input.nodeId}`);
  }
  node.status = input.status;
  node.updatedAt = new Date().toISOString();
  if (input.artifactHash) node.artifactHash = input.artifactHash;
  if (input.error) node.error = input.error;
  else delete node.error;
  job.updatedAt = node.updatedAt;
  if (job.nodes.every((candidate) => ["ready", "completed", "evidence_locked"].includes(candidate.status))) {
    job.phase = "board_ready";
  } else if (job.nodes.some((candidate) => candidate.status === "needs_attention")) {
    job.phase = "needs_attention";
  }
  atomicJson(generationJobPath(input.childId, input.homeworkId, input), job);
  console.log(` 🎮 [adaptive-math] [node-generation] [${input.status}] child=${input.childId} homework=${input.homeworkId} node=${input.nodeId}`);
  return job;
}

function startMathGenerationNodeAttempt(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  nodeId: string;
}): number {
  const job = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!job) throw new Error("math_generation_job_missing");
  const node = job.nodes.find((candidate) => candidate.nodeId === input.nodeId);
  if (!node) throw new Error(`math_generation_job_node_missing:${input.nodeId}`);
  node.attemptCount = (node.attemptCount ?? 0) + 1;
  node.updatedAt = new Date().toISOString();
  job.updatedAt = node.updatedAt;
  atomicJson(generationJobPath(input.childId, input.homeworkId, input), job);
  console.log(` 🎮 [adaptive-math] [node-attempt] [started] child=${input.childId} homework=${input.homeworkId} node=${input.nodeId} attempt=${node.attemptCount}`);
  return node.attemptCount;
}

function markMathGenerationNodeNeedsAttention(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  nodeId: string;
  reason: string;
}): void {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const cycle = getLearningCycle(input.childId, input.homeworkId, { rootDir: input.rootDir });
    if (!cycle) {
      console.warn(` 🎮 [adaptive-math] [canonical-node-failure] [skipped-no-cycle] child=${input.childId} homework=${input.homeworkId} node=${input.nodeId}`);
      return;
    }
    const node = cycle.nodes.find((candidate) => candidate.nodeId === input.nodeId);
    if (!node) throw new Error(`learning_cycle_node_missing:${input.nodeId}`);
    if (node.state === "blocked") return;
    try {
      transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
        type: "artifact_generation_attention_required",
        nodeId: input.nodeId,
        reason: input.reason,
      }, { rootDir: input.rootDir });
      console.log(` 🎮 [adaptive-math] [canonical-node-failure] [parent-help] child=${input.childId} homework=${input.homeworkId} node=${input.nodeId}`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < 2 && message.includes("revision")) continue;
      throw error;
    }
  }
}

export async function buildTargetedNodesResumably(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  firstNodeId: string;
  concurrency: number;
  buildNode: (nodeId: string) => Promise<{ artifactHash: string }>;
  onNodeReady?: (nodeId: string, artifactHash: string) => Promise<void> | void;
}): Promise<MathGenerationJob> {
  const initial = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!initial) throw new Error("math_generation_job_missing");
  const missing = initial.nodes
    .filter((node) => node.status === "preparing" || node.status === "failed_resumable")
    .map((node) => node.nodeId);
  const first = missing.includes(input.firstNodeId) ? input.firstNodeId : undefined;
  const remaining = missing.filter((nodeId) => nodeId !== first);

  const buildOne = async (nodeId: string): Promise<void> => {
    const attemptCount = startMathGenerationNodeAttempt({
      rootDir: input.rootDir,
      childId: input.childId,
      homeworkId: input.homeworkId,
      nodeId,
    });
    try {
      const built = await input.buildNode(nodeId);
      updateMathGenerationNode({
        rootDir: input.rootDir,
        childId: input.childId,
        homeworkId: input.homeworkId,
        nodeId,
        status: "ready",
        artifactHash: built.artifactHash,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      updateMathGenerationNode({
        rootDir: input.rootDir,
        childId: input.childId,
        homeworkId: input.homeworkId,
        nodeId,
        status: attemptCount >= 2 ? "needs_attention" : "failed_resumable",
        error: message,
      });
      if (attemptCount >= 2) {
        markMathGenerationNodeNeedsAttention({
          rootDir: input.rootDir,
          childId: input.childId,
          homeworkId: input.homeworkId,
          nodeId,
          reason: message,
        });
      }
      if (attemptCount < 2 && message.startsWith("targeted_browser_verification_failed:")) {
        console.log(` 🎮 [adaptive-math] [node-repair] [scheduled] node=${nodeId} attempt=2/2`);
        await buildOne(nodeId);
      }
      return;
    }
    const ready = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir })!.nodes.find(node => node.nodeId === nodeId)!;
    await input.onNodeReady?.(nodeId, ready.artifactHash!);
  };

  if (first) await buildOne(first);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(input.concurrency), remaining.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < remaining.length) {
      const nodeId = remaining[cursor];
      cursor += 1;
      if (nodeId) await buildOne(nodeId);
    }
  }));
  const final = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!final) throw new Error("math_generation_job_missing_after_build");
  return final;
}

export function hashDiscoveryContract(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
