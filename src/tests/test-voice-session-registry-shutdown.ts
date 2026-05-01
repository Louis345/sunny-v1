import { describe, expect, it } from "vitest";
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
});
