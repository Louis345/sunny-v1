import { describe, expect, it, vi } from "vitest";
import { COMPANION_WAKE_NAMES } from "../companions/loader";
import {
  handleCompanionPresenceTranscript,
  routeCompanionPresenceTranscript,
} from "./urgentLearningSupport";

/**
 * Lab invariant (child session 2026-11-05, Ila + Elli): Ila told Elli to go
 * away over and over ("Stop. Eddie. ... Bye. Goodbye. ...") and Elli answered
 * "I'm right here with you" and kept replying to the next utterances. The child
 * caught it because she was the one being talked over. Logs showed each turn as
 * a normal companion response, so nothing looked wrong. The lab only tested
 * short, exact farewells ("Bye Elli"); a real dismissal is long, repeated, and
 * the STT hears "Ellie" as "Eddie".
 */
const ILA_DISMISSAL =
  "Stop. Eddie. Eddie. Go to count. Go to count now. Go go to count now. Eddie, go. Bye. Goodbye. Goodbye. Eddie. No. Go. Ellie, go to count now. Go. She be she be -- No. No. No. No.";

const route = (transcript: string, presence: "collapsed" | "summoned" = "summoned", speechCaptureArmed = false) =>
  routeCompanionPresenceTranscript({ transcript, presence, companionWakeNames: COMPANION_WAKE_NAMES, speechCaptureArmed }).action;

describe("companion dismissal", () => {
  it("dismisses Ila's exact go-away utterance", () => {
    expect(route(ILA_DISMISSAL)).toBe("dismiss");
    expect(route(ILA_DISMISSAL, "summoned", true)).toBe("dismiss");
    // Dismissing never summons her, even when she was already collapsed.
    expect(route(ILA_DISMISSAL, "collapsed")).toBe("dismiss");
  });

  it("dismisses goodbyes, go-away phrases and her name with go/stop/bye", () => {
    for (const text of [
      "Okay goodbye Elli",
      "Bye bye",
      "Go away",
      "Leave me alone",
      "Stop talking",
      "Be quiet please",
      "Eddie, go.",
      "Ellie stop",
      "Stop, Ellie.",
      "Elli bye",
    ]) {
      expect(route(text), text).toBe("dismiss");
    }
  });

  it("does not dismiss game talk or requests to her", () => {
    // Racing in a game: "go" is not addressed to Elli.
    expect(route("Go. Go. Go. This one's a long one.")).not.toBe("dismiss");
    expect(route("Go. Go. Go. This one's a long one.", "collapsed", true)).toBe("route_to_game");
    expect(route("Ellie, go to the next one")).not.toBe("dismiss");
    expect(route("How do you spell goodbye?")).not.toBe("dismiss");
    expect(route("No. No. No.")).not.toBe("dismiss");
  });

  it("collapses on the dismissal and stays quiet until she is called by name", () => {
    let presence: "collapsed" | "summoned" = "summoned";
    const setPresence = vi.fn((state: "collapsed" | "summoned") => { presence = state; });
    const turn = (transcript: string) => handleCompanionPresenceTranscript({
      enabled: true,
      transcript,
      presence,
      companionWakeNames: COMPANION_WAKE_NAMES,
      speechCaptureArmed: false,
      sendFinal: vi.fn(),
      setPresence,
      recordEvent: vi.fn(),
    });
    expect(turn(ILA_DISMISSAL)).toBe(true);
    expect(setPresence).toHaveBeenLastCalledWith("collapsed", "voice");
    // The next utterances (room talk) are not answered.
    expect(turn("Go.")).toBe(true);
    expect(turn("Mom, where are my shoes?")).toBe(true);
    expect(presence).toBe("collapsed");
    // Called by name, she answers again.
    expect(turn("Ellie, what's next?")).toBe(false);
    expect(presence).toBe("summoned");
  });
});
