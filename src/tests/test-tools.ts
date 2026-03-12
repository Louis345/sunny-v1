import { dateTime, startSession, logAttempt } from "../agents/elli/tools";

async function main() {
  console.log(await dateTime.execute({}, { toolCallId: "", messages: [] }));
  console.log(
    await startSession.execute(
      { childName: "Ila", timestamp: new Date().toISOString() },
      { toolCallId: "", messages: [] },
    ),
  );
  console.log(
    await logAttempt.execute(
      { childName: "Ila", word: "cat", correct: true },
      { toolCallId: "", messages: [] },
    ),
  );
}

main();
