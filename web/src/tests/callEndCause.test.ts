import { describe, expect, it } from "vitest";
import { callEndPayload } from "../utils/companionVideoCallTrace";

// BUGS.md S42 (owner 2026-11-20: "FaceTime was abruptly interrupted"): Ila's call ended 11 s in, and the trace said only
// call_ended with no cause, so nobody can tell a tap from a code path. Why the human caught it: the child saw the call
// vanish. Why logs missed it: four paths end a call and none said which. Why the lab missed it: no test asked what a
// call_ended record names. Invariant: every end names its cause and how long the call lasted, and an end in the first
// 10 seconds is flagged as early.
describe("what ended the call", () => {
  it("names the cause and the seconds into the call", () => {
    expect(callEndPayload("hang_up_button", 1_000, 61_000)).toEqual({ cause: "hang_up_button", secondsIn: 60, early: false });
  });

  it("flags an end in the first 10 seconds as early", () => {
    expect(callEndPayload("call_clock_goodbye", 1_000, 9_000)).toMatchObject({ secondsIn: 8, early: true });
  });

  it("says the start time is unknown rather than inventing one", () => {
    expect(callEndPayload("wardrobe_store_closed", null, 9_000)).toEqual({ cause: "wardrobe_store_closed", secondsIn: null, early: false });
  });
});
