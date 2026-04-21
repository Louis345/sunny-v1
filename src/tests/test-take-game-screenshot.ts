import { describe, expect, it } from "vitest";
import { createTakeGameScreenshotTool } from "../agents/elli/tools/takeGameScreenshot";

describe("takeGameScreenshot tool", () => {
  it("returns base64 to companion when capture succeeds", async () => {
    const tool = createTakeGameScreenshotTool({
      requestGameScreenshot(cb: (base64: string | null) => void) {
        cb("AAA");
      },
    } as Parameters<typeof createTakeGameScreenshotTool>[0]);
    const exec = (tool as { execute?: (a: object) => Promise<unknown> }).execute;
    expect(exec).toBeDefined();
    const out = (await exec!({})) as { screenshot?: string | null };
    expect(out?.screenshot).toBe("AAA");
  });

  it("returns null when capture is unavailable", async () => {
    const tool = createTakeGameScreenshotTool({
      requestGameScreenshot(cb: (base64: string | null) => void) {
        cb(null);
      },
    } as Parameters<typeof createTakeGameScreenshotTool>[0]);
    const exec = (tool as { execute?: (a: object) => Promise<unknown> }).execute;
    const out = (await exec!({})) as { screenshot?: string | null };
    expect(out?.screenshot).toBeNull();
  });
});
