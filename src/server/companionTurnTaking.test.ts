import { describe, expect, it } from "vitest";
import {
  COMPANION_SPOKEN_TURN_PROMPT,
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
