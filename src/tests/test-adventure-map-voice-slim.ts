import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { buildSessionPrompt } from "../agents/prompts";
import { SessionManager } from "../server/session-manager";
import { createSessionContext } from "../server/session-context";
import { shouldUseAdventureMapVoiceSlimToolkit } from "../utils/adventureMapAgentPolicy";

const repoRoot = path.resolve(__dirname, "../..");
const companionIla = path.join(repoRoot, "src/companions/elli.md");

function mockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  } as unknown as WebSocket;
}

describe("shouldUseAdventureMapVoiceSlimToolkit", () => {
  it("is false without ADVENTURE_MAP", () => {
    expect(
      shouldUseAdventureMapVoiceSlimToolkit({
        env: {},
        worksheetMode: false,
        sessionType: "spelling",
      }),
    ).toBe(false);
  });

  it("is false in worksheet mode even when ADVENTURE_MAP", () => {
    expect(
      shouldUseAdventureMapVoiceSlimToolkit({
        env: { ADVENTURE_MAP: "true" },
        worksheetMode: true,
        sessionType: "homework",
      }),
    ).toBe(false);
  });

  it("is false for reading when ADVENTURE_MAP", () => {
    expect(
      shouldUseAdventureMapVoiceSlimToolkit({
        env: { ADVENTURE_MAP: "true" },
        worksheetMode: false,
        sessionType: "reading",
      }),
    ).toBe(false);
  });

  it("is false for diag when ADVENTURE_MAP", () => {
    expect(
      shouldUseAdventureMapVoiceSlimToolkit({
        env: { ADVENTURE_MAP: "true" },
        worksheetMode: false,
        sessionType: "diag",
      }),
    ).toBe(false);
  });

  it("is true for spelling when ADVENTURE_MAP and not worksheet", () => {
    expect(
      shouldUseAdventureMapVoiceSlimToolkit({
        env: { ADVENTURE_MAP: "true" },
        worksheetMode: false,
        sessionType: "spelling",
      }),
    ).toBe(true);
  });
});

describe("buildSessionPrompt — ADVENTURE_MAP voice slim", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("omits canvas capabilities manifest and documents slim tools", async () => {
    vi.stubEnv("ADVENTURE_MAP", "true");
    const prompt = await buildSessionPrompt(
      "Ila",
      companionIla,
      "",
      [],
      "free",
      { carePlan: null },
    );
    expect(prompt).not.toContain("[Canvas Capabilities]");
    expect(prompt).toContain("The adventure map controls which activities appear on screen");
    expect(prompt).toContain("### takeGameScreenshot");
    expect(prompt).toContain("### companionAct");
  });

  it("keeps canvas manifest when ADVENTURE_MAP is off", async () => {
    vi.stubEnv("ADVENTURE_MAP", "false");
    const prompt = await buildSessionPrompt(
      "Ila",
      companionIla,
      "",
      [],
      "free",
      { carePlan: null },
    );
    expect(prompt).toContain("[Canvas Capabilities]");
  });

  it("keeps canvas manifest for reading when ADVENTURE_MAP", async () => {
    vi.stubEnv("ADVENTURE_MAP", "true");
    const prompt = await buildSessionPrompt(
      "Ila",
      companionIla,
      "cat\nbat",
      [],
      "reading",
      { carePlan: null },
    );
    expect(prompt).toContain("[Canvas Capabilities]");
  });
});

describe("SessionManager.buildAgentToolkit — ADVENTURE_MAP voice slim", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("omits canvas tools when ADVENTURE_MAP and session is spelling", () => {
    vi.stubEnv("ADVENTURE_MAP", "true");
    const sm = new SessionManager(mockWs(), "Ila");
    (sm as unknown as { isSpellingSession: boolean }).isSpellingSession = true;
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({ childName: "Ila", sessionType: "spelling" });
    const keys = Object.keys(
      (
        sm as unknown as { buildAgentToolkit(): Record<string, unknown> }
      ).buildAgentToolkit(),
    ).sort();
    expect(keys).not.toContain("canvasShow");
    expect(keys).toContain("takeGameScreenshot");
    expect(keys).toContain("sessionLog");
    expect(keys).toContain("companionAct");
  });

  it("keeps canvas tools for reading session when ADVENTURE_MAP", () => {
    vi.stubEnv("ADVENTURE_MAP", "true");
    const sm = new SessionManager(mockWs(), "Ila");
    (sm as unknown as { isSpellingSession: boolean }).isSpellingSession = false;
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({ childName: "Ila", sessionType: "reading" });
    const keys = Object.keys(
      (
        sm as unknown as { buildAgentToolkit(): Record<string, unknown> }
      ).buildAgentToolkit(),
    );
    expect(keys).toContain("canvasShow");
  });
});
