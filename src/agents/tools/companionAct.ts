import { tool } from "ai";
import { z } from "zod";

export interface CompanionActHost {
  companionAct(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/**
 * Single root object schema so Anthropic tool input_schema stays type: "object".
 */
const companionActInputSchema = z.object({
  type: z
    .string()
    .describe(
      "Capability id from [Companion Capabilities] in the session manifest (e.g. emote, camera).",
    ),
  payload: z
    .record(z.string(), z.unknown())
    .describe("Payload object for that capability, matching the manifest."),
  presenceAfterSpeech: z
    .enum(["standby_after_speech", "await_child_response"])
    .optional()
    .describe(
      "For child-requested help only: omit to return to standby after speaking, or await_child_response when your response ends with one useful question.",
    ),
});

export function createCompanionActTool(host: CompanionActHost) {
  return tool({
    description:
      "Drive the on-screen VRM companion (expressions, camera, …). Read [Companion Capabilities] in the session manifest for valid `type` and `payload` keys. Prefer showing emotion here instead of action lines in asterisks. During requested activity help, presenceAfterSpeech may keep one useful follow-up open; otherwise Elli returns to standby.",
    inputSchema: companionActInputSchema,
    execute: async (args) =>
      host.companionAct(args as Record<string, unknown>),
  });
}
