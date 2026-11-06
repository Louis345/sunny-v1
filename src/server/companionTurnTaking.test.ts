import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPANION_SPOKEN_TURN_PROMPT,
  PRE_AUDIO_RESTART_LIMIT,
  preAudioSpeechAction,
  isBackchannel,
  isEchoOfCompanion,
  shouldBargeIn,
} from "./companionTurnTaking";

describe("barge-in policy", () => {
  // Human request (Oct 20): "people want to overtalk the AI. That's critical."
  // Before: Elli could only be interrupted after 1.5s of speaking, by any sound.
  const speaking = { companionSpoken: "Great job on that word! Now let's look at science.", speakingForMs: 900 };

  it("stops Elli as soon as the child says two real words", () => {
    expect(shouldBargeIn({ ...speaking, interim: "wait can" })).toBe(true);
  });

  it("waits for real words instead of any sound", () => {
    expect(shouldBargeIn({ ...speaking, interim: "um" })).toBe(false);
    expect(shouldBargeIn({ ...speaking, interim: "" })).toBe(false);
  });

  it("lets Elli keep talking through backchannels", () => {
    for (const text of ["uh-huh", "Mm-hmm.", "okay okay", "yeah", "oh right"]) {
      expect(isBackchannel(text)).toBe(true);
      expect(shouldBargeIn({ ...speaking, interim: text })).toBe(false);
    }
    expect(isBackchannel("yes please")).toBe(false);
  });

  it("ignores Elli's own voice coming back through the speakers", () => {
    expect(isEchoOfCompanion("now let's look at science", speaking.companionSpoken)).toBe(true);
    expect(shouldBargeIn({ ...speaking, interim: "now let's look at science" })).toBe(false);
    expect(isEchoOfCompanion("I don't want science", speaking.companionSpoken)).toBe(false);
  });

  it("guards the first 300ms of Elli's speech against her own opening echo", () => {
    expect(shouldBargeIn({ ...speaking, speakingForMs: 150, interim: "wait can" })).toBe(false);
    expect(shouldBargeIn({ ...speaking, speakingForMs: 300, interim: "wait can" })).toBe(true);
  });
});

describe("Elli's spoken-turn rule", () => {
  // Human catch (Oct 20 PR #21 session): Ila said "You're talking so much", the
  // adults said "reduce the speaking", and five times Ila waited 9-17s behind
  // a long reply. One reply also spoke Elli's private note aloud ("They seem
  // confused... Let me clarify gently").

  it("prefers brief conversation with room to expand, without a sentence quota", () => {
    expect(COMPANION_SPOKEN_TURN_PROMPT).toContain("Keep ordinary conversation brief");
    expect(COMPANION_SPOKEN_TURN_PROMPT).toContain("Expand when useful or requested");
    expect(COMPANION_SPOKEN_TURN_PROMPT).not.toMatch(/one or two short sentences/i);
  });

  it("tells Elli that every word is spoken aloud, so private notes never reach the child", () => {
    expect(COMPANION_SPOKEN_TURN_PROMPT).toMatch(/every word you write is spoken aloud/i);
    expect(COMPANION_SPOKEN_TURN_PROMPT).toMatch(/third person/i);
  });

  it("tells Elli to answer what the child just said when interrupted", () => {
    expect(COMPANION_SPOKEN_TURN_PROMPT).toMatch(/interrupt/i);
  });

  it("names no child or companion, since it serves every session", () => {
    for (const name of ["Ila", "Reina", "Elli", "Matilda"]) {
      expect(COMPANION_SPOKEN_TURN_PROMPT).not.toContain(name);
    }
  });
});

describe("speech before the companion's reply is heard", () => {
  // Human-caught: on Nov 3 Reina asked Matilda for help nine times in 32 seconds and got no
  // answer: each new utterance (often just "Matilda" again) cancelled the reply before it
  // played. Logs showed barge_in every time; the lab never spoke twice before first audio.
  const wakeNames = ["Matilda", "Elli", "Ellie", "Sunny"];
  it("does not restart for her companion's name or the same request said again", () => {
    for (const transcript of ["Matilda.", "Lateilda. Matilda.", "Latilda", "Matilda. Matilda. Matilda. Matilda."]) {
      expect(preAudioSpeechAction({ transcript, inFlightRequest: "Can you help me with desired", restarts: 0, wakeNames })).toBe("repeat");
    }
    expect(preAudioSpeechAction({ transcript: "Matilda, can you help me with the word?", inFlightRequest: "Matilda, can you help me with the word?", restarts: 0, wakeNames })).toBe("repeat");
  });
  it("restarts for new words, at most twice per turn, then holds them for right after the reply", () => {
    const said = ["Help me.", "Foot tilt is only", "Look. What's this?", "Yeah.", "Help me."];
    let restarts = 0;
    const actions = said.map(transcript => {
      const action = preAudioSpeechAction({ transcript, inFlightRequest: "Matilda", restarts, wakeNames });
      if (action === "restart") restarts += 1;
      return action;
    });
    expect(actions).toEqual(["restart", "restart", "hold", "hold", "hold"]);
    expect(restarts).toBe(PRE_AUDIO_RESTART_LIMIT);
  });
  it("routes pre-audio speech through the rule in the session", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/server/session-manager.ts"), "utf8");
    expect(source).toContain("preAudioSpeechAction({");
    expect(source).toContain("[turn-taking] [pre-audio]");
  });
});
