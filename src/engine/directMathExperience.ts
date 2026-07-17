import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { ChildChart } from "../profiles/childChart";
import type { AssignmentSourceExtraction } from "./assignmentSourceExtraction";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
import { NODE_REGISTRY } from "../shared/nodeRegistry";

export type DirectActivity = {
  id: string;
  title: string;
  routeId: string;
  academicTarget: string;
  mechanic: string;
  engagementVariable: string;
  visualMock: { scene: string; layout: string; artworkPrompt: string };
  experience: {
    objective: string;
    childAction: string;
    worldReaction: string;
    anticipation: string;
    progress: string;
    recovery: string;
    reward: string;
  };
  questions: Array<{
    id: string;
    prompt: string;
    options: Array<{ label: string; correct: boolean }>;
  }>;
  acceptanceSteps: string[];
  creatorPrompt: string;
  designPrediction: string;
  preserve: string[];
  change: string[];
  explore: string[];
  avoid: string[];
  measurementKeys: string[];
  /** Planner-authored browser test, created before the activity HTML. */
  acceptanceScript: string;
};

export const EXPERIENCE_DESIGN_CONSTITUTION = `Experience Design Constitution:
- Make the learning target visually dominant and readable.
- Make the first required action understandable within ten seconds.
- Show one active problem unless simultaneous comparison is academically necessary.
- Make the requested response match the accepted response.
- Use drag only when movement represents the concept; otherwise use a lower-friction interaction.
- Keep required input targets stationary while the child acts; animate the surrounding world instead of moving buttons, tiles, or drop zones away from the pointer.
- For unfamiliar mechanics, provide visible toggleable “Show me” and “Let me try” controls. The demonstration must remain replayable and must not reveal the answer.
- Include a visible sound toggle plus interaction, recovery, progress, and completion sounds initialized after the first child gesture.
- Show the exact visible activity title in the opening viewport.
- Visibly load the assigned artwork URL as part of the world rather than silently replacing or omitting it.
- Keep Quest and Boss locked at ingestion.
- Treat initial activities as teaching and practice evidence only, never mastery.`;

export type DirectLearningExperiencePlan = {
  planId: string;
  title: string;
  academicTheory: string;
  profileEvidence: string[];
  boardWorld: { title: string; narrative: string; backgroundPrompt: string };
  fork: {
    question: string;
    hypothesis: string;
    heldConstant: string[];
    routes: Array<{
      id: string;
      label: string;
      promise: string;
      engagementVariable: string;
      nodeIds: string[];
    }>;
  };
  activities: DirectActivity[];
  quest: { title: "Quest"; locked: true; teaser: string; artworkPrompt: string };
  boss: { title: "Boss"; locked: true; teaser: string; artworkPrompt: string };
};

export type DirectArtifact = {
  childId: string;
  homeworkId: string;
  nodeId: string;
  title: string;
  htmlPath: string;
  artworkUrl: string;
  acceptanceScript: string;
  creatorPrompt: string;
  promptHash: string;
  plannerModel: string;
  creatorModel: string;
};

export type DirectPlaywrightReport = {
  passed: boolean;
  failures: string[];
  screenshots: string[];
};

export function hasReadyDirectMathExperience(childId: string, rootDir = process.cwd()): boolean {
  const directPath = path.join(rootDir, "src", "context", childId.trim().toLowerCase(), "homework", "direct_experience_plan.json");
  if (!fs.existsSync(directPath)) return false;
  try {
    const record = JSON.parse(fs.readFileSync(directPath, "utf8")) as {
      childId?: string;
      activeSessionPlan?: { domain?: string };
      playwrightReport?: { passed?: boolean };
    };
    return record.childId === childId.trim().toLowerCase()
      && record.activeSessionPlan?.domain === "math"
      && record.playwrightReport?.passed === true;
  } catch {
    return false;
  }
}

export function boardPosition(percentX: number, percentY: number): { x: number; y: number } {
  return { x: percentX / 100, y: percentY / 100 };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`direct_plan_missing_${key}`);
  return value.trim();
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`direct_plan_invalid_${label}`);
  }
  return value.map(String);
}

export function parseDirectLearningExperiencePlan(value: unknown): DirectLearningExperiencePlan {
  const root = object(value);
  if (!root) throw new Error("direct_plan_must_be_object");
  const fork = object(root.fork);
  if (!fork) throw new Error("direct_plan_missing_fork");
  const rawRoutes = Array.isArray(fork.routes) ? fork.routes : [];
  if (rawRoutes.length !== 2) throw new Error("direct_plan_requires_two_routes");
  const routes = rawRoutes.map((raw) => {
    const route = object(raw);
    if (!route) throw new Error("direct_plan_invalid_route");
    return {
      id: requiredString(route, "id"),
      label: requiredString(route, "label"),
      promise: requiredString(route, "promise"),
      engagementVariable: requiredString(route, "engagementVariable"),
      nodeIds: stringArray(route.nodeIds, "route_node_ids"),
    };
  });
  if (routes[0]!.id === routes[1]!.id || routes[0]!.engagementVariable === routes[1]!.engagementVariable) {
    throw new Error("direct_plan_requires_genuine_fork");
  }
  const rawActivities = Array.isArray(root.activities) ? root.activities : [];
  if (rawActivities.length === 0) throw new Error("direct_plan_requires_activities");
  const activities = rawActivities.map((raw): DirectActivity => {
    const activity = object(raw);
    const visualMock = object(activity?.visualMock);
    const experience = object(activity?.experience);
    if (!activity || !visualMock || !experience) throw new Error("direct_plan_invalid_activity");
    const questions = (Array.isArray(activity.questions) ? activity.questions : []).map((rawQuestion) => {
      const question = object(rawQuestion);
      if (!question) throw new Error("direct_plan_invalid_question");
      const options = (Array.isArray(question.options) ? question.options : []).map((rawOption) => {
        const option = object(rawOption);
        if (!option || typeof option.correct !== "boolean") throw new Error("direct_plan_invalid_option");
        return { label: requiredString(option, "label"), correct: option.correct };
      });
      if (options.length < 2 || options.filter((option) => option.correct).length !== 1) {
        throw new Error("direct_plan_question_requires_one_correct_answer");
      }
      return { id: requiredString(question, "id"), prompt: requiredString(question, "prompt"), options };
    });
    if (questions.length === 0) throw new Error("direct_plan_activity_requires_questions");
    return {
      id: requiredString(activity, "id"),
      title: requiredString(activity, "title"),
      routeId: requiredString(activity, "routeId"),
      academicTarget: requiredString(activity, "academicTarget"),
      mechanic: requiredString(activity, "mechanic"),
      engagementVariable: requiredString(activity, "engagementVariable"),
      visualMock: {
        scene: requiredString(visualMock, "scene"),
        layout: requiredString(visualMock, "layout"),
        artworkPrompt: requiredString(visualMock, "artworkPrompt"),
      },
      experience: {
        objective: requiredString(experience, "objective"),
        childAction: requiredString(experience, "childAction"),
        worldReaction: requiredString(experience, "worldReaction"),
        anticipation: requiredString(experience, "anticipation"),
        progress: requiredString(experience, "progress"),
        recovery: requiredString(experience, "recovery"),
        reward: requiredString(experience, "reward"),
      },
      questions,
      acceptanceSteps: stringArray(activity.acceptanceSteps, "acceptance_steps"),
      creatorPrompt: requiredString(activity, "creatorPrompt"),
      designPrediction: requiredString(activity, "designPrediction"),
      preserve: stringArray(activity.preserve, "preserve"),
      change: stringArray(activity.change, "change"),
      explore: stringArray(activity.explore, "explore"),
      avoid: stringArray(activity.avoid, "avoid"),
      measurementKeys: stringArray(activity.measurementKeys, "measurement_keys"),
      acceptanceScript: requiredString(activity, "acceptanceScript"),
    };
  });
  const ids = new Set(activities.map((activity) => activity.id));
  if (ids.size !== activities.length) throw new Error("direct_plan_duplicate_activity_id");
  for (const activity of activities) {
    const route = routes.find((candidate) => candidate.id === activity.routeId);
    if (!route) throw new Error("direct_plan_activity_not_bound_to_route");
  }
  for (const route of routes) route.nodeIds = activities.filter((activity) => activity.routeId === route.id).map((activity) => activity.id);
  if (routes.some((route) => route.nodeIds.length === 0)) throw new Error("direct_plan_route_has_no_activity");
  const quest = object(root.quest);
  const boss = object(root.boss);
  if (!quest || !boss) throw new Error("direct_plan_requires_quest_and_boss_teasers");
  const boardWorld = object(root.boardWorld);
  if (!boardWorld) throw new Error("direct_plan_missing_board_world");
  return {
    planId: requiredString(root, "planId"),
    title: requiredString(root, "title"),
    academicTheory: requiredString(root, "academicTheory"),
    profileEvidence: stringArray(root.profileEvidence, "profile_evidence"),
    boardWorld: {
      title: requiredString(boardWorld, "title"),
      narrative: requiredString(boardWorld, "narrative"),
      backgroundPrompt: requiredString(boardWorld, "backgroundPrompt"),
    },
    fork: {
      question: requiredString(fork, "question"),
      hypothesis: requiredString(fork, "hypothesis"),
      heldConstant: stringArray(fork.heldConstant, "held_constant"),
      routes,
    },
    activities,
    quest: { title: "Quest", locked: true, teaser: requiredString(quest, "teaser"), artworkPrompt: requiredString(quest, "artworkPrompt") },
    boss: { title: "Boss", locked: true, teaser: requiredString(boss, "teaser"), artworkPrompt: requiredString(boss, "artworkPrompt") },
  };
}

function chartForPlanner(chart: ChildChart): unknown {
  return {
    identity: chart.identity,
    demographics: chart.demographics,
    learningProfile: {
      rewardPreferences: chart.learningProfile.rewardPreferences,
      sessionStats: chart.learningProfile.sessionStats,
      activityModel: chart.learningProfile.activityModel,
      activityTraitModel: chart.learningProfile.activityTraitModel,
    },
    engagementTheory: chart.engagementTheory,
    factBankSummary: chart.factBankSummary,
    recentDecision: chart.decisionTrace.latest,
  };
}

export async function askDirectMathPlanner(input: {
  childId: string;
  chart: ChildChart;
  extraction: AssignmentSourceExtraction;
  client?: Anthropic;
  model?: string;
  priorOutcomes?: unknown;
}): Promise<DirectLearningExperiencePlan> {
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `You are Sunny's sole learning-experience planner and creative director.
${EXPERIENCE_DESIGN_CONSTITUTION}

Create one coherent choose-your-adventure math board for this exact child and assignment.
You decide how many baseline activities are educationally necessary. Do not force two activities.
The board must include exactly two meaningful routes so the child has agency and Sunny can compare one engagement variable while holding the academic need comparable.
fork.question is child-facing copy: at most 10 words, inviting, and easy to say aloud. Put the detailed research claim only in fork.hypothesis.
Each activity must be a bespoke vibrant game world, never a quiz card placed on a background. Describe the complete visual mock, child action, world reaction, anticipation, progress transformation, recovery, and reward.
Use profile evidence as broad motivators; do not repeat one literal interest across every activity.
Quest and Boss are exciting locked teaser destinations. Do not create playable Quest or Boss content.
Every math question must have exactly one correct answer grounded in the assignment.
The first required action must be understandable within ten seconds. For any unfamiliar drag, construction, or manipulation mechanic, provide an optional visible demonstration instead of front-loading instructions.
A question asking “how many” must accept the final quantity. If the child must construct or show a representation, the prompt must explicitly ask them to build or show it.
Use one active problem at a time when simultaneous problems add unnecessary cognitive load, and keep instructions short and child-facing.
Design intentional interaction, recovery, progress, and completion sounds that support the experience without distracting from it.
Initial board activities create teaching and practice evidence only. Completion cannot establish mastery or unlock Quest or Boss.
For every activity, write a bespoke creatorPrompt that tells a separate Experience Creator how to realize this activity. Derive it from the assignment, child chart, prior factual outcomes, recent themes, and engagement theory. Also preregister designPrediction and list preserve, change, explore, avoid, and namespaced measurementKeys. These values must vary when evidence supports a change; do not hardcode a game, theme, layout, mechanic, or activity count.
For each activity, write acceptanceScript before its UI exists. It is an async Playwright JavaScript function body with access to page and BASE_URL. It must use page locators and stable data-testid selectors to open /activities/{activityId}, take an incorrect path, verify recovery, complete every question correctly, verify visible world/progress changes, and return {passed:true} only when completion is visible. It must throw when any promise is broken. The activity implementation will be generated against this exact test.

Return JSON only with this shape:
{
  "planId":"...", "title":"...", "academicTheory":"...", "profileEvidence":["evidence reference"],
  "boardWorld":{"title":"...","narrative":"...","backgroundPrompt":"..."},
  "fork":{"question":"...","hypothesis":"...","heldConstant":["..."],"routes":[{"id":"route-a","label":"...","promise":"...","engagementVariable":"...","nodeIds":["..."]},{"id":"route-b","label":"...","promise":"...","engagementVariable":"...","nodeIds":["..."]}]},
  "activities":[{"id":"...","title":"...","routeId":"route-a","academicTarget":"...","mechanic":"...","engagementVariable":"...","visualMock":{"scene":"...","layout":"...","artworkPrompt":"..."},"experience":{"objective":"...","childAction":"...","worldReaction":"...","anticipation":"...","progress":"...","recovery":"...","reward":"..."},"questions":[{"id":"q1","prompt":"...","options":[{"label":"...","correct":true},{"label":"...","correct":false}]}],"creatorPrompt":"Adaptive instructions for the Experience Creator","designPrediction":"A preregistered prediction about the child's interaction","preserve":["successful element"],"change":["evidence-supported correction"],"explore":["one bounded variation"],"avoid":["known failure"],"measurementKeys":["interaction.timeToFirstValidActionMs"],"acceptanceSteps":["launch","perform real action","exercise incorrect recovery","exercise correct path","complete"],"acceptanceScript":"JavaScript async-function body that uses real DOM interactions, throws on failure, and returns {passed:true} after completion"}],
  "quest":{"title":"Quest","locked":true,"teaser":"...","artworkPrompt":"..."},
  "boss":{"title":"Boss","locked":true,"teaser":"...","artworkPrompt":"..."}
}

Assignment:
${input.extraction.fullText}

Child chart:
${JSON.stringify(chartForPlanner(input.chart), null, 2)}

Prior factual outcomes and Planner interpretations:
${JSON.stringify(input.priorOutcomes ?? [], null, 2)}`;
  const toolName = "create_learning_experience_plan";
  const response = await client.messages.create({
    model: input.model ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
    tools: [{
      name: toolName,
      description: "Return the complete planner-authored learning experience plan.",
      input_schema: { type: "object", additionalProperties: true },
    }],
    tool_choice: { type: "tool", name: toolName },
  }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("direct_planner_tool_output_missing");
  return parseDirectLearningExperiencePlan(toolUse.input);
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`direct_artwork_download_failed:${response.status}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

async function requestDirectArtwork(prompt: string): Promise<string> {
  const apiKey = process.env.GROK_API_KEY?.trim();
  if (!apiKey) throw new Error("direct_artwork_missing_grok_key");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROK_IMAGE_MODEL?.trim() || "grok-imagine-image",
        prompt: `Premium vibrant children's game artwork for age 7, strong visual hierarchy, cinematic lighting, no text, no equations, no generic school worksheet imagery. ${prompt}`,
        n: 1,
      }),
    });
    if (response.ok) {
      const json = await response.json() as { data?: Array<{ url?: string }> };
      const url = json.data?.[0]?.url;
      if (url) return url;
      throw new Error("direct_artwork_provider_returned_no_url");
    }
    if (response.status !== 429 || attempt === 3) {
      throw new Error(`direct_artwork_provider_failed:${response.status}:${await response.text()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error("direct_artwork_provider_exhausted");
}

async function createArtwork(prompt: string, publicDir: string, filename: string): Promise<string> {
  const relative = path.join("generated", "direct-math", filename);
  const localPath = path.join(publicDir, relative);
  if (!fs.existsSync(localPath) || fs.statSync(localPath).size === 0) {
    const remote = await requestDirectArtwork(prompt);
    await download(remote, localPath);
  }
  return `/${relative.replaceAll(path.sep, "/")}`;
}

function stripHtml(text: string): string {
  return text.trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "");
}

export function isCompleteGeneratedHtml(html: string): boolean {
  return /^\s*<!doctype html/i.test(html) && /<\/html>\s*$/i.test(html.trim());
}

export function acceptanceScriptBody(script: string): string {
  const trimmed = script.trim();
  const wrapped = trimmed.match(
    /^async\s+function\s*\(\s*\{\s*page\s*,\s*BASE_URL\s*\}\s*\)\s*\{([\s\S]*)\}\s*;?$/,
  );
  return wrapped?.[1]?.trim() ?? trimmed;
}

export function creatorPromptHash(
  activity: DirectActivity,
  plannerModel: string,
  creatorModel: string,
): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    constitution: EXPERIENCE_DESIGN_CONSTITUTION,
    plannerModel,
    creatorModel,
    activity,
  })).digest("hex");
}

export function shouldReuseDirectArtifact(input: {
  htmlComplete: boolean;
  savedPromptHash?: string;
  expectedPromptHash: string;
}): boolean {
  return input.htmlComplete && input.savedPromptHash === input.expectedPromptHash;
}

export function buildDirectActivityCreatorPrompt(input: {
  activity: DirectActivity;
  artworkUrl: string;
  childId: string;
}): string {
  return `Build the complete child-facing activity below as one self-contained HTML file with inline CSS and JavaScript.
${EXPERIENCE_DESIGN_CONSTITUTION}

The AI Planner's exact Creator prompt is authoritative:
${input.activity.creatorPrompt}

The ExperienceSpec is authoritative. Do not reinterpret it, rename it, or turn it into a generic quiz/card shell.
Make the opening viewport vibrant, polished, and immediately understandable to a child. The central mechanic must visibly perform the promised child action and world reaction.
Use the supplied artwork as part of the world, not as a decorative thumbnail: ${input.artworkUrl}
Implement the AI Planner's saved questions and correct answers faithfully so the mathematical quantities, accepted responses, activity UI, and browser QA agree.
Saved questions/content:
${JSON.stringify(input.activity.questions, null, 2)}
Emit interaction evidence with window.parent.postMessage for demoRequested, demoReplayCount, timeToFirstValidActionMs, invalidActionCount, and soundMuted. Include those factual values in the node_complete payload with attempt results.
Emit window.parent.postMessage({type:"attempt_event",payload:{domain:"math",targetId,correct,responseTimeMs}},"*") for each answer and {type:"node_complete",payload:{nodeId:"${input.activity.id}",completed:true}},"*") on completion.
Include <div id="sunny-companion"></div> so the parent app owns Elli.
The planner wrote the browser acceptance test before this UI. Build the DOM, data-testid hooks, behavior, and completion flow so this exact script passes through real interactions. Do not rewrite or embed the test in the activity:
${input.activity.acceptanceScript}
Apply observable state attributes synchronously in the order the test asserts them; animations may continue afterward but must not delay the tested state transition.
Keep the complete HTML under 18,000 characters. Prefer concise CSS and JavaScript; do not duplicate rules or add hidden alternate implementations. The document must end with </html>.
Do not include external libraries.
Return raw HTML only.

Child: ${input.childId}
ExperienceSpec:
${JSON.stringify(input.activity, null, 2)}`;
}

export function buildDirectActivityRepairPrompt(input: {
  activity: DirectActivity;
  html: string;
  failures: string[];
}): string {
  return `Repair this generated activity implementation only.
Keep the Planner's exact Creator prompt authoritative:
${input.activity.creatorPrompt}

Fix every supplied browser failure. Do not change the questions, correct answers, learning target, mechanic, title, evidence claim, or board identity. Keep required controls stationary while they are being used. Remove references to missing DOM elements. Preserve all runtime evidence events.

Browser failures:
${input.failures.join("\n")}

Activity specification:
${JSON.stringify(input.activity, null, 2)}

Current HTML:
${input.html}

Return only minimal exact replacements through the repair tool. Each edit must contain an oldText snippet copied exactly once from the current HTML and the smallest possible newText replacement. Do not return a rewritten HTML document. Do not include unchanged sections.`;
}

export type DirectArtifactEdit = { oldText: string; newText: string };

export function normalizeDirectArtifactEdits(value: unknown): DirectArtifactEdit[] {
  let candidate = value;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && "edits" in candidate) {
    candidate = (candidate as { edits?: unknown }).edits;
  }
  if (typeof candidate === "string") {
    const serialized = candidate.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      candidate = JSON.parse(serialized) as unknown;
    } catch {
      throw new Error("direct_activity_repair_edits_invalid_json");
    }
  }
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    candidate = Object.values(candidate as Record<string, unknown>);
  }
  if (!Array.isArray(candidate)) throw new Error("direct_activity_repair_edits_invalid");
  return candidate.map((raw) => {
    const edit = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    return {
      oldText: typeof edit.oldText === "string" ? edit.oldText : "",
      newText: typeof edit.newText === "string" ? edit.newText : "",
    };
  });
}

export function applyDirectArtifactEdits(html: string, edits: DirectArtifactEdit[]): string {
  if (edits.length === 0 || edits.length > 12) throw new Error("direct_activity_repair_edit_count_invalid");
  let repaired = html;
  for (const edit of edits) {
    if (!edit.oldText || edit.oldText === edit.newText) throw new Error("direct_activity_repair_edit_invalid");
    const first = repaired.indexOf(edit.oldText);
    if (first < 0) throw new Error("direct_activity_repair_anchor_missing");
    if (repaired.indexOf(edit.oldText, first + edit.oldText.length) >= 0) {
      throw new Error("direct_activity_repair_anchor_ambiguous");
    }
    repaired = `${repaired.slice(0, first)}${edit.newText}${repaired.slice(first + edit.oldText.length)}`;
  }
  if (!isCompleteGeneratedHtml(repaired)) throw new Error("direct_activity_repair_html_incomplete");
  return repaired;
}

async function generateActivityHtml(input: {
  activity: DirectActivity;
  artworkUrl: string;
  childId: string;
  client: Anthropic;
  model: string;
}): Promise<string> {
  const prompt = buildDirectActivityCreatorPrompt(input);
  const response = await input.client.messages.create({
    model: input.model,
    max_tokens: Number(process.env.SUNNY_GENERATION_MAX_TOKENS ?? 8000),
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: prompt }],
  }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
  const html = stripHtml(response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n"));
  if (!isCompleteGeneratedHtml(html)) {
    throw new Error(`direct_activity_html_truncated:${input.activity.id}:stop=${response.stop_reason ?? "unknown"}:chars=${html.length}`);
  }
  return html;
}

export async function generateDirectArtifacts(input: {
  plan: DirectLearningExperiencePlan;
  childId: string;
  homeworkId: string;
  rootDir?: string;
  client?: Anthropic;
  model?: string;
  plannerModel?: string;
}): Promise<{ artifacts: DirectArtifact[]; backgroundUrl: string; questArtworkUrl: string; bossArtworkUrl: string }> {
  const rootDir = input.rootDir ?? process.cwd();
  const publicDir = path.join(rootDir, "web", "public");
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = input.model ?? process.env.SUNNY_GENERATION_MODEL ?? "claude-sonnet-5";
  const plannerModel = input.plannerModel ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5";
  process.env.SUNNY_IMAGE_GENERATION_MAX_PER_RUN = String(input.plan.activities.length + 3);
  const artworkJobs = [
    { prompt: input.plan.boardWorld.backgroundPrompt, filename: `${input.homeworkId}-background.jpeg` },
    { prompt: input.plan.quest.artworkPrompt, filename: `${input.homeworkId}-quest.jpeg` },
    { prompt: input.plan.boss.artworkPrompt, filename: `${input.homeworkId}-boss.jpeg` },
    ...input.plan.activities.map((activity) => ({ prompt: activity.visualMock.artworkPrompt, filename: `${input.homeworkId}-${activity.id}.jpeg` })),
  ];
  const artworkUrls: string[] = [];
  for (const job of artworkJobs) artworkUrls.push(await createArtwork(job.prompt, publicDir, job.filename));
  const [backgroundUrl, questArtworkUrl, bossArtworkUrl, ...activityArt] = artworkUrls as [string, string, string, ...string[]];
  const gamesDir = path.join(rootDir, "src", "context", input.childId, "homework", "games", input.homeworkId);
  fs.mkdirSync(gamesDir, { recursive: true });
  const artifacts: DirectArtifact[] = [];
  for (const [index, activity] of input.plan.activities.entries()) {
    const artworkUrl = activityArt[index]!;
    const htmlPath = path.join(gamesDir, `${activity.id}.html`);
    const metadataPath = path.join(gamesDir, `${activity.id}.artifact.json`);
    const existingHtml = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
    const expectedPromptHash = creatorPromptHash(activity, plannerModel, model);
    let savedPromptHash: string | undefined;
    try {
      savedPromptHash = (JSON.parse(fs.readFileSync(metadataPath, "utf8")) as { promptHash?: string }).promptHash;
    } catch {
      savedPromptHash = undefined;
    }
    if (!shouldReuseDirectArtifact({ htmlComplete: isCompleteGeneratedHtml(existingHtml), savedPromptHash, expectedPromptHash })) {
      const html = await generateActivityHtml({ activity, artworkUrl, childId: input.childId, client, model });
      fs.writeFileSync(htmlPath, html, "utf8");
      fs.writeFileSync(metadataPath, `${JSON.stringify({
        version: 1,
        nodeId: activity.id,
        creatorPrompt: activity.creatorPrompt,
        promptHash: expectedPromptHash,
        plannerModel,
        creatorModel: model,
      }, null, 2)}\n`, "utf8");
    }
    artifacts.push({
      childId: input.childId,
      homeworkId: input.homeworkId,
      nodeId: activity.id,
      title: activity.title,
      htmlPath,
      artworkUrl,
      acceptanceScript: activity.acceptanceScript,
      creatorPrompt: activity.creatorPrompt,
      promptHash: expectedPromptHash,
      plannerModel,
      creatorModel: model,
    });
  }
  return { artifacts, backgroundUrl, questArtworkUrl, bossArtworkUrl };
}

export async function repairDirectArtifactsOnce(input: {
  plan: DirectLearningExperiencePlan;
  artifacts: DirectArtifact[];
  failures: string[];
  client?: Anthropic;
  model?: string;
}): Promise<number> {
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = input.model ?? process.env.SUNNY_GENERATION_MODEL ?? "claude-sonnet-5";
  let repaired = 0;
  for (const artifact of input.artifacts) {
    const failures = input.failures.filter((failure) => failure.startsWith(`${artifact.nodeId}:`));
    if (failures.length === 0) continue;
    const activity = input.plan.activities.find((candidate) => candidate.id === artifact.nodeId);
    if (!activity) continue;
    const html = fs.readFileSync(artifact.htmlPath, "utf8");
    const toolName = "repair_activity_with_exact_edits";
    const response = await client.messages.create({
      model,
      max_tokens: 6000,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: buildDirectActivityRepairPrompt({ activity, html, failures }) }],
      tools: [{
        name: toolName,
        description: "Return minimal exact text replacements for the existing activity artifact.",
        input_schema: {
          type: "object",
          properties: {
            edits: {
              type: "array",
              minItems: 1,
              maxItems: 12,
              items: {
                type: "object",
                properties: { oldText: { type: "string" }, newText: { type: "string" } },
                required: ["oldText", "newText"],
                additionalProperties: false,
              },
            },
          },
          required: ["edits"],
          additionalProperties: false,
        },
      }],
      tool_choice: { type: "tool", name: toolName },
    }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
    const tool = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
    if (!tool || tool.type !== "tool_use") throw new Error(`direct_activity_repair_edits_missing:${artifact.nodeId}`);
    const edits = normalizeDirectArtifactEdits(tool.input);
    const repairedHtml = applyDirectArtifactEdits(html, edits);
    fs.writeFileSync(artifact.htmlPath, repairedHtml, "utf8");
    repaired += 1;
  }
  return repaired;
}

export async function runDirectAcceptanceRepairLoop(input: {
  runAcceptance: () => Promise<DirectPlaywrightReport>;
  repair: (failures: string[]) => Promise<number>;
  maxRepairs?: number;
}): Promise<DirectPlaywrightReport> {
  const maxRepairs = Math.max(0, Math.min(10, input.maxRepairs ?? 5));
  let report = await input.runAcceptance();
  for (let attempt = 1; !report.passed && attempt <= maxRepairs; attempt += 1) {
    console.log(`[4/4] Creator surgical repair ${attempt}/${maxRepairs}`);
    await input.repair(report.failures);
    report = await input.runAcceptance();
  }
  return report;
}

function contentType(file: string): string {
  if (/\.html$/i.test(file)) return "text/html; charset=utf-8";
  if (/\.jpe?g$/i.test(file)) return "image/jpeg";
  if (/\.png$/i.test(file)) return "image/png";
  return "application/octet-stream";
}

export async function runDirectPlaywrightAcceptance(input: {
  artifacts: DirectArtifact[];
  outputDir: string;
  rootDir?: string;
}): Promise<DirectPlaywrightReport> {
  const rootDir = input.rootDir ?? process.cwd();
  const publicDir = path.join(rootDir, "web", "public");
  const byNodeId = new Map(input.artifacts.map((artifact) => [artifact.nodeId, artifact]));
  const byLaunchPath = new Map(input.artifacts.map((artifact) => [
    `/api/homework/game/${artifact.childId}/${artifact.homeworkId}/${encodeURIComponent(path.basename(artifact.htmlPath))}`,
    artifact,
  ]));
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/activities/")) {
      const artifact = byNodeId.get(decodeURIComponent(url.pathname.slice("/activities/".length)));
      if (artifact) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(fs.readFileSync(artifact.htmlPath));
        return;
      }
    }
    const launchArtifact = byLaunchPath.get(url.pathname);
    if (launchArtifact) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(fs.readFileSync(launchArtifact.htmlPath));
      return;
    }
    const publicFile = path.join(publicDir, url.pathname.replace(/^\//, ""));
    if (publicFile.startsWith(publicDir) && fs.existsSync(publicFile)) {
      response.writeHead(200, { "content-type": contentType(publicFile) });
      response.end(fs.readFileSync(publicFile));
      return;
    }
    response.writeHead(404); response.end("not found");
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("direct_playwright_server_failed");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const failures: string[] = [];
  const screenshots: string[] = [];
  fs.mkdirSync(input.outputDir, { recursive: true });
  try {
    for (const artifact of input.artifacts) {
      const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.addInitScript(`window.__sunnyMessages=[];window.addEventListener("message",event=>window.__sunnyMessages.push(event.data));`);
      const launchPath = NODE_REGISTRY["generated-baseline"]?.getUrl?.({
        id: artifact.nodeId,
        type: "generated-baseline",
        gameHtmlPath: artifact.htmlPath,
        date: artifact.homeworkId,
        words: [],
        difficulty: 2,
      }, { childId: artifact.childId, companion: "elli", previewParam: "" });
      if (!launchPath) {
        failures.push(`${artifact.nodeId}:launch_url_missing`);
        await page.close();
        continue;
      }
      const navigation = await page.goto(`http://127.0.0.1:${address.port}${launchPath}`, { waitUntil: "load" });
      if (navigation?.status() !== 200 || !navigation.headers()["content-type"]?.includes("text/html")) {
        failures.push(`${artifact.nodeId}:real_launch_not_html`);
      }
      if (!(await page.getByText(artifact.title, { exact: false }).first().isVisible().catch(() => false))) failures.push(`${artifact.nodeId}:title_not_visible`);
      const artworkLoaded = await page.evaluate(
        (artworkUrl) => performance.getEntriesByType("resource").some((entry) => entry.name.includes(artworkUrl)),
        artifact.artworkUrl,
      );
      if (!artworkLoaded) failures.push(`${artifact.nodeId}:artwork_not_rendered`);
      let acceptanceError = "";
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<{ passed?: boolean }>;
      const result = await new AsyncFunction("page", "BASE_URL", acceptanceScriptBody(artifact.acceptanceScript))(page, `http://127.0.0.1:${address.port}`)
        .catch((error: Error) => { acceptanceError = error.message; return { passed: false }; });
      if (!result?.passed) failures.push(`${artifact.nodeId}:acceptance_run_failed${acceptanceError ? `:${acceptanceError}` : ""}`);
      const messages = await page.evaluate<Array<{ type?: string }>>(`window.__sunnyMessages||[]`);
      if (!messages.some((message) => message?.type === "attempt_event")) failures.push(`${artifact.nodeId}:attempt_evidence_missing`);
      if (!messages.some((message) => message?.type === "node_complete")) failures.push(`${artifact.nodeId}:completion_evidence_missing`);
      pageErrors.forEach((error) => failures.push(`${artifact.nodeId}:browser_error:${error}`));
      const screenshot = path.join(input.outputDir, `${artifact.nodeId}-complete.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      screenshots.push(screenshot);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return { passed: failures.length === 0, failures, screenshots };
}

export function buildDirectActiveSessionPlan(input: {
  childId: string;
  homeworkId: string;
  plan: DirectLearningExperiencePlan;
  artifacts: DirectArtifact[];
  backgroundUrl: string;
  questArtworkUrl: string;
  bossArtworkUrl: string;
  report: DirectPlaywrightReport;
  createdAt?: string;
}): ActiveSessionPlan {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const artifactById = new Map(input.artifacts.map((artifact) => [artifact.nodeId, artifact]));
  const nodePlan: ActiveSessionPlan["nodePlan"] = input.plan.activities.map((activity) => {
    const artifact = artifactById.get(activity.id)!;
    return {
      id: activity.id, type: "generated-baseline", activityId: "generated-baseline", targets: activity.questions.map((q) => q.id), difficulty: 2,
      source: "chart_planner", targetLane: activity.academicTarget, locked: false, masteryUnlockState: "unlocked", title: activity.title,
      gameHtmlPath: artifact.htmlPath, date: input.homeworkId, thumbnailUrl: artifact.artworkUrl, contentId: `${input.homeworkId}:${activity.id}`, mechanic: activity.mechanic,
      engagementDimensions: [activity.engagementVariable as never], engagementHypothesis: input.plan.fork.hypothesis,
      validationProof: { engine: "playwright", passed: true, worldStateChanged: true, screenshotPaths: input.report.screenshots.filter((file) => file.includes(activity.id)) },
    };
  });
  nodePlan.push(
    { id: "quest", type: "quest", activityId: "quest", targets: [], difficulty: 2, source: "chart_planner", locked: true, masteryUnlockState: "preparing", title: "Quest", thumbnailUrl: input.questArtworkUrl },
    { id: "boss", type: "boss", activityId: "boss", targets: [], difficulty: 3, source: "chart_planner", locked: true, masteryUnlockState: "preparing", title: "Boss", thumbnailUrl: input.bossArtworkUrl },
  );
  const nodes: AdventureBoardJson["nodes"] = [
    { id: "start", kind: "start", label: "Start", state: "completed", position: boardPosition(8, 78) },
    { id: "choose-path", kind: "choice-gate", label: input.plan.fork.question, state: "current", position: boardPosition(20, 58), action: { type: "open-choice-set", payloadId: "direct-route-choice" }, choiceSetId: "direct-route-choice" },
  ];
  input.plan.fork.routes.forEach((route, routeIndex) => route.nodeIds.forEach((nodeId, index) => {
    const activity = input.plan.activities.find((item) => item.id === nodeId)!;
    const artifact = artifactById.get(nodeId)!;
    nodes.push({ id: nodeId, kind: "activity", activityId: "generated-baseline", label: activity.title, state: "available", position: boardPosition(37 + index * 12, routeIndex === 0 ? 32 : 72), action: { type: "launch-activity", payloadId: nodeId }, thumbnailUrl: artifact.artworkUrl, mechanic: activity.mechanic, engagementDimensions: [activity.engagementVariable], engagementHypothesis: input.plan.fork.hypothesis, contentId: `${input.homeworkId}:${nodeId}` });
  }));
  nodes.push(
    { id: "quest", kind: "quest", label: "Quest", state: "locked", position: boardPosition(68, 48), thumbnailUrl: input.questArtworkUrl, lock: { reason: "Complete your adventure routes to reveal the Quest.", label: "Locked" }, action: { type: "show-locked-reason", payloadId: "quest" } },
    { id: "boss", kind: "boss", label: "Boss", state: "locked", position: boardPosition(91, 28), thumbnailUrl: input.bossArtworkUrl, lock: { reason: "Complete the Quest before facing the Boss.", label: "Locked" }, action: { type: "show-locked-reason", payloadId: "boss" } },
  );
  const edges: AdventureBoardJson["edges"] = [{ id: "start-choice", from: "start", to: "choose-path", state: "available" }];
  for (const route of input.plan.fork.routes) {
    let previous = "choose-path";
    for (const nodeId of route.nodeIds) { edges.push({ id: `${previous}-${nodeId}`, from: previous, to: nodeId, state: "available" }); previous = nodeId; }
    edges.push({ id: `${previous}-quest`, from: previous, to: "quest", state: "locked" });
  }
  edges.push({ id: "quest-boss", from: "quest", to: "boss", state: "locked" });
  const adventureBoard: AdventureBoardJson = {
    schemaVersion: 1, boardId: `direct:${input.homeworkId}`, planId: input.plan.planId, childId: input.childId, domain: "math", title: input.plan.boardWorld.title,
    theme: { background: { type: "image", value: input.backgroundUrl }, palette: { path: "#fff4c2", completed: "#34d399", available: "#7c3aed", locked: "#64748b", current: "#f59e0b", preview: "#94a3b8", text: "#ffffff", panel: "rgba(15,23,42,.82)" } },
    layout: { preset: "horizontal-adventure-spine", companionSlot: "right", routeChoiceBehavior: "parallel" },
    plannerRationale: { agencyDesign: input.plan.fork.hypothesis, evidenceDesign: input.plan.fork.heldConstant.join("; "), layoutChoice: "Two visible choose-your-adventure routes converge on a locked Quest." },
    nodes, edges,
    choiceSets: [{ id: "direct-route-choice", kind: "baseline-route", title: input.plan.fork.question, options: input.plan.fork.routes.map((route) => ({ id: route.id, label: route.label, description: route.promise, state: "available", nodeId: route.nodeIds[0], engagementDimensions: [route.engagementVariable], choiceSignal: { algorithmFeed: "choicePolicy", traits: [route.engagementVariable], expectedEvidence: "selection, start, completion, abandonment, replay", preferenceNotMastery: true } })) }],
    companion: { id: "elli", name: "Elli" }, progress: { currentNodeId: "choose-path", completedNodeIds: ["start"], activeChoiceSetId: "direct-route-choice" },
  };
  return {
    planId: input.plan.planId, childId: input.childId, createdAt, source: "ingest_human_loop", activeHomeworkId: input.homeworkId, domain: "math", testDate: null,
    nodePlan, learningRoutes: input.plan.fork.routes.map((route) => ({ id: route.id, label: route.label, rationale: route.promise, nodeIds: [...route.nodeIds, "quest", "boss"] })), adventureBoard,
    variationPolicy: { avoidExactPreviousNodeOrder: true, avoidExactPreviousWordOrder: true, seed: input.homeworkId, previousCompletedNodeCount: 0 },
    companionPolicy: { companionId: "elli", displayName: "Elli", openingLinePolicy: "context_start_short", verbosity: "low", maxMicroProbes: 1 },
    evidenceUsed: input.plan.profileEvidence.map((summary, index) => ({ id: `planner-evidence-${index + 1}`, type: "child_chart", summary })), openQuestions: [], approvalStatus: "approved",
    planTheory: { hypothesis: input.plan.academicTheory, evidenceSummary: input.plan.profileEvidence, intervention: input.plan.boardWorld.narrative, supportCriteria: ["Real child evidence supports transfer."], reviseCriteria: ["Real child evidence is mixed."], falsifyCriteria: ["Real child evidence contradicts the theory."] },
  };
}

export function persistDirectExperience(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  extraction: AssignmentSourceExtraction;
  plannerPlan: DirectLearningExperiencePlan;
  activeSessionPlan: ActiveSessionPlan;
  artifacts: DirectArtifact[];
  report: DirectPlaywrightReport;
}): string {
  const rootDir = input.rootDir ?? process.cwd();
  const contextDir = path.join(rootDir, "src", "context", input.childId);
  const directPath = path.join(contextDir, "homework", "direct_experience_plan.json");
  const now = new Date().toISOString();
  let priorFeedback: { feedbackObservations?: unknown[]; feedbackDecisions?: unknown[] } = {};
  try {
    priorFeedback = JSON.parse(fs.readFileSync(directPath, "utf8")) as typeof priorFeedback;
  } catch {
    priorFeedback = {};
  }
  const record = {
    version: 2,
    childId: input.childId,
    homeworkId: input.homeworkId,
    generatedAt: now,
    assignment: input.extraction,
    plannerPlan: input.plannerPlan,
    activeSessionPlan: input.activeSessionPlan,
    artifacts: input.artifacts,
    playwrightReport: input.report,
    feedbackObservations: priorFeedback.feedbackObservations ?? [],
    feedbackDecisions: priorFeedback.feedbackDecisions ?? [],
  };
  fs.mkdirSync(path.dirname(directPath), { recursive: true });
  fs.writeFileSync(directPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  const planFile = { version: 1, childId: input.childId, selectedDomain: "math", current: input.activeSessionPlan, activeByDomain: { math: input.activeSessionPlan }, updatedAt: now };
  fs.mkdirSync(path.join(contextDir, "plans"), { recursive: true });
  fs.writeFileSync(path.join(contextDir, "plans", "active_session_plan.json"), `${JSON.stringify(planFile, null, 2)}\n`, "utf8");
  const pending = { weekOf: now.slice(0, 10), testDate: null, returnTag: `#sunny_${input.childId}_${input.homeworkId}`, wordList: [], contentProfile: { practiceDomain: "math", topic: input.plannerPlan.title }, capturedContent: { title: input.plannerPlan.title, rawText: input.extraction.fullText }, homeworkId: input.homeworkId, generatedAt: now, nodes: input.activeSessionPlan.nodePlan };
  const homeworkFile = { version: 1, childId: input.childId, selectedDomain: "math", current: pending, activeByDomain: { math: pending }, updatedAt: now };
  fs.writeFileSync(path.join(contextDir, "homework", "current.json"), `${JSON.stringify(homeworkFile, null, 2)}\n`, "utf8");
  const profilePath = path.join(contextDir, "learning_profile.json");
  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  profile.pendingHomework = pending;
  profile.activeSessionPlan = input.activeSessionPlan;
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return directPath;
}
