import { tool } from "ai";
import { z } from "zod";

/** Implemented by SessionManager (or test harness). */
export interface SixToolsHost {
  canvasShow(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  canvasClear(): Promise<Record<string, unknown>>;
  canvasStatus(): Promise<Record<string, unknown>>;
  sessionLog(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  sessionStatus(): Promise<Record<string, unknown>>;
  sessionEnd(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const canvasShowSchema = z.object({
  type: z.enum(["text", "worksheet", "game", "svg"]),
  content: z.string().optional(),
  problemId: z.string().optional(),
  name: z.string().optional(),
  svg: z.string().optional(),
  style: z.record(z.string(), z.any()).optional(),
});

export function createSixTools(host: SixToolsHost) {
  return {
    canvasShow: tool({
      description:
        "Render on the child's canvas. type=text|svg shows content; type=worksheet shows a worksheet problem by id; type=game launches a named game. Each call replaces whatever was showing (mutex).",
      inputSchema: canvasShowSchema,
      execute: async (args) => host.canvasShow(args as Record<string, unknown>),
    }),
    canvasClear: tool({
      description: "Clear the canvas to idle.",
      inputSchema: z.object({}),
      execute: async () => host.canvasClear(),
    }),
    canvasStatus: tool({
      description: "Return current canvas mode and revision.",
      inputSchema: z.object({}),
      execute: async () => host.canvasStatus(),
    }),
    sessionLog: tool({
      description:
        "Log a graded interaction (worksheet answer or observation). For worksheets, server maps this to the active problem.",
      inputSchema: z.object({
        correct: z.boolean(),
        childSaid: z.string(),
        observation: z.string().optional(),
      }),
      execute: async (args) =>
        host.sessionLog(args as Record<string, unknown>),
    }),
    sessionStatus: tool({
      description: "Session summary for the model (streak, phase, worksheet progress when applicable).",
      inputSchema: z.object({}),
      execute: async () => host.sessionStatus(),
    }),
    sessionEnd: tool({
      description:
        "End the session only when the child or parent says exactly 'end session' or 'end the session'.",
      inputSchema: z.object({
        childName: z.string(),
        reason: z.enum(["child_requested", "session_complete", "goodbye"]),
      }),
      execute: async (args) => host.sessionEnd(args as Record<string, unknown>),
    }),
  } as const;
}
