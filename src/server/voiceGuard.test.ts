import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GameNarrationRouter, requestGameNarrationForSession } from "./gameNarrationRoute";

// Guard for the scripted-speech audit (docs/audits/deterministic-code.md), owner 2026-11-22: two AIs shared one mouth
// (game scripts spoken in the companion's voice over her live replies; Reina: "it talks too much and doesn't follow
// up"). Rule: nothing reaches the companion's voice except her own model output; nothing reaches the narrator except
// on-screen game text or test words. Every door into either voice is listed here; a new door fails this test until it
// is reviewed against that rule. Doors still carrying scripted words are named with their open audit item.

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const count = (source: string, pattern: RegExp) => source.match(new RegExp(pattern.source, "g"))?.length ?? 0;

function serverSources(): Array<{ rel: string; source: string }> {
  const out: Array<{ rel: string; source: string }> = [];
  for (const dir of ["src/server", "src/agents", "src/engine"]) {
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(path.join(process.cwd(), d), { withFileTypes: true })) {
        const rel = `${d}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.ts$/.test(entry.name) && !/\.test\.ts$|\/tests\//.test(rel)) out.push({ rel, source: read(rel) });
      }
    };
    walk(dir);
  }
  return out;
}

function doors(pattern: RegExp): Record<string, number> {
  const found: Record<string, number> = {};
  for (const { rel, source } of serverSources()) {
    const n = count(source, pattern);
    if (n) found[rel] = n;
  }
  return found;
}

describe("the companion's voice carries only her own model output", () => {
  it("model tokens enter her voice only from the model stream", () => {
    expect(doors(/turnSM\??\.onToken\s*(\?\.)?\(/)).toEqual({ "src/server/companion-response-runner.ts": 1 });
  });

  it("whole lines spoken in her voice come only from these reviewed doors", () => {
    expect(doors(/runDirectCompanionTurnForSession\(/)).toEqual({
      "src/server/companion-response-runner.ts": 1, // its definition
      "src/server/session-manager.ts": 1, // handleCompanionTurn
    });
    const session = read("src/server/session-manager.ts");
    expect(count(session, /\.handleCompanionTurn\s*(\?\.)?\(/)).toBe(3);
    expect(session).toMatch(/speakCompanionWords\(text: string\): Promise<void> \{ return this\.handleCompanionTurn\(text\); \}/); // her own check-in words
    expect(session).toMatch(/replayWorksheetQuestion: \(question\) => this\.handleCompanionTurn\(question\)/); // OPEN audit: worksheet replay
    expect(session).toMatch(/await this\.handleCompanionTurn\(supportText\)/); // OPEN audit: pronunciation help lines
  });

  it("raw text into a TTS stream comes only from these reviewed doors", () => {
    expect(doors(/\.sendText\s*(\?\.)?\(/)).toEqual({
      "src/server/session-manager.ts": 1, // turnSM flush of her model tokens
      "src/server/companion-response-runner.ts": 1, // runDirectCompanionTurnForSession
      "src/server/game-event-handler.ts": 1, // narrateGameStimulus: the NARRATOR voice
      "src/server/routes.ts": 3, // call: model delta, model tool follow-up, OPEN audit: empty-reply fallback line
    });
  });

  it("game narration never plays in her voice: it starts an activity playback, which uses the narrator voice", () => {
    const session = read("src/server/session-manager.ts");
    expect(session).toMatch(/this\.ttsBridge\?\.beginPlayback\(requestId, String\(metadata\.itemId \?\? assessment\?\.itemId \?\? ""\), Boolean\(assessment\), true,/);
    expect(read("src/server/session-bootstrap.ts")).toMatch(/useNarratorVoice\(NARRATOR_VOICE_ID\)/);
  });
});

describe("the narrator reads only on-screen game text or test words", () => {
  it("the narrator is reached only after routing (or a line the voice floor held after routing)", () => {
    expect(doors(/\.speakGameNarration\s*(\?\.)?\(/)).toEqual({
      "src/server/gameNarrationRoute.ts": 1,
      "src/server/session-manager.ts": 1, // playHeldNarration
    });
  });

  it("chat, praise and names never reach the narrator; screen text and test words do", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const spoken: string[] = [];
    const facts: string[] = [];
    const session = {
      gameNarration: new GameNarrationRouter(), childName: "Reina", sessionTtsLabel: "Ray-nah",
      noteExternalEvent: (event: { summary: string }) => facts.push(event.summary),
      speakGameNarration: async (text: string) => { spoken.push(text); },
    };
    session.gameNarration.noteScreen({ launchToken: "l1", currentChallenge: "Which number is bigger?", itemPrompt: "48 or 84" });
    for (const line of ["Ray-nah, first puzzle is up!", "Not mate yet. Check what each number means.", "Check yourself like a champ!", "Great job!"]) {
      await requestGameNarrationForSession(session, line, { launchToken: "l1" });
    }
    expect(spoken).toEqual([]);
    expect(facts).toHaveLength(4);
    await requestGameNarrationForSession(session, "Which number is bigger?", { launchToken: "l1" });
    await requestGameNarrationForSession(session, "48 or 84", { launchToken: "l1" });
    await requestGameNarrationForSession(session, "carnivore.", { word: "carnivore", assessmentMode: true });
    expect(spoken).toEqual(["Which number is bigger?", "48 or 84", "carnivore."]);
  });
});
