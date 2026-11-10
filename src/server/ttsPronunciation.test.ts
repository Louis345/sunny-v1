import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { narrateGameStimulus } from "./game-event-handler";
import { getTtsNameForSessionChild } from "../profiles/childrenConfig";
import { pronounceForTts, THEME_WORD_PRONUNCIATIONS } from "./ttsPronunciation";

// Bug 2026-11-10 (Ila's session): generated games' narration said "Ayla" for Ila, while Elli already said "EYE-lah",
// and it mispronounced Japanese theme words (Fuji, kappa, tanuki).
// Why the human caught it: she heard the game call her by the wrong name, next to Elli saying it right.
// Why the logs did not: game narration logs the text it sends ("Ayla, …"), which looks like an intended spelling;
// nothing compares it with how the companion says her name.
// Why the lab missed it: Elli's path hard-coded "EYE-lah" in its TTS normalizer, while game narration used the
// config's ttsName ("Ayla"); the two never met in a test, and no test heard a theme word.

async function gameNarrationSpoken(text: string): Promise<string> {
  const sent: string[] = [];
  const bridge = { connect: async () => {}, sendText: (chunk: string) => { sent.push(chunk); }, finish: async () => {}, hadAudioThisTurn: () => true };
  await narrateGameStimulus({ text, metadata: { activityId: "letter-keeper" }, childName: "Ila", ttsLabel: getTtsNameForSessionChild("Ila"), bridge, record: () => {} });
  // The TTS bridge applies the same pronunciations to everything it speaks.
  return pronounceForTts(sent.join(" "));
}

describe("game narration says her name the way Elli does", () => {
  it("speaks Ila as EYE-lah from her chart's pronunciation, never Ayla", async () => {
    const spoken = await gameNarrationSpoken("Great job, Ila! Ready for the next word?");
    expect(spoken).toContain("EYE-lah");
    expect(spoken).not.toContain("Ayla");
  });

  it("fixes games generated with the old spelling of her spoken name", async () => {
    expect(await gameNarrationSpoken("Ayla, the kappa is waiting!")).toContain("EYE-lah");
  });

  it("the companion's own speech uses the same per-child pronunciation", () => {
    expect(pronounceForTts("Hi Ila, nice work.")).toContain("EYE-lah");
    expect(pronounceForTts("Hi Reina!")).toContain(getTtsNameForSessionChild("Reina"));
  });
});

describe("theme words are pronounced from one small lexicon", () => {
  it("covers Fuji, kappa and tanuki", () => {
    for (const word of ["Fuji", "kappa", "tanuki"]) expect(Object.keys(THEME_WORD_PRONUNCIATIONS).map(key => key.toLowerCase())).toContain(word.toLowerCase());
    const spoken = pronounceForTts("We climbed Mount Fuji with a Kappa and two tanukis.");
    expect(spoken).not.toMatch(/\bFuji\b|\bKappa\b|\btanuki/i);
  });

  it("both speech paths use it instead of a hard-coded name", () => {
    for (const file of ["ws-tts-bridge.ts", "companionTalkStream.ts"]) {
      const source = fs.readFileSync(path.join(process.cwd(), "src/server", file), "utf8");
      expect(source, file).toContain("pronounceForTts");
      expect(source, file).not.toContain('"EYE-lah"');
    }
  });
});
