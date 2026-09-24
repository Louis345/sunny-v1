import { useState } from "react";
import type { GenerationStatus } from "../hooks/useAdaptiveMathGenerationRefresh";

/** Operational status only: no invented ETA, teaching instruction, or learning claim. */
export function LearningPreparationStatus(props: {
  status: GenerationStatus | null;
  error?: string | null;
  paused?: boolean;
  checking?: boolean;
  checkedAt?: number | null;
  preview?: boolean;
  onCheck: () => void;
  onFinish?: () => void;
}) {
  const [finishing,setFinishing]=useState(false);
  const status=props.status;
  const total=status?.nodes.length ?? 0;
  const prepared=status?.nodes.filter(node=>["ready","completed","evidence_locked"].includes(node.status)).length ?? 0;
  const ready=status?.nodes.filter(node=>node.status === "ready").length ?? 0;
  const completed=status?.nodes.filter(node=>node.status === "completed").length ?? 0;
  const locked=status?.nodes.filter(node=>node.status === "evidence_locked").length ?? 0;
  const preparing=status?.nodes.filter(node=>node.status === "preparing").length ?? 0;
  const attention=status?.phase === "needs_attention" || status?.nodes.some(node=>["needs_attention","failed_resumable"].includes(node.status));
  const hasRefreshableWork=status?.nodes.some(node=>["ready","preparing","failed_resumable"].includes(node.status)) ?? false;
  const canCheck=!props.preview && (!attention || hasRefreshableWork);
  const attentionDetail=status?.nodes.some(node=>node.status === "ready") ? "Ready activities are still available; ask a grown-up about the others." : "Ask a grown-up to check preparation before continuing.";
  const title=props.preview ? "Preview finished" : attention ? "Some activities need attention" : ({targeted_planning:"Choosing what to work on",board_designing:"Designing your learning map",board_generating:"Preparing your activities",board_ready:"Your learning map is ready"}[status?.phase ?? ""] ?? "Sunny is preparing your learning path");
  const detail=props.preview ? "No child evidence was saved." : attention ? `Saved work is safe. ${attentionDetail}`
    : ready > 0 && preparing > 0 ? `${ready} ${ready === 1 ? "activity is" : "activities are"} ready. You can begin while ${preparing} more ${preparing === 1 ? "finishes" : "finish"}.`
      : ready > 0 ? `${ready} ${ready === 1 ? "activity is" : "activities are"} ready when you are.`
        : total > 0 && completed === total ? "All activities are complete."
          : locked > 0 && preparing === 0 ? "The map is prepared. Complete earlier learning to unlock the next activity."
        : "Sunny keeps preparing after you leave. You can finish for now and return to this assignment.";
  const checkedDetail=ready > 0 ? `Latest status received — ${ready} ${ready === 1 ? "activity is" : "activities are"} ready.`
    : locked > 0 && preparing === 0 ? "Latest status received — the next activities are still learning-locked."
    : status?.phase === "targeted_planning" ? "Latest status received — Sunny is still planning."
      : status?.phase === "board_designing" ? "Latest status received — Sunny is still designing the map."
        : "Latest status received — Sunny is still preparing the first activity.";
  return <section aria-label="Learning preparation" className="rounded-2xl border border-white/20 bg-zinc-950/95 p-5 text-white shadow-xl">
    <div role="status" aria-live="polite">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-white/80">{detail}</p>
      {total > 0 && <><p className="mt-2 text-sm">{prepared} of {total} activities prepared. {locked > 0 ? `${locked} still ${locked === 1 ? "needs" : "need"} earlier learning.` : ""}</p><progress aria-label="Activities prepared, not time remaining" aria-valuenow={prepared} aria-valuemax={total} max={total} value={prepared} className="mt-2 w-full accent-amber-300" /></>}
      {props.error && <p className="mt-2 text-sm text-amber-200">{props.error}</p>}
      {props.paused && canCheck && <p className="mt-2 text-sm text-white/70">Automatic checks paused. Check progress for the latest status.</p>}
      {!props.checking && props.checkedAt && <p className="mt-2 text-sm text-emerald-200">{checkedDetail}</p>}
    </div>
    <div className="mt-3 flex flex-wrap gap-3">
      {canCheck && <button type="button" disabled={props.checking} className="rounded-full border border-white/40 px-4 py-2 font-bold disabled:cursor-wait disabled:opacity-70" onClick={props.onCheck}>{props.checking ? "Checking progress…" : "Check progress"}</button>}
      {props.onFinish && <button type="button" disabled={finishing} className="rounded-full bg-amber-300 px-4 py-2 font-bold text-zinc-950 disabled:cursor-wait disabled:opacity-70" onClick={()=>{if(finishing)return;setFinishing(true);props.onFinish?.();}}>{finishing ? "Finishing…" : "Finish for now"}</button>}
    </div>
  </section>;
}
