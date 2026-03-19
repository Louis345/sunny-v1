import { dateTime, startSession, logAttempt } from "../agents/elli/tools";

async function main() {
  const dateTimeExecute = dateTime.execute;
  const startSessionExecute = startSession.execute;
  const logAttemptExecute = logAttempt.execute;
  if (!dateTimeExecute || !startSessionExecute || !logAttemptExecute) {
    throw new Error("Expected tool execute functions to be defined");
  }

  console.log(await dateTimeExecute({}, { toolCallId: "", messages: [] }));
  console.log(
    await startSessionExecute(
      { childName: "Ila", timestamp: new Date().toISOString() },
      { toolCallId: "", messages: [] },
    ),
  );
  console.log(
    await logAttemptExecute(
      { childName: "Ila", word: "cat", correct: true },
      { toolCallId: "", messages: [] },
    ),
  );
}

main();
