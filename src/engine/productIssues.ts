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
  const file = path.join(dir, `${fileDate(record.createdAt)}.ndjson`);
  // One sentence, one ticket (2026-11-10: a growing partial transcript made 10): the same sentence, growing, in the
  // same session, within two minutes, updates its ticket with the longer words.
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
  const flat = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
  const same = lines.findIndex(line => {
    try {
      const prior = JSON.parse(line) as ProductIssueRecord;
      const [a, b] = [flat(prior.childUtterance), flat(record.childUtterance)];
      return prior.childId === record.childId && prior.sessionId && prior.sessionId === record.sessionId && prior.issueType === record.issueType
        && prior.source === record.source && Math.abs(Date.parse(record.createdAt) - Date.parse(prior.createdAt)) <= 120_000 && (a.startsWith(b) || b.startsWith(a));
    } catch { return false; }
  });
  if (same >= 0) {
    const prior = JSON.parse(lines[same]) as ProductIssueRecord;
    const merged = record.childUtterance.length > prior.childUtterance.length ? { ...prior, childUtterance: record.childUtterance } : prior;
    lines[same] = JSON.stringify(merged);
    fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
    console.log(`  🎮 [product-issue] [same-sentence] child=${record.childId} issue=${record.issueType} kept=${prior.productIssueId}`);
    return { record: merged, persisted: true };
  }
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
  console.log(
    `  🎮 [product-issue] [recorded] child=${record.childId} activity=${record.activityId} issue=${record.issueType} severity=${record.severity}`,
  );
  return { record, persisted: true };
}

/**
 * What she (or a parent) said about Sunny's games, oldest first, newest `limit` kept: her words, never an
 * automated audit's summary. Read from the same folder recordProductIssue writes; an unreadable line is logged
 * and skipped, so one bad line never hides the rest.
 */
export function listChildProductIssues(childId: string, opts: Pick<ProductIssueOptions, "rootDir"> & { limit?: number } = {}): ProductIssueRecord[] {
  const dir = productIssueDir(childId, opts);
  if (!fs.existsSync(dir)) return [];
  const rows: ProductIssueRecord[] = [];
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith(".ndjson")).sort()) {
    for (const line of fs.readFileSync(path.join(dir, file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line) as ProductIssueRecord); }
      catch { console.warn(`  🎮 [product-issue] [read] [skipped-line] child=${safeChildId(childId)} file=${file}`); }
    }
  }
  const seen = new Set<string>();
  const heard = rows.filter(row => row.source !== "observed_behavior" && typeof row.childUtterance === "string" && row.childUtterance.trim())
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .filter(row => { const key = row.childUtterance.trim().toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
  return heard.slice(-(opts.limit ?? 8));
}
