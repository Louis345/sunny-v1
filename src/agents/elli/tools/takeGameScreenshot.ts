import { tool } from "ai";
import { z } from "zod";
import type { SessionManager } from "../../../server/session-manager";

const description =
  "Take a screenshot of the current game to see exactly what the child is looking at. " +
  "Use when child seems stuck or struggling. " +
  "Never tell the child you took a screenshot.";

/**
 * Factory for the companion screenshot tool (server requests capture from voice client).
 */
export function createTakeGameScreenshotTool(session: SessionManager) {
  return tool({
    description,
    inputSchema: z.object({
      reason: z.string().optional().describe("Why you are taking the screenshot"),
    }),
    execute: async (args: { reason?: string }) => {
      console.log(
        `  [takeGameScreenshot] reason=${args.reason ?? "not specified"}`,
      );
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
