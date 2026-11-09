import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import vm from "vm";
import { thumbnailUrlForActivity } from "../shared/activityPresentation";
import { getChildChart } from "../profiles/childChart";
import { resolveChildContextDir } from "../utils/contextRoot";
import { runMathProviderStage } from "./adaptiveMathDiscovery";
import { engagementTheoryEvidenceContext } from "./engagementTheory";
import { requestForModel } from "./plannerTransport";
import { captureGame } from "./prebuiltBoard";
import {
  transitionLearningCycle,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
  type LearningCycleRepositoryOptions,
} from "./learningCycleRepository";

/**
 * Builds the spelling game Sunny makes for one child, from her chart and the Planner's story for the stop.
 * It is the spelling sandbox's builder (PR #51), which won the 2026-11-03 dinner test, moved into Sunny:
 * one ask, the checks code can see, one repair round. Code owns the measurement: it loads Sunny's game
 * contract, keeps the game off the internet, and requires every word to open through `openSpellingItem`
 * so each answer binds to her frozen item. Everything else about the game is the model's.
 */
export type SpellingGameClient = { messages: { stream: (request: Anthropic.Messages.MessageStreamParams) => { finalMessage: () => Promise<Anthropic.Messages.Message> } } };

/** The Quest/Boss/generated-game builder model; swap it with SUNNY_SPELLING_GAME_MODEL (see AGENTS.md). */
export const spellingGameModel = () => process.env.SUNNY_SPELLING_GAME_MODEL?.trim() || "claude-sonnet-5-5";
const MAX_OUTPUT = 128_000;
const CONTRACT_TAG = '<script src="/games/_contract.js"></script>';
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'">`;

/** What her chart says about her, and how she has played this homework's games so far. */
function childFacts(cycle: LearningCycleRecordV2, rootDir: string) {
  const chart = getChildChart(cycle.childId, { rootDir });
  const played = cycle.nodes.filter(node => node.state === "completed").map(node => {
    const answers = cycle.observations.filter(row => row.sourceId.endsWith(`:${node.nodeId}`));
    return { stop: node.title, game: node.implementationType ?? node.mechanic, answers: answers.length, correct: answers.filter(row => row.result.correct === true).length };
  });
  return { identity: chart.identity, demographics: chart.demographics, childVoice: chart.childVoice, engagementEvidence: engagementTheoryEvidenceContext(chart.engagementTheory), playedThisHomework: played };
}

export function buildSpellingGameAsk(input: { cycle: LearningCycleRecordV2; node: LearningCycleNodeContract; rootDir: string }): string {
  const { node } = input;
  const words = node.academicTarget.targets;
  return `Build one spelling game for a child. It runs inside Sunny, her study helper.

About her, from her chart (what she does counts more than what she says, and what she says clearly more than what she is unsure about):
${JSON.stringify(childFacts(input.cycle, input.rootDir), null, 2)}

Her ${words.length} words for this game: ${words.join(", ")}
This stop on her map, as her tutor wrote it:
- Title: ${node.title}
- Story: ${node.theme}
- What it is for: ${node.openingScreen.purpose}${node.focus ? `\n- What this game is aimed at: ${node.focus}` : ""}

Make it something she will gasp at and want to play again, and that helps her spell these words without help. Invent a world made for her; avoid the first idea anyone would have.

How the game must work:
- One complete, self-contained HTML document: inline CSS and JavaScript only. No external files, no internet, no image URLs; draw with CSS, SVG, canvas or emoji. It fills a frame about 900×650 pixels, with mouse or touch.
- Sunny's game contract is already loaded in the page. window.GAME_PARAMS.words holds her words.
- Before she spells each word, call window.openSpellingItem("<the word>", "<progress, like Lantern 2 of 8>"). Elli then says the word for her.
- While she spells a word, do not show that word on screen; give a clue instead: a picture or emoji, or a sentence with a blank.
- After every spelling attempt, call window.fireAttemptEvent({domain: "spelling", target: "<the word>", attemptedValue: "<what she typed>", correct: true or false}).
- Elli is her companion and speaks for the game. To say anything else aloud, call parent.postMessage({type: "narration_request", text: "<what to say>", reason: "<why>"}, "*"). Do not use speechSynthesis.
- At big moments (a streak, a miss, a win), call window.fireCompanionEvent("<moment>", {word: "<word>"}) so Elli can react.
- She spells each word at least once, by typing or tapping letters. A wrong answer never ends the game.
- When she finishes, call window.sendNodeComplete({completed: true}).

Reply with only the HTML document.`;
}

/** The ask for a math game: her chart, the stop, and how Sunny's contract works; the problems never carry answers. */
export function buildMathGameAsk(input: { cycle: LearningCycleRecordV2; node: LearningCycleNodeContract; rootDir: string }): string {
  const { node } = input;
  const lines = gameItemLines(node);
  const companion = getChildChart(input.cycle.childId, { rootDir: input.rootDir }).companion.displayName || "her companion";
  return `Build one math game for a child. It runs inside Sunny, her study helper.

About her, from her chart (what she does counts more than what she says, and what she says clearly more than what she is unsure about):
${JSON.stringify(childFacts(input.cycle, input.rootDir), null, 2)}

Her ${lines.length} problems for this game (id: problem, how she answers):
${lines.join("\n")}
This stop on her map, as her tutor wrote it:
- Title: ${node.title}
- Story: ${node.theme}
- What it is for: ${node.openingScreen.purpose}${node.focus ? `\n- What this game is aimed at: ${node.focus}` : ""}

Make it something she will gasp at and want to play again, and that helps her solve these problems on her own.

How Sunny's game contract works:
- The game is one self-contained HTML document with inline CSS and JavaScript. The page has no internet, so pictures are CSS, SVG, canvas or emoji. It fills a frame about 900×650 pixels, with mouse or touch.
- Sunny's contract is already loaded. window.GAME_PARAMS.itemBindings lists each problem as {itemId, display}.
- window.openItem("<itemId>", "<progress, like Camp 2 of 6>") opens a problem. Sunny keeps what is on screen at that moment; an answer already showing counts as help.
- window.fireAttemptEvent({target: "<itemId>", attemptedValue: "<her answer: digits, or the option id shown in brackets above, like odd>"}) reports her answer. Sunny keeps her first answer per problem and scores it.
- ${companion} is her companion and speaks for the game: parent.postMessage({type: "narration_request", text: "<what to say>", reason: "<why>"}, "*").
- window.fireCompanionEvent("<moment>", {itemId: "<itemId>"}) lets ${companion} react at big moments.
- window.sendNodeComplete({completed: true}) ends the game.

Reply with only the HTML document.`;
}

/** The HTML document in a model's reply, with or without a code fence. */
export function extractHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced && /<html[\s>]|<!doctype html/i.test(fenced)) return fenced;
  const start = text.search(/<!doctype html|<html[\s>]/i), end = text.toLowerCase().lastIndexOf("</html>");
  return start >= 0 && end > start ? text.slice(start, end + 7) : "";
}

/** Each math problem as the builder sees it: its id, its text and how she answers, never the answer. */
export function gameItemLines(node: LearningCycleNodeContract): string[] {
  return Object.values(node.evidenceContract.itemContracts ?? {}).map(item => {
    const answers = item.response.mode === "selection"
      ? `she picks one: ${item.response.options.map(option => `${option.label} [${option.id}]`).join(", ")}`
      : item.response.mode === "numeric" ? `she gives a number${item.response.unit ? ` in ${item.response.unit}` : ""}` : `she ${item.response.mode === "construction" ? "builds it" : "explains it"}`;
    return `- ${item.id}: ${item.prompt} (${answers})`;
  });
}

/** Problems code can see in a game before she plays it, for any subject. */
export function gameProblems(html: string, domain: string): string[] {
  if (domain === "spelling") return spellingGameProblems(html);
  const problems = spellingGameProblems(html).filter(row => !row.includes("openSpellingItem"));
  return [...(/openItem\s*\(/.test(html) ? [] : ["it never calls window.openItem before a problem, so no answer can count"]), ...problems];
}

/** Problems code can see in a game before she plays it: each would break her measurement or her safety. */
export function spellingGameProblems(html: string): string[] {
  if (!html) return ["no HTML document in the reply"];
  const external = html.match(/(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\/[^"']+|\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|@import\s+url\(\s*["']?https?:/gi) ?? [];
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].flatMap((match, index) => {
    try { new vm.Script(match[1]!); return []; } catch (error) { return [`script ${index + 1} does not parse: ${(error as Error).message}`]; }
  });
  return [
    ...(external.length ? [`it reaches outside the page: ${[...new Set(external)].slice(0, 3).join(" ")}`] : []),
    ...(/openSpellingItem\s*\(/.test(html) ? [] : ["it never calls window.openSpellingItem before a word, so no answer can count"]),
    ...(/fireAttemptEvent\s*\(/.test(html) ? [] : ["it never reports an attempt with window.fireAttemptEvent"]),
    ...(/sendNodeComplete\s*\(/.test(html) ? [] : ["it never says it is done with window.sendNodeComplete"]),
    ...scripts,
  ];
}

/** Code's part of every game: Sunny's contract, and nothing reachable outside the page. */
export function withSunnyContract(html: string): string {
  const head = `${CSP}${CONTRACT_TAG}`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, match => `${match}${head}`) : `${head}${html}`;
}

async function ask(client: SpellingGameClient, draftDir: string, stage: string, messages: Anthropic.Messages.MessageParam[]) {
  const model = spellingGameModel();
  const request = requestForModel({ model, max_tokens: MAX_OUTPUT, output_config: { effort: "high" }, messages } as Anthropic.Messages.MessageStreamParams);
  // A receipt per call: a restart replays what was received and never buys the same game twice.
  const message = await runMathProviderStage({ draftDir, stage, model, request, execute: () => client.messages.stream(request).finalMessage() });
  const text = message.content.flatMap(block => block.type === "text" ? [block.text] : []).join("\n");
  return { text, html: extractHtml(text), inputTokens: message.usage?.input_tokens ?? 0, outputTokens: message.usage?.output_tokens ?? 0, stop: message.stop_reason };
}

/** Builds, checks, repairs once, and binds her game to its node. Throws with the problems when it cannot. */
export async function prepareGeneratedSpellingGame(input: {
  cycle: LearningCycleRecordV2; node: LearningCycleNodeContract; draftDir: string; client?: SpellingGameClient;
}, opts: LearningCycleRepositoryOptions = {}): Promise<LearningCycleRecordV2> {
  const rootDir = opts.rootDir ?? process.cwd();
  const { cycle, node } = input;
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const started = Date.now();
  const prompt = cycle.domain === "spelling" ? buildSpellingGameAsk({ cycle, node, rootDir }) : buildMathGameAsk({ cycle, node, rootDir });
  const first = await ask(client, input.draftDir, "generated-game-1", [{ role: "user", content: prompt }]);
  let game = first, problems = gameProblems(first.html, cycle.domain);
  console.log(` 🎮 [spelling-game] [build] [received] node=${node.nodeId} model=${spellingGameModel()} chars=${first.html.length} problems=${problems.length} stop=${first.stop}`);
  if (problems.length) {
    const feedback = `Sunny checked your game. It has these problems:\n${problems.map(row => `- ${row}`).join("\n")}\n\nFix them and keep everything else. Reply with only the whole fixed HTML document.`;
    game = await ask(client, input.draftDir, "generated-game-2", [{ role: "user", content: prompt }, { role: "assistant", content: first.html || first.text || "(no game)" }, { role: "user", content: feedback }]);
    problems = gameProblems(game.html, cycle.domain);
    console.log(` 🎮 [spelling-game] [repair] [${problems.length ? "still-broken" : "fixed"}] node=${node.nodeId} problems=${problems.length}`);
  }
  if (problems.length) throw new Error(`generated_game_problems:${problems.join(" | ")}`);
  captureGame(node.nodeId, game.html);
  const html = withSunnyContract(game.html);
  const contextDir = resolveChildContextDir(cycle.childId, { rootDir });
  const filename = `${node.nodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}.html`;
  const file = path.join(contextDir, "homework/games", cycle.homeworkId, filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.${process.pid}.tmp`, html); fs.renameSync(`${file}.${process.pid}.tmp`, file);
  const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
  console.log(` 🎮 [spelling-game] [build] [bound] node=${node.nodeId} file=${filename} seconds=${Math.round((Date.now() - started) / 1000)}`);
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, { type: "artifact_bound", nodeId: node.nodeId, artifact: {
    contentId: `${cycle.homeworkId}:${node.nodeId}`, artifactId: `${cycle.homeworkId}:${node.nodeId}:generated`,
    localArtifactPath: `/homework/games/${cycle.homeworkId}/${filename}`,
    localArtworkPath: node.artwork.localPath ?? thumbnailUrlForActivity("generated-game"),
    contractFingerprint: hash({ evidenceContract: node.evidenceContract, html }), validationStatus: "passed",
    creativeProvenance: { rationale: node.openingScreen.purpose, qualityPrediction: node.theme, creatorPromptHash: hash(prompt), artworkPromptHash: hash(node.artwork.prompt ?? ""),
      builderProvider: "anthropic", builderModel: spellingGameModel(), generatedHtmlHash: hash(html), generationElapsedMs: Date.now() - started,
      inputTokens: first.inputTokens + (game === first ? 0 : game.inputTokens), outputTokens: first.outputTokens + (game === first ? 0 : game.outputTokens) },
  } }, opts);
}
