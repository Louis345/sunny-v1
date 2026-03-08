export const GOODBYE_PATTERNS =
  /\b(bye|goodbye|goodnight|gotta go|see you|i'm done|i have to go)\b/i;

export function isGoodbye(transcript: string): boolean {
  return GOODBYE_PATTERNS.test(transcript);
}
