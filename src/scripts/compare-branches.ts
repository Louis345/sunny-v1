/**
 * Parse session logs for branch comparison (TASK-001).
 * Expects grep-friendly lines such as: stale_replay_count=3 turn_latency_p50_ms=120
 * (same style as 🎮 [audit] key=value fields). Last occurrence of each key wins.
 */
import fs from "fs";
import path from "path";

export type SessionComparisonMetrics = {
  stale_replay_count: number;
  turn_latency_p50_ms: number;
  karaoke_completion_pct: number;
  barge_in_latency_ms: number;
};

export type CompositeMetricScores = {
  completion: number;
  hesitationAccuracy: number;
  latency: number;
  suppression: number;
  completeOnce: number;
};

const WEIGHTS = {
  completion: 0.3,
  hesitationAccuracy: 0.2,
  latency: 0.2,
  suppression: 0.15,
  completeOnce: 0.15,
} as const;

function extractLastNumeric(logContent: string, key: string): number | null {
  const re = new RegExp(
    `(?:^|[\\s\\[\\]])${key}=(\\d+(?:\\.\\d+)?)\\%?`,
    "gm",
  );
  let last: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(logContent)) !== null) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) last = v;
  }
  return last;
}

export function compareSession(logContent: string): SessionComparisonMetrics {
  const pick = (key: string): number => {
    const v = extractLastNumeric(logContent, key);
    return v === null ? 0 : v;
  };
  return {
    stale_replay_count: pick("stale_replay_count"),
    turn_latency_p50_ms: pick("turn_latency_p50_ms"),
    karaoke_completion_pct: pick("karaoke_completion_pct"),
    barge_in_latency_ms: pick("barge_in_latency_ms"),
  };
}

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function compositeScore(metrics: CompositeMetricScores): number {
  const c = clamp100(metrics.completion);
  const h = clamp100(metrics.hesitationAccuracy);
  const l = clamp100(metrics.latency);
  const s = clamp100(metrics.suppression);
  const o = clamp100(metrics.completeOnce);
  const raw =
    c * WEIGHTS.completion +
    h * WEIGHTS.hesitationAccuracy +
    l * WEIGHTS.latency +
    s * WEIGHTS.suppression +
    o * WEIGHTS.completeOnce;
  return Math.round(Math.min(100, Math.max(0, raw)) * 10) / 10;
}

/** Map raw log metrics to 0–100 subscores for compositeScore (CLI). */
export function rawMetricsToCompositeScores(
  r: SessionComparisonMetrics,
): CompositeMetricScores {
  return {
    completion: clamp100(r.karaoke_completion_pct),
    hesitationAccuracy: clamp100(100 - r.stale_replay_count * 10),
    latency: clamp100(100 - r.turn_latency_p50_ms / 5),
    suppression: clamp100(100 - r.barge_in_latency_ms / 4),
    completeOnce: r.karaoke_completion_pct > 0 ? 100 : 0,
  };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sampleStd(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1);
  return Math.sqrt(v);
}

/** Cohen's d (pooled SD) for two independent samples of composite scores. */
export function cohenDEffectSize(a: number[], b: number[]): number {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return 0;
  const m1 = mean(a);
  const m2 = mean(b);
  const v1 =
    a.reduce((s, x) => s + (x - m1) ** 2, 0) / (n1 - 1);
  const v2 =
    b.reduce((s, x) => s + (x - m2) ** 2, 0) / (n2 - 1);
  const pooled = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  if (pooled === 0) return 0;
  return (m1 - m2) / pooled;
}

function erfApprox(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
  return sign * y;
}

function normCdf(x: number): number {
  return 0.5 * (1 + erfApprox(x / Math.SQRT2));
}

/**
 * Two-sided p-value (normal approximation to Welch) for small session counts.
 * Documented in run-comparison.md; use larger n or external stats for publication.
 */
export function welchPValueNormalApprox(a: number[], b: number[]): number {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 1 || n2 < 1) return 1;
  const m1 = mean(a);
  const m2 = mean(b);
  const v1 = n1 > 1 ? a.reduce((s, x) => s + (x - m1) ** 2, 0) / (n1 - 1) : 0;
  const v2 = n2 > 1 ? b.reduce((s, x) => s + (x - m2) ** 2, 0) / (n2 - 1) : 0;
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (se === 0) return 1;
  const z = Math.abs(m1 - m2) / se;
  const p = 2 * (1 - normCdf(z));
  return Math.min(1, Math.max(1e-9, p));
}

function effectLabel(d: number): string {
  const a = Math.abs(d);
  if (a < 0.2) return "negligible effect";
  if (a < 0.5) return "small effect";
  if (a < 0.8) return "medium effect";
  return "large effect";
}

function scoreSessionsFromFiles(files: string[]): number[] {
  const scores: number[] = [];
  for (const f of files) {
    const abs = path.resolve(f);
    if (!fs.existsSync(abs)) {
      console.error(`  Missing log file: ${abs}`);
      continue;
    }
    const log = fs.readFileSync(abs, "utf8");
    const raw = compareSession(log);
    scores.push(compositeScore(rawMetricsToCompositeScores(raw)));
  }
  return scores;
}

function printHelp(): void {
  console.log(`
compare-branches — aggregate Sunny session logs for two pipeline branches

Usage:
  npx tsx src/scripts/compare-branches.ts --help
  npx tsx src/scripts/compare-branches.ts \\
    --branch-a-label pipecat --branch-a logs/pipe-1.log logs/pipe-2.log logs/pipe-3.log \\
    --branch-b-label legacy --branch-b logs/leg-1.log logs/leg-2.log logs/leg-3.log

Each log file should contain optional summary lines (last value wins), e.g.:
  stale_replay_count=2 turn_latency_p50_ms=120 karaoke_completion_pct=88 barge_in_latency_ms=40

See src/scripts/run-comparison.md for the fixed utterance script and capture steps.
`);
}

function parseMultiArg(argv: string[], flag: string): string[] {
  const i = argv.indexOf(flag);
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < argv.length; j++) {
    if (argv[j].startsWith("--")) break;
    out.push(argv[j]);
  }
  return out;
}

function parseLabel(argv: string[], flag: string, fallback: string): string {
  const i = argv.indexOf(flag);
  if (i < 0 || i + 1 >= argv.length) return fallback;
  const v = argv[i + 1];
  return v.startsWith("--") ? fallback : v;
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const labelA = parseLabel(argv, "--branch-a-label", "branchA");
  const labelB = parseLabel(argv, "--branch-b-label", "branchB");
  const filesA = parseMultiArg(argv, "--branch-a");
  const filesB = parseMultiArg(argv, "--branch-b");

  if (filesA.length === 0 || filesB.length === 0) {
    console.error(
      "Error: provide --branch-a <log files...> and --branch-b <log files...>",
    );
    printHelp();
    process.exitCode = 1;
    return;
  }

  const scoresA = scoreSessionsFromFiles(filesA);
  const scoresB = scoreSessionsFromFiles(filesB);
  if (scoresA.length === 0 || scoresB.length === 0) {
    console.error("Error: no valid scores computed (check log paths).");
    process.exitCode = 1;
    return;
  }

  const mA = mean(scoresA);
  const mB = mean(scoresB);
  const sA = sampleStd(scoresA);
  const sB = sampleStd(scoresB);
  const d = cohenDEffectSize(scoresA, scoresB);
  const p = welchPValueNormalApprox(scoresA, scoresB);
  const winner = mA >= mB ? labelA : labelB;
  const winnerIsA = mA >= mB;

  console.log(
    `Branch A: ${labelA} Sessions: ${scoresA.length} Score: ${mA.toFixed(1)} ± ${sA.toFixed(1)}`,
  );
  console.log(
    `Branch B: ${labelB} Sessions: ${scoresB.length} Score: ${mB.toFixed(1)} ± ${sB.toFixed(1)}`,
  );
  console.log(
    `Winner: ${winner} (p=${p.toFixed(2)}, Cohen d=${(winnerIsA ? d : -d).toFixed(1)} — ${effectLabel(winnerIsA ? d : -d)})`,
  );
}

const ranAsScript =
  typeof process !== "undefined" &&
  process.argv[1]?.replace(/\\/g, "/").includes("compare-branches");

if (ranAsScript) {
  void main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
