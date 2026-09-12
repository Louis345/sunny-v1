import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSync } from "esbuild";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildDirectActiveSessionPlan, type DirectArtifact } from "./directMathExperience";
import { plan } from "../scripts/fixtures/adaptiveMathRelease";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";

// Render the real component, including lock captions, not a hand-maintained copy of its markup.
let browser: Browser;
let temporary: string;
let renderBoard: (board: AdventureBoardJson) => string;
const artifacts = path.resolve("output/pipeline-stability-20260907/map-proof/layout");
const programs = [2, 4, 7, 8].flatMap(count => Array.from({ length: count - 1 }, (_, shared) =>
  Array.from({ length: count - shared - 1 }, (_, index) => [count, shared, index + 1]))).flat();
programs.push([5, 3, 1]);
beforeAll(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-map-layout-"));
  const bundle = buildSync({
    stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {AdventureBoard} from './src/components/AdventureBoard'; export const render = board => renderToStaticMarkup(React.createElement(AdventureBoard,{board}));`, resolveDir: path.resolve("web") },
    bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", loader: { ".css": "empty" },
  });
  const file = path.join(temporary, "render.cjs");
  fs.writeFileSync(file, bundle.outputFiles[0]!.text);
  renderBoard = require(file).render;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); fs.rmSync(temporary, { recursive: true, force: true }); });

for (const viewport of [{ width: 1365, height: 768 }, { width: 1280, height: 720 }, { width: 1164, height: 656 }]) {
  for (const [count, shared, upper] of programs) {
    it(`separates ${count} math activities (${shared} shared, ${upper} upper) at ${viewport.width}x${viewport.height}`, async () => {
      const designed = plan(count);
      designed.activities.forEach((activity: { routeId: string }, index: number) => {
        activity.routeId = index < shared ? "shared" : index - shared < upper ? "route-a" : "route-b";
      });
      designed.fork.routes.forEach((route: { id: string; nodeIds: string[]; previewNodeId: string }) => {
        route.nodeIds = designed.activities.filter((a: { routeId: string }) => a.routeId === route.id).map((a: { id: string }) => a.id);
        route.previewNodeId = route.nodeIds[0]!;
      });
      const generated: DirectArtifact[] = designed.activities.map((a: { id: string; title: string }) => ({
        childId: "layout-lab", homeworkId: "layout-lab", nodeId: a.id, title: a.title, htmlPath: "", artworkUrl: "", creatorPrompt: "fixture", promptHash: "fixture", plannerModel: "recorded", creatorModel: "recorded",
      }));
      const projected = buildDirectActiveSessionPlan({ childId: "layout-lab", homeworkId: "layout-lab", plan: designed, artifacts: generated, backgroundUrl: "", questArtworkUrl: "", bossArtworkUrl: "", report: { passed: true, failures: [], screenshots: [] } });
      const board = projected.adventureBoard!;
      board.theme.background = { type: "solid", value: "#10233f" };
      board.nodes = board.nodes.map(node => node.kind === "activity" ? { ...node, shortLabel: "Read and record values", state: "preview", lock: { reason: "artifact-generating", label: "Preparing" } } : node);
      const page = await browser.newPage({ viewport });
      try {
        const css = fs.readFileSync(path.resolve("web/src/components/AdventureBoard.css"), "utf8");
        const preflight = fs.readFileSync(path.resolve("web/node_modules/tailwindcss/lib/css/preflight.css"), "utf8");
        await page.setContent(`<!doctype html><style>${preflight}${css}</style>${renderBoard(board)}`);
        const boxes = await page.locator(".adventure-board__node").evaluateAll((nodes, ids) => nodes.map((node, index) => ({
          id: ids[index],
          parts: Array.from((node as any).children).map((part: any) => {
            const rect = part.getBoundingClientRect();
            return { name: part.className, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
          }),
        })), board.nodes.map(node => node.id));
        const failures: string[] = [];
        for (let index = 0; index < boxes.length; index++) {
          const a = boxes[index]!;
          for (const part of a.parts) {
            if (part.x < 0 || part.y < 0 || part.right > viewport.width || part.bottom > viewport.height) failures.push(`clipped:${a.id}:${part.name}`);
            for (const b of boxes.slice(index + 1)) for (const other of b.parts) {
              const overlap = Math.max(0, Math.min(part.right, other.right) - Math.max(part.x, other.x)) * Math.max(0, Math.min(part.bottom, other.bottom) - Math.max(part.y, other.y));
              if (overlap > 8) failures.push(`overlap:${a.id}:${part.name}:${b.id}:${other.name}`);
            }
          }
        }
        fs.mkdirSync(artifacts, { recursive: true });
        const name = `${count}-${shared}-${upper}-${viewport.width}`;
        await page.screenshot({ path: path.join(artifacts, `${name}.png`) });
        fs.writeFileSync(path.join(artifacts, `${name}.json`), JSON.stringify({ viewport, boxes, failures }, null, 2));
        expect(boxes).toHaveLength(count + 4);
        expect(failures).toEqual([]);
      } finally { await page.close(); }
    });
  }
}
