import { describe, expect, it } from "vitest";
import { COMPANION_SPOKEN_TURN_PROMPT } from "./companionTurnTaking";
import { buildShowroomTalkSystemPrompt } from "./companionShowroomTalk";

// Owner, 2026-11-21 (Nuance Labs comparison). Ila's 11/20 homework turns: Claude's first word came in 0.6–0.9 s, then
// 0.3–1.4 s more passed before the first whole sentence existed, and Sunny speaks only whole sentences (so a tool call
// never cuts one in half). Why the human caught it: a live side-by-side call felt slow. Why logs missed it: the gap
// (model_first_token → tts_first_text) was logged but never judged. Why the lab missed it: nothing asked for a short opener.
describe("the companion opens with a short first sentence, so her voice starts sooner", () => {
  it("homework sessions", () => {
    expect(COMPANION_SPOKEN_TURN_PROMPT).toMatch(/your voice starts as soon as your first sentence is written/i);
  });

  it("FaceTime calls", () => {
    const prompt = buildShowroomTalkSystemPrompt({ companionId: "elli", companionName: "Elli", showroomTheme: "meadow", personality: "warm", mode: "video_call" });
    expect(prompt).toMatch(/short first sentence/i);
  });
});
