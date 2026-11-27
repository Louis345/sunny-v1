import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { REWARD_GAMES } from "../../../src/shared/gameRegistry.generated";

// Bug 2026-11-10 (Ila's session): a frog-crossing arcade game did not move when she tapped it. The reward games
// are keyboard-first: Asteroid has no mouse input at all, Space Invaders moves only on touch-drag, and Space
// Frogger's tap target is the frog's own square, so a tap on the frog or a short drag can do nothing.
// The kiosk is a Mac driven by taps and clicks, which arrive as mouse/pointer events, not keys or touch events.
// Why the human caught it: she tapped and nothing happened.
// Why the logs did not: a tap that a game ignores produces no event at all.
// Why the lab missed it: game checks load each file and read its contract; none pressed a control with a pointer.
// Every reward game now carries the same on-screen controls (shared script) that press the game's own keys.

const gamesDir = path.join(process.cwd(), "public/games");
const script = fs.readFileSync(path.join(gamesDir, "_arcade-touch.js"), "utf8");

afterEach(() => { document.body.innerHTML = ""; });

function mountControls(keys: string): void {
  const tag = document.createElement("script");
  tag.setAttribute("data-arcade-keys", keys);
  document.body.appendChild(tag);
  Object.defineProperty(document, "currentScript", { value: tag, configurable: true });
  new Function(script)();
  Object.defineProperty(document, "currentScript", { value: null, configurable: true });
}

it("every reward game loads the shared tap controls", () => {
  for (const [gameId, game] of Object.entries(REWARD_GAMES)) {
    const html = fs.readFileSync(path.join(process.cwd(), "public", game.url), "utf8");
    expect(html, gameId).toMatch(/<script[^>]+src="_arcade-touch\.js"[^>]*data-arcade-keys="[^"]+"/);
  }
});

it("a tap on an arrow presses and releases the game's own key", () => {
  mountControls("left,right,up,down,fire");
  const pressed: string[] = [];
  document.addEventListener("keydown", event => pressed.push(`down:${event.key}:${event.code}`));
  document.addEventListener("keyup", event => pressed.push(`up:${event.key}:${event.code}`));
  const left = document.querySelector<HTMLButtonElement>("[data-arcade-key=left]")!;
  left.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  left.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  const fire = document.querySelector<HTMLButtonElement>("[data-arcade-key=fire]")!;
  fire.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  fire.dispatchEvent(new MouseEvent("pointerleave", { bubbles: true }));
  expect(pressed).toEqual(["down:ArrowLeft:ArrowLeft", "up:ArrowLeft:ArrowLeft", "down: :Space", "up: :Space"]);
});

it("shows only the controls a game asks for", () => {
  mountControls("left,right,fire");
  expect([...document.querySelectorAll("[data-arcade-key]")].map(button => button.getAttribute("data-arcade-key"))).toEqual(["left", "right", "fire"]);
});
