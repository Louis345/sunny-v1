import { describe, expect, it } from "vitest";
import {
  captureSoundForStage,
  hatchHuntMotionFrame,
  hatchSoundForEvent,
  mossyCaptureMotionFrame,
  mossyEscapeMotionFrame,
} from "../components/HatchHuntPolish";

describe("Hatch Hunt sensory polish", () => {
  it("escalates wobble and light as shell stakes rise", () => {
    const first = hatchHuntMotionFrame({
      phase: "cracking",
      crackCount: 0,
      seconds: 1,
      reducedMotion: false,
    });
    const final = hatchHuntMotionFrame({
      phase: "cracking",
      crackCount: 2,
      seconds: 1,
      reducedMotion: false,
    });

    expect(final.wobbleAmplitude).toBeGreaterThan(first.wobbleAmplitude);
    expect(final.lightIntensity).toBeGreaterThan(first.lightIntensity);
    expect(final.heartbeatTempo).toBeGreaterThan(first.heartbeatTempo);
  });

  it("animates shell separation and Mossy emergence during the hatch", () => {
    expect(
      hatchHuntMotionFrame({
        phase: "hatched",
        crackCount: 3,
        seconds: 0,
        reducedMotion: false,
      }),
    ).toMatchObject({ shellSpread: 0, emergence: 0 });
    expect(
      hatchHuntMotionFrame({
        phase: "hatched",
        crackCount: 3,
        seconds: 1.5,
        reducedMotion: false,
      }),
    ).toMatchObject({ shellSpread: 1, emergence: 1 });
  });

  it("keeps reduced-motion presentation calm while preserving state", () => {
    const frame = hatchHuntMotionFrame({
      phase: "cracking",
      crackCount: 2,
      seconds: 1,
      reducedMotion: true,
    });
    expect(frame.wobbleAmplitude).toBe(0);
    expect(frame.bobAmplitude).toBe(0);
    expect(frame.lightIntensity).toBeGreaterThan(0);
  });

  it("maps factual hunt events to bounded child-safe sound cues", () => {
    expect(hatchSoundForEvent("egg_selected")).toBe("awaken");
    expect(hatchSoundForEvent("shell_cracked")).toBe("crack");
    expect(hatchSoundForEvent("shell_resealed")).toBe("reseal");
    expect(hatchSoundForEvent("rescue_started")).toBe("heartbeat");
    expect(hatchSoundForEvent("rescue_recovered")).toBe("recovery");
    expect(hatchSoundForEvent("egg_hatched")).toBe("hatch");
    expect(hatchSoundForEvent("guardian_answered")).toBeNull();
  });

  it("plays Mossy's escape once, centered, and freezes the handoff pose", () => {
    const start = mossyEscapeMotionFrame({ stage: "escaping", seconds: 0 });
    const middle = mossyEscapeMotionFrame({ stage: "escaping", seconds: 0.8 });
    const end = mossyEscapeMotionFrame({ stage: "escaping", seconds: 3 });
    const held = mossyEscapeMotionFrame({ stage: "handoff-ready", seconds: 30 });

    expect([start, middle, end, held].map((frame) => frame.positionX))
      .toEqual([0, 0, 0, 0]);
    expect(middle.depthProgress).toBeGreaterThan(start.depthProgress);
    expect(end.depthProgress).toBe(1);
    expect(middle.runBounce).toBeGreaterThan(0);
    expect(end.runBounce).toBe(0);
    expect(held).toEqual(mossyEscapeMotionFrame({ stage: "handoff-ready", seconds: 0 }));
    expect(held.runBounce).toBe(0);
    expect(held.cameraTargetX).toBe(0);
  });

  it("plays one centered capture pull and freezes the locked orb", () => {
    const waiting = mossyCaptureMotionFrame({ stage: "targeting", seconds: 0 });
    const flight = mossyCaptureMotionFrame({ stage: "orb-flight", seconds: 0.55 });
    const pulling = mossyCaptureMotionFrame({ stage: "pull", seconds: 0.6 });
    const complete = mossyCaptureMotionFrame({ stage: "capture-complete", seconds: 30 });

    expect([waiting, flight, pulling, complete].map((frame) => frame.targetX))
      .toEqual([0, 0, 0, 0]);
    expect(flight.orbProgress).toBeGreaterThan(0);
    expect(pulling.creatureScale).toBeGreaterThan(0);
    expect(pulling.creatureScale).toBeLessThan(1);
    expect(complete.creatureScale).toBe(0);
    expect(complete.orbLocked).toBe(true);
    expect(complete).toEqual(mossyCaptureMotionFrame({ stage: "capture-complete", seconds: 0 }));
  });

  it("maps each capture beat to one bounded sound cue", () => {
    expect(captureSoundForStage("targeting")).toBeNull();
    expect(captureSoundForStage("orb-flight")).toBe("orb-flight");
    expect(captureSoundForStage("impact")).toBe("capture-impact");
    expect(captureSoundForStage("pull")).toBe("capture-pull");
    expect(captureSoundForStage("lock")).toBe("capture-lock");
    expect(captureSoundForStage("capture-complete")).toBe("capture-complete");
  });
});
