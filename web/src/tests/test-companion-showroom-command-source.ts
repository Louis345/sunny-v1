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

  it("does not let hidden companion slots block the showroom opening curtain", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain(".filter((slot) => slot.slot !== \"hidden\")");
    expect(source).toContain("visibleSlotKeys.every((slotKey)");
    expect(source).not.toContain("expectedSlotKeys.every((slotKey)");
  });

  it("keeps the signature move on authored audio and animation paths", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );
    const signatureMoveBody = source.match(
      /const playSignatureMove = useCallback\([\s\S]*?\n  \}, \[/,
    )?.[0];

    expect(signatureMoveBody).toBeDefined();
    expect(signatureMoveBody).toContain("playSignatureMoveAudio");
    expect(signatureMoveBody).toContain("playCurrentCompanionAnimation(signatureMove.animation");
    expect(signatureMoveBody).not.toContain("createShowroomAnimateCommand");
    expect(signatureMoveBody).not.toContain(".playAnimation(");
  });

  it("maps Kefla's signature move to the MP3 and authored fireball animation", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );
    const generatedSource = readFileSync(
      resolve(__dirname, "../companion/companions.generated.ts"),
      "utf8",
    );

    expect(source).toContain("function playSignatureMoveAudio");
    expect(source).toContain("new Audio(audioUrl)");
    expect(generatedSource).toContain('"animation": "fireball"');
    expect(generatedSource).toContain('"audioUrl": "/sfx/kefla-power-up.mp3"');
  });

  it("keeps the power-up visual active until the signature MP3 ends", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );
    const signatureMoveBody = source.match(
      /const playSignatureMove = useCallback\([\s\S]*?\n  \}, \[/,
    )?.[0];

    expect(source).toContain("onEnded: () => {");
    expect(source).toContain('audio.addEventListener("ended", onEnded');
    expect(signatureMoveBody).toBeDefined();
    expect(signatureMoveBody).toContain("onEnded: () =>");
    expect(signatureMoveBody).not.toContain('setSignatureMoveLevel("idle");\n    }, 2600)');
  });

  it("uses one signature move VFX source for both the stage render and meet card render", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("signatureMoveVfxPreset");
    expect(source).toContain('aria-label={`Play ${current.showroom.signatureMove.name}`}');
    expect(source).toContain('vfxPreset={slot.slot === "current" ? signatureMoveVfxPreset(slot.entry) : undefined}');
    expect(source).toContain('vfxPreset={signatureMoveVfxPreset(entry)}');
  });

  it("does not add generic humanoid bone pose writers that can break existing companions", () => {
    const source = readFileSync(
      resolve(__dirname, "../companion/CompanionMotor.ts"),
      "utf8",
    );

    expect(source).not.toContain("applyNeutralPresentationPoseToVrm");
    expect(source).not.toContain("setRawPose");
    expect(source).not.toContain("setNormalizedPose");
    expect(source).toContain("resolveHumanoidBounds");
  });

  it("renders Kefla's aura through a Three.js VFX layer instead of CSS pose hacks", () => {
    const showroomSource = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );
    const vfxSource = readFileSync(
      resolve(__dirname, "../companion/CompanionVfxLayer.ts"),
      "utf8",
    );

    expect(showroomSource).toContain("CompanionVfxLayer");
    expect(showroomSource).toContain("vfxPreset=");
    expect(showroomSource).toContain("vfxLevel=");
    expect(vfxSource).toContain("new THREE.CanvasTexture");
    expect(vfxSource).toContain("new THREE.Sprite");
    expect(vfxSource).toContain("new THREE.Points");
    expect(vfxSource).toContain("THREE.AdditiveBlending");
    expect(vfxSource).not.toContain("playAnimation");
    expect(vfxSource).not.toContain("createShowroomAnimateCommand");
    expect(vfxSource).not.toContain("getNormalizedBoneNode");
    expect(vfxSource).not.toContain("setNormalizedPose");
  });

  it("keeps power-up VFX fully off until the signature move is triggered", () => {
    const vfxSource = readFileSync(
      resolve(__dirname, "../companion/CompanionVfxLayer.ts"),
      "utf8",
    );

    expect(vfxSource).toContain('if (level === "idle") return 0;');
    expect(vfxSource).toContain("this.aura.visible = intensity > 0");
    expect(vfxSource).toContain("this.light.intensity = intensity === 0 ? 0");
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

  it("honors companion displayScale without adding pose writers", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("companionConfig.displayScale");
    expect(source).toContain("transformOrigin: \"50% 92%\"");
  });

  it("does not expand displayScale companion slots off the showroom stage", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).not.toContain('width: "min(64vw, 620px)"');
    expect(source).not.toContain('height: "min(76vh, 660px)"');
    expect(source).not.toContain('top: "0%"');
  });

  it("caps oversized displayScale values in the showroom motor config", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("SHOWROOM_MAX_DISPLAY_SCALE");
    expect(source).toContain("showroomCompanionConfig");
    expect(source).toContain("displayScale: SHOWROOM_MAX_DISPLAY_SCALE");
    expect(source).toContain(
      "motor.attachVrm(vrm, scene, size.w, size.h, showroomCompanionConfig)",
    );
  });

  it("ticks showroom motors with a companion config instead of null like the diag path", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("mergeCompanionConfigWithDefaults");
    expect(source).toContain("entry.companionConfig");
    expect(source).toContain("resolveModelUrl(showroomCompanionConfig.vrmUrl)");
    expect(source).toContain("companion: showroomCompanionConfig");
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
