import { expect, it } from "vitest";
import { noteCompanionHelpOnItem, takeCompanionHelpItemIds } from "./companionItemHelp";

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
