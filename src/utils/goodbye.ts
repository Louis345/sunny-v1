// User goodbye — keep broad (child saying "bye" should end session)
export const USER_GOODBYE_PATTERNS =
  /\b(bye|goodbye|goodnight)\b|^(gotta go|see you|i'm done|i have to go|i need to go)[\s!.]*$/i;

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
