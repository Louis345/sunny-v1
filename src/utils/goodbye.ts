export const GOODBYE_PATTERNS =
  /\b(bye|goodbye|goodnight)\b|^(gotta go|see you|i'm done|i have to go|i need to go)[\s!.]*$/i;

export function isGoodbye(transcript: string): boolean {
  return GOODBYE_PATTERNS.test(transcript);
}
