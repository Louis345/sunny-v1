export const INGEST_STAGE_COUNT = 5;

export type IngestProgress = {
  update(stage: number, label: string): void;
  finish(): void;
};

export function createIngestProgress(options: {
  interactive: boolean;
  write?: (text: string) => void;
}): IngestProgress {
  const write = options.write ?? process.stdout.write.bind(process.stdout);
  let lastWidth = 0;
  let finished = false;

  return {
    update(stage, label) {
      if (finished) return;
      const boundedStage = Math.max(1, Math.min(INGEST_STAGE_COUNT, stage));
      const filled = Math.round((boundedStage / INGEST_STAGE_COUNT) * 10);
      const bar = `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
      const line = `[${bar}] ${boundedStage}/${INGEST_STAGE_COUNT}  ${label}`;
      if (options.interactive) {
        lastWidth = Math.max(lastWidth, line.length);
        write(`\r${line.padEnd(lastWidth, " ")}`);
      } else {
        write(`${line}\n`);
      }
    },
    finish() {
      if (finished) return;
      finished = true;
      if (options.interactive) write("\n");
    },
  };
}

/** Internal ingestion diagnostics are written to the report by the CLI. */
export function ingestDiagnostic(...args: unknown[]): void {
  console.log(...args);
}

export function ingestDiagnosticError(...args: unknown[]): void {
  console.error(...args);
}
