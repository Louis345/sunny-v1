import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  CHILD_FACING_VISUAL_PROMPT,
  judgeChildFacingScreens,
} from "./childFacingVisualGate";

const roots: string[] = [];

function fixture(): { screenshot: string; audit: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-blind-visual-"));
  roots.push(root);
  const screenshot = path.join(root, "screen.png");
  fs.writeFileSync(screenshot, Buffer.from("recorded screenshot bytes"));
  return { screenshot, audit: path.join(root, "verdict.json") };
}

afterEach(() => {
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

it("shows the screenshots to an open-ended reviewer without defect-specific hints", async () => {
  const { screenshot } = fixture();
  const create = vi.fn(async (_request: unknown) => ({
    content: [{
      type: "tool_use",
      input: {
        decision: "reject",
        observations: ["A prominent shape contradicts the rest of the scene."],
      },
    }],
  }));

  const verdict = await judgeChildFacingScreens({
    screenshotPaths: [screenshot],
    client: { messages: { create } } as never,
  });

  expect(verdict.decision).toBe("reject");
  const request = create.mock.calls[0]![0] as { messages: Array<{ content: Array<{ type: string; text?: string }> }> };
  expect(request.messages[0]!.content.some(block => block.type === "image")).toBe(true);
  expect(request.messages[0]!.content.at(-1)).toEqual({ type: "text", text: CHILD_FACING_VISUAL_PROMPT });
  expect(CHILD_FACING_VISUAL_PROMPT).not.toMatch(/clock|hand|overlap|clipp|button/i);
});

it("reuses the verdict for unchanged screenshot bytes instead of paying twice", async () => {
  const { screenshot, audit } = fixture();
  const create = vi.fn(async () => ({
    content: [{ type: "tool_use", input: { decision: "approve", observations: [] } }],
  }));
  const client = { messages: { create } } as never;

  await judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit, client });
  await judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit, client });

  expect(create).toHaveBeenCalledTimes(1);
});

it("fails closed when no child-visible screenshot exists", async () => {
  await expect(judgeChildFacingScreens({
    screenshotPaths: ["/missing/screenshot.png"],
    client: { messages: { create: vi.fn() } } as never,
  })).rejects.toThrow("child_visual_review_screenshots_missing");
});
