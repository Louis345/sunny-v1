import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gameControlBoxes, portraitLiftStyle } from "../lib/portraitCorner";

// S41 (arcade reward break, 11/20 01:42 UTC): the companion portrait, fixed bottom-right, sat on the game's fire
// button. The kiosk now reads the open game's controls from its frame and keeps the portrait in a free corner. Why the
// human caught it: the screenshot. Why the logs missed it: nothing logged where the portrait sat. Why the lab missed it:
// no test put a game control under the portrait.

function fakeRect(x: number, y: number, w: number, h: number) {
  return () => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y, toJSON: () => ({}) }) as DOMRect;
}

describe("the portrait reads the open game's controls (S41)", () => {
  it("lists a game's buttons in page coordinates, offset by its frame", () => {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    frame.getBoundingClientRect = fakeRect(100, 50, 1000, 700);
    const gameDoc = frame.contentDocument!;
    gameDoc.body.innerHTML = '<button id="fire">FIRE</button>';
    const fire = gameDoc.getElementById("fire")!;
    fire.getBoundingClientRect = fakeRect(900, 600, 80, 80);
    gameDoc.elementFromPoint = () => fire;
    const boxes = gameControlBoxes(document);
    expect(boxes).toContainEqual({ x: 1000, y: 650, w: 80, h: 80, label: "FIRE" });
    frame.remove();
  });

  // 11/22 owner screenshot: Elli jumped to the top-left corner in Ila's rounding game. Her home is bottom-right; a lift
  // only slides her up the right edge, and only her circle is measured.
  it("keeps her on the right edge, lifted only as far as needed", () => {
    expect(portraitLiftStyle(0, 16)).toEqual({ right: 16, bottom: 16, alignItems: "flex-end" });
    expect(portraitLiftStyle(96, 16)).toEqual({ right: 16, bottom: 112, alignItems: "flex-end" });
    const layer = readFileSync(resolve(__dirname, "../components/CompanionLayer.tsx"), "utf8");
    expect(layer).toContain("usePortraitLift(");
    expect(layer).not.toMatch(/left: 16|top: 16|Corner\(/);
  });
});
