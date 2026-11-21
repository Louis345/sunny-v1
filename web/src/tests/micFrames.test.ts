import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MIC_FRAME_MS, framesFor } from "../utils/micFrames";

// Owner, 2026-11-21 (Nuance Labs comparison): the mic sent audio in 4096-sample frames (256 ms at 16 kHz), so Deepgram
// heard the end of her sentence up to a quarter second late and barge-in needed half a second of her voice. Why the
// human caught it: only a live side-by-side call shows the lag. Why logs missed it: no trace marks her last syllable.
// Why the lab missed it: frame size was a literal in two hooks with no test.

const hook = (name: string) => readFileSync(resolve(__dirname, "../hooks", name), "utf8");

describe("mic frames", () => {
  it("send her voice in frames of 64 ms or less", () => {
    expect(MIC_FRAME_MS).toBeLessThanOrEqual(64);
  });

  it("keep every duration the same in milliseconds, whatever the frame size", () => {
    expect(framesFor(1024) * MIC_FRAME_MS).toBe(1024);
    expect(framesFor(768) * MIC_FRAME_MS).toBe(768);
    expect(framesFor(1)).toBe(1);
  });

  it("both mic paths (homework and FaceTime) capture with the shared frame size", () => {
    for (const name of ["useSession.ts", "useDeepgramVideoCallStt.ts"]) {
      expect(hook(name)).toContain("createScriptProcessor(MIC_FRAME_SAMPLES");
      expect(hook(name)).not.toMatch(/createScriptProcessor\(\d/);
    }
  });
});
