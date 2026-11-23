import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

// Ila, 11/22 evening: "They're saying my name wrong." Her profile spells her name for the voice ("EYE-lah") and the
// homework voice said it right all day, but the FaceTime greeting/goodbye route and the showroom talk route sent text
// straight to ElevenLabs, skipping pronounceForTts, so Princess read "Ila" as written. Why the human caught it: it was
// her own name. Why the logs missed it: the call route logs no spoken text. Why the lab missed it: only the two
// streaming paths were tested. Rule: every text-to-speech call passes through pronounceForTts.
it("every direct text-to-speech call in the routes says her name the way her profile spells it", () => {
  const source = readFileSync(resolve(__dirname, "routes.ts"), "utf8");
  const calls = [...source.matchAll(/textToSpeech\.convert\([^,]+,\s*\{\s*text:\s*([^,\n]+)/g)].map(match => match[1]!.trim());
  expect(calls.length).toBeGreaterThan(0);
  for (const text of calls) expect(text, `convert text: ${text}`).toMatch(/^pronounceForTts\(/);
});
