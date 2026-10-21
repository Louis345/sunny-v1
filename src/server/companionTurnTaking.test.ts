import { describe, expect, it } from "vitest";
import { COMPANION_SPOKEN_TURN_PROMPT } from "./companionTurnTaking";

describe("Elli's spoken-turn rule", () => {
  // Human catch (Oct 20 PR #21 session): Ila said "You're talking so much", the
  // adults said "reduce the speaking", and five times Ila waited 9-17s behind
  // a long reply. One reply also spoke Elli's private note aloud ("They seem
  // confused... Let me clarify gently").

  it("asks for one or two short sentences, one idea at a time", () => {
    expect(COMPANION_SPOKEN_TURN_PROMPT).toMatch(/one or two short sentences/i);
    expect(COMPANION_SPOKEN_TURN_PROMPT).toMatch(/one idea/i);
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
