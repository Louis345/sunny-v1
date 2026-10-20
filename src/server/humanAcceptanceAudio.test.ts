import { describe, expect, it } from "vitest";
import { assertHumanAcceptanceAudioEnvironment } from "./humanAcceptanceAudio";

const liveAudioEnv = {
  SUNNY_HUMAN_ACCEPTANCE: "true",
  TTS_ENABLED: "true",
  DEEPGRAM_API_KEY: "dg-live-secret",
  ELEVENLABS_API_KEY: "el-live-secret",
  ANTHROPIC_API_KEY: "anthropic-live-secret",
};

describe("human acceptance audio environment", () => {
  it("allows an isolated human session only with the real speech chain", () => {
    expect(() => assertHumanAcceptanceAudioEnvironment(liveAudioEnv)).not.toThrow();
  });

  it.each([
    ["disabled TTS", { TTS_ENABLED: "false" }, "human_acceptance_tts_disabled"],
    ["missing STT", { DEEPGRAM_API_KEY: "" }, "human_acceptance_stt_credentials_missing"],
    ["dummy STT", { DEEPGRAM_API_KEY: "dummy-key" }, "human_acceptance_stt_credentials_not_live"],
    ["missing TTS", { ELEVENLABS_API_KEY: "" }, "human_acceptance_tts_credentials_missing"],
    ["dummy TTS", { ELEVENLABS_API_KEY: "mock-elevenlabs" }, "human_acceptance_tts_credentials_not_live"],
    ["missing companion model", { ANTHROPIC_API_KEY: "" }, "human_acceptance_companion_credentials_missing"],
    ["dummy companion model", { ANTHROPIC_API_KEY: "test-anthropic" }, "human_acceptance_companion_credentials_not_live"],
    [
      "runtime speech substitution",
      { NODE_OPTIONS: "--require=/tmp/deepgram-mock.cjs" },
      "human_acceptance_runtime_hook_forbidden",
    ],
  ])("rejects %s before opening the kiosk", (_label, overrides, expected) => {
    expect(() => assertHumanAcceptanceAudioEnvironment({ ...liveAudioEnv, ...overrides }))
      .toThrow(expected);
  });

  it("does not impose live-provider requirements on non-human lab runs", () => {
    expect(() => assertHumanAcceptanceAudioEnvironment({
      SUNNY_HUMAN_ACCEPTANCE: "false",
      TTS_ENABLED: "false",
      NODE_OPTIONS: "--require=/tmp/deepgram-mock.cjs",
    })).not.toThrow();
  });
});
