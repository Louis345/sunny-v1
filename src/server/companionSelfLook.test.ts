/**
 * BUGS.md S34 (owner, 2026-11-18; human-caught 2026-11-19 01:08 UTC): Ila held two dresses up on Princess in a
 * FaceTime call and asked "you like this dress, or do you like this dress?"; Princess answered "tap the Look button so
 * I can take a peek", then "I can't see anything right now!". Why the human caught it: only a child dressing her
 * companion asks it about its own clothes. Why logs missed it: `vision=false` is normal for every turn, and the
 * reply was polite. Why the lab missed it: no test asked a FaceTime companion what it is wearing.
 * The rule: on FaceTime the companion always knows what it is wearing (code-owned fact), and it can look at itself.
 */
import { describe, expect, it } from "vitest";
import {
  buildShowroomTalkSystemPrompt,
  getShowroomSelfLookTools,
  LOOK_AT_MYSELF_TOOL,
  resolveShowroomTalkRequest,
  selfLookRequested,
} from "./companionShowroomTalk";

const voiceOptions = [{ id: "voice_a", label: "Voice A", language: "en", default: true }];
const opts = { routeCompanionId: "princess", voiceOptions, fallbackVoiceId: "voice_a" };
const base = { childId: "ila", companionId: "princess", voiceId: "voice_a", question: "Do you like this dress?" };
const prompt = (extra: Partial<Parameters<typeof buildShowroomTalkSystemPrompt>[0]>) =>
  buildShowroomTalkSystemPrompt({ companionId: "princess", companionName: "Princess", showroomTheme: "aurora", personality: "", mode: "video_call", ...extra });
const selfSnapshot = { base64: "abc", mimeType: "image/jpeg" as const, reason: "self_look", capturedAt: 1, width: 10, height: 10 };

describe("FaceTime companion knows what it is wearing (S34)", () => {
  it("accepts the call's drawn look and the last three try-ons, newest last", () => {
    const result = resolveShowroomTalkRequest({
      ...base, mode: "video_call",
      companionLook: { outfit: "Sleeveless Dress", accessory: "Cat Ears", recentTryOns: ["Teal Ribbon Dress", "Plum Ribbon Dress", "Sky Ribbon Dress", "Sleeveless Dress"] },
    }, opts);
    expect(result.ok && result.request.companionLook).toEqual({
      outfit: "Sleeveless Dress", accessory: "Cat Ears", recentTryOns: ["Plum Ribbon Dress", "Sky Ribbon Dress", "Sleeveless Dress"],
    });
  });

  it("ignores a look outside a call", () => {
    const result = resolveShowroomTalkRequest({ ...base, companionLook: { outfit: "Sleeveless Dress", accessory: "", recentTryOns: [] } }, opts);
    expect(result.ok && result.request.companionLook).toBeUndefined();
  });

  it("tells the companion its outfit and the dresses just tried, as fact without a picture", () => {
    const text = prompt({ companionLook: { outfit: "Sleeveless Dress", accessory: "", recentTryOns: ["Sky Ribbon Dress", "Sleeveless Dress"] } });
    expect(text).toContain('You are wearing right now: "Sleeveless Dress", no accessory.');
    expect(text).toContain('just tried on you, oldest to newest: "Sky Ribbon Dress", "Sleeveless Dress"');
  });

  // Owner 2026-11-25: Elli remembers. The chart says when the child last chose this look, so Elli can say "you gave me
  // this yesterday" from fact, never from a guess.
  it("tells her when the child chose this look, from her chart (S10)", () => {
    const text = prompt({ companionLook: { outfit: "Sleeveless Dress", accessory: "", recentTryOns: [] },
      lookChosenAt: "2026-11-24T15:00:00.000Z", nowIso: "2026-11-25T16:00:00.000Z" });
    expect(text).toContain("The child chose this look for you on Tue, Nov 24 (about 1 day ago).");
    expect(prompt({ companionLook: { outfit: "", accessory: "", recentTryOns: [] } })).not.toContain("chose this look");
  });

  it("says her own clothes when nothing from the shop is on", () => {
    expect(prompt({ companionLook: { outfit: "", accessory: "", recentTryOns: [] } })).toContain("You are wearing right now: your own clothes, no accessory.");
  });

  it("never sends her to the camera button for her own clothes", () => {
    const text = prompt({ companionLook: { outfit: "Sleeveless Dress", accessory: "", recentTryOns: [] } });
    expect(text).toContain(LOOK_AT_MYSELF_TOOL);
    expect(text).toContain("the Look button shows only the child's camera");
  });

  it("tells her a self picture is herself, not the child's camera", () => {
    const text = prompt({ hasFreshVisualSnapshot: true, visualSnapshotReason: "self_look" });
    expect(text).toContain("The picture in this turn is you: your own portrait on the call");
    expect(text).not.toContain("A fresh camera snapshot is included");
  });
});

describe("look-at-myself tool (S34)", () => {
  it("is offered on a FaceTime turn", () => {
    expect(getShowroomSelfLookTools({ mode: "video_call" }).map(tool => tool.name)).toEqual([LOOK_AT_MYSELF_TOOL]);
  });

  it("is not offered outside a call", () => {
    expect(getShowroomSelfLookTools({ mode: "showroom" })).toEqual([]);
  });

  it("is not offered on the turn that already carries her picture, so a look cannot loop", () => {
    expect(getShowroomSelfLookTools({ mode: "video_call", visualSnapshot: selfSnapshot })).toEqual([]);
  });

  it("reads the request from the reply", () => {
    expect(selfLookRequested([{ type: "text", text: "Let me look!" }, { type: "tool_use", id: "t1", name: LOOK_AT_MYSELF_TOOL, input: {} }])).toBe(true);
    expect(selfLookRequested([{ type: "text", text: "Hi" }])).toBe(false);
  });
});
