import { describe, expect, it, vi } from "vitest";
import { SessionManager } from "./session-manager";
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

  it("keeps Ila on screen while sending only the pronunciation label to TTS", async () => {
    const send = vi.fn();
    const sendText = vi.fn();
    const session = {
      childName: "Ila",
      sessionTtsLabel: "EYE-lah",
      turnSM: {
        onEndOfTurn: vi.fn(),
        onAgentComplete: vi.fn(),
        onSpeakingDone: vi.fn(),
      },
      send,
      ttsBridge: {
        connect: vi.fn().mockResolvedValue(undefined),
        sendText,
        finish: vi.fn().mockResolvedValue(undefined),
      },
    };

    await (SessionManager.prototype as any).handleCompanionTurn.call(
      session,
      "Ila, choose the minute hand.",
    );

    expect(send).toHaveBeenCalledWith("response_text", {
      chunk: "Ila, choose the minute hand.",
    });
    expect(sendText).toHaveBeenCalledWith("EYE-lah, choose the minute hand.");
  });
});
