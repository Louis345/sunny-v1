import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { AdventureBoard, HORIZONTAL_ADVENTURE_SLOTS } from "../components/AdventureBoard";
import { buildSlotLabBoard } from "../storybook/adventureBoardFixtures";
import type { AdventureBoardSlot } from "../../../src/shared/adventureBoardJson";

// Humans caught overlapping controls during the kiosk session. State logs cannot
// reveal screen geometry; the old lab verified routes at one wide viewport only.
// Render the real component and CSS so narrow screens become a lab invariant.
it.each([{ width: 901, height: 720 }, { width: 1280, height: 720 }, { width: 768, height: 1024 }, { width: 390, height: 844 }])(
  "keeps every supported slot readable and inside the $width×$height viewport", async viewport => {
    const board = buildSlotLabBoard({ routeShape: "three-way" });
    const prototype = board.nodes.find(node => node.kind === "activity")!;
    board.nodes = (Object.keys(HORIZONTAL_ADVENTURE_SLOTS) as AdventureBoardSlot[]).map(slot => ({
      ...prototype, id: `slot-${slot}`, slot, position: undefined,
      kind: slot === "7" ? "quest" : slot === "8" ? "boss" : slot === "4" ? "choice-gate" : "activity",
      label: slot === "8" ? "Boss challenge" : "Recall checkpoint", shortLabel: undefined,
      state: "locked", lock: { reason: "planner-sequence", label: "Keep going" },
    }));
    board.edges = []; board.choiceSets = [];
    const markup = renderToStaticMarkup(<AdventureBoard board={board} />);
    const css = readFileSync(resolve("src/components/AdventureBoard.css"), "utf8");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport });
      await page.setContent(`<style>${css} body{margin:0}</style>${markup}`);
      const problems = await page.locator(".adventure-board__node").evaluateAll(elements => {
        const boxes = elements.map((element, index) => ({ id: `slot-${index}`, rect: element.getBoundingClientRect() }));
        const outside = boxes.filter(({ rect }) => rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1).map(box => `${box.id} outside`);
        const collisions = boxes.flatMap((a, index) => boxes.slice(index + 1).flatMap(b => {
          const w = Math.max(0, Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left));
          const h = Math.max(0, Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top));
          return w * h > 8 ? [`${a.id} overlaps ${b.id}`] : [];
        }));
        return [...outside, ...collisions];
      });
      expect(problems).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 15000,
);

// Kiosk run 2026-10-13: labels were drawn straight onto the illustrated scene, so the artist's
// text colour had nothing behind it and dark text vanished into the hills. The artist chooses
// text and panel as a pair; the board now draws the label on that panel.
it("draws every node label on a plate of the artist's panel colour", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const css = readFileSync(join(process.cwd(), "src/components/AdventureBoard.css"), "utf8");
  const rule = css.slice(css.indexOf(".adventure-board__node-label {"));
  const body = rule.slice(0, rule.indexOf("}"));
  expect(body).toContain("var(--board-panel)");
  expect(body).toContain("color: var(--board-text)");
  expect(body).toContain("box-shadow");
  expect(body).toContain("border-radius");
  // Live run 7: the "Keep going" chips kept a hard-coded dark background under the artist's dark text.
  const chip = css.slice(css.indexOf(".adventure-board__lock-label {"));
  const chipBody = chip.slice(0, chip.indexOf("}"));
  expect(chipBody).toContain("var(--board-panel)");
  expect(chipBody).toContain("color: var(--board-text)");
});
