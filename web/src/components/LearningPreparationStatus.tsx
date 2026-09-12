import type { GenerationStatus } from "../hooks/useAdaptiveMathGenerationRefresh";

/** Operational status only: no invented ETA, teaching instruction, or learning claim. */
export function LearningPreparationStatus(props: {
  status: GenerationStatus | null;
  error?: string | null;
  paused?: boolean;
  preview?: boolean;
  onCheck: () => void;
  onFinish?: () => void;
}) {
  const status=props.status;
  const total=status?.nodes.length ?? 0;
  const ready=status?.nodes.filter(node=>["ready","completed","evidence_locked"].includes(node.status)).length ?? 0;
  const attention=status?.phase === "needs_attention" || status?.nodes.some(node=>["needs_attention","failed_resumable"].includes(node.status));
  const attentionDetail=status?.nodes.some(node=>node.status === "ready") ? "Ready activities are still available; ask a grown-up about the others." : "Ask a grown-up to check preparation before continuing.";
  const title=props.preview ? "Preview finished" : attention ? "Some activities need attention" : ({targeted_planning:"Choosing what to work on",board_designing:"Designing your learning map",board_generating:"Preparing your activities",board_ready:"Your learning map is ready"}[status?.phase ?? ""] ?? "Sunny is preparing your learning path");
  return <section aria-label="Learning preparation" className="rounded-2xl border border-white/20 bg-zinc-950/95 p-5 text-white shadow-xl">
    <div role="status" aria-live="polite">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-white/80">{props.preview ? "No child evidence was saved." : attention ? `Saved work is safe. ${attentionDetail}` : "You can finish for now and return to this assignment."}</p>
      {total > 0 && <><p className="mt-2 text-sm">{ready} of {total} activities ready. Some may need earlier learning first.</p><progress aria-label="Activities prepared, not time remaining" aria-valuenow={ready} aria-valuemax={total} max={total} value={ready} className="mt-2 w-full accent-amber-300" /></>}
      {props.error && <p className="mt-2 text-sm text-amber-200">{props.error}</p>}
      {props.paused && <p className="mt-2 text-sm text-white/70">Automatic checks paused. Check progress for the latest status.</p>}
    </div>
    <div className="mt-3 flex flex-wrap gap-3">
      {!props.preview && <button className="rounded-full border border-white/40 px-4 py-2 font-bold" onClick={props.onCheck}>Check progress</button>}
      {props.onFinish && <button className="rounded-full bg-amber-300 px-4 py-2 font-bold text-zinc-950" onClick={props.onFinish}>Finish for now</button>}
    </div>
  </section>;
}
