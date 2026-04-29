import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createShowroomAnimateCommand,
  createShowroomCameraCommand,
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

  it("uses a stable analyser callback so card readiness does not recreate motors", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("const getSpeechAnalyser = useCallback");
    expect(source).not.toContain("getAnalyser={() => speechAnalyserRef.current}");
  });
});
