import { expect, it } from "vitest";
import { noteCompanionHelpOnItem, setCompanionSpeechMuted, takeCompanionHelpItemIds } from "./companionItemHelp";

// The server's record of which open problem her companion helped with, per game, taken once at completion.
it("remembers which problems her companion helped with in a game, and hands them over once", () => {
  noteCompanionHelpOnItem("reina", "scout", "p11");
  noteCompanionHelpOnItem("reina", "scout", "p11");
  noteCompanionHelpOnItem("reina", "scout", "p12");
  noteCompanionHelpOnItem("reina", "other", "p1");
  expect(takeCompanionHelpItemIds("reina", "scout")).toEqual(["p11", "p12"]);
  expect(takeCompanionHelpItemIds("reina", "scout")).toEqual([]);
  expect(takeCompanionHelpItemIds("reina", "other")).toEqual(["p1"]);
});

// Lab invariant (Saori logs 11/22–11/25): 47 answers were saved "her companion helped" while she had her companion
// muted, so she never heard the help and her own work was under-credited. The human caught it by noticing Ila leaves
// Elli muted; logs had the mute press and the help note but nothing joined them; the lab never played a muted session.
it("does not count a reply she could not hear as help", () => {
  setCompanionSpeechMuted("ila", true);
  noteCompanionHelpOnItem("ila", "quest", "p1");
  setCompanionSpeechMuted("ila", false);
  noteCompanionHelpOnItem("ila", "quest", "p2");
  expect(takeCompanionHelpItemIds("ila", "quest")).toEqual(["p2"]);
});

it("starts each session unmuted, as her screen does", () => {
  setCompanionSpeechMuted("reina", true);
  setCompanionSpeechMuted("reina", false, "session_start");
  noteCompanionHelpOnItem("reina", "boss", "p3");
  expect(takeCompanionHelpItemIds("reina", "boss")).toEqual(["p3"]);
});
