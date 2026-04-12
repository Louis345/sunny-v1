import { describe, it, expect, beforeEach } from "vitest";
import {
  audioAnalyserRef,
  ensurePlaybackAnalyser,
  resetAudioAnalyser,
  rmsFromByteTimeDomain,
  updateMouthSync,
} from "../utils/audioAnalyser";

describe("mouth sync / audioAnalyser (COMPANION-005)", () => {
  beforeEach(() => {
    resetAudioAnalyser();
  });

  it("audioAnalyserRef.current is null initially", () => {
    expect(audioAnalyserRef.current).toBeNull();
  });

  it("ensurePlaybackAnalyser creates analyser and stores ref", () => {
    const node = { fftSize: 2048 } as unknown as AnalyserNode;
    const ctx = {
      createAnalyser: () => node,
    } as unknown as AudioContext;
    const a = ensurePlaybackAnalyser(ctx);
    expect(a).toBe(node);
    expect(audioAnalyserRef.current).toBe(node);
  });

  it("updateMouthSync returns 0.0 when analyser is null", () => {
    expect(updateMouthSync(null, 1 / 60)).toBe(0);
  });

  it("rmsFromByteTimeDomain is 0 for silent center samples", () => {
    const u = new Uint8Array(64);
    u.fill(128);
    expect(rmsFromByteTimeDomain(u)).toBe(0);
  });

  it("rmsFromByteTimeDomain is high for alternating max/min", () => {
    const u = new Uint8Array(64);
    for (let i = 0; i < u.length; i++) {
      u[i] = i % 2 === 0 ? 255 : 0;
    }
    const r = rmsFromByteTimeDomain(u);
    expect(r).toBeGreaterThan(0.7);
  });

  it("updateMouthSync returns value between 0 and 1 with loud mock analyser", () => {
    const buf = new Uint8Array(32);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = i % 2 === 0 ? 255 : 0;
    }
    const analyser = {
      fftSize: buf.length,
      getByteTimeDomainData(out: Uint8Array) {
        out.set(buf);
      },
    } as unknown as AnalyserNode;
    const w = updateMouthSync(analyser, 1 / 60);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(1);
  });

  it("smoothing limits large jumps per frame", () => {
    resetAudioAnalyser();
    const buf = new Uint8Array(64);
    buf.fill(255);
    const analyser = {
      fftSize: buf.length,
      getByteTimeDomainData(out: Uint8Array) {
        out.set(buf);
      },
    } as unknown as AnalyserNode;
    const w1 = updateMouthSync(analyser, 1 / 60);
    const w2 = updateMouthSync(analyser, 1 / 60);
    expect(Math.abs(w2 - w1)).toBeLessThanOrEqual(0.35);
  });

  it("mouth decays toward 0 when analyser becomes null", () => {
    const buf = new Uint8Array(32);
    buf.fill(255);
    const analyser = {
      fftSize: buf.length,
      getByteTimeDomainData(out: Uint8Array) {
        out.set(buf);
      },
    } as unknown as AnalyserNode;
    let w = 0;
    for (let i = 0; i < 5; i++) {
      w = updateMouthSync(analyser, 1 / 60);
    }
    expect(w).toBeGreaterThan(0.2);
    for (let i = 0; i < 30; i++) {
      w = updateMouthSync(null, 1 / 60);
    }
    expect(w).toBe(0);
  });
});
