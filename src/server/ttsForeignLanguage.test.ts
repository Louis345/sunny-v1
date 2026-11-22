import { describe, expect, it } from "vitest";
import { sanitizeForTTS } from "./session-state";
import { buildShowroomTalkSystemPrompt } from "./companionShowroomTalk";

// S12 (owner 11/16: "Japanese spoken by the companions sounds very bad"; Ila mimics what she hears). Reina's soul asks
// for すごい and やった in Japanese script, but sanitizeForTTS (3/15) deleted every Japanese, Chinese, Korean and Arabic
// character before speech, so only romaji like "Yatta" reached the voice, which read it as English. Why the human
// caught it: the girls repeat the sound. Why the logs missed it: the TTS line is logged after the strip, so it looked
// like the companion wrote romaji. Why the lab missed it: no test sent non-Latin text through the speech path.
describe("companions can say words in any language (S12)", () => {
  it("keeps native script for every language; still drops emoji", () => {
    for (const phrase of ["すごい！やった！", "カッパ", "安心", "안녕하세요", "مرحبا", "Привет", "γεια", "שלום", "नमस्ते", "¡Olé!"]) {
      expect(sanitizeForTTS(`Great job, ${phrase} Reina!`)).toContain(phrase);
    }
    expect(sanitizeForTTS("Great job 🎉 Reina!")).toBe("Great job Reina!");
  });

  it("FaceTime companions get the same native-script rule as homework companions", () => {
    const prompt = buildShowroomTalkSystemPrompt({ companionId: "matilda", companionName: "Matilda", showroomTheme: "garden", personality: "warm", mode: "video_call" });
    expect(prompt).toMatch(/native script/i);
  });
});
