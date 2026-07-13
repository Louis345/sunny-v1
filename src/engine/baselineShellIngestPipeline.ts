import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { getChildChart } from "../profiles/childChart";
import type { ChildChart } from "../profiles/childChart";
import { planBaselineShellsForHomework } from "./baselinePlannerIntegration";
import {
  attachBaselineShellToHomework,
  generateBaselineMechanicBriefCandidates,
  generateBaselineShellWithLlm,
  refillBaselineLaneConfigs,
  refillBaselineShellConfig,
  reviewBaselineShellArtifact,
  type BaselineLaneRound,
  type BaselineShellArtifact,
} from "./baselineGameFactory";
import type { PlannerGenerationRequest } from "./assignmentPlanner";
import { parseBaselineMechanicBrief, type BaselineMechanicBrief } from "./baselineMechanicBrief";
import { readContentFeedbackLessons } from "./contentFeedbackMemory";
import { ingestDiagnostic, ingestDiagnosticError } from "../utils/ingestOutput";
import { baselineShellMatchesNodeContract } from "./baselineShellGap";
import { resolveChildContextDir } from "../utils/contextRoot";

export type BaselineShellPipelineInput = {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  domain: string;
  title: string;
  conceptText: string;
  generationRequests: PlannerGenerationRequest[];
  roundsByNodeId: Record<string, BaselineLaneRound[]>;
  /** Wall-clock budget before ingest stops waiting; generation keeps running and upgrades nodes in place. */
  budgetMs?: number;
  /** Full ingestion must not evaluate readiness until every requested artifact settles. */
  waitForCompletion?: boolean;
  judgeModel?: string;
};

export type BaselineShellPipelineResult = {
  /** Nodes attached to a freshly generated shell within the budget. */
  attachedNodeIds: string[];
  /** Nodes whose generation failed outright (judge double-reject or generation error). */
  failedNodeIds: string[];
  /** Nodes still generating when the budget elapsed; they upgrade in place when done. */
  pendingNodeIds: string[];
};

export type BaselineShellJudgeVerdict = {
  decision: "approve" | "reject";
  reason: string;
  lessons: string[];
};

function assessableTaskRounds(rounds: BaselineLaneRound[], domain: string): BaselineLaneRound[] {
  if (domain !== "math") return rounds;
  return rounds.filter((round) => /\d+\s*[x×÷+\-]\s*\d+/i.test(round.prompt) || /\?$/.test(round.prompt.trim()));
}

export function buildReusedBaselineArtifact(
  match: import("./baselineShellGap").BaselineShellMatch,
  input: {
    childId: string;
    homeworkId: string;
    domain: string;
    title: string;
    requestId: string;
  },
): BaselineShellArtifact | undefined {
  if (!match.gameHtmlPath || !match.experienceBrief) return undefined;
  const baseId = (match.contentId ?? `${input.homeworkId}:generated-baseline:${input.requestId}`)
    .replace(/[^a-zA-Z0-9:_-]+/g, "-");
  const brief = parseBaselineMechanicBrief({
    ...match.experienceBrief,
    briefId: `${baseId}-${input.requestId}`,
    title: match.title ?? input.title,
    mechanic: match.mechanic ?? "approved baseline shell reuse",
    theme: match.theme ?? "approved baseline shell",
    domain: input.domain,
    skillTarget: match.skillTarget ?? "captured homework practice",
  });
  return {
    contentId: `${baseId}:${input.requestId}`,
    briefId: brief.briefId,
    filename: path.basename(match.gameHtmlPath),
    filePath: match.gameHtmlPath,
    gameHtmlPath: match.gameHtmlPath,
    artifactStatus: "approved_ready",
    brief,
  };
}

const DEFAULT_BUDGET_MS = 240_000;

export function generationWaitMode(input: Pick<BaselineShellPipelineInput, "waitForCompletion">): "complete" | "budget" {
  return input.waitForCompletion ? "complete" : "budget";
}

export function generationCandidateAttempts(candidates: readonly unknown[]): number {
  return candidates.length;
}

export function buildNodeBriefGap(input: {
  baseGap: import("./baselineMechanicBrief").BaselineShellGapRequest;
  request: PlannerGenerationRequest;
  node?: { title: string; mechanic: string; theme: string };
}): import("./baselineMechanicBrief").BaselineShellGapRequest {
  return {
    ...input.baseGap,
    skillTarget: input.request.skillTarget,
    title: input.node?.title ?? input.baseGap.title,
    reason: [
      input.request.reason,
      input.request.mechanicConstraints,
      input.node
        ? `The saved node contract is authoritative: title="${input.node.title}", mechanic="${input.node.mechanic}", theme="${input.node.theme}". Author the complete experience loop for that exact promise.`
        : "Author the complete experience loop from this generation request.",
    ].join(" "),
  };
}
const GENERATION_POOL_SIZE = 2;

export function generationBriefForTask(
  briefs: BaselineMechanicBrief[],
  requestId: string,
  attempt: number,
): BaselineMechanicBrief | undefined {
  const baseBrief = briefs[attempt % briefs.length];
  if (!baseBrief) return undefined;
  const safeRequestId = requestId.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return {
    ...baseBrief,
    briefId: `${baseBrief.briefId}-${safeRequestId}-attempt-${attempt + 1}`,
  };
}

/** child:homework:request keys currently generating, so retries never double-run. */
const runningGenerationKeys = new Set<string>();

/**
 * Content-quality gate for fully automatic generation: one vision call over
 * the gameplay screenshots the Playwright validator already captured. This
 * gates playability/design only — mastery claims still require evidence
 * (AGENTS.md Laws 13-14).
 */
export async function judgeBaselineShellDesign(input: {
  brief: BaselineMechanicBrief;
  screenshotPaths: string[];
  model?: string;
}): Promise<BaselineShellJudgeVerdict> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { decision: "approve", reason: "offline: playwright validation passed", lessons: [] };
  }
  const images = input.screenshotPaths
    .filter((file) => fs.existsSync(file))
    .slice(0, 3)
    .map((file) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/png" as const,
        data: fs.readFileSync(file).toString("base64"),
      },
    }));
  if (images.length === 0) {
    return { decision: "reject", reason: "no gameplay screenshots to judge", lessons: [] };
  }
  const client = new Anthropic();
  const response = await client.messages.create({
    model: input.model ?? "claude-sonnet-5",
    max_tokens: 600,
    tools: [{
      name: "judge_generated_game",
      description: "Judge whether a generated learning game is ready for a child to play.",
      input_schema: {
        type: "object",
        required: ["decision", "reason"],
        properties: {
          decision: { type: "string", enum: ["approve", "reject"] },
          reason: { type: "string" },
          lessons: { type: "array", items: { type: "string" }, maxItems: 3 },
        },
      },
    }],
    tool_choice: { type: "tool", name: "judge_generated_game" },
    messages: [{
      role: "user",
      content: [
        ...images,
        {
          type: "text" as const,
          text: [
            "These are load/midplay/completion screenshots of a generated learning game for an early-elementary child.",
            `Intended mechanic: ${input.brief.mechanic}`,
            `Theme: ${input.brief.theme}. Skill target: ${input.brief.skillTarget}.`,
            "Independent word-problem rounds may use different objects (for example pencils, stars, or flowers); judge whether each round expresses the same mechanic, not whether every round uses one decorative object.",
            "Approve only if: prompts/text are readable, real interactivity is visible across the screenshots, the mechanic matches the brief, and the content is age-appropriate.",
            "Reject with a concrete reason and up to 3 reusable design lessons otherwise.",
          ].join("\n"),
        },
      ],
    }],
  });
  const toolUse = response.content.find((block) => block.type === "tool_use");
  const verdict = toolUse?.type === "tool_use"
    ? (toolUse.input as Partial<BaselineShellJudgeVerdict>)
    : undefined;
  if (verdict?.decision !== "approve" && verdict?.decision !== "reject") {
    return { decision: "reject", reason: "judge returned no usable verdict", lessons: [] };
  }
  return {
    decision: verdict.decision,
    reason: verdict.reason ?? "",
    lessons: verdict.lessons ?? [],
  };
}

type GenerationTask = {
  request: PlannerGenerationRequest;
  nodeIds: string[];
  rounds: BaselineLaneRound[];
};

function laneNodesForChart(chart: ChildChart): Array<{ id: string; type: string; title?: string; words?: string[]; targetLane?: string }> {
  // The active session plan is the planner's source of truth and carries
  // targetLane; pendingHomework nodes don't. Fall back to pending nodes for
  // charts without a plan (lane matching then only works for laneless requests).
  const planNodes = (chart.activeSessionPlan?.nodePlan ?? [])
    .filter((node) => node.type === "generated-baseline")
    .map((node) => ({
      id: node.id,
      type: node.type as string,
      title: (node as { title?: string }).title,
      words: node.targets,
      targetLane: node.targetLane,
    }));
  if (planNodes.length > 0) return planNodes;
  return (chart.homework.pending?.nodes ?? [])
    .filter((node) => node.type === "generated-baseline")
    .map((node) => ({
      id: node.id,
      type: node.type,
      title: (node as { title?: string }).title,
      words: node.words,
      targetLane: (node as { targetLane?: string }).targetLane,
    }));
}

/**
 * Map each generation request to the generated-baseline nodes it should fill.
 * When several requests share one lane (single-source-group homework puts
 * every node on the same lane), the lane's nodes are distributed round-robin
 * across those requests so each node still gets a distinct mechanic.
 */
export function assignRequestsToNodes(
  requests: PlannerGenerationRequest[],
  nodes: Array<{ id: string; targetLane?: string }>,
): GenerationTask[] {
  const tasks: GenerationTask[] = [];
  const claimed = new Set<string>();
  const requestsByLane = new Map<string, PlannerGenerationRequest[]>();
  for (const request of requests) {
    const lane = request.targetLane?.trim().toLowerCase() ?? "";
    requestsByLane.set(lane, [...(requestsByLane.get(lane) ?? []), request]);
  }
  for (const [lane, laneRequests] of requestsByLane) {
    const matched = nodes.filter((node) =>
      !claimed.has(node.id) &&
      (lane === "" || node.targetLane?.trim().toLowerCase() === lane));
    if (matched.length === 0) continue;
    if (lane === "") {
      laneRequests.forEach((request, index) => {
        const node = matched[index];
        if (!node) return;
        claimed.add(node.id);
        tasks.push({ request, nodeIds: [node.id], rounds: [] });
      });
      continue;
    }
    const buckets: string[][] = laneRequests.map(() => []);
    matched.forEach((node, index) => {
      buckets[index % laneRequests.length]!.push(node.id);
      claimed.add(node.id);
    });
    laneRequests.forEach((request, index) => {
      const nodeIds = buckets[index]!;
      if (nodeIds.length === 0) return;
      tasks.push({ request, nodeIds, rounds: [] });
    });
  }
  return tasks;
}

async function runPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Fully automatic ingest-time generation: for each planner generation request,
 * generate a distinct shell (unique mechanic brief), Playwright-validate it,
 * AI-judge the gameplay screenshots, catalog it, and attach it to exactly its
 * nodes. Runs inside a wall-clock budget; work that outlives the budget keeps
 * going and upgrades its nodes in place when it lands.
 */
export async function generateAndAttachBaselineShells(
  input: BaselineShellPipelineInput,
): Promise<BaselineShellPipelineResult> {
  const rootDir = input.rootDir ?? process.cwd();
  const childId = input.childId.trim().toLowerCase();
  const chart = getChildChart(childId, { rootDir });
  const boundCanonicalNodeIds = new Set(
    (chart.learningCycle?.nodes ?? [])
      .filter((node) => node.role === "baseline" && node.artifactBinding?.validationStatus === "passed")
      .map((node) => node.nodeId),
  );
  const laneNodes = laneNodesForChart(chart)
    .filter((node) => !boundCanonicalNodeIds.has(node.id));
  const tasks = assignRequestsToNodes(input.generationRequests, laneNodes)
    .flatMap((task) => task.nodeIds.map((nodeId) => ({
      request: { ...task.request, id: `${task.request.id}-${nodeId}` },
      nodeIds: [nodeId],
      rounds: assessableTaskRounds(input.roundsByNodeId[nodeId] ?? [], input.domain),
    })))
    .filter((task) => task.rounds.length > 0);
  const coveredNodeIds = new Set(tasks.flatMap((task) => task.nodeIds));
  for (const node of laneNodes) {
    const rounds = assessableTaskRounds(input.roundsByNodeId[node.id] ?? [], input.domain);
    if (coveredNodeIds.has(node.id) || rounds.length === 0) continue;
    tasks.push({
      request: {
        id: `genreq-canonical-${node.id}`,
        skillTarget: node.targetLane ?? `${input.domain}_practice`,
        targetLane: node.targetLane,
        domain: input.domain,
        mechanicConstraints: "Implement the canonical node contract exactly.",
        reason: "The canonical cycle has an unbound baseline node and requires a distinct validated artifact.",
      },
      nodeIds: [node.id],
      rounds,
    });
  }
  if (tasks.length === 0) {
    return { attachedNodeIds: [], failedNodeIds: [], pendingNodeIds: [] };
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
    decision: "generate_new",
    decisionReason: "Planner supplied generation requests and no approved artifact was selected for those experiment arms.",
    evidenceUsed: [input.homeworkId],
    theoryId: chart.engagementTheory?.theoryId ?? chart.learningProfile.engagementTheory?.theoryId,
    experimentIds: laneNodes.map((node) => chart.activeSessionPlan?.nodePlan.find((candidate) => candidate.id === node.id)?.experimentId).filter(Boolean),
    generationRequests: input.generationRequests,
    recordedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");

  const sharedRefill = refillBaselineShellConfig({
    rootDir,
    childId,
    shell: { activityId: "generated-baseline", nodeType: "generated-baseline", source: "generated_shell" },
    homeworkId: input.homeworkId,
    title: input.title,
    homeworkRounds: tasks.flatMap((task) => task.rounds).slice(0, 12),
  });
  const laneConfigs = refillBaselineLaneConfigs({
    rootDir,
    childId,
    homeworkId: input.homeworkId,
    title: input.title,
    homeworkRounds: tasks.flatMap((task) => task.rounds).slice(0, 12),
    nodes: laneNodes,
    roundsByNodeId: input.roundsByNodeId,
    domain: input.domain,
  });

  const latestFeedback = new Map<string, ReturnType<typeof readContentFeedbackLessons>[number]>();
  for (const lesson of readContentFeedbackLessons(rootDir, childId)) {
    if (lesson.contentId) latestFeedback.set(lesson.contentId, lesson);
  }
  const reusableMatches = [...new Map(
    decision.matchedShells
      .filter((match) => match.gameHtmlPath)
      .filter((match) => {
        const lesson = match.contentId ? latestFeedback.get(match.contentId) : undefined;
        return lesson?.decision !== "reject" && lesson?.verdict !== "retire";
      })
      .map((match) => [match.gameHtmlPath, match] as const),
  ).values()];

  const canonicalNodes = new Map(
    (chart.learningCycle?.nodes ?? [])
      .filter((node) => node.role === "baseline")
      .map((node) => [node.nodeId, node] as const),
  );
  const exactMatchesByNode = new Map<string, typeof reusableMatches>();
  for (const task of tasks) {
    for (const nodeId of task.nodeIds) {
      const contract = canonicalNodes.get(nodeId);
      exactMatchesByNode.set(
        nodeId,
        contract ? reusableMatches.filter((match) => baselineShellMatchesNodeContract(match, contract).matches) : [],
      );
    }
  }
  const everyReuseNodeHasExactMatch = tasks.flatMap((task) => task.nodeIds)
    .every((nodeId) => (exactMatchesByNode.get(nodeId)?.length ?? 0) > 0);

  if (decision.decision === "reuse_baseline" && everyReuseNodeHasExactMatch) {
    const attachedNodeIds: string[] = [];
    let nodeIndex = 0;
    tasks.forEach((task) => {
      const artifactsForNodes = task.nodeIds.map((nodeId) => {
        const nodeMatches = exactMatchesByNode.get(nodeId) ?? [];
        const artifact = buildReusedBaselineArtifact(
          nodeMatches[nodeIndex++ % nodeMatches.length]!,
          {
            childId,
            homeworkId: input.homeworkId,
            domain: input.domain,
            title: input.title,
            requestId: `${task.request.id}-${nodeId}`,
          },
        );
        if (!artifact) return [nodeId, undefined] as const;
        const nodeArtifact = {
          ...artifact,
          contentId: `${artifact.contentId}:${nodeId}`,
          brief: {
            ...artifact.brief,
            briefId: `${artifact.brief.briefId}:${nodeId}`,
            title: chart.activeSessionPlan?.nodePlan.find((node) => node.id === nodeId)?.title ?? artifact.brief.title,
          },
        };
        return [nodeId, nodeArtifact] as const;
      });
      const primary = artifactsForNodes.find(([, artifact]) => artifact)?.[1];
      if (!primary) return;
      const artifactByNodeId = Object.fromEntries(
        artifactsForNodes.filter(([, artifact]) => artifact) as Array<[string, BaselineShellArtifact]>,
      );
      attachBaselineShellToHomework({
        rootDir,
        childId,
        artifact: primary,
        activityConfigPath: sharedRefill.activityConfigPath,
        configPathByNodeId: laneConfigs,
        artifactByNodeId,
        onlyNodeIds: task.nodeIds,
      });
      attachedNodeIds.push(...task.nodeIds);
    });
    ingestDiagnostic(`🎮 [baseline-pipeline] [reuse] attached=${attachedNodeIds.length} approved_shells=${reusableMatches.length}`);
    return { attachedNodeIds, failedNodeIds: [], pendingNodeIds: [] };
  }

  const attachedNodeIds: string[] = [];
  const failedNodeIds: string[] = [];
  const settledNodeIds = new Set<string>();

  const runTask = async (task: GenerationTask): Promise<void> => {
    const generationKey = `${childId}:${input.homeworkId}:${task.request.id}`;
    if (runningGenerationKeys.has(generationKey)) return;
    runningGenerationKeys.add(generationKey);
    try {
      const nodeContract = canonicalNodes.get(task.nodeIds[0]!);
      const briefs = await generateBaselineMechanicBriefCandidates({
        chart,
        gap: buildNodeBriefGap({ baseGap: decision.gap, request: task.request, node: nodeContract }),
        rootDir,
        homeworkBody: input.conceptText,
      });
      for (let attempt = 0; attempt < generationCandidateAttempts(briefs); attempt += 1) {
        const candidateBrief = generationBriefForTask(briefs, task.request.id, attempt);
        if (!candidateBrief) break;
        const baseBrief = nodeContract ? {
          ...candidateBrief,
          title: nodeContract.title,
          mechanic: nodeContract.mechanic,
          theme: nodeContract.theme,
          domain: nodeContract.academicTarget.domain,
          skillTarget: nodeContract.academicTarget.skill,
        } : candidateBrief;
        // Static-validation failures throw; treat them as a failed attempt so
        // the retry brief still runs instead of killing this pool runner.
        const nodeId = task.nodeIds[0]!;
        const configUrl = laneConfigs[nodeId];
        const configFilename = configUrl ? path.basename(configUrl) : "generated-baseline.json";
        const configFilePath = path.join(
          resolveChildContextDir(childId, { rootDir }),
          "homework",
          "games",
          input.homeworkId,
          configFilename,
        );
        const artifact = await generateBaselineShellWithLlm({
          chart,
          gap: { ...decision.gap, skillTarget: task.request.skillTarget },
          brief: baseBrief,
          homeworkId: input.homeworkId,
          configFilename,
          homework: { title: input.title, body: input.conceptText, rounds: task.rounds },
          configFilePath,
          rootDir,
        }).catch((err: unknown) => {
          ingestDiagnostic(
            `🎮 [baseline-pipeline] [generate-error] request=${task.request.id} brief=${baseBrief.briefId}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return null;
        });
        if (!artifact || artifact.artifactStatus !== "ready_for_review") {
          if (artifact) {
            ingestDiagnostic(
              `🎮 [baseline-pipeline] [validation-failed] request=${task.request.id} brief=${baseBrief.briefId}`,
            );
          }
          continue;
        }
        const verdict = await judgeBaselineShellDesign({
          brief: baseBrief,
          screenshotPaths: artifact.validationReport?.screenshotPaths ?? [],
          model: input.judgeModel,
        });
        reviewBaselineShellArtifact({
          rootDir,
          childId,
          artifact,
          decision: verdict.decision === "approve" ? "approve" : "reject",
          reason: verdict.reason || "AI design judge verdict",
          reviewer: "ai",
        });
        if (verdict.decision !== "approve") {
            ingestDiagnostic(
              `🎮 [baseline-pipeline] [judge-reject] request=${task.request.id} brief=${baseBrief.briefId}: ${verdict.reason}`,
          );
          continue;
        }
        const approved: BaselineShellArtifact = { ...artifact, artifactStatus: "approved_ready" };
        const artifactByNodeId = Object.fromEntries(
          task.nodeIds.map((nodeId) => [nodeId, {
            ...approved,
            contentId: `${approved.contentId}:${nodeId}`,
            brief: {
              ...approved.brief,
              briefId: `${approved.brief.briefId}:${nodeId}`,
              title: chart.activeSessionPlan?.nodePlan.find((node) => node.id === nodeId)?.title ?? approved.brief.title,
            },
          }]),
        );
        attachBaselineShellToHomework({
          rootDir,
          childId,
          artifact: approved,
          activityConfigPath: sharedRefill.activityConfigPath,
          configPathByNodeId: laneConfigs,
          artifactByNodeId,
          onlyNodeIds: task.nodeIds,
        });
        task.nodeIds.forEach((nodeId) => {
          settledNodeIds.add(nodeId);
          attachedNodeIds.push(nodeId);
        });
        ingestDiagnostic(
          `🎮 [baseline-pipeline] [attached] request=${task.request.id} shell=${approved.filename} nodes=${task.nodeIds.join(",")}`,
        );
        return;
      }
      task.nodeIds.forEach((nodeId) => {
        settledNodeIds.add(nodeId);
        failedNodeIds.push(nodeId);
      });
      ingestDiagnostic(`🎮 [baseline-pipeline] [failed] request=${task.request.id} — falling back to shared shell`);
    } finally {
      runningGenerationKeys.delete(generationKey);
    }
  };

  const allWork = runPool(tasks, GENERATION_POOL_SIZE, runTask).catch((err: unknown) => {
    ingestDiagnosticError("🎮 [baseline-pipeline] [error]", err instanceof Error ? err.message : String(err));
  });
  const budgetMs = input.budgetMs ??
    Number(process.env.SUNNY_INGEST_GENERATION_BUDGET_MS ?? DEFAULT_BUDGET_MS);
  let budgetTimer: NodeJS.Timeout | undefined;
  const budgetElapsed = new Promise<"budget">((resolve) => {
    budgetTimer = setTimeout(() => resolve("budget"), budgetMs);
    budgetTimer.unref?.();
  });
  const outcome = generationWaitMode(input) === "complete"
    ? await allWork.then(() => "done" as const)
    : await Promise.race([allWork.then(() => "done" as const), budgetElapsed]);
  if (budgetTimer) clearTimeout(budgetTimer);

  const allTaskNodeIds = tasks.flatMap((task) => task.nodeIds);
  const pendingNodeIds = outcome === "budget"
    ? allTaskNodeIds.filter((nodeId) => !settledNodeIds.has(nodeId))
    : [];
  if (pendingNodeIds.length > 0) {
    ingestDiagnostic(
      `🎮 [baseline-pipeline] [budget-elapsed] nodes still generating: ${pendingNodeIds.join(",")} — they upgrade in place when ready`,
    );
  }
  return {
    attachedNodeIds: [...attachedNodeIds],
    failedNodeIds: [...failedNodeIds],
    pendingNodeIds,
  };
}
