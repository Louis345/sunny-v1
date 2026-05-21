import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Companion showroom video-chat flicker lab", () => {
  it("provides a repeatable browser lab with mocked camera, speech, audio, screenshots, and metrics", () => {
    const labPath = resolve(
      __dirname,
      "../../scripts/showroom-video-chat-flicker-lab.mjs",
    );

    expect(existsSync(labPath)).toBe(true);

    const source = readFileSync(labPath, "utf8");
    expect(source).toContain("addInitScript");
    expect(source).toContain("getUserMedia");
    expect(source).toContain("SpeechRecognition");
    expect(source).toContain("MockAudioContext");
    expect(source).toContain("screenshot");
    expect(source).toContain("click_to_listening_ms");
    expect(source).toContain("ask_to_response_ms");
    expect(source).toContain("audio_end_to_idle_ms");
  });
});
