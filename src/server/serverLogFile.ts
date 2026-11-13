import fs from "node:fs";
import path from "node:path";

/**
 * A dated copy of everything the server prints (2026-11-10: the log was overwritten at each restart, taking the
 * proof of Reina's lost morning with it). One file per day, each line stamped with its time, kept seven days.
 * Returns a function that restores the original streams.
 */
export function installServerLogFile(input: { dir: string; now?: () => Date; keepDays?: number }): () => void {
  const now = input.now ?? (() => new Date());
  fs.mkdirSync(input.dir, { recursive: true });
  const cutoff = now().getTime() - (input.keepDays ?? 7) * 86_400_000;
  for (const name of fs.readdirSync(input.dir)) {
    const day = /^(\d{4}-\d{2}-\d{2})\.log$/.exec(name)?.[1];
    if (day && Date.parse(`${day}T23:59:59Z`) < cutoff) fs.rmSync(path.join(input.dir, name), { force: true });
  }
  const originals = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };
  const copy = (chunk: unknown) => {
    try {
      const stamp = now().toISOString();
      const text = String(chunk).split("\n").map((line, index, all) => index === all.length - 1 && !line ? "" : `${stamp} ${line}`).join("\n");
      fs.appendFileSync(path.join(input.dir, `${stamp.slice(0, 10)}.log`), text.endsWith("\n") ? text : `${text}\n`);
    } catch { /* The copy never stops the server; the console line still prints. */ }
  };
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => { copy(chunk); return (originals.out as (...args: unknown[]) => boolean)(chunk, ...rest); }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => { copy(chunk); return (originals.err as (...args: unknown[]) => boolean)(chunk, ...rest); }) as typeof process.stderr.write;
  return () => { process.stdout.write = originals.out; process.stderr.write = originals.err; };
}
