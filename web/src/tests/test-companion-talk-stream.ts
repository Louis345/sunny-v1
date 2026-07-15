import { describe, expect, it } from "vitest";
import {
  isCompanionTalkStreamDisabledByQuery,
  parseCompanionTalkSseChunk,
  pcm16Base64ToFloat32,
} from "../utils/companionTalkStream";

describe("companion talk stream utilities", () => {
  it("parses complete SSE frames and keeps partial frames as remainder", () => {
    const chunk =
      'event: meta\ndata: {"pcmSampleRate":24000}\n\n' +
      'event: text_delta\ndata: {"delta":"Hi "}\n\n' +
      'event: audio\ndata: {"chunk":"AA';
    const { frames, remainder } = parseCompanionTalkSseChunk(chunk);
    expect(frames).toEqual([
      { event: "meta", data: { pcmSampleRate: 24000 } },
      { event: "text_delta", data: { delta: "Hi " } },
    ]);
    expect(remainder).toBe('event: audio\ndata: {"chunk":"AA');

    const rest = remainder + 'BB"}\n\nevent: done\ndata: {"ok":true}\n\n';
    const second = parseCompanionTalkSseChunk(rest);
    expect(second.frames.map((frame) => frame.event)).toEqual(["audio", "done"]);
    expect(second.remainder).toBe("");
  });

  it("skips malformed frames without dropping the rest", () => {
    const chunk =
      "event: audio\ndata: {not-json}\n\n" + 'event: done\ndata: {"ok":true}\n\n';
    const { frames } = parseCompanionTalkSseChunk(chunk);
    expect(frames).toEqual([{ event: "done", data: { ok: true } }]);
  });

  it("decodes little-endian 16-bit PCM into normalized float samples", () => {
    // Samples: 0, 16384 (0.5), -16384 (-0.5), -32768 (-1)
    const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x40, 0x00, 0xc0, 0x00, 0x80]);
    const base64 = btoa(String.fromCharCode(...bytes));
    const samples = pcm16Base64ToFloat32(base64);
    expect(samples.length).toBe(4);
    expect(samples[0]).toBeCloseTo(0, 5);
    expect(samples[1]).toBeCloseTo(0.5, 5);
    expect(samples[2]).toBeCloseTo(-0.5, 5);
    expect(samples[3]).toBeCloseTo(-1, 5);
  });

  it("honors the companionStream=off escape hatch", () => {
    expect(isCompanionTalkStreamDisabledByQuery("?companionStream=off")).toBe(true);
    expect(isCompanionTalkStreamDisabledByQuery("?showroomTheme=crystal")).toBe(false);
    expect(isCompanionTalkStreamDisabledByQuery("")).toBe(false);
  });
});
