import { describe, expect, it, vi } from "vitest";
import {
  __resetVoiceSessionRegistryForTests,
  endActiveVoiceSessions,
  registerActiveVoiceSessionManager,
} from "../server/voice-session-registry";

describe("voice-session-registry shutdown", () => {
  it("ends active sessions so shutdown can write debug packets", async () => {
    __resetVoiceSessionRegistryForTests();
    let ended = 0;
    const sm = {
      noteExternalEvent: () => {},
      async end() {
        ended += 1;
      },
    };

    registerActiveVoiceSessionManager("reina", sm);

    await endActiveVoiceSessions();

    expect(ended).toBe(1);
  });

  it("logs failed session finalization and still ends the remaining active sessions", async () => {
    __resetVoiceSessionRegistryForTests();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let ended = 0;
    registerActiveVoiceSessionManager("ila", {
      noteExternalEvent: () => {},
      async end() {
        throw new Error("finalize failed");
      },
    });
    registerActiveVoiceSessionManager("reina", {
      noteExternalEvent: () => {},
      async end() {
        ended += 1;
      },
    });

    await expect(endActiveVoiceSessions()).resolves.toBeUndefined();

    expect(ended).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
