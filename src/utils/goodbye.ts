// User goodbye — keep broad (child saying "bye" should end session)
export const USER_GOODBYE_PATTERNS =
  /\b(bye|bye bye|goodbye|goodnight|gotta go|see you|see you later|see you tomorrow|i'm done|i have to go|i need to go|exit the program|close the app|stop the session|end the session|i want to stop|let's stop|can we stop|i'm finished|all done)[\s.!?]*$/i;

// Assistant goodbye — only fire on explicit farewell sentences at end of response
// Must be a standalone farewell phrase, not a word mid-sentence
export const ASSISTANT_GOODBYE_PATTERNS =
  /^(bye|goodbye|goodnight|see you|see you next time|talk soon|until next time|take care)[!.\s]*$|(?:^|\.\s)(bye[!.]?\s*$|goodbye[!.]?\s*$|see you next time[!.]?\s*$)/im;

export function isGoodbye(transcript: string): boolean {
  return USER_GOODBYE_PATTERNS.test(transcript);
}

export function isAssistantGoodbye(text: string): boolean {
  // Only trigger on final sentence of response being a clear farewell
  const sentences = text.split(/(?<=[.!?])\s+/);
  const lastSentence = sentences[sentences.length - 1].trim();
  return ASSISTANT_GOODBYE_PATTERNS.test(lastSentence);
}
