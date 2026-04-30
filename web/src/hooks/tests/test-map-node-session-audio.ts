import { describe, it, expect } from "vitest";
import { mapNodeSessionAudioFlags } from "../../../../src/shared/mapNodeSessionAudio";

describe("mapNodeSessionAudioFlags", () => {
  it("word-radar suppresses companion TTS while the node is active", () => {
    const f = mapNodeSessionAudioFlags("word-radar");
    expect(f.companionTtsMuted).toBe(true);
  });

  it("cleared map node unmutes companion TTS (regression: after Word Radar / karaoke)", () => {
    expect(mapNodeSessionAudioFlags(null).companionTtsMuted).toBe(false);
  });

  it("karaoke uses same TTS-off default as word-radar while active", () => {
    expect(mapNodeSessionAudioFlags("karaoke").companionTtsMuted).toBe(true);
  });
});
