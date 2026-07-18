import { useEffect, useState, type CSSProperties } from "react";

type Assignment = { homeworkId: string; title: string; domain: string };
type ConstructLink = { constructId: string; role: "primary" | "secondary"; confidence: number };
type DraftItem = {
  itemId: string;
  prompt: string;
  childResponse?: string;
  correct?: boolean;
  teacherNote?: string;
  observedErrorType?: string;
  extractionConfidence: number;
  constructLinks: ConstructLink[];
};
type Draft = {
  homeworkId: string;
  source: { sourceId: string };
  score?: { earned: number; possible: number };
  items: DraftItem[];
};

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f6f1e7",
  color: "#231942",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  padding: "40px 20px",
};
const cardStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  border: "2px solid #c9b8e8",
  borderRadius: 16,
  background: "white",
  padding: 18,
  marginBottom: 12,
  color: "inherit",
};

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export function ReturnedWorkPage({ childId }: { childId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState("Loading assignments…");
  const [busy, setBusy] = useState(false);

  function updateItem(itemId: string, update: (item: DraftItem) => DraftItem) {
    setDraft((current) => current
      ? { ...current, items: current.items.map((item) => item.itemId === itemId ? update(item) : item) }
      : current);
  }

  useEffect(() => {
    void fetch(`/api/learning/${encodeURIComponent(childId)}/assignments`)
      .then((response) => jsonResponse<{ assignments: Assignment[] }>(response))
      .then((body) => {
        setAssignments(body.assignments);
        setStatus(body.assignments.length > 0 ? "Choose the original assignment" : "No assignments found");
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error)));
  }, [childId]);

  async function extract() {
    if (!selected || !file) return;
    setBusy(true);
    setStatus("Reading marked work…");
    try {
      const response = await fetch(`/api/learning/${encodeURIComponent(childId)}/assignments/${encodeURIComponent(selected.homeworkId)}/returned-work/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, dataBase64: await fileToBase64(file) }),
      });
      const body = await jsonResponse<{ draft: Draft }>(response);
      setDraft(body.draft);
      setStatus("Review Sunny’s reading before saving");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!draft) return;
    setBusy(true);
    setStatus("Saving evidence…");
    try {
      const response = await fetch(`/api/learning/${encodeURIComponent(childId)}/assignments/${encodeURIComponent(draft.homeworkId)}/returned-work/${encodeURIComponent(draft.source.sourceId)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: draft.score, items: draft.items }),
      });
      await jsonResponse<{ interpretationStatus: string }>(response);
      setStatus("Evidence saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <p style={{ color: "#6d597a", fontWeight: 700, marginBottom: 6 }}>SUNNY PARENT</p>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", margin: "0 0 10px" }}>Return marked work</h1>
        <p style={{ fontSize: 18, marginBottom: 28 }}>{status}</p>

        {!selected && assignments.map((assignment) => (
          <button key={assignment.homeworkId} type="button" style={cardStyle} onClick={() => setSelected(assignment)}>
            <strong style={{ display: "block", fontSize: 20 }}>{assignment.title}</strong>
            <span style={{ color: "#6d597a" }}>{assignment.domain}</span>
          </button>
        ))}

        {selected && !draft && (
          <div style={cardStyle}>
            <button type="button" onClick={() => setSelected(null)} style={{ border: 0, background: "none", color: "#5a189a", padding: 0 }}>← Change assignment</button>
            <h2>{selected.title}</h2>
            <label htmlFor="returned-work-file" style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Marked homework file</label>
            <input id="returned-work-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <button type="button" disabled={!file || busy} onClick={() => void extract()} style={{ ...cardStyle, marginTop: 20, textAlign: "center", background: "#5a189a", color: "white" }}>Review marked work</button>
          </div>
        )}

        {draft && (
          <div>
            {draft.score && <h2>Score: {draft.score.earned} / {draft.score.possible}</h2>}
            {draft.items.map((item) => (
              <article key={item.itemId} style={cardStyle}>
                <strong style={{ display: "block", fontSize: 18 }}>{item.prompt}</strong>
                <small>{Math.round(item.extractionConfidence * 100)}% extraction confidence</small>
                <label style={{ display: "block", marginTop: 14 }}>
                  Child response
                  <input value={item.childResponse ?? ""} onChange={(event) => updateItem(item.itemId, (current) => ({ ...current, childResponse: event.target.value }))} style={{ display: "block", width: "100%", padding: 8 }} />
                </label>
                <label style={{ display: "block", marginTop: 12 }}>
                  Result for {item.prompt}
                  <select value={item.correct === true ? "correct" : item.correct === false ? "incorrect" : "unclear"} onChange={(event) => updateItem(item.itemId, (current) => ({
                    ...current,
                    ...(event.target.value === "unclear" ? { correct: undefined } : { correct: event.target.value === "correct" }),
                  }))} style={{ display: "block", width: "100%", padding: 8 }}>
                    <option value="correct">Correct</option>
                    <option value="incorrect">Incorrect</option>
                    <option value="unclear">Unclear</option>
                  </select>
                </label>
                <label style={{ display: "block", marginTop: 12 }}>
                  Teacher note
                  <input value={item.teacherNote ?? ""} onChange={(event) => updateItem(item.itemId, (current) => ({ ...current, teacherNote: event.target.value }))} style={{ display: "block", width: "100%", padding: 8 }} />
                </label>
                <div style={{ marginTop: 8, color: "#6d597a" }}>{item.constructLinks.map((link) => link.constructId).join(", ")}</div>
              </article>
            ))}
            <button type="button" disabled={busy} onClick={() => void confirm()} style={{ ...cardStyle, textAlign: "center", background: "#2d6a4f", color: "white" }}>Confirm results</button>
          </div>
        )}
      </section>
    </main>
  );
}
