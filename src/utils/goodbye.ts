// User goodbye — end-anchored; session-manager ends without Claude when matched.
export const USER_GOODBYE_PATTERNS =
  /\b(bye\s+elli|goodbye\s+elli|bye\s+bye|we'?re\s+done|i'?m\s+done\s+for\s+today|(?:end|and)\s+the\s+session|(?:end|and)\s+session|that'?s\s+all\s+for\s+today|see\s+you\s+later|gotta\s+go|i\s+have\s+to\s+go|bye|goodbye|goodnight|see\s+you|see\s+you\s+tomorrow|i'?m\s+done|i\s+need\s+to\s+go|exit\s+the\s+program|close\s+the\s+app|stop\s+the\s+session|i\s+want\s+to\s+stop|let'?s\s+stop|can\s+we\s+stop|i'?m\s+finished|all\s+done)[\s.!?]*$/i;

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
