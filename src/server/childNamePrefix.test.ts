import { describe, expect, it } from "vitest";
import { buildNamePrefix } from "../utils/childNamePrefix";

describe("child identity prompt", () => {
  it("keeps the canonical display name in model text and leaves pronunciation to TTS", () => {
    // Human catch: the screen and Elli transcript called Ila "Ayla." The prompt
    // explicitly ordered the model to emit the phonetic TTS label, so no visual
    // or content harness could distinguish pronunciation metadata from identity.
    const prompt = buildNamePrefix("Ila");

    expect(prompt).toContain("Their name is Ila.");
    expect(prompt).toContain("always write 'Ila'");
    expect(prompt).toContain("speech system handles pronunciation");
    expect(prompt).not.toContain("always write 'Ayla'");
    expect(prompt).not.toContain("never write 'Ila'");
  });
});
