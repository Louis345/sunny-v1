import { describe, expect, it, vi } from "vitest";
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

  it("returns structured state instead of screenshot when fresh game state is available", async () => {
    const requestGameScreenshot = vi.fn();
    const tool = createTakeGameScreenshotTool({
      getFreshActivityStateForScreenshot() {
        return {
          game: "Wheel of Fortune",
          boardState: "_ N _ _ N _ _ _",
          guessedLetters: ["N"],
        };
      },
      requestGameScreenshot,
    } as unknown as Parameters<typeof createTakeGameScreenshotTool>[0]);
    const exec = (tool as { execute?: (a: object) => Promise<unknown> }).execute;

    const out = (await exec!({ reason: "check board" })) as {
      screenshot?: string | null;
      reason?: string;
      currentActivityState?: Record<string, unknown>;
    };

    expect(out).toMatchObject({
      screenshot: null,
      reason: "fresh_structured_state_available",
      currentActivityState: {
        game: "Wheel of Fortune",
        boardState: "_ N _ _ N _ _ _",
        guessedLetters: ["N"],
      },
    });
    expect(requestGameScreenshot).not.toHaveBeenCalled();
  });
});
