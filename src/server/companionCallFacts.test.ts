import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import * as talk from "./companionShowroomTalk";

// Owner 2026-11-24 (prompt sweep): "I don't like this heavy-handed... it should be fun." On a call the companion is
// her persona plus the facts of the moment. Code decided her opinion of a store item ("Code-owned companion verdict…
// keep the strength of the spoken opinion equal"), and a regex guard rejected and re-asked her speech.

const item = { id: "sky-ribbon-dress", name: "Sky Ribbon Dress", price: 30, category: "outfit" as const, styleTags: ["pastel", "ribbons"],
  owned: false, saved: false, preferenceMatch: false, opinionVerdict: "reject" as const, opinionReasons: ["not her colors"], companionConsentsToWear: true };
const shoppingContext = { mode: "browse", companionMood: { id: "sunny", label: "sunny" }, walletBalance: 40, companionWish: "a star clip",
  selectedItem: item, ownedItemIds: [], savedItemIds: [], wishFulfilled: { itemId: "star-clip", name: "Star Clip" } };

it("the store gives her the item's facts and lets her persona decide what she thinks of it", () => {
  const prompt = talk.buildShowroomTalkSystemPrompt({ companionId: "matilda", companionName: "Matilda", showroomTheme: "aurora", personality: "",
    mode: "video_call", shoppingContext, shoppingEvent: { type: "item_reviewed", itemId: item.id } } as never);
  expect(prompt).toContain("Sky Ribbon Dress");
  expect(prompt).toContain("pastel, ribbons");
  expect(prompt).not.toMatch(/verdict|opinion reasons|preference_match/i);
  expect(prompt).not.toMatch(/\b(Always|Never|Do not|Celebrate|thank them)\b/);
  // Kept: the child controls spending and is never pressured (child safety).
  expect(prompt).toMatch(/The child controls spending/);
});

it("no code checks or re-asks what she says in the store", () => {
  expect((talk as Record<string, unknown>).evaluateShoppingSpeech).toBeUndefined();
  const routes = fs.readFileSync(path.join(process.cwd(), "src/server/routes.ts"), "utf8");
  expect(routes).not.toMatch(/shopping speech guard|evaluateShoppingSpeech/);
});

it("the call prompt, the live-talk facts and call moments state facts, not rules", async () => {
  const { COMPANION_SPOKEN_TURN_PROMPT, companionAbilitiesLine } = await import("./companionTurnTaking");
  const { buildCallMomentTurn } = await import("./companionCallMoment");
  const rule = /\b(never|always|do not|don't|must|keep it short|warmly|in your own words|follow (her|their) lead)\b/i;
  const prompts = [
    talk.buildShowroomTalkSystemPrompt({ companionId: "elli", companionName: "Elli", showroomTheme: "meadow", personality: "", mode: "video_call",
      callSource: "game_reward", relationshipState: "earned_reward", callClock: { event: "time_up", minutesLeft: 0, coins: 10, price: 5, minutes: 1 } } as never),
    talk.buildShowroomTalkSystemPrompt({ companionId: "elli", companionName: "Elli", showroomTheme: "meadow", personality: "", mode: "showroom",
      callSource: "showroom", relationshipState: "previewing", conversationIntent: "repeat_after" } as never),
    COMPANION_SPOKEN_TURN_PROMPT, companionAbilitiesLine(["companionAct"]),
    ...(["showroom_intro", "showroom_plead", "opening", "goodbye"] as const).map(moment => buildCallMomentTurn({ moment } as never)),
  ];
  for (const prompt of prompts) expect(prompt).not.toMatch(rule);
});
