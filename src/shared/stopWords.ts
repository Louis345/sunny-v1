/**
 * A bare stop: she only told the companion to stop or wait (Ila 11/22: "she doesn't listen when I say stop"). One rule for
 * the call screen (web callTurnFloor) and for her companion in a game (session-manager): her turn ends the companion's,
 * and a bare stop is never sent to the companion as a question.
 */
const STOP_WORDS = new Set(["stop", "wait", "pause", "shh", "shhh", "hush", "quiet", "enough", "hold", "on", "be", "please", "okay", "ok", "no", "hey", "um", "uh", "it", "just", "talking"]);
const STOP_CORE = new Set(["stop", "wait", "pause", "shh", "shhh", "hush", "quiet", "enough", "hold"]);

export function isOnlyStopWords(text: string): boolean {
  const words = text.toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 6 && words.every((word) => STOP_WORDS.has(word)) && words.some((word) => STOP_CORE.has(word));
}
