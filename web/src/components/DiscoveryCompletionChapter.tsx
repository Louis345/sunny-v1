import { useState } from "react";

/** Ends independent Discovery as a completed child chapter, never as a build wait. */
export function DiscoveryCompletionChapter(props: {
  preview?: boolean;
  onFinish: () => void;
}) {
  const [finishing, setFinishing] = useState(false);
  const finish = () => {
    if (finishing) return;
    setFinishing(true);
    props.onFinish();
  };

  return (
    <section
      aria-label="Discovery complete"
      className="w-full max-w-lg rounded-3xl border border-amber-200/30 bg-zinc-950/95 p-8 text-center text-white shadow-2xl"
    >
      <div aria-hidden="true" className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-amber-300 text-4xl shadow-lg shadow-amber-300/25">
        ⭐
      </div>
      <div role="status" aria-live="polite">
        <h1 className="text-3xl font-black">
          {props.preview ? "Preview complete" : "You did the check!"}
        </h1>
        <p className="mt-3 text-lg text-white/85">
          {props.preview
            ? "No child learning evidence was saved."
            : "Sunny will make your practice board for next time."}
        </p>
      </div>
      <button
        type="button"
        disabled={finishing}
        className="mt-7 rounded-full bg-amber-300 px-7 py-3 text-lg font-black text-zinc-950 disabled:cursor-wait disabled:opacity-70"
        onClick={finish}
      >
        {finishing ? "Finishing…" : "Finish for now"}
      </button>
    </section>
  );
}
