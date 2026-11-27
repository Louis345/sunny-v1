import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isOnlyStopWords } from "../shared/stopWords";

// Owner eval 11/22 (C6, homework surface): the companion talks on after "Stop". a5811f4c made her stop win on FaceTime
// only (web callTurnFloor). In a game, her speech barged in, but a bare "stop" then went to the companion as a new turn
// and was answered. Why the human caught it: Ila said stop and Elli kept talking. Why logs did not: a barge-in followed
// by a normal reply looks like any turn. Why the lab missed it: the stop test covered the call screen only.
describe("a bare stop ends her companion's turn in a game too, and is never answered", () => {
  it("one shared rule decides what a bare stop is, on the call and in a game", () => {
    expect(isOnlyStopWords("Stop.")).toBe(true);
    expect(isOnlyStopWords("wait wait")).toBe(true);
    expect(isOnlyStopWords("stop, what is 52 minus 3?")).toBe(false);
    expect(fs.readFileSync(path.join(process.cwd(), "web/src/utils/callTurnFloor.ts"), "utf8")).toMatch(/from "\.\.\/\.\.\/\.\.\/src\/shared\/stopWords"/);
  });

  it("the in-game turn path stops on a bare stop before any companion turn starts", () => {
    const session = fs.readFileSync(path.join(process.cwd(), "src/server/session-manager.ts"), "utf8");
    const stop = session.indexOf("isOnlyStopWords(transcript)"), urgent = session.indexOf("state === \"IDLE\" &&\n      this.shouldSuppressTranscriptDuringKaraoke(transcript)");
    expect(stop).toBeGreaterThan(0);
    expect(stop).toBeLessThan(urgent);
    expect(session.slice(stop, stop + 900)).toMatch(/this\.bargeIn\("child_speech"\)[\s\S]*\[companion\] \[stopped\] \[by-child\][\s\S]*return/);
  });
});
