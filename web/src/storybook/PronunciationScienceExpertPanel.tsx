import React from "react";

export type PronunciationProviderName = "azure" | "speechace";

export type ExpertPhonemeScore = {
  phoneme: string;
  score: number | null;
  position: "initial" | "medial" | "final";
  soundMostLike?: string;
};

export type ExpertPronunciationResult = {
  targetWord: string;
  spokenTranscript: string;
  provider: PronunciationProviderName;
  wordScore: number | null;
  phonemeScores: ExpertPhonemeScore[];
  omissions: string[];
  insertions: string[];
  substitutions: Array<{ expected: string; actual: string; position?: "initial" | "medial" | "final" }>;
  wilsonSignals: string[];
  confidence: number;
  flowState: {
    timeOnTask_ms: number;
    bestStreak: number;
    heatReached: boolean;
    comboReached: boolean;
    retries: number;
    missToHitRecoveries: number;
    idleEvents: number;
    pauseRequests: number;
    replayRequests: number;
    powerBarSurvival_ms: number;
    abandoned: boolean;
  };
};

export type ProviderComparison = {
  targetWord: string;
  agreement: "agree" | "mixed" | "insufficient";
  clearestProvider: PronunciationProviderName | "both" | "neither";
  reason: string;
};

export type ProviderStatus = {
  provider: PronunciationProviderName;
  ok: boolean;
  status: "scored" | "missing_key" | "provider_error" | "unsupported_audio";
  message?: string;
};

export interface PronunciationScienceExpertPanelProps {
  results: ExpertPronunciationResult[];
  comparisons: ProviderComparison[];
  providerStatuses?: ProviderStatus[];
  onLiveCompare?: () => void;
  liveCompareStatus?: string;
  liveCompareDisabled?: boolean;
}

const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: "#10131f",
  color: "#f8fafc",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  padding: 24,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 1.15fr) minmax(320px, 0.85fr)",
  gap: 16,
  alignItems: "start",
};

const panel: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.26)",
  background: "rgba(15, 23, 42, 0.88)",
  borderRadius: 8,
  padding: 16,
  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.28)",
};

const panelTitle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 15,
  letterSpacing: 0,
  fontWeight: 800,
};

const muted: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  borderTop: "1px solid rgba(148, 163, 184, 0.16)",
  padding: "8px 0",
};

function scoreColor(score: number | null): string {
  if (score == null) return "#94a3b8";
  if (score >= 80) return "#86efac";
  if (score >= 65) return "#fde68a";
  return "#fca5a5";
}

function percent(score: number | null): string {
  return score == null ? "n/a" : `${Math.round(score)}%`;
}

function compactMs(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "watch" | "bad" }): React.ReactElement {
  const colors = {
    neutral: ["rgba(148, 163, 184, 0.16)", "#cbd5e1"],
    good: ["rgba(34, 197, 94, 0.16)", "#86efac"],
    watch: ["rgba(250, 204, 21, 0.16)", "#fde68a"],
    bad: ["rgba(248, 113, 113, 0.18)", "#fca5a5"],
  }[tone];
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      minHeight: 24,
      padding: "3px 8px",
      borderRadius: 999,
      background: colors[0],
      color: colors[1],
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function ProviderCard({ result }: { result: ExpertPronunciationResult }): React.ReactElement {
  return (
    <section style={panel} aria-label={`${result.provider} pronunciation evidence`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <h2 style={panelTitle}>{result.provider.toUpperCase()} Evidence</h2>
          <div style={muted}>
            Target <strong style={{ color: "#f8fafc" }}>{result.targetWord}</strong> heard as{" "}
            <strong style={{ color: "#f8fafc" }}>{result.spokenTranscript}</strong>
          </div>
        </div>
        <Chip tone={(result.wordScore ?? 0) >= 70 ? "good" : "bad"}>{percent(result.wordScore)}</Chip>
      </div>
      <div style={{ marginTop: 12 }}>
        {result.phonemeScores.map((phoneme) => (
          <div key={`${result.provider}-${phoneme.position}-${phoneme.phoneme}`} style={row}>
            <div>
              <strong>{phoneme.phoneme}</strong>
              <span style={{ ...muted, marginLeft: 8 }}>{phoneme.position}</span>
              {phoneme.soundMostLike ? (
                <span style={{ ...muted, marginLeft: 8 }}>sounds like {phoneme.soundMostLike}</span>
              ) : null}
            </div>
            <strong style={{ color: scoreColor(phoneme.score) }}>{percent(phoneme.score)}</strong>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {result.wilsonSignals.map((signal) => (
          <Chip key={`${result.provider}-${signal}`} tone="watch">{signal.replaceAll("_", " ")}</Chip>
        ))}
      </div>
    </section>
  );
}

function FlowPanel({ result }: { result: ExpertPronunciationResult }): React.ReactElement {
  const flow = result.flowState;
  return (
    <section style={panel} aria-label="Flow-state evidence">
      <h2 style={panelTitle}>Flow-State Evidence</h2>
      <div style={row}><span style={muted}>Best streak</span><strong>{flow.bestStreak}</strong></div>
      <div style={row}><span style={muted}>Heat reached</span><Chip tone={flow.heatReached ? "good" : "neutral"}>{flow.heatReached ? "yes" : "no"}</Chip></div>
      <div style={row}><span style={muted}>Combo reached</span><Chip tone={flow.comboReached ? "good" : "neutral"}>{flow.comboReached ? "yes" : "no"}</Chip></div>
      <div style={row}><span style={muted}>Retries</span><strong>{flow.retries}</strong></div>
      <div style={row}><span style={muted}>Miss to hit recoveries</span><strong>{flow.missToHitRecoveries}</strong></div>
      <div style={row}><span style={muted}>Replay requests</span><strong>{flow.replayRequests}</strong></div>
      <div style={row}><span style={muted}>Power-bar survival</span><strong>{compactMs(flow.powerBarSurvival_ms)}</strong></div>
      <div style={row}><span style={muted}>Abandoned</span><Chip tone={flow.abandoned ? "bad" : "good"}>{flow.abandoned ? "yes" : "no"}</Chip></div>
    </section>
  );
}

function CarePlanPanel({ result }: { result: ExpertPronunciationResult }): React.ReactElement {
  const lowPhonemes = result.phonemeScores
    .filter((phoneme) => (phoneme.score ?? 100) < 65)
    .map((phoneme) => `${phoneme.position} /${phoneme.phoneme}/`);
  const nextMove = lowPhonemes.length > 0
    ? `Next session should probe ${lowPhonemes.join(", ")} before treating the word as mastered.`
    : "Next session can increase pace if retention stays strong.";
  return (
    <section style={panel} aria-label="Care plan expert interpretation">
      <h2 style={panelTitle}>Care Plan Expert</h2>
      <p style={muted}>
        This is educational decision support, not a diagnosis. It explains how the next Sunny plan could adapt.
      </p>
      <div style={row}><span style={muted}>Theory</span><strong>Sound-level support before mastery gate</strong></div>
      <div style={row}><span style={muted}>Support if</span><strong>recovers after model with fewer retries</strong></div>
      <div style={row}><span style={muted}>Revise if</span><strong>same phoneme stays below 65%</strong></div>
      <div style={row}><span style={muted}>Falsify if</span><strong>real reading transfer does not improve</strong></div>
      <p style={{ margin: "12px 0 0", lineHeight: 1.5 }}>{nextMove}</p>
    </section>
  );
}

function ParentPreviewPanel({ result }: { result: ExpertPronunciationResult }): React.ReactElement {
  const weak = result.phonemeScores.find((phoneme) => (phoneme.score ?? 100) < 65);
  const message = weak
    ? `${result.targetWord} was not just right/wrong. The likely issue is the ${weak.position} sound /${weak.phoneme}/. Ila recovered after support, so Sunny should practice that sound pattern again in a short, high-energy round.`
    : `${result.targetWord} looked strong. Sunny should check delayed retention before moving it fully out of practice.`;
  return (
    <section style={panel} aria-label="Parent preview">
      <h2 style={panelTitle}>Parent Preview</h2>
      <p style={{ margin: 0, lineHeight: 1.55 }}>{message}</p>
    </section>
  );
}

export function PronunciationScienceExpertPanel({
  results,
  comparisons,
  providerStatuses = [],
  onLiveCompare,
  liveCompareStatus,
  liveCompareDisabled = false,
}: PronunciationScienceExpertPanelProps): React.ReactElement {
  const first = results[0];
  return (
    <main style={shell}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: 0 }}>Pronunciation Science Expert</h1>
        <p style={{ ...muted, marginTop: 8, maxWidth: 860 }}>
          Shadow-mode review of provider evidence, Wilson-style learning signals, flow-state health, and next-plan implications.
        </p>
        {onLiveCompare ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onLiveCompare}
              disabled={liveCompareDisabled}
              style={{
                border: "1px solid rgba(96, 165, 250, 0.55)",
                background: liveCompareDisabled ? "rgba(51, 65, 85, 0.72)" : "#2563eb",
                color: "#fff",
                minHeight: 36,
                padding: "0 12px",
                borderRadius: 6,
                fontWeight: 800,
                cursor: liveCompareDisabled ? "not-allowed" : "pointer",
              }}
            >
              Record and compare APIs
            </button>
            {liveCompareStatus ? <span style={muted}>{liveCompareStatus}</span> : null}
          </div>
        ) : null}
      </header>
      <div style={grid}>
        <div style={{ display: "grid", gap: 16 }}>
          {results.map((result) => <ProviderCard key={`${result.provider}-${result.targetWord}`} result={result} />)}
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <section style={panel} aria-label="Provider comparison expert">
            <h2 style={panelTitle}>Provider Comparison Expert</h2>
            {providerStatuses.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {providerStatuses.map((status) => (
                  <Chip key={status.provider} tone={status.ok ? "good" : "bad"}>
                    {status.provider}: {status.status}
                  </Chip>
                ))}
              </div>
            ) : null}
            {comparisons.map((comparison) => (
              <div key={comparison.targetWord} style={row}>
                <div>
                  <strong>{comparison.targetWord}</strong>
                  <div style={muted}>{comparison.reason}</div>
                </div>
                <Chip tone={comparison.agreement === "agree" ? "good" : "watch"}>
                  {comparison.clearestProvider}
                </Chip>
              </div>
            ))}
          </section>
          {first ? <FlowPanel result={first} /> : null}
          {first ? <CarePlanPanel result={first} /> : null}
          {first ? <ParentPreviewPanel result={first} /> : null}
        </div>
      </div>
    </main>
  );
}
