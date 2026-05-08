import { describe, expect, it } from "vitest";
import { checkUserGoodbye } from "./session-triggers";

describe("user goodbye detection", () => {
  it("does not end a homework session when bye is casual punctuation after an activity request", () => {
    expect(
      checkUserGoodbye("Good. Okay. Let's get right to the letter rush. Bye."),
    ).toBe(false);
  });

  it("does not end a session for a bare casual farewell", () => {
    expect(checkUserGoodbye("bye")).toBe(false);
    expect(checkUserGoodbye("goodbye")).toBe(false);
    expect(checkUserGoodbye("see you later")).toBe(false);
  });

  it("ends only on explicit session/app termination language", () => {
    expect(checkUserGoodbye("end session")).toBe(true);
    expect(checkUserGoodbye("please end the session")).toBe(true);
    expect(checkUserGoodbye("stop the session")).toBe(true);
    expect(checkUserGoodbye("close the app")).toBe(true);
  });
});
