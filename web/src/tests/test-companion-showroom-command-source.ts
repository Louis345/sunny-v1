import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createShowroomAnimateCommand,
  createShowroomCameraCommand,
  shouldRunShowroomSlotLoop,
} from "../components/CompanionShowroom";

describe("CompanionShowroom command source", () => {
  it("creates validated animate commands from the same contract path as diag", () => {
    const cmd = createShowroomAnimateCommand("talking", { loop: true });

    expect(cmd).toMatchObject({
      apiVersion: "1.0",
      type: "animate",
      childId: "showroom",
      source: "diag",
      payload: { animation: "talking", loop: true },
    });
    expect(typeof cmd.timestamp).toBe("number");
  });

  it("creates validated camera commands instead of calling the motor directly", () => {
    const cmd = createShowroomCameraCommand("mid-shot");

    expect(cmd).toMatchObject({
      apiVersion: "1.0",
      type: "camera",
      childId: "showroom",
      source: "diag",
      payload: { angle: "mid-shot" },
    });
    expect(typeof cmd.timestamp).toBe("number");
  });

  it("does not enable the showroom-only pose writer", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).not.toContain(".setShowroomIdle(");
  });

  it("does not keep a second showroom-only idle pose path in CompanionMotor", () => {
    const source = readFileSync(
      resolve(__dirname, "../companion/CompanionMotor.ts"),
      "utf8",
    );

    expect(source).not.toContain("setShowroomIdle(");
    expect(source).not.toContain("applyShowroomIdlePose");
  });

  it("does not bypass the validated command path with direct motor animations", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).not.toContain(".playAnimation(");
  });

  it("does not restart idle from a showroom mount/index effect", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).not.toContain("useLayoutEffect");
    expect(source).not.toContain("Object.values(motorsRef.current).forEach");
  });

  it("opens with the meet gesture but restores idle before the card reveal", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );
    const openSpotlightBody = source.match(
      /const openSpotlight = useCallback\([\s\S]*?\n  \}, \[/,
    )?.[0];

    expect(openSpotlightBody).toBeDefined();
    expect(openSpotlightBody).toContain('playShowroomGesture("meet")');
    expect(openSpotlightBody).toContain('playSlotAnimation("prev", "wave"');
    expect(openSpotlightBody).toContain('playSlotAnimation("next", "wave"');
    expect(openSpotlightBody).toContain(
      'playCurrentCompanionAnimation("idle", { loop: true })',
    );
  });

  it("uses diag's mid-shot framing for showroom slots instead of a showroom-only full-body pose view", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain('motor?.setCameraAngle("mid-shot", 680)');
    expect(source).toContain('motor.setCameraAngle("mid-shot", 0)');
    expect(source).not.toContain('contained ? "mid-shot" : "full-body"');
  });

  it("ticks showroom motors with a companion config instead of null like the diag path", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("mergeCompanionConfigWithDefaults");
    expect(source).toContain("entry.companionConfig");
    expect(source).toContain("resolveModelUrl(companionConfig.vrmUrl)");
    expect(source).toContain("companion: companionConfig");
    expect(source).not.toContain("companion: null");
  });

  it("uses a stable analyser callback so card readiness does not recreate motors", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("const getSpeechAnalyser = useCallback");
    expect(source).not.toContain("getAnalyser={() => speechAnalyserRef.current}");
  });

  it("only runs render loops for slots visible enough to compare with diag", () => {
    expect(shouldRunShowroomSlotLoop("hidden", true)).toBe(false);
    expect(shouldRunShowroomSlotLoop("prev", false)).toBe(false);
    expect(shouldRunShowroomSlotLoop("next", false)).toBe(false);
    expect(shouldRunShowroomSlotLoop("prev", true)).toBe(true);
    expect(shouldRunShowroomSlotLoop("current", false)).toBe(true);
    expect(shouldRunShowroomSlotLoop("hidden", false, true)).toBe(true);
  });
});
