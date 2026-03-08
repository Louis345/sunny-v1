import { dateTime } from "./tools/dateTime";
import { startSession } from "./tools/startSession";
import { transitionToWork } from "./tools/transitionToWork";
import { logAttempt } from "./tools/logAttempt";
import { saveSessionSummary } from "./tools/saveSessionSummary";

async function main() {
  console.log(await dateTime.execute({}, { toolCallId: "", messages: [] }));
  console.log(
    await startSession.execute(
      { childName: "Ila", timestamp: new Date().toISOString() },
      { toolCallId: "", messages: [] },
    ),
  );
  console.log(
    await transitionToWork.execute(
      { childName: "Ila", timestamp: new Date().toISOString() },
      { toolCallId: "", messages: [] },
    ),
  );
  console.log(
    await logAttempt.execute(
      {
        childName: "Ila",
        word: "cat",
        correct: true,
        timestamp: new Date().toISOString(),
      },
      { toolCallId: "", messages: [] },
    ),
  );
  console.log(
    await saveSessionSummary.execute(
      {
        childName: "Ila",
        summary: "Test session",
        timestamp: new Date().toISOString(),
      },
      { toolCallId: "", messages: [] },
    ),
  );
}

main();
