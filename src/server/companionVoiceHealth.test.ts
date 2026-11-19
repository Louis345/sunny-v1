import { afterEach, expect, it, vi } from "vitest";
import * as health from "../engine/sunnyHealth";
import { companionOutageText, companionVoiceDown, noteCompanionVoiceFailed, noteCompanionVoiceOk, resetCompanionVoiceHealth } from "./companionVoiceHealth";

// BUGS.md S26/S27 (Ila on FaceTime, 2026-11-18): the Anthropic credit was empty, every reply failed, her call minutes
// kept being spent, and the screen said "taking a short break. Their choice still counts". Why the human caught it:
// the call went silent while minutes ran. Why logs missed it: failures logged but nothing acted on them. Why the lab
// missed it: no test joined a failing reply to the minute meter. Rule: while replies fail, minutes are free and the
// parent is told once, in plain words.
afterEach(() => { resetCompanionVoiceHealth(); vi.restoreAllMocks(); });

it("marks the voice down on a failed reply, alerts the parent once, and clears on the next good reply", () => {
  const alert = vi.spyOn(health, "raiseParentAlert").mockResolvedValue();
  noteCompanionVoiceFailed("ila", new Error("400 Your credit balance is too low to access the Anthropic API"), 1_000);
  noteCompanionVoiceFailed("ila", new Error("400 Your credit balance is too low"), 2_000);
  expect(companionVoiceDown(3_000)).toBe(true);
  expect(alert).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[0]![0].text).toMatch(/Anthropic credit is empty/);
  noteCompanionVoiceOk("ila");
  expect(companionVoiceDown(3_000)).toBe(false);
  expect(companionVoiceDown(1_000 + 4 * 60_000)).toBe(false);
});

it("names a non-billing failure without guessing a cause", () => {
  expect(companionOutageText("socket hang up")).toMatch(/failing \(socket hang up\)/);
});
