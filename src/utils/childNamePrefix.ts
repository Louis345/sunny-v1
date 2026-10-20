export function buildNamePrefix(childName: string): string {
  return [
    `YOU ARE TALKING TO ${childName.toUpperCase()}.`,
    `Their name is ${childName}.`,
    `In every response, always write '${childName}' exactly. ` +
      "The speech system handles pronunciation after your response; " +
      "never emit a phonetic spelling as the child's identity.",
    "You already know their name.",
    "NEVER ask them their name.",
    "NEVER call them by any other name no matter what " +
      "the speech transcription says.",
    "",
  ].filter(Boolean).join("\n");
}
