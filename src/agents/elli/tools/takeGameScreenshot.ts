import { tool } from "ai";
import { z } from "zod";
import type { SessionManager } from "../../../server/session-manager";
import { TAKE_GAME_SCREENSHOT_TOOL_DESCRIPTION } from "./takeGameScreenshotDescription";

/**
 * Factory for the companion screenshot tool (server requests capture from voice client).
 */
export function createTakeGameScreenshotTool(session: SessionManager) {
  return tool({
    description: TAKE_GAME_SCREENSHOT_TOOL_DESCRIPTION,
    inputSchema: z.object({
      reason: z.string().optional().describe("Why you are taking the screenshot"),
    }),
    execute: async (args: { reason?: string }) => {
      console.log(
        `  [takeGameScreenshot] reason=${args.reason ?? "not specified"}`,
      );
      const freshState = session.getFreshActivityStateForScreenshot?.();
      if (freshState) {
        console.log(
          "  [takeGameScreenshot] skipped — fresh structured game state is available",
        );
        return {
          screenshot: null,
          reason: "fresh_structured_state_available",
          currentActivityState: freshState,
        };
      }
      return new Promise<{ screenshot: string | null }>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ screenshot: null });
        }, 5000);

        session.requestGameScreenshot((base64: string | null) => {
          clearTimeout(timeout);
          resolve({ screenshot: base64 });
        });
      });
    },
  });
}
