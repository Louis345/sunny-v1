import path from "node:path";
import { runAssignmentInboxWorker } from "../server/assignmentInbox";
import { runIngestHomework } from "./ingestHomework";
import { ingestMathAssignment } from "./ingestMathDirect";

function argument(name: string): string {
  const value = process.argv.slice(2).find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3).trim();
  if (!value) throw new Error(`assignment_inbox_worker_argument_missing:${name}`);
  return value;
}

async function main(): Promise<void> {
  const intakeId = argument("intake-id");
  const launchId = argument("launch-id");
  const inboxRoot = path.resolve(argument("inbox-root"));
  const result = await runAssignmentInboxWorker({ intakeId, launchId, pid: process.pid }, {
    inboxRoot,
    ingest: async (record) => {
      if (record.domain === "math") {
        return await ingestMathAssignment({ childId: record.childId, pdf: record.sourceFile });
      }
      const summary = await runIngestHomework([
        "--domain", "spelling",
        `--child=${record.childId}`,
        `--pdf=${record.sourceFile}`,
      ]);
      return { homeworkId: summary.homeworkId };
    },
  });
  if (!result) {
    console.log(` 🎮 [assignment-inbox] [worker-claim] [already-owned] intake=${intakeId}`);
  } else if (result.status === "failed_resumable") {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(` 🎮 [assignment-inbox] [worker] [failed] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
