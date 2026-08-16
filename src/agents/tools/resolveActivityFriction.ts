import { tool } from "ai";
import { z } from "zod";
import type { ActivityFrictionDecision } from "../../server/activityFrictionResolution";

export interface ResolveActivityFrictionHost {
  resolveActivityFriction(args: ActivityFrictionDecision): Promise<Record<string, unknown>>;
}

const inputSchema = z.object({
  likelyCause: z.enum([
    "conceptual",
    "prompt_ambiguity",
    "response_mode",
    "scoring_disagreement",
    "speech_failure",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  action: z.enum(["clarify", "offer_alternative", "advance_current_item"]),
  rationale: z.string().min(1).max(300),
});

export function createResolveActivityFrictionTool(host: ResolveActivityFrictionHost) {
  return tool({
    description:
      "Resolve child-invoked friction in the current answer-hidden activity. Use only after the child summons you and the live board reports a rejected attempt. Clarify briefly in speech when possible; advance only when the response instrument cannot fairly distinguish understanding from interface or wording friction. Advancement is assisted/unresolved and never correct or mastery.",
    inputSchema,
    execute: async (args) => host.resolveActivityFriction(args),
  });
}
