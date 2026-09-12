import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { buildAdventureBoardFromActiveSessionPlan } from "../shared/adventureBoardFromPlan";
import type { AdventureBoardJson, AdventureBoardSlot } from "../shared/adventureBoardJson";

const desktopViewport = { width: 2048, height: 1152 };
const artifactDir = resolve(__dirname, "../../web/test-artifacts/adventure-board-layout-regression");
const screenshotPath = resolve(artifactDir, "failure.png");
const reportPath = resolve(artifactDir, "failure-bounding-boxes.json");

const theme: AdventureBoardJson["theme"] = {
  background: { type: "solid", value: "#10233f" },
  palette: {
    path: "#ffffff",
    completed: "#2f9f6f",
    available: "#7058f4",
    locked: "#aeb7c2",
    current: "#ef9825",
    preview: "#d5dde5",
    text: "#ffffff",
    panel: "rgba(21, 31, 50, 0.80)",
  },
};

const slotCoordinates: Record<AdventureBoardSlot, { x: number; y: number }> = {
  "1": { x: 0.10, y: 0.82 },
  "2": { x: 0.22, y: 0.68 },
  "3": { x: 0.33, y: 0.56 },
  "4": { x: 0.43, y: 0.50 },
  "5a.1": { x: 0.52, y: 0.25 },
  "5a.2": { x: 0.62, y: 0.20 },
  "5a.3": { x: 0.70, y: 0.25 },
  "5b.1": { x: 0.52, y: 0.73 },
  "5b.2": { x: 0.62, y: 0.78 },
  "5b.3": { x: 0.70, y: 0.73 },
  "5c.1": { x: 0.52, y: 0.50 },
  "5c.2": { x: 0.62, y: 0.50 },
  "5c.3": { x: 0.70, y: 0.50 },
  "6": { x: 0.76, y: 0.50 },
  "6.1": { x: 0.74, y: 0.58 },
  "6.2": { x: 0.78, y: 0.42 },
  "7": { x: 0.84, y: 0.31 },
  "8": { x: 0.91, y: 0.13 },
};

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type NodeBox = {
  id: string;
  kind: string;
  label: string;
  rect: Rect;
  labelRect: Rect;
};

let browser: Browser | null = null;

afterEach(async () => {
  await browser?.close();
  browser = null;
});

describe("AdventureBoard visual layout invariants", () => {
  it("keeps normalized route labels, Mystery, Quest, Boss, and companion space from overlapping", async () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId: "visual-route-regression",
        childId: "reina",
        domain: "spelling",
        nodePlan: [
          { id: "node-baseline-sl", type: "word-radar", activityId: "word-radar", targets: ["sign"], targetLane: "silent_letters" },
          { id: "node-baseline-hfw", type: "word-radar", activityId: "word-radar", targets: ["among"], targetLane: "high_frequency_words" },
          { id: "node-route-a-spell", type: "spell-check", activityId: "spell-check", targets: ["sign"], targetLane: "silent_letters" },
          { id: "node-route-b-pronunciation", type: "pronunciation", activityId: "pronunciation", targets: ["among"], targetLane: "high_frequency_words" },
          { id: "node-mystery", type: "mystery", activityId: "mystery", targets: ["sign", "among"] },
          { id: "node-quest", type: "quest", activityId: "quest", targets: ["sign"], locked: true, masteryUnlockState: "preparing" },
          { id: "node-boss", type: "boss", activityId: "boss", targets: [], locked: true, masteryUnlockState: "preparing" },
        ],
        learningRoutes: [
          {
            id: "spell-route",
            label: "Spell Route",
            rationale: "Only spell-check should become the upper divergent route.",
            nodeIds: ["node-baseline-sl", "node-route-a-spell", "node-mystery", "node-quest", "node-boss"],
          },
          {
            id: "voice-route",
            label: "Voice Route",
            rationale: "Only pronunciation should become the lower divergent route.",
            nodeIds: ["node-baseline-hfw", "node-route-b-pronunciation", "node-mystery", "node-quest", "node-boss"],
          },
        ],
      },
      boardId: "visual-route-regression",
      theme,
    });

    expect(board.nodes.some((node) => node.slot === "5c.1" || node.slot === "5c.2")).toBe(false);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: desktopViewport });
    await page.setContent(renderBoardHtml(board), { waitUntil: "domcontentloaded" });

    const boxes = await page.$$eval(".adventure-board__node", (nodes): NodeBox[] => {
      const serializeRect = (rect: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      }): Rect => ({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
      return nodes.map((node) => {
        const label = node.querySelector(".adventure-board__node-label");
        const nodeRect = node.getBoundingClientRect();
        const labelRect = label?.getBoundingClientRect() ?? nodeRect;
        return {
          id: node.getAttribute("data-node-id") ?? "",
          kind: node.getAttribute("data-node-kind") ?? "",
          label: label?.textContent ?? "",
          rect: serializeRect(nodeRect),
          labelRect: serializeRect(labelRect),
        };
      });
    });

    try {
      const readableLabels = boxes.filter((box) => box.label);
      for (let index = 0; index < readableLabels.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < readableLabels.length; otherIndex += 1) {
          expect(overlapArea(readableLabels[index]!.labelRect, readableLabels[otherIndex]!.labelRect)).toBeLessThanOrEqual(8);
        }
      }

      const routeLabels = boxes.filter((box) =>
        ["node-route-a-spell", "node-route-b-pronunciation", "choose-path"].includes(box.id));
      const destinations = boxes.filter((box) => ["mystery", "quest", "boss"].includes(box.kind));
      for (const routeLabel of routeLabels) {
        for (const destination of destinations) {
          expect(overlapArea(routeLabel.labelRect, destination.rect)).toBeLessThanOrEqual(8);
        }
      }

      const companionVisualBox: Rect = {
        left: desktopViewport.width * 0.76,
        top: desktopViewport.height * 0.44,
        right: desktopViewport.width * 0.96,
        bottom: desktopViewport.height,
        width: desktopViewport.width * 0.20,
        height: desktopViewport.height * 0.56,
      };
      for (const destination of destinations.filter((box) => box.kind === "quest" || box.kind === "boss")) {
        expect(overlapArea(destination.labelRect, companionVisualBox)).toBeLessThanOrEqual(8);
      }
    } catch (error) {
      await mkdir(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await writeFile(reportPath, JSON.stringify({ boxes }, null, 2));
      throw error;
    }
  });
});

function renderBoardHtml(board: AdventureBoardJson): string {
  const css = readFileSync(resolve(__dirname, "../../web/src/components/AdventureBoard.css"), "utf8");
  const nodes = board.nodes
    .map((node) => {
      const position = node.position ?? (node.slot ? slotCoordinates[node.slot] : undefined);
      if (!position) return "";
      return `
        <button
          class="adventure-board__node adventure-board__node--${node.kind} adventure-board__node--${node.state}"
          data-node-id="${escapeHtml(node.id)}"
          data-node-kind="${escapeHtml(node.kind)}"
          style="left: ${position.x * 100}%; top: ${position.y * 100}%"
        >
          <span class="adventure-board__node-orb"></span>
          <span class="adventure-board__node-label">${escapeHtml(node.shortLabel ?? node.label)}</span>
        </button>`;
    })
    .join("\n");
  return `<!doctype html>
    <html>
      <head>
        <style>${css}</style>
        <style>
          body { margin: 0; }
          .adventure-board { width: ${desktopViewport.width}px; height: ${desktopViewport.height}px; min-height: ${desktopViewport.height}px; }
        </style>
      </head>
      <body>
        <section class="adventure-board"><div class="adventure-board__nodes">${nodes}</div></section>
      </body>
    </html>`;
}

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
