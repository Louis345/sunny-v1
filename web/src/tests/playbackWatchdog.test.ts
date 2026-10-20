import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaybackWatchdog } from "../utils/playbackWatchdog";

// Saori kiosk 2026-10-14: the server announced speech, the voice failed, and no end message ever
// came, so the browser kept the microphone closed. The server now always sends the end; this is
// the browser's own guarantee that a missing end can never lock the microphone for good.
afterEach(() => vi.useRealTimers());
describe("playback watchdog", () => {
  it("releases a playback that hears nothing for the deadline", () => {
    vi.useFakeTimers();
    const release = vi.fn();
    const watchdog = createPlaybackWatchdog(15_000, release);
    watchdog.arm("word-1");
    vi.advanceTimersByTime(14_999);
    expect(release).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(release).toHaveBeenCalledWith("word-1");
  });
  it("keeps waiting while audio is still arriving, and stops when playback ends normally", () => {
    vi.useFakeTimers();
    const release = vi.fn();
    const watchdog = createPlaybackWatchdog(15_000, release);
    watchdog.arm("word-1");
    vi.advanceTimersByTime(10_000);
    watchdog.heard("word-1");
    vi.advanceTimersByTime(10_000);
    expect(release).not.toHaveBeenCalled();
    watchdog.disarm();
    vi.advanceTimersByTime(60_000);
    expect(release).not.toHaveBeenCalled();
  });
  it("ignores audio for a playback that has already been replaced", () => {
    vi.useFakeTimers();
    const release = vi.fn();
    const watchdog = createPlaybackWatchdog(15_000, release);
    watchdog.arm("word-1");
    watchdog.arm("word-2");
    vi.advanceTimersByTime(10_000);
    watchdog.heard("word-1");
    vi.advanceTimersByTime(5_000);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith("word-2");
  });
  it("is wired into the session's speech start, audio and end handling", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(`${process.cwd()}/src/hooks/useSession.ts`, "utf8");
    expect(source).toContain("playbackWatchdogRef.current.arm(");
    expect(source).toContain("playbackWatchdogRef.current.heard(");
    expect(source).toContain("playbackWatchdogRef.current.disarm()");
  });
});
