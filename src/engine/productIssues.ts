import crypto from "crypto";
import fs from "fs";
import path from "path";

export const PRODUCT_ISSUE_TYPES = [
  "bug_report",
  "flow_complaint",
  "companion_lag",
  "confusion",
  "content_mismatch",
  "ui_blocker",
] as const;

export const PRODUCT_ISSUE_SEVERITIES = ["low", "medium", "high"] as const;
export const PRODUCT_ISSUE_SOURCES = [
  "child_utterance",
  "observed_behavior",
  "parent_comment",
] as const;

export type ProductIssueType = typeof PRODUCT_ISSUE_TYPES[number];
export type ProductIssueSeverity = typeof PRODUCT_ISSUE_SEVERITIES[number];
export type ProductIssueSource = typeof PRODUCT_ISSUE_SOURCES[number];

export type ProductIssueInput = {
  childId: string;
  activityId: string;
  issueType: ProductIssueType;
  severity: ProductIssueSeverity;
  childUtterance: string;
  evidenceText: string;
  confidence: number;
  source: ProductIssueSource;
  sessionId?: string;
  nodeId?: string;
  choiceSetId?: string;
  screenshotId?: string;
  turnState?: string;
  activityState?: Record<string, unknown> | null;
  createdAt?: string;
};

export type ProductIssueRecord = ProductIssueInput & {
  type: "product_issue";
  version: 1;
  productIssueId: string;
  childId: string;
  createdAt: string;
};

export type ProductIssueOptions = {
  rootDir?: string;
  now?: Date;
  skipPersistence?: boolean;
};

function rootDir(opts?: Pick<ProductIssueOptions, "rootDir">): string {
  return opts?.rootDir ?? process.cwd();
}

function safeChildId(childId: string): string {
  return childId.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}

function safeKey(value: string, fallback: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_") || fallback;
}

function fileDate(value: string): string {
  const direct = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function assertOneOf<T extends readonly string[]>(label: string, value: string, allowed: T): asserts value is T[number] {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`product_issue_invalid_${label}:${value}`);
  }
}

function assertConfidence(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`product_issue_invalid_confidence:${value}`);
  }
}

function productIssueDir(childId: string, opts?: Pick<ProductIssueOptions, "rootDir">): string {
  return path.join(rootDir(opts), "src", "context", safeChildId(childId), "product_issues");
}

function normalizeActivityState(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeProductIssue(input: ProductIssueInput, opts: ProductIssueOptions = {}): ProductIssueRecord {
  const issueType = String(input.issueType);
  const severity = String(input.severity);
  const source = String(input.source);
  assertOneOf("issue_type", issueType, PRODUCT_ISSUE_TYPES);
  assertOneOf("severity", severity, PRODUCT_ISSUE_SEVERITIES);
  assertOneOf("source", source, PRODUCT_ISSUE_SOURCES);
  assertConfidence(input.confidence);
  const childId = safeChildId(input.childId);
  const activityId = safeKey(input.activityId, "unknown_activity");
  const childUtterance = input.childUtterance.trim();
  const evidenceText = input.evidenceText.trim();
  if (!childId) throw new Error("product_issue_missing_child_id");
  if (!childUtterance) throw new Error("product_issue_missing_child_utterance");
  if (!evidenceText) throw new Error("product_issue_missing_evidence_text");
  const createdAt = input.createdAt ?? (opts.now ?? new Date()).toISOString();
  const activityState = normalizeActivityState(input.activityState);
  const productIssueId = `product_issue_${stableHash({
    childId,
    activityId,
    issueType,
    severity,
    childUtterance,
    evidenceText,
    source,
    createdAt,
  })}`;
  return {
    type: "product_issue",
    version: 1,
    productIssueId,
    childId,
    activityId,
    issueType,
    severity,
    childUtterance,
    evidenceText,
    confidence: round(input.confidence),
    source,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(input.choiceSetId ? { choiceSetId: input.choiceSetId } : {}),
    ...(input.screenshotId ? { screenshotId: input.screenshotId } : {}),
    ...(input.turnState ? { turnState: input.turnState } : {}),
    ...(activityState ? { activityState } : {}),
    createdAt,
  };
}

export function recordProductIssue(
  input: ProductIssueInput,
  opts: ProductIssueOptions = {},
): { record: ProductIssueRecord; persisted: boolean } {
  const record = normalizeProductIssue(input, opts);
  if (opts.skipPersistence) {
    console.log(
      `  🎮 [product-issue] [preview] child=${record.childId} activity=${record.activityId} issue=${record.issueType}`,
    );
    return { record, persisted: false };
  }
  const dir = productIssueDir(record.childId, opts);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${fileDate(record.createdAt)}.ndjson`), `${JSON.stringify(record)}\n`, "utf8");
  console.log(
    `  🎮 [product-issue] [recorded] child=${record.childId} activity=${record.activityId} issue=${record.issueType} severity=${record.severity}`,
  );
  return { record, persisted: true };
}
