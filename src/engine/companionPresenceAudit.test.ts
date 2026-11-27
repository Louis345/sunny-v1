import { describe, expect, it } from "vitest";
import { auditCompanionPresence, replyOverlap } from "./companionPresenceAudit";

// Human-caught 2026-11-16 (Ila, in her own report): "Elli is annoying… she keeps saying the same over and over."
// Why the human caught it: Ila heard the same "I can't give you the letters" explanation on word after word.
// Why the logs did not: each reply was a normal completed turn; nothing measured reply length, repeats or how often
// she cut Elli off (12 times in 25 minutes). Why the lab missed it: no lab line graded the companion's presence.
// This audit turns the complaint into numbers read from the server log, so a fix is proven or disproven.

const t = (s: string) => `2026-11-16T22:${s}Z`;
const tts = (s: string, text: string) => `${t(s)}   🔊 TTS: "${text}"`;
const barge = (s: string, state = "SPEAKING") => `${t(s)} 🎮 [audit] component=turn action=barge_in stateBefore=${state} turnState=IDLE tts=on childName=Ila round=1`;
const audio = (s: string, ms: number) => `${t(s)}  🎮 [latency] [turn_first_audio] turn=1 source=final eot_to_first_audio=${ms}ms response_start=4ms`;
const reply = (s: string, words: number, repeat: number) => `${t(s)}  🎮 [companion] [reply] [said] child=ila words=${words} repeat=${repeat}`;

describe("companion presence audit (read from the server log)", () => {
  it("scores two replies that say the same thing as a repeat, and unrelated ones as new", () => {
    expect(replyOverlap("This one's a try-it-yourself word, I can't give you the letters but I can say it again",
      "This one's a try-it-yourself word EYE-lah, I can't give you letters or sounds, want me to say it again?")).toBeGreaterThanOrEqual(0.5);
    expect(replyOverlap("Ooh, an orange, yum!", "Up, down, up, down, nice rhythm! Your lantern houses are glowing.")).toBeLessThan(0.5);
  });

  it("from old logs, rebuilds replies from speech chunks (skipping one-word game prompts) and marks them approximate", () => {
    const log = [
      tts("31:00.400", "This one's a try-it-yourself word, I can't spell it for you, but I can"), tts("31:00.600", "say it again as many times as you need."),
      barge("31:00.700"),
      tts("31:14.300", "circus."),
      tts("31:27.800", "This one's a try-it-yourself word EYE-lah, I can't give you letters or sounds, but I can say it again."),
      barge("32:50.300", "PROCESSING"),
      audio("31:00.700", 1690), audio("31:24.300", 2650), audio("31:30.000", 4035),
    ];
    const result = auditCompanionPresence(log, { from: t("30:00.000"), to: t("40:00.000") });
    expect(result.approximate).toBe(true);
    expect(result.replies).toBe(2);
    expect(result.repeats).toBe(1);
    expect(result.interruptions).toBe(1);
    expect(result.medianFirstAudioMs).toBe(2650);
    expect(result.medianWords).toBeGreaterThan(15);
  });

  it("prefers the exact reply lines when the log has them, and stays inside the window", () => {
    const log = [reply("31:00.000", 12, 0.1), reply("32:00.000", 30, 0.8), reply("33:00.000", 8, 0), reply("50:00.000", 99, 1), barge("31:30.000")];
    const result = auditCompanionPresence(log, { from: t("30:00.000"), to: t("40:00.000") });
    expect(result).toMatchObject({ approximate: false, replies: 3, repeats: 1, medianWords: 12, interruptions: 1, minutes: 10 });
    expect(result.interruptionsPer10Min).toBe(1);
  });
});
