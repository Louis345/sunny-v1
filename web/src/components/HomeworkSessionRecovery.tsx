import { useEffect } from "react";

export function HomeworkSessionRecovery(props: {
  error: string | null;
  /** The server refused the session: retrying cannot succeed, so no Try again. */
  needsGrownUp?: boolean;
  onRetry: () => void;
}) {
  const { error, needsGrownUp } = props;
  useEffect(() => {
    if (needsGrownUp) {
      console.error(` 🎮 [homework-session] [recovery] [needs-grown-up] reason=${error ?? "unknown"}`);
    }
  }, [needsGrownUp, error]);

  if (needsGrownUp) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-slate-950 p-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 text-center shadow-2xl">
          <div aria-hidden="true" className="text-7xl">🧑‍🔧</div>
          <h1 className="mt-4 text-3xl font-black">Get a grown-up.</h1>
          {error ? (
            <p className="mt-6 text-xs text-white/50">{error}</p>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-slate-950 p-6 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 text-center shadow-2xl">
        <div aria-hidden="true" className="text-5xl">☀️</div>
        <h1 className="mt-4 text-3xl font-black">Sunny lost the connection.</h1>
        <p className="mt-3 text-base leading-7 text-white/80">
          Your work is safe. Try again when you are ready.
        </p>
        {error ? (
          <p className="mt-4 text-xs text-white/50">{error}</p>
        ) : null}
        <button
          type="button"
          className="mt-7 rounded-full bg-amber-300 px-8 py-3 text-lg font-black text-slate-950 shadow-lg"
          onClick={props.onRetry}
        >
          Try again
        </button>
      </section>
    </main>
  );
}
