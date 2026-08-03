import { useEffect, useState, type CSSProperties } from "react";

type Assignment = { homeworkId: string; title: string; domain: string };
type Assessment = { outcome: "supported" | "rejected" | "uncertain"; reason: string; observationIds: string[] };
export type AssignmentLearningReport = {
  childId: string;
  homeworkId: string;
  status: "awaiting_returned_work" | "awaiting_interpretation" | "interpreted";
  lifecycle: string;
  assignment: { title: string; domain: string };
  assumptions: Array<{ assumptionId: string; claim: string; confidence: number; uncertainty: string; assessment: Assessment | null }>;
  predictions: Array<{ predictionId: string; context: string; expectedMetric: { key: string; min: number; max: number }; evaluation: null | { observedMetric: number | null; predictionError: number | null; sufficiency: string } }>;
  observations?: Array<{ observationId: string; prompt?: string; childResponse?: string; result: { correct?: boolean; score?: number; teacherNote?: string } }>;
  latestDecision: null | { status?: string; reason: string; preserve: string[]; change: string[]; testNext: string[]; nextEvidenceRequired: string[] };
};

const pageStyle: CSSProperties = {
  minHeight: "100vh", background: "#f5f2ea", color: "#211a3c",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", padding: "36px 20px",
};
const cardStyle: CSSProperties = {
  background: "white", border: "1px solid #ded8ea", borderRadius: 18, padding: 20, marginBottom: 14,
  boxShadow: "0 8px 28px rgba(43,31,72,.06)",
};

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

function list(values: string[], empty: string) {
  return values.length ? <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p>{empty}</p>;
}

export function LearningReportCard({ report }: { report: AssignmentLearningReport }) {
  if (report.status === "awaiting_returned_work") {
    return <section style={cardStyle}><h2>Waiting for returned work</h2><p>Sunny has recorded its predictions. Upload the marked assignment when it comes home.</p></section>;
  }
  if (report.status === "awaiting_interpretation") {
    return <section style={cardStyle}><h2>Evidence saved</h2><p>The factual results are safe. Sunny is still waiting to interpret what they mean.</p></section>;
  }
  const decision = report.latestDecision;
  return <div>
    <section style={cardStyle}>
      <p style={{ color: "#6d597a", fontWeight: 800, margin: 0 }}>WHAT SUNNY BELIEVED</p>
      <h2>What Sunny believed</h2>
      {report.assumptions.map((item) => <article key={item.assumptionId} style={{ borderTop: "1px solid #eee8f4", padding: "14px 0" }}>
        <strong>{item.claim}</strong>
        <p style={{ color: "#6d597a" }}>{Math.round(item.confidence * 100)}% confidence · {item.uncertainty}</p>
        {item.assessment && <p><b>{item.assessment.outcome.toUpperCase()}</b> — {item.assessment.reason}</p>}
      </article>)}
    </section>
    <section style={cardStyle}>
      <p style={{ color: "#6d597a", fontWeight: 800, margin: 0 }}>WHAT HAPPENED</p>
      <h2>Returned-work evidence</h2>
      {(report.observations ?? []).length
        ? (report.observations ?? []).map((item) => <p key={item.observationId}><b>{item.result.correct === true ? "Correct" : item.result.correct === false ? "Incorrect" : "Observed"}:</b> {item.prompt ?? item.observationId}{item.childResponse ? ` — ${item.childResponse}` : ""}</p>)
        : <p>No item-level observations are available.</p>}
    </section>
    <section style={{ ...cardStyle, borderLeft: "8px solid #6c4ccf" }}>
      <p style={{ color: "#6d597a", fontWeight: 800, margin: 0 }}>WHAT CHANGES NEXT</p>
      <h2>{decision?.status === "revised" ? "Sunny revised its plan" : "Sunny’s learning decision"}</h2>
      <p>{decision?.reason ?? "No interpretation is available."}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
        <div><h3>Preserve</h3>{list(decision?.preserve ?? [], "Nothing specified")}</div>
        <div><h3>Change</h3>{list(decision?.change ?? [], "No change specified")}</div>
        <div><h3>Test next</h3>{list(decision?.testNext ?? [], "No next test specified")}</div>
        <div><h3>Evidence still needed</h3>{list(decision?.nextEvidenceRequired ?? [], "None specified")}</div>
      </div>
    </section>
  </div>;
}

export function LearningReportPage({ childId, initialHomeworkId }: { childId: string; initialHomeworkId?: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState(initialHomeworkId ?? "");
  const [report, setReport] = useState<AssignmentLearningReport | null>(null);
  const [status, setStatus] = useState("Loading assignments…");

  useEffect(() => {
    void fetch(`/api/learning/${encodeURIComponent(childId)}/assignments`)
      .then((response) => jsonResponse<{ assignments: Assignment[] }>(response))
      .then((body) => {
        setAssignments(body.assignments);
        setStatus(body.assignments.length ? "Choose an assignment" : "No assignments found");
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error)));
  }, [childId]);

  useEffect(() => {
    if (!selectedId) return;
    setStatus("Loading learning report…");
    void fetch(`/api/learning/${encodeURIComponent(childId)}/assignments/${encodeURIComponent(selectedId)}/report`)
      .then((response) => jsonResponse<{ report: AssignmentLearningReport }>(response))
      .then((body) => { setReport(body.report); setStatus(""); })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error)));
  }, [childId, selectedId]);

  return <main style={pageStyle}><section style={{ maxWidth: 960, margin: "0 auto" }}>
    <p style={{ color: "#6d597a", fontWeight: 800, marginBottom: 6 }}>SUNNY PARENT</p>
    <h1 style={{ fontSize: "clamp(2rem,5vw,3.4rem)", margin: "0 0 8px" }}>Learning report</h1>
    {status && <p style={{ fontSize: 18 }}>{status}</p>}
    {!selectedId && assignments.map((assignment) => <button key={assignment.homeworkId} type="button" onClick={() => setSelectedId(assignment.homeworkId)} style={{ ...cardStyle, width: "100%", textAlign: "left", color: "inherit" }}>
      <strong style={{ display: "block", fontSize: 20 }}>{assignment.title}</strong><span>{assignment.domain}</span>
    </button>)}
    {selectedId && <button type="button" onClick={() => { setSelectedId(""); setReport(null); }} style={{ border: 0, background: "none", color: "#5a189a", padding: "8px 0 18px" }}>← Choose another assignment</button>}
    {report && <><h2>{report.assignment.title}</h2><LearningReportCard report={report} /></>}
  </section></main>;
}
