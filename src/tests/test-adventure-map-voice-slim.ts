import path from "path";
import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { buildSessionPrompt } from "../agents/prompts";
import { SessionManager } from "../server/session-manager";
import { createSessionContext } from "../server/session-context";
import { shouldUseAdventureMapVoiceSlimToolkit } from "../utils/adventureMapAgentPolicy";

const repoRoot = path.resolve(__dirname, "../..");
const companionIla = path.join(repoRoot, "src/companions/elli.md");
const companionReina = path.join(repoRoot, "src/companions/matilda.md");
const promptBanned =
  "Wilson|transitionToWork|Stay in voice|narrate, encourage|Cheer, encourage|React to their performance AFTER|remind them naturally|Never replace speech with only an emote|champion|crush|unstoppable|flawless|Bookbag".split("|");
const profileBanned =
  "showCanvas|mathProblem|LEARNING phase|Dopamine Loop|brief praise|loud celebrations".split("|");

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

  it("does not seed adventure-map companion chatter", async () => {
    vi.stubEnv("ADVENTURE_MAP", "true");
    const prompts = [
      await buildSessionPrompt("Ila", companionIla, "", [], "free", {
        carePlan: null,
      }),
      await buildSessionPrompt("Reina", companionReina, "", [], "free", {
        carePlan: null,
      }),
    ];

    for (const prompt of prompts) {
      for (const phrase of promptBanned) {
        expect(prompt).not.toContain(phrase);
      }
    }
  });

  it("does not leak raw homework targets into the child-facing adventure-map prompt", async () => {
    vi.stubEnv("ADVENTURE_MAP", "true");
    const prompt = await buildSessionPrompt(
      "Reina",
      companionReina,
      "zorbular\nquendle\nplimsy",
      [],
      "spelling",
      { carePlan: null },
    );

    expect(prompt).not.toContain("## Context: words in today's adventure");
    expect(prompt).not.toContain("zorbular");
    expect(prompt).not.toContain("quendle");
    expect(prompt).not.toContain("plimsy");
  });

  it("does not inject map-unlock hype into the child-facing adventure-map prompt", async () => {
    vi.stubEnv("ADVENTURE_MAP", "true");
    const prompt = await buildSessionPrompt(
      "Reina",
      companionReina,
      "zorbular",
      [],
      "spelling",
      { carePlan: null },
    );

    expect(prompt).not.toContain("AI Challenge");
    expect(prompt).not.toContain("something special is coming soon");
    expect(prompt).not.toContain("Build anticipation");
    expect(prompt).not.toContain("Never cause disappointment");
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

describe("companion profile source", () => {
  it("keeps Elli and Matilda compact and non-tutor-shaped", () => {
    const profiles = [
      fs.readFileSync(companionIla, "utf8"),
      fs.readFileSync(companionReina, "utf8"),
    ];

    for (const profile of profiles) {
      expect(profile.split("\n").length).toBeLessThanOrEqual(80);
      for (const phrase of [...promptBanned, ...profileBanned]) {
        expect(profile).not.toContain(phrase);
      }
    }
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
