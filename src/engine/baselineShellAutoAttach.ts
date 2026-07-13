import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { getChildChart } from "../profiles/childChart";
import {
  planBaselineShellsForHomework,
  shouldTriggerBaselineGeneration,
} from "./baselinePlannerIntegration";
import { selectPreferredBaselineShell } from "./baselineShellGap";
import {
  attachBaselineShellToHomework,
  refillBaselineLaneConfigs,
  refillBaselineShellConfig,
  type BaselineLaneRound,
  type BaselineShellArtifact,
} from "./baselineGameFactory";
import type { BaselineMechanicBrief } from "./baselineMechanicBrief";
import { readContentFeedbackLessons } from "./contentFeedbackMemory";
import fs from "fs";

export type BaselineShellAutoAttachResult = {
  attached: boolean;
  reason:
    | "reused_shell"
    | "no_generated_baseline_nodes"
    | "no_derivable_rounds"
    | "needs_generation"
    | "no_reusable_shell";
};

type RoundsCapableNode = {
  id: string;
  type: string;
  words?: string[];
  rounds?: BaselineLaneRound[];
};

/**
 * Per-node rounds, best source first: planner-authored rounds from the tool
 * output, then deterministic regex derivation, then one small LLM refill call
 * for nodes still empty (skipped silently offline). Nodes with no resolvable
 * rounds are simply absent from the map.
 */
export async function resolveBaselineRoundsForNodes(input: {
  nodes: RoundsCapableNode[];
  worksheetText?: string;
  domain?: string;
  model?: string;
}): Promise<Record<string, BaselineLaneRound[]>> {
  const out: Record<string, BaselineLaneRound[]> = {};
  const unresolved: RoundsCapableNode[] = [];
  for (const node of input.nodes) {
    if (node.type !== "generated-baseline") continue;
    if (node.rounds?.length) {
      out[node.id] = node.rounds;
      continue;
    }
    const derived = deriveBaselineRoundsFromNodeTargets([node]);
    if (derived.length > 0) {
      out[node.id] = derived;
      continue;
    }
    unresolved.push(node);
  }
  if (unresolved.length > 0 && process.env.ANTHROPIC_API_KEY) {
    for (const node of unresolved) {
      const rounds = await deriveRoundsWithLlm({
        targets: node.words ?? [],
        worksheetText: input.worksheetText ?? "",
        domain: input.domain ?? "math",
        model: input.model,
      }).catch((err: unknown) => {
        console.log(
          `🎮 [baseline-factory] [rounds-llm] node=${node.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [];
      });
      if (rounds.length > 0) out[node.id] = rounds;
    }
  }
  return out;
}

/** One compact tool call turning worksheet targets into playable rounds. */
async function deriveRoundsWithLlm(input: {
  targets: string[];
  worksheetText: string;
  domain: string;
  model?: string;
}): Promise<BaselineLaneRound[]> {
  if (input.targets.length === 0) return [];
  const client = new Anthropic();
  const response = await client.messages.create({
    model: input.model ?? "claude-sonnet-5",
    max_tokens: 1_200,
    tools: [{
      name: "write_rounds",
      description: "Write multiple-choice practice rounds for the given homework targets.",
      input_schema: {
        type: "object",
        required: ["rounds"],
        properties: {
          rounds: {
            type: "array",
            maxItems: 6,
            items: {
              type: "object",
              required: ["id", "prompt", "options"],
              properties: {
                id: { type: "string" },
                prompt: { type: "string" },
                options: {
                  type: "array",
                  minItems: 2,
                  maxItems: 3,
                  items: {
                    type: "object",
                    required: ["id", "label", "correct"],
                    properties: {
                      id: { type: "string" },
                      label: { type: "string" },
                      correct: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }],
    tool_choice: { type: "tool", name: "write_rounds" },
    messages: [{
      role: "user",
      content: `Domain: ${input.domain}. Turn each homework target into one multiple-choice round with exactly one correct option and plausible distractors. Targets:\n${input.targets.join("\n")}\n\nWorksheet context:\n${input.worksheetText.slice(0, 1_500)}`,
    }],
  });
  const toolUse = response.content.find((block) => block.type === "tool_use");
  const rounds = (toolUse?.type === "tool_use"
    ? (toolUse.input as { rounds?: BaselineLaneRound[] }).rounds
    : undefined) ?? [];
  return rounds.filter((round) =>
    round.id && round.prompt &&
    Array.isArray(round.options) &&
    round.options.filter((option) => option.correct).length === 1);
}

/**
 * Deterministic rounds from planner node targets: bare multiplication facts
 * ("5x2") and two-number grouping word problems ("5 pencils in 4 boxes").
 * Targets that can't be derived confidently are skipped rather than guessed.
 */
export function deriveBaselineRoundsFromNodeTargets(
  nodes: Array<{ type: string; words?: string[] }>,
): BaselineLaneRound[] {
  const seen = new Set<string>();
  const rounds: BaselineLaneRound[] = [];
  for (const node of nodes) {
    if (node.type !== "generated-baseline") continue;
    for (const raw of node.words ?? []) {
      const target = raw.trim();
      if (!target || seen.has(target.toLowerCase())) continue;
      const round = roundFromTarget(target, rounds.length + 1);
      if (!round) continue;
      seen.add(target.toLowerCase());
      rounds.push(round);
    }
  }
  return rounds;
}

function roundFromTarget(target: string, index: number): BaselineLaneRound | null {
  const fact = target.match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (fact) {
    const a = Number(fact[1]);
    const b = Number(fact[2]);
    const answer = a * b;
    return {
      id: `r${index}`,
      prompt: `${a} x ${b} = ?`,
      options: [
        { id: "a", label: String(answer), correct: true },
        { id: "b", label: String(answer + Math.max(a, b)), correct: false },
      ],
    };
  }
  const numbers = target.match(/\d+/g)?.map(Number) ?? [];
  if (
    numbers.length === 2 &&
    /(each|per|rows?|groups?|boxes?|stacks?|bags?|sets?)/i.test(target)
  ) {
    const [a, b] = numbers as [number, number];
    const answer = a * b;
    if (answer === a + b) return null;
    const alreadyAsks = /how many|\?/i.test(target);
    return {
      id: `r${index}`,
      prompt: alreadyAsks ? target : `${target} — how many in all?`,
      options: [
        { id: "a", label: String(answer), correct: true },
        { id: "b", label: String(a + b), correct: false },
      ],
    };
  }
  return null;
}

/**
 * Ingest-time shell reuse: when the child's catalog already holds an approved
 * generated-baseline shell, refill per-node configs from the plan targets and
 * attach it so every board node launches. Generation of new shells stays a
 * reviewed factory step (sunny:demo:game-factory).
 */
export function autoAttachBaselineShellForHomework(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  domain: string;
  title: string;
  conceptText: string;
  /** Nodes already attached by the generation pipeline; leave them untouched. */
  skipNodeIds?: string[];
  /** Planner/LLM-resolved rounds per node; regex derivation remains the fallback. */
  roundsByNodeId?: Record<string, BaselineLaneRound[]>;
}): BaselineShellAutoAttachResult {
  const rootDir = input.rootDir ?? process.cwd();
  const childId = input.childId.trim().toLowerCase();
  const skipNodeIds = new Set(input.skipNodeIds ?? []);
  const chart = getChildChart(childId, { rootDir });
  const laneNodes = (chart.homework.pending?.nodes ?? []).filter(
    (node) => node.type === "generated-baseline" && !skipNodeIds.has(node.id),
  );
  if (laneNodes.length === 0) {
    return { attached: false, reason: "no_generated_baseline_nodes" };
  }
  const rounds = laneNodes.flatMap((node) => input.roundsByNodeId?.[node.id] ?? []).length > 0
    ? laneNodes.flatMap((node) => input.roundsByNodeId?.[node.id] ?? [])
    : deriveBaselineRoundsFromNodeTargets(laneNodes);
  if (rounds.length === 0) {
    console.log(
      `🎮 [baseline-factory] [auto-attach] child=${childId} homework=${input.homeworkId} skipped: no derivable rounds`,
    );
    return { attached: false, reason: "no_derivable_rounds" };
  }

  const decision = planBaselineShellsForHomework({
    chart,
    homeworkId: input.homeworkId,
    domain: input.domain,
    title: input.title,
    conceptText: input.conceptText,
  });
  const decisionPath = path.join(rootDir, "src", "context", childId, "homework", "pending", new Date().toISOString().slice(0, 10), "baseline-decision.json");
  fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
  fs.writeFileSync(decisionPath, `${JSON.stringify({
    ...decision,
    recordedAt: new Date().toISOString(),
    experimentIds: laneNodes.map((node) => chart.activeSessionPlan?.nodePlan.find((candidate) => candidate.id === node.id)?.experimentId).filter(Boolean),
  }, null, 2)}\n`, "utf8");
  const lessons = readContentFeedbackLessons(rootDir, childId);
  const shell =
    selectPreferredBaselineShell(decision.matchedShells, lessons) ??
    decision.matchedShells.find(
      (candidate) => candidate.source === "generated_shell" && candidate.gameHtmlPath,
    );
  if (!shell?.gameHtmlPath || !shell.experienceBrief) {
    console.log(
      `🎮 [baseline-factory] [auto-attach] child=${childId} homework=${input.homeworkId} skipped: ${
        shouldTriggerBaselineGeneration(decision)
          ? "no approved shell — run the game factory to generate one"
          : "no reusable generated shell in catalog"
      }`,
    );
    return {
      attached: false,
      reason: shouldTriggerBaselineGeneration(decision)
        ? "needs_generation"
        : "no_reusable_shell",
    };
  }

  const refill = refillBaselineShellConfig({
    rootDir,
    childId,
    shell,
    homeworkId: input.homeworkId,
    title: input.title,
    homeworkRounds: rounds,
  });
  const laneConfigs = refillBaselineLaneConfigs({
    rootDir,
    childId,
    homeworkId: input.homeworkId,
    title: input.title,
    homeworkRounds: rounds,
    nodes: laneNodes,
    roundsByNodeId: input.roundsByNodeId,
    domain: input.domain,
  });
  const artifactByNodeId = Object.fromEntries(
    laneNodes.map((node) => [node.id, {
      contentId: `${shell.contentId ?? `${input.homeworkId}:generated-baseline:reuse`}:${node.id}`,
      briefId: `reuse-${node.id}`,
      filename: path.basename(shell.gameHtmlPath!),
      filePath: shell.gameHtmlPath!,
      gameHtmlPath: shell.gameHtmlPath!,
      artifactStatus: "approved_ready" as const,
      brief: { ...shell.experienceBrief!, briefId: `reuse-${node.id}` } as BaselineMechanicBrief,
    } satisfies BaselineShellArtifact]),
  );
  attachBaselineShellToHomework({
    rootDir,
    childId,
    artifact: {
      contentId: shell.contentId ?? `${input.homeworkId}:generated-baseline:reuse`,
      briefId: "reuse",
      filename: path.basename(shell.gameHtmlPath),
      filePath: shell.gameHtmlPath,
      gameHtmlPath: shell.gameHtmlPath,
      artifactStatus: "approved_ready",
      brief: { ...shell.experienceBrief, briefId: "reuse" } satisfies BaselineMechanicBrief,
    } satisfies BaselineShellArtifact,
    activityConfigPath: refill.activityConfigPath,
    configPathByNodeId: laneConfigs,
    artifactByNodeId,
    onlyNodeIds: input.skipNodeIds?.length ? laneNodes.map((node) => node.id) : undefined,
  });
  console.log(
    `🎮 [baseline-factory] [auto-attach] child=${childId} homework=${input.homeworkId} reused shell=${path.basename(shell.gameHtmlPath)} nodes=${Object.keys(laneConfigs).length}`,
  );
  return { attached: true, reason: "reused_shell" };
}
