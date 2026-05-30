import { afterEach, describe, expect, it, vi } from "vitest";
import { playSparkOrbSfx } from "../utils/sparkOrbSfx";

describe("playSparkOrbSfx", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("plays an optional audio file when a sound asset is configured", () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const audioInstances: HTMLAudioElement[] = [];
    const AudioMock = vi.fn(function AudioMock(this: HTMLAudioElement, src: string) {
      this.src = src;
      this.volume = 1;
      this.currentTime = 0;
      this.play = play;
      audioInstances.push(this);
    });
    vi.stubGlobal("Audio", AudioMock);

    playSparkOrbSfx("collected", {
      audioMode: "file",
      audioAssets: {
        collected: "/encounters/spark-orb/sfx/collection-boom.mp3",
      },
      volume: 0.42,
    });

    expect(AudioMock).toHaveBeenCalledWith("/encounters/spark-orb/sfx/collection-boom.mp3");
    expect(audioInstances[0]?.volume).toBe(0.42);
    expect(play).toHaveBeenCalled();
  });

  it("logs optional audio file playback failures instead of swallowing them", async () => {
    const error = new Error("blocked");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const AudioMock = vi.fn(function AudioMock(this: HTMLAudioElement, src: string) {
      this.src = src;
      this.play = vi.fn().mockRejectedValue(error);
    });
    vi.stubGlobal("Audio", AudioMock);

    playSparkOrbSfx("launch", {
      audioMode: "file",
      audioAssets: {
        launch: "/encounters/spark-orb/sfx/orb-launch.mp3",
      },
    });
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith(
      " 🎮 [spark-orb-sfx] [file] [failed]",
      expect.objectContaining({ id: "launch", error }),
    );
  });
});
