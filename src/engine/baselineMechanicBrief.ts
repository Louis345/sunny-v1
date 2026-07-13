import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import type { LearningDomain } from "./activityToolCatalog";
import { SONNET_MODEL, parseExtractedJson, textFromMessage } from "../scripts/generateGame";

// These flags are contractual constants, not model choices: the LLM sometimes
// emits false/omits them, which used to fail the whole candidate list and fall
// back to canned briefs whose arcade mechanics the HTML generator can't build.
const contractTrue = z.preprocess(() => true, z.literal(true));

export const baselineEvidenceContractSchema = z.object({
  gameStateUpdate: contractTrue,
  attemptEvents: contractTrue,
  targetResults: contractTrue,
  completionSummary: contractTrue,
});

export const baselineMechanicBriefSchema = z.object({
  briefId: z.string().min(1),
  title: z.string().min(1),
  mechanic: z.string().min(1),
  theme: z.string().min(1),
  domain: z.string().min(1),
  skillTarget: z.string().min(1),
  engagementWrapper: z.string().min(1),
  controlledExperiment: z.object({
    engagementVariable: z.string().min(1),
    holdConstant: z.array(z.string().min(1)).min(1),
  }),
  experienceLoop: z.object({
    childAction: z.string().min(1),
    worldReaction: z.string().min(1),
    anticipation: z.string().min(1),
    rewardMoment: z.string().min(1),
  }),
  deterministicMath: z.object({
    source: z.literal("activity-config"),
    artworkMayDefineQuantities: z.literal(false),
  }),
  sfxContract: z.preprocess((value) => {
    if (!value || Array.isArray(value) || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    return ["tap", "correct", "incorrect", "progress", "complete"]
      .filter((event) => event in record);
  }, z.array(z.enum(["tap", "correct", "incorrect", "progress", "complete"]))
    .superRefine((values, ctx) => {
      for (const required of ["tap", "correct", "incorrect", "progress", "complete"] as const) {
        if (!values.includes(required)) ctx.addIssue({ code: "custom", message: `missing_sfx:${required}` });
      }
    })),
  recentThemeExclusions: z.array(z.string().min(1)),
  configInjection: z.object({
    configUrlParam: z.preprocess(() => "config", z.literal("config")),
    requiredFields: z.array(z.string().min(1)).min(1),
    description: z.string().min(1),
  }),
  evidenceContract: baselineEvidenceContractSchema,
  guardPushback: z.object({
    behavior: z.string().min(1),
    tone: z.preprocess(() => "firm-but-playful", z.literal("firm-but-playful")),
    mustNotRevealAnswer: contractTrue,
  }),
  companionRules: z.object({
    sunnyCompanionAnchor: contractTrue,
    noInGameCompanionChrome: contractTrue,
    fireCompanionEvents: contractTrue,
    reportGameState: contractTrue,
  }),
});

export type BaselineMechanicBrief = z.infer<typeof baselineMechanicBriefSchema>;

export type BaselineShellGapRequest = {
  childId: string;
  homeworkId: string;
  domain: LearningDomain | string;
  skillTarget: string;
  title: string;
  reason: string;
  matchedShells: string[];
  needsGeneration: boolean;
};

export function parseBaselineMechanicBrief(input: unknown): BaselineMechanicBrief {
  return baselineMechanicBriefSchema.parse(input);
}

export function buildBaselineMechanicBriefCandidates(input: {
  gap: BaselineShellGapRequest;
  preferenceSummary: string;
  childHooks: string[];
}): BaselineMechanicBrief[] {
  const hook = input.childHooks[0] ?? "adventure";

  const templates: Array<Pick<BaselineMechanicBrief, "title" | "mechanic" | "theme" | "controlledExperiment" | "experienceLoop">> = [
    {
      title: `${input.gap.skillTarget} Meteor Rush`,
      mechanic: "Falling targets show products; blast the one that matches the spoken fact.",
      theme: `${hook} space arcade with streak rewards`,
      controlledExperiment: { engagementVariable: "speed", holdConstant: ["academic targets", "question count", "difficulty", "evidence contract"] },
      experienceLoop: {
        childAction: "Choose the matching product before it crosses the action line.",
        worldReaction: "The selected target bursts and charges the visible streak engine.",
        anticipation: "The next target telegraphs its path before entering play.",
        rewardMoment: "A completed fact set triggers a short arena transformation and personal-best reveal.",
      },
    },
    {
      title: `${input.gap.skillTarget} Array Builder`,
      mechanic: "Drag items into rows and columns to build the fact before the timer fills.",
      theme: `${hook} builder puzzle with visible progress meter`,
      controlledExperiment: { engagementVariable: "visual", holdConstant: ["academic targets", "question count", "difficulty", "evidence contract"] },
      experienceLoop: {
        childAction: "Drag deterministic math objects into the requested equal groups.",
        worldReaction: "Each valid group becomes part of a growing world structure.",
        anticipation: "A silhouette previews what the completed groups will reveal.",
        rewardMoment: "The finished structure animates only after every exact group is verified.",
      },
    },
    {
      title: `${input.gap.skillTarget} Power Charge`,
      mechanic: "Rapid-fire prompts charge a power meter; wrong answers trigger guard pushback without revealing answers.",
      theme: `${hook} competition lane with recovery celebrations`,
      controlledExperiment: { engagementVariable: "competition", holdConstant: ["academic targets", "question count", "difficulty", "evidence contract"] },
      experienceLoop: {
        childAction: "Commit an answer to move the challenger along the competition lane.",
        worldReaction: "Accurate answers advance the challenger; recovery answers repair lost momentum.",
        anticipation: "The meter shows the next unlock without exposing the next answer.",
        rewardMoment: "The final charge reveals the run result and a beatable personal record.",
      },
    },
  ];

  return templates.map((template, index) =>
    briefTemplateFromGap({
      gap: input.gap,
      preferenceSummary: input.preferenceSummary,
      childHooks: input.childHooks,
      index,
      title: template.title,
      mechanic: template.mechanic,
      theme: template.theme,
      controlledExperiment: template.controlledExperiment,
      experienceLoop: template.experienceLoop,
    }),
  );
}

export function formatBaselineMechanicBriefForReview(brief: BaselineMechanicBrief): string {
  return [
    `Title: ${brief.title}`,
    `Mechanic: ${brief.mechanic}`,
    `Theme: ${brief.theme}`,
    `Domain: ${brief.domain}`,
    `Skill: ${brief.skillTarget}`,
    `Engagement: ${brief.engagementWrapper}`,
  ].join("\n");
}

const baselineBriefCandidatesSchema = z.object({
  candidates: z.array(baselineMechanicBriefSchema).min(3).max(3),
});

function briefTemplateFromGap(input: {
  gap: BaselineShellGapRequest;
  preferenceSummary: string;
  childHooks: string[];
  index: number;
  title: string;
  mechanic: string;
  theme: string;
  controlledExperiment: BaselineMechanicBrief["controlledExperiment"];
  experienceLoop: BaselineMechanicBrief["experienceLoop"];
}): BaselineMechanicBrief {
  const baseId = `${input.gap.homeworkId}-${input.gap.skillTarget}`.replace(/[^a-z0-9]+/gi, "-");
  const avoid =
    input.preferenceSummary.trim() &&
    !input.preferenceSummary.toLowerCase().includes("no prior generated-content feedback")
      ? input.preferenceSummary
      : "";
  return parseBaselineMechanicBrief({
    briefId: `${baseId}-candidate-${input.index + 1}`,
    title: input.title,
    mechanic: input.mechanic,
    theme: input.theme,
    domain: input.gap.domain,
    skillTarget: input.gap.skillTarget,
    engagementWrapper: input.childHooks.join("; ") || "child-centered challenge",
    controlledExperiment: input.controlledExperiment,
    experienceLoop: input.experienceLoop,
    deterministicMath: {
      source: "activity-config",
      artworkMayDefineQuantities: false,
    },
    sfxContract: ["tap", "correct", "incorrect", "progress", "complete"],
    recentThemeExclusions: /wrestl/i.test(input.preferenceSummary) ? ["wrestling"] : [],
    configInjection: {
      configUrlParam: "config",
      requiredFields: ["targets", "rounds", "topic", "domain"],
      description: "Load rounds/targets from /api/activity-config JSON; never hardcode homework content.",
    },
    evidenceContract: {
      gameStateUpdate: true,
      attemptEvents: true,
      targetResults: true,
      completionSummary: true,
    },
    guardPushback: {
      behavior: avoid
        ? `Avoid prior rejected patterns: ${avoid}`
        : "Shake the board and offer a hint scaffold without revealing the answer.",
      tone: "firm-but-playful",
      mustNotRevealAnswer: true,
    },
    companionRules: {
      sunnyCompanionAnchor: true,
      noInGameCompanionChrome: true,
      fireCompanionEvents: true,
      reportGameState: true,
    },
  });
}

export async function generateBaselineMechanicBriefCandidatesWithLlm(input: {
  gap: BaselineShellGapRequest;
  preferenceSummary: string;
  childHooks: string[];
  homeworkBody?: string;
  engagementTheoryContext?: string;
  client?: Anthropic;
}): Promise<BaselineMechanicBrief[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for LLM brief generation");
  }
  const client = input.client ?? new Anthropic({ apiKey });
  const prompt = `You are designing three distinct baseline game mechanic briefs for a 3rd grade child.
Return JSON only with shape { "candidates": [ ...3 brief objects... ] }.
Each candidate must include: briefId, title, mechanic, theme, domain, skillTarget,
engagementWrapper, controlledExperiment { engagementVariable, holdConstant },
experienceLoop { childAction, worldReaction, anticipation, rewardMoment },
deterministicMath { source:"activity-config", artworkMayDefineQuantities:false },
sfxContract containing tap/correct/incorrect/progress/complete, recentThemeExclusions,
configInjection { configUrlParam:"config", requiredFields, description },
evidenceContract (all true), guardPushback { behavior, tone:"firm-but-playful", mustNotRevealAnswer:true },
companionRules (all true literals as in Sunny baseline contract).

Gap context:
${JSON.stringify(input.gap, null, 2)}

Child engagement hooks: ${input.childHooks.join(", ") || "adventure challenge"}
Prior content feedback summary:
${input.preferenceSummary || "No prior generated-content feedback yet."}

Current engagement theory:
${input.engagementTheoryContext || "No prior engagement theory exists. Design the first controlled experiment."}

Homework evidence:
${input.homeworkBody ?? "(not provided)"}

Rules:
- Produce exactly 3 meaningfully different mechanics/themes.
- briefId must be unique per candidate and include the homework id.
- Respect rejected patterns from the feedback summary.
- Treat the engagement theory as the current experiment hypothesis. Vary the declared engagement dimension while keeping academic targets and evidence behavior constant.
- Every brief must require config injection (config URL param) and Sunny companion contract fields exactly as schema literals.`;

  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const parsed = parseExtractedJson(textFromMessage(response));
  const rawCandidates = baselineBriefCandidatesSchema.parse(parsed).candidates;
  return rawCandidates.map((brief, index) =>
    parseBaselineMechanicBrief({
      ...brief,
      briefId: brief.briefId || `${input.gap.homeworkId}-candidate-${index + 1}`,
      configInjection: {
        configUrlParam: "config",
        requiredFields: ["targets", "rounds", "topic", "domain"],
        description: "Load rounds/targets from /api/activity-config JSON; never hardcode homework content.",
      },
      evidenceContract: {
        gameStateUpdate: true,
        attemptEvents: true,
        targetResults: true,
        completionSummary: true,
      },
      deterministicMath: {
        source: "activity-config",
        artworkMayDefineQuantities: false,
      },
      sfxContract: ["tap", "correct", "incorrect", "progress", "complete"],
      recentThemeExclusions: brief.recentThemeExclusions ?? [],
      guardPushback: {
        behavior: brief.guardPushback?.behavior ?? "Offer a hint scaffold without revealing the answer.",
        tone: "firm-but-playful",
        mustNotRevealAnswer: true,
      },
      companionRules: {
        sunnyCompanionAnchor: true,
        noInGameCompanionChrome: true,
        fireCompanionEvents: true,
        reportGameState: true,
      },
    }),
  );
}
