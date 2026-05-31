import Anthropic from "@anthropic-ai/sdk";
import { config as loadDotenv } from "dotenv";
import fs from "fs";
import http from "http";
import path from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";
import type { ActiveSessionPlan, GeneratedExperienceBrief } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import { generateExperienceArtifactFromChart, generateExperienceHtmlWithSonnet } from "../engine/generatedExperienceArtifact";
import { selectQuestBossLabCandidate } from "../engine/questBossLabSelection";
import { renderQuestBossFreeVisionShell, renderQuestBossShell } from "../engine/questBossExperienceShell";
import {
  deriveBossBriefFromQuestEvidence,
  prepareQuestBossCandidates,
  questBossChoiceEventInput,
  selectQuestBossCandidate,
  type QuestBossCandidate,
  type QuestBossExperienceSkin,
  type QuestBossEvidence,
  type QuestBossKind,
} from "../engine/questBossTeamPipeline";

loadDotenv({ override: false });

type Args = {
  childId: string;
  paid: boolean;
  maxCostUsd: number;
  outRoot: string;
  model: string;
  runtime: "trusted-shell" | "ai-html" | "free-vision";
  selectQuest: string | null;
  selectBoss: string | null;
  autoSelectFirst: boolean;
};

type ScreenshotEntry = {
  name: string;
  path: string;
};

const DEFAULT_MODEL = process.env.SUNNY_QUEST_BOSS_MODEL ?? "claude-sonnet-4-20250514";
const DEFAULT_OPENAI_IMAGE_MODEL = process.env.SUNNY_QUEST_BOSS_IMAGE_MODEL ?? "gpt-image-1";
const DEFAULT_OPENAI_IMAGE_QUALITY = process.env.SUNNY_QUEST_BOSS_IMAGE_QUALITY ?? "medium";
const ESTIMATED_CARD_ART_COST_USD = 0.07;
const ESTIMATED_PAID_COST_USD = 3.6;
const TEAM_LAB_OUT_ROOT = path.join(process.cwd(), "web", "test-artifacts", "quest-boss-team-lab");
const FREE_VISION_OUT_ROOT = path.join(process.cwd(), "web", "test-artifacts", "quest-boss-free-vision-lab");
const NORTH_STAR_MOCK_PATH = path.join(
  process.cwd(),
  "web",
  "test-artifacts",
  "visual-concept-workflow",
  "2026-05-29T19-52-07-111Z",
  "quest-selected-preview-full.png",
);
const runtimeAssetRegistry = new Map<string, string>();

function parseArgs(argv: string[]): Args {
  let outRootProvided = false;
  const args: Args = {
    childId: "reina",
    paid: false,
    maxCostUsd: 5,
    outRoot: TEAM_LAB_OUT_ROOT,
    model: DEFAULT_MODEL,
    runtime: "trusted-shell",
    selectQuest: null,
    selectBoss: null,
    autoSelectFirst: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--child" && next) {
      args.childId = next.trim().toLowerCase();
      index += 1;
    } else if (arg === "--paid") {
      args.paid = true;
    } else if (arg === "--max-cost-usd" && next) {
      args.maxCostUsd = Number(next);
      index += 1;
    } else if (arg === "--out" && next) {
      args.outRoot = path.resolve(next);
      outRootProvided = true;
      index += 1;
    } else if (arg === "--model" && next) {
      args.model = next.trim();
      index += 1;
    } else if (arg === "--ai-runtime") {
      args.runtime = "ai-html";
    } else if (arg === "--select-quest" && next) {
      args.selectQuest = next.trim();
      index += 1;
    } else if (arg?.startsWith("--select-quest=")) {
      args.selectQuest = arg.split("=").slice(1).join("=").trim();
    } else if (arg === "--select-boss" && next) {
      args.selectBoss = next.trim();
      index += 1;
    } else if (arg?.startsWith("--select-boss=")) {
      args.selectBoss = arg.split("=").slice(1).join("=").trim();
    } else if (arg === "--auto-select-first") {
      args.autoSelectFirst = true;
    } else if (arg === "--runtime" && next) {
      if (next !== "trusted-shell" && next !== "ai-html" && next !== "free-vision") {
        throw new Error(`Unsupported --runtime value: ${next}`);
      }
      args.runtime = next;
      index += 1;
    } else if (arg?.startsWith("--runtime=")) {
      const runtime = arg.split("=")[1];
      if (runtime !== "trusted-shell" && runtime !== "ai-html" && runtime !== "free-vision") {
        throw new Error(`Unsupported --runtime value: ${runtime}`);
      }
      args.runtime = runtime;
    }
  }
  if (args.runtime === "free-vision" && !outRootProvided) {
    args.outRoot = FREE_VISION_OUT_ROOT;
  }
  return args;
}

function requirePaidReadiness(args: Args): void {
  if (!args.paid) return;
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is required for --paid Quest/Boss lab runs.");
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for --paid Quest/Boss lab card art.");
  }
  if (process.env.OPENAI_API_KEY.includes("your_") || process.env.OPENAI_API_KEY.includes("placeholder")) {
    throw new Error("OPENAI_API_KEY still looks like a placeholder.");
  }
  if (!Number.isFinite(args.maxCostUsd) || args.maxCostUsd <= 0) {
    throw new Error("--max-cost-usd must be a positive number.");
  }
  if (ESTIMATED_PAID_COST_USD > args.maxCostUsd) {
    throw new Error(
      `Estimated paid run cost $${ESTIMATED_PAID_COST_USD.toFixed(2)} exceeds cap $${args.maxCostUsd.toFixed(2)}.`,
    );
  }
  if (!args.autoSelectFirst && (!args.selectQuest || !args.selectBoss)) {
    throw new Error(
      "Paid Quest/Boss lab runs require explicit selection. Pass --select-quest=<1|candidateId> and --select-boss=<1|candidateId>, or pass --auto-select-first to intentionally use the old first-card behavior.",
    );
  }
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "item";
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function selectedCurrent(value: unknown): unknown {
  return value && typeof value === "object" && "current" in value ? value.current : value;
}

function activePlanFile(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId, "plans", "active_session_plan.json");
}

function homeworkFile(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId, "homework", "current.json");
}

function cycleFile(rootDir: string, childId: string, homeworkId: string): string {
  return path.join(rootDir, "src", "context", childId, "homework", "cycles", `${homeworkId}.json`);
}

function copyChildContext(childId: string, labRoot: string): void {
  const source = path.join(process.cwd(), "src", "context", childId);
  const target = path.join(labRoot, "src", "context", childId);
  if (!fs.existsSync(source)) throw new Error(`Missing child context: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function loadLabPlan(rootDir: string, childId: string): ActiveSessionPlan {
  const file = activePlanFile(rootDir, childId);
  const wrapper = readJson<{ current?: ActiveSessionPlan } | ActiveSessionPlan>(file);
  const current = selectedCurrent(wrapper) as ActiveSessionPlan | null;
  if (!current?.nodePlan?.length) throw new Error("Lab copy has no active session plan.");
  return current;
}

function writeLabPlan(rootDir: string, childId: string, plan: ActiveSessionPlan): void {
  const file = activePlanFile(rootDir, childId);
  const wrapper = readJson<Record<string, unknown>>(file);
  const domain = String(plan.domain ?? wrapper.selectedDomain ?? "spelling");
  writeJson(file, {
    ...wrapper,
    current: plan,
    activeByDomain: {
      ...(wrapper.activeByDomain && typeof wrapper.activeByDomain === "object" ? wrapper.activeByDomain : {}),
      [domain]: plan,
    },
    selectedDomain: domain,
    updatedAt: new Date().toISOString(),
  });
}

function loadLabHomework(rootDir: string, childId: string): NonNullable<Record<string, unknown>> {
  const wrapper = readJson<Record<string, unknown>>(homeworkFile(rootDir, childId));
  const current = selectedCurrent(wrapper);
  if (!current || typeof current !== "object") throw new Error("Lab copy has no active homework.");
  return current as Record<string, unknown>;
}

function loadCycle(rootDir: string, childId: string, homeworkId: string): HomeworkCycle {
  return readJson<HomeworkCycle>(cycleFile(rootDir, childId, homeworkId));
}

function writeCycle(rootDir: string, childId: string, cycle: HomeworkCycle): void {
  writeJson(cycleFile(rootDir, childId, cycle.homeworkId), cycle);
}

function assignmentFromCycle(cycle: HomeworkCycle) {
  return {
    domain: cycle.capturedContent?.contentProfile.practiceDomain ?? "spelling",
    title: cycle.capturedContent?.title ?? cycle.homeworkId,
    targetWords: cycle.wordList,
    concepts: cycle.capturedContent?.contentProfile.concepts ?? [],
  };
}

function profileFile(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId, "learning_profile.json");
}

function childSignalsDir(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId, "child_signals");
}

function readOptionalJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return readJson<T>(file);
}

function buildDesignerBriefFromLabContext(rootDir: string, childId: string): {
  likelyHooks: string[];
  avoidOrSoften: string[];
  activityAffinity: string[];
  signalSummary: string[];
} {
  const profile = readOptionalJson<Record<string, unknown>>(profileFile(rootDir, childId)) ?? {};
  const traitModel = profile.activityTraitModel && typeof profile.activityTraitModel === "object"
    ? profile.activityTraitModel as Record<string, { positiveWeight?: number; negativeWeight?: number; samples?: number }>
    : {};
  const activityModel = profile.activityModel && typeof profile.activityModel === "object"
    ? profile.activityModel as Record<string, { positiveWeight?: number; negativeWeight?: number; samples?: number }>
    : {};
  const likelyHooks = Object.entries(traitModel)
    .filter(([, value]) => Number(value.positiveWeight ?? 0) >= Number(value.negativeWeight ?? 0))
    .sort((a, b) => Number(b[1].positiveWeight ?? 0) - Number(a[1].positiveWeight ?? 0))
    .slice(0, 6)
    .map(([trait]) => trait);
  const avoidOrSoften = Object.entries(traitModel)
    .filter(([, value]) => Number(value.negativeWeight ?? 0) > Number(value.positiveWeight ?? 0))
    .sort((a, b) => Number(b[1].negativeWeight ?? 0) - Number(a[1].negativeWeight ?? 0))
    .slice(0, 5)
    .map(([trait]) => trait);
  const activityAffinity = Object.entries(activityModel)
    .sort((a, b) => Number(b[1].positiveWeight ?? 0) - Number(a[1].positiveWeight ?? 0))
    .slice(0, 5)
    .map(([activity]) => activity);
  const signalsPath = childSignalsDir(rootDir, childId);
  const signalSummary: string[] = [];
  if (fs.existsSync(signalsPath)) {
    for (const file of fs.readdirSync(signalsPath).filter((name) => name.endsWith(".ndjson")).sort().slice(-3)) {
      const lines = fs.readFileSync(path.join(signalsPath, file), "utf8").split("\n").filter(Boolean).slice(-6);
      signalSummary.push(...lines.map((line) => {
        try {
          const parsed = JSON.parse(line) as { eventName?: string; activityId?: string; signalType?: string; dimension?: string };
          return [parsed.eventName, parsed.activityId, parsed.signalType, parsed.dimension].filter(Boolean).join(":");
        } catch {
          return line.slice(0, 120);
        }
      }));
    }
  }
  return {
    likelyHooks: likelyHooks.length ? likelyHooks : ["mystery", "novelty", "control"],
    avoidOrSoften,
    activityAffinity,
    signalSummary,
  };
}

function skinForCandidate(input: {
  kind: QuestBossKind;
  title: string;
  wrapperTraits: string[];
  theme: string;
  focalObject: string;
  mechanicMetaphor: string;
  visualIntensity?: QuestBossExperienceSkin["visualIntensity"];
}): QuestBossExperienceSkin {
  const boss = input.kind === "boss";
  const wrapperTraits = unique(input.wrapperTraits);
  const fallbackTraits = boss ? ["mastery", "transfer", "finale"] : ["mystery", "control", "novelty"];
  const traits = wrapperTraits.length ? wrapperTraits : fallbackTraits;
  const high = input.visualIntensity ?? (traits.some((trait) => /competition|arena|streak|rare|surprise/i.test(trait)) ? "high" : "balanced");
  return {
    theme: input.theme,
    visualIntensity: high,
    palette: boss
      ? { background: "#08111f", surface: "#12152b", accent: "#a78bfa", glow: "#fde68a", text: "#fff7e1" }
      : { background: "#071b24", surface: "#102238", accent: "#2eecc4", glow: "#ffe46b", text: "#fff7e1" },
    focalObject: input.focalObject,
    mechanicMetaphor: input.mechanicMetaphor,
    companionLines: boss
      ? ["This is the final gate. The world only opens from what you remember."]
      : ["This world is waiting for your spelling signal."],
    rewardMoment: boss ? "The finale opens because the evidence transferred." : "The adventure reacts and reveals the next reward.",
    wrapperTraits: traits,
  };
}

function normalizeSkin(input: {
  kind: QuestBossKind;
  candidate: Partial<QuestBossCandidate>;
  fallbackTitle: string;
  fallbackTraits: string[];
}): QuestBossExperienceSkin {
  const raw = input.candidate.experienceSkin as Partial<QuestBossExperienceSkin> | undefined;
  const rawPalette: Partial<QuestBossExperienceSkin["palette"]> =
    raw?.palette && typeof raw.palette === "object" && !Array.isArray(raw.palette)
      ? raw.palette
      : {};
  const rawIntensity = raw?.visualIntensity;
  const visualIntensity = rawIntensity === "subtle" || rawIntensity === "balanced" || rawIntensity === "high"
    ? rawIntensity
    : undefined;
  const traits = unique([
    ...(Array.isArray(raw?.wrapperTraits) ? raw.wrapperTraits.map(String) : []),
    ...input.fallbackTraits,
  ]);
  const base = skinForCandidate({
    kind: input.kind,
    title: input.fallbackTitle,
    wrapperTraits: traits,
    theme: String(raw?.theme ?? input.fallbackTitle),
    focalObject: String(raw?.focalObject ?? (input.kind === "boss" ? "final mastery gate" : "locked adventure object")),
    mechanicMetaphor: String(raw?.mechanicMetaphor ?? "Use the hidden answer to change the world."),
    visualIntensity,
  });
  return {
    theme: String(raw?.theme ?? base.theme),
    visualIntensity: visualIntensity ?? base.visualIntensity,
    worldImagePath: raw?.worldImagePath,
    cardImagePath: raw?.cardImagePath,
    palette: {
      background: String(rawPalette.background ?? base.palette.background),
      surface: String(rawPalette.surface ?? base.palette.surface),
      accent: String(rawPalette.accent ?? base.palette.accent),
      glow: String(rawPalette.glow ?? base.palette.glow),
      text: String(rawPalette.text ?? base.palette.text),
    },
    focalObject: String(raw?.focalObject ?? base.focalObject),
    mechanicMetaphor: String(raw?.mechanicMetaphor ?? base.mechanicMetaphor),
    companionLines: Array.isArray(raw?.companionLines) && raw.companionLines.length
      ? raw.companionLines.map(String)
      : base.companionLines,
    rewardMoment: String(raw?.rewardMoment ?? base.rewardMoment),
    wrapperTraits: traits.length ? traits : base.wrapperTraits,
  };
}

function fileToDataUrl(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

function runtimeAssetUrl(file: string): string {
  const token = `asset-${runtimeAssetRegistry.size + 1}-${slug(path.basename(file, path.extname(file)))}`;
  runtimeAssetRegistry.set(token, file);
  return `/generated-asset/${token}`;
}

function fixtureCandidates(kind: QuestBossKind, assignment: ReturnType<typeof assignmentFromCycle>, questEvidence?: QuestBossEvidence): QuestBossCandidate[] {
  const weakWords = questEvidence
    ? questEvidence.targetResults.filter((result) => !result.correct || result.recovered || result.attempts > 1).map((result) => result.target)
    : assignment.targetWords.slice(0, 6);
  const secureWords = questEvidence
    ? questEvidence.targetResults.filter((result) => result.correct && !result.recovered).map((result) => result.target)
    : assignment.targetWords.slice(6, 10);
  const role = kind === "boss" ? "mastery_gate" : "intervention";
  return [
    {
      candidateId: `${kind}-secret-vault`,
      kind,
      status: "validated_available",
      title: kind === "boss" ? "Final Vault Trial" : "Secret Spelling Vault",
      purpose: kind === "boss" ? "Transfer finale" : "Mystery recall",
      description:
        kind === "boss"
          ? "Open the final gate by spelling the weak and secure targets cold."
          : "Unlock rare vault keys by spelling hidden clues from memory.",
      wrapperTraits: ["mystery", "control", "rare reward"],
      targetWords: [...new Set([...weakWords, ...secureWords])].slice(0, 8),
      evidenceRole: role,
      experienceSkin: skinForCandidate({
        kind,
        title: kind === "boss" ? "Final Vault Trial" : "Secret Spelling Vault",
        wrapperTraits: ["mystery", "control", "rare reward"],
        theme: kind === "boss" ? "final crystal vault trial" : "secret spelling vault",
        focalObject: kind === "boss" ? "final vault core" : "locked crystal vault",
        mechanicMetaphor:
          kind === "boss"
            ? "Spell from memory to open the final gate and prove the quest skill transfers."
            : "Spell the hidden word to charge the vault core and reveal the next chamber.",
      }),
      validationSummary: "fixture_validated",
    },
    {
      candidateId: `${kind}-championship-arena`,
      kind,
      status: "validated_available",
      title: kind === "boss" ? "Champion Transfer Arena" : "Championship Arena",
      purpose: "Competitive recall",
      description:
        kind === "boss"
          ? "Beat the final scoreboard with no visible answer support."
          : "Charge the next gate by spelling each comparative clue correctly.",
      wrapperTraits: ["competition", "progress", "streak"],
      targetWords: [...new Set([...weakWords, ...secureWords])].slice(0, 8),
      evidenceRole: role,
      experienceSkin: skinForCandidate({
        kind,
        title: kind === "boss" ? "Champion Transfer Arena" : "Championship Arena",
        wrapperTraits: ["competition", "progress", "streak"],
        theme: kind === "boss" ? "champion transfer arena" : "championship spelling arena",
        focalObject: kind === "boss" ? "final arena gate" : "charged scoreboard gate",
        mechanicMetaphor:
          kind === "boss"
            ? "Each hidden answer powers the final arena gate without any visible word support."
            : "Spell each hidden answer to light the scoreboard and unlock the next round.",
      }),
      validationSummary: "fixture_validated",
    },
    {
      candidateId: `${kind}-crystal-lab`,
      kind,
      status: "validated_available",
      title: kind === "boss" ? "Crystal Mastery Lab" : "Crystal Recall Lab",
      purpose: "Tactile puzzle",
      description:
        kind === "boss"
          ? "Stabilize each crystal by proving the spelling transfers without hints."
          : "Tune glowing crystals by typing each hidden spelling target.",
      wrapperTraits: ["visual", "tactile", "surprise"],
      targetWords: [...new Set([...weakWords, ...secureWords])].slice(0, 8),
      evidenceRole: role,
      experienceSkin: skinForCandidate({
        kind,
        title: kind === "boss" ? "Crystal Mastery Lab" : "Crystal Recall Lab",
        wrapperTraits: ["visual", "tactile", "surprise"],
        theme: kind === "boss" ? "crystal mastery lab" : "crystal recall lab",
        focalObject: kind === "boss" ? "mastery crystal engine" : "glowing crystal engine",
        mechanicMetaphor:
          kind === "boss"
            ? "Stabilize the crystal engine by recalling each word cold after the Quest."
            : "Type the hidden word to tune each crystal and repair the lab machine.",
      }),
      validationSummary: "fixture_validated",
    },
  ];
}

function stripJsonFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function scrubChildName(value: string, childId: string): string {
  const escaped = childId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value
    .replace(new RegExp(`\\b${escaped}'s\\b`, "gi"), "your")
    .replace(new RegExp(`\\b${escaped}\\b`, "gi"), "you");
}

function sanitizeCandidateId(value: string, childId: string, fallback: string): string {
  const scrubbed = scrubChildName(value, childId)
    .toLowerCase()
    .replace(/\byou\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return scrubbed || fallback;
}

function scrubExperienceSkinForChild(
  skin: QuestBossExperienceSkin,
  childId: string,
): QuestBossExperienceSkin {
  return {
    ...skin,
    theme: scrubChildName(skin.theme, childId),
    focalObject: scrubChildName(skin.focalObject, childId),
    mechanicMetaphor: scrubChildName(skin.mechanicMetaphor, childId),
    companionLines: skin.companionLines.map((line) => scrubChildName(line, childId)),
    rewardMoment: scrubChildName(skin.rewardMoment, childId),
  };
}

async function anthropicCandidates(input: {
  model: string;
  childId: string;
  kind: QuestBossKind;
  assignment: ReturnType<typeof assignmentFromCycle>;
  baselineEvidence: unknown[];
  designerBrief: ReturnType<typeof buildDesignerBriefFromLabContext>;
  questEvidence?: QuestBossEvidence;
}): Promise<{ candidates: QuestBossCandidate[]; usage?: unknown; latencyMs: number }> {
  const started = Date.now();
  const client = new Anthropic();
  const message = await client.messages.create({
    model: input.model,
    max_tokens: 2400,
    messages: [{
      role: "user",
      content: `You are Sunny's educational game designer. Create exactly 3 ${input.kind} experience directions as JSON only.
Context:
${JSON.stringify(input, null, 2)}

Rules:
- Return {"candidates":[...]} only.
- Each candidate needs candidateId, title, purpose, description, wrapperTraits, targetWords, and experienceSkin.
- experienceSkin must include theme, visualIntensity ("subtle"|"balanced"|"high"), palette, focalObject, mechanicMetaphor, companionLines, rewardMoment, wrapperTraits.
- Do not reveal answer words in child-facing title/description.
- Quest is an intervention; Boss is a mastery/transfer gate that uses Quest evidence.
- No Spark Orb.
- The selected card becomes the playable world. Do not make a pretty card that turns into a plain quiz.
- The academic skill should be the world mechanic: spelling unlocks/charges/repairs the world object; reading reveals/routes; math powers/builds/solves; science stabilizes/tests.
- Use the designer brief to choose intensity. Wow can mean magical, competitive, cozy, tactical, funny, or calm depending on the child.
- Write title/description as a kid-facing adventure pitch, not an instructional objective.
- Keep clinical language inside purpose only; it is for audit, not for the child.
- Use cinematic world language: vaults, engines, maps, machines, portals, labs, arenas, cozy rooms, or tactical spaces as appropriate.
- Do not use phrases like "master comparative suffixes", "assessment", "intervention", "mastery gate", "spelling accuracy determines", or "target words" in title/description/mechanicMetaphor/companionLines.
- Use vivid game worlds, not worksheets, flashcards, or clinical labels.`,
    }],
  });
  const text = message.content
    .filter((part): part is Anthropic.TextBlock => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  const parsed = JSON.parse(stripJsonFence(text)) as { candidates?: Array<Partial<QuestBossCandidate>> };
  const evidenceRole: QuestBossCandidate["evidenceRole"] = input.kind === "boss" ? "mastery_gate" : "intervention";
  const candidates: QuestBossCandidate[] = (parsed.candidates ?? []).map((candidate, index) => ({
    candidateId: sanitizeCandidateId(
      String(candidate.candidateId ?? `${input.kind}-candidate-${index + 1}`),
      input.childId,
      `${input.kind}-candidate-${index + 1}`,
    ),
    kind: input.kind,
    status: "validated_available" as const,
    title: scrubChildName(String(candidate.title ?? `${input.kind} candidate ${index + 1}`), input.childId),
    purpose: scrubChildName(String(candidate.purpose ?? (input.kind === "boss" ? "Mastery gate" : "Quest intervention")), input.childId),
    description: scrubChildName(String(candidate.description ?? "Generated Sunny adventure."), input.childId),
    wrapperTraits: Array.isArray(candidate.wrapperTraits) ? candidate.wrapperTraits.map(String) : [],
    targetWords: Array.isArray(candidate.targetWords) ? candidate.targetWords.map(String) : input.assignment.targetWords.slice(0, 8),
    evidenceRole,
    experienceSkin: scrubExperienceSkinForChild(
      normalizeSkin({
        kind: input.kind,
        candidate,
        fallbackTitle: String(candidate.title ?? `${input.kind} candidate ${index + 1}`),
        fallbackTraits: Array.isArray(candidate.wrapperTraits) ? candidate.wrapperTraits.map(String) : [],
      }),
      input.childId,
    ),
    validationSummary: "anthropic_card_json_valid",
  }));
  return {
    candidates,
    usage: message.usage,
    latencyMs: Date.now() - started,
  };
}

type OpenAiImageGenerationResult = {
  candidateId: string;
  provider: "openai";
  model: string;
  promptPath: string;
  imagePath: string;
  latencyMs: number;
  usage?: unknown;
};

function writeFixtureVisionPlaceholder(input: {
  outDir: string;
  kind: QuestBossKind;
  candidate: QuestBossCandidate;
}): string {
  const dir = path.join(input.outDir, "fixture-free-vision");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${input.kind}-${slug(input.candidate.candidateId)}.svg`);
  const boss = input.kind === "boss";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="864" viewBox="0 0 1536 864">
  <defs>
    <radialGradient id="g" cx="52%" cy="45%" r="64%">
      <stop offset="0" stop-color="${boss ? "#fde68a" : "#f0f9ff"}"/>
      <stop offset=".28" stop-color="${boss ? "#8b5cf6" : "#22d3ee"}"/>
      <stop offset=".64" stop-color="${boss ? "#111827" : "#0f172a"}"/>
      <stop offset="1" stop-color="#020617"/>
    </radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="1536" height="864" fill="url(#g)"/>
  <circle cx="768" cy="404" r="156" fill="${boss ? "#f59e0b" : "#14b8a6"}" opacity=".9"/>
  <circle cx="768" cy="404" r="238" fill="none" stroke="${boss ? "#fde68a" : "#67e8f9"}" stroke-width="18" opacity=".72"/>
  <circle cx="768" cy="404" r="326" fill="none" stroke="#ffffff" stroke-width="4" opacity=".18"/>
  <path d="M210 740 C420 620 520 696 720 610 C940 515 1090 650 1326 540" fill="none" stroke="${boss ? "#fde68a" : "#5eead4"}" stroke-width="16" opacity=".55"/>
  <g filter="url(#soft)" opacity=".9">
    <circle cx="300" cy="190" r="44" fill="#a78bfa"/>
    <circle cx="1210" cy="210" r="58" fill="#22d3ee"/>
    <circle cx="1110" cy="670" r="42" fill="#facc15"/>
  </g>
</svg>`;
  fs.writeFileSync(file, svg, "utf8");
  return file;
}

async function generateOpenAiCardArt(input: {
  outDir: string;
  kind: QuestBossKind;
  childId: string;
  assignment: ReturnType<typeof assignmentFromCycle>;
  candidate: QuestBossCandidate;
  runtime: Args["runtime"];
  questEvidence?: QuestBossEvidence;
}): Promise<OpenAiImageGenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for OpenAI card art.");
  const skin = input.candidate.experienceSkin;
  const freeVisionDirection = input.runtime === "free-vision"
    ? `You are a designer pitching a custom experience to one child, not a generic illustrator making a pretty reward image. This image is a premium playable game-screen mock and the experience artifact, not a thumbnail. Create one cohesive full-screen playable moment that should be displayed almost unchanged in Sunny. It should already contain the wonder, mechanic, anticipation, reward promise, and child-fit vibe. Sunny will add only a tiny translucent recall/action strip and a small companion anchor.`
    : `Create one vivid Sunny Quest/Boss key art image that can work as BOTH a choice-card crop and the full-screen playable world background.`;
  const prompt = `${freeVisionDirection}

Child: ${input.childId}
Stage: ${input.kind}
Homework domain: ${input.assignment.domain}
Homework assignment: ${input.assignment.title}
Learning concepts: ${input.assignment.concepts.join(", ")}
Candidate title: ${input.candidate.title}
Candidate purpose: ${input.candidate.purpose}
Candidate description: ${input.candidate.description}
Wrapper traits: ${input.candidate.wrapperTraits.join(", ")}
Experience skin: ${skin ? JSON.stringify({
    theme: skin.theme,
    visualIntensity: skin.visualIntensity,
    focalObject: skin.focalObject,
    mechanicMetaphor: skin.mechanicMetaphor,
    rewardMoment: skin.rewardMoment,
    wrapperTraits: skin.wrapperTraits,
  }, null, 2) : "none"}
Quest evidence for Boss, if any: ${input.questEvidence ? JSON.stringify(input.questEvidence.targetResults, null, 2) : "none"}

Art direction:
- Premium, child-exciting game world concept art with a strong focal object.
- The image should feel like the actual place where the quest happens, not a poster for a worksheet.
- The domain visual mechanic must be obvious from the drawing before any text is read. Engagement style can decorate the world, but it cannot replace the learning mechanic.
- For spelling, spelling must look like recall changing the world: a vault, portal, engine, machine, map, arena gate, or creature with empty glowing memory slots, silent glyph sockets, hidden-key chambers, sound/typing energy, or lock cores that clearly wait for the child to create a missing signal from memory.
- For reading, comprehension should reveal routes, maps, scenes, clues, doors, or cause/effect evidence. For math, reasoning should power/build/repair/solve machines, bridges, patterns, or control systems. For science, evidence should stabilize/test/classify the lab, ecosystem, or experiment.
- A trophy, fireworks, race car, arena, or celebration is not enough unless the picture also shows how the academic skill changes the world.
- Non-answer UI chrome is allowed when it sells the playable fantasy: empty slots, progress meters, locked action bars, companion reaction space, panels, icons, invented glyphs, or readable generic labels like quest and unlock. Do not show actual spelling answers, target words, or readable homework words.
- Human-caught invariant: random readable alphabet letters looked like possible spelling content even when they were not target words. Use invented glyphs or abstract icons instead of readable alphabet letters, letter clouds, letter fragments, alphabet tiles, fake word chunks, or UI text that looks like homework content.
- No spelling answers, no visible target words, no word lists, no worksheet panels, no readable homework questions.
- Shell-buildable: clear interactable focal object, readable environment, and a little negative space near the bottom or lower side for Sunny's tiny action strip.
- Feels like a premium game moment: atmosphere, depth, VFX, anticipation, and a world that reacts.
- Aim for the wonder of a magical vault/game-world reveal; avoid a generic educational illustration.
- Make this feel custom for this child based on the wrapper traits and evidence, not generic school content.
- Avoid gambling/casino visual language.`;
  const artDir = path.join(input.outDir, "openai-card-art");
  fs.mkdirSync(artDir, { recursive: true });
  const base = `${input.kind}-${slug(input.candidate.candidateId)}`;
  const promptPath = path.join(artDir, `${base}.prompt.txt`);
  const imagePath = path.join(artDir, `${base}.png`);
  fs.writeFileSync(promptPath, prompt, "utf8");
  const started = Date.now();
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_IMAGE_MODEL,
      prompt,
      size: "1024x1024",
      quality: DEFAULT_OPENAI_IMAGE_QUALITY,
      n: 1,
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI card art failed (${response.status}): ${raw.slice(0, 800)}`);
  }
  const parsed = JSON.parse(raw) as {
    data?: Array<{ b64_json?: string }>;
    usage?: unknown;
  };
  const b64 = parsed.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI card art response did not include b64_json.");
  fs.writeFileSync(imagePath, Buffer.from(b64, "base64"));
  return {
    candidateId: input.candidate.candidateId,
    provider: "openai",
    model: DEFAULT_OPENAI_IMAGE_MODEL,
    promptPath,
    imagePath,
    latencyMs: Date.now() - started,
    usage: parsed.usage,
  };
}

async function attachOpenAiCardArt(input: {
  paid: boolean;
  outDir: string;
  kind: QuestBossKind;
  childId: string;
  assignment: ReturnType<typeof assignmentFromCycle>;
  candidates: QuestBossCandidate[];
  runtime: Args["runtime"];
  questEvidence?: QuestBossEvidence;
}): Promise<{ candidates: QuestBossCandidate[]; visuals: OpenAiImageGenerationResult[] }> {
  if (!input.paid && input.runtime === "free-vision") {
    return {
      candidates: input.candidates.map((candidate) => {
        const imagePath = writeFixtureVisionPlaceholder({ outDir: input.outDir, kind: input.kind, candidate });
        return {
          ...candidate,
          imagePath,
          experienceSkin: candidate.experienceSkin
            ? {
                ...candidate.experienceSkin,
                cardImagePath: imagePath,
                worldImagePath: imagePath,
              }
            : candidate.experienceSkin,
        };
      }),
      visuals: [],
    };
  }
  if (!input.paid) return { candidates: input.candidates, visuals: [] };
  const visuals: OpenAiImageGenerationResult[] = [];
  const candidates: QuestBossCandidate[] = [];
  for (const candidate of input.candidates) {
    const visual = await generateOpenAiCardArt({
      outDir: input.outDir,
      kind: input.kind,
      childId: input.childId,
      assignment: input.assignment,
      candidate,
      runtime: input.runtime,
      questEvidence: input.questEvidence,
    });
    visuals.push(visual);
    candidates.push({
      ...candidate,
      imagePath: visual.imagePath,
      experienceSkin: candidate.experienceSkin
        ? {
            ...candidate.experienceSkin,
            cardImagePath: visual.imagePath,
            worldImagePath: visual.imagePath,
          }
        : candidate.experienceSkin,
    });
  }
  return { candidates, visuals };
}

function briefFromCandidate(args: {
  candidate: QuestBossCandidate;
  childId: string;
  homeworkId: string;
  assignmentTitle: string;
  questEvidence?: QuestBossEvidence;
  now: Date;
}): GeneratedExperienceBrief {
  if (args.candidate.kind === "boss" && args.questEvidence) {
    const boss = deriveBossBriefFromQuestEvidence({
      childId: args.childId,
      homeworkId: args.homeworkId,
      assignmentTitle: args.assignmentTitle,
      questEvidence: args.questEvidence,
      now: args.now,
    });
    return {
      ...boss,
      briefId: `${boss.briefId}-${slug(args.candidate.candidateId)}`,
      title: args.candidate.title,
      engagementHooks: args.candidate.wrapperTraits,
      targetWords: args.candidate.targetWords.length ? args.candidate.targetWords : boss.targetWords,
    };
  }
  return {
    briefId: `brief-${args.candidate.kind}-${args.homeworkId}-${slug(args.candidate.candidateId)}`,
    experimentId: `experiment-${args.homeworkId}-${args.candidate.kind}`,
    kind: args.candidate.kind,
    title: args.candidate.title,
    learningGoal:
      args.candidate.kind === "boss"
        ? "Prove transfer/mastery using the latest Quest evidence."
        : "Teach and probe the current homework theory through a generated intervention.",
    targetSkills: ["spelling recall", "retrieval practice"],
    targetConcepts: [args.candidate.purpose],
    targetWords: args.candidate.targetWords,
    engagementHooks: args.candidate.wrapperTraits,
    algorithmTargets:
      args.candidate.kind === "boss"
        ? ["mastery-gating", "transfer-check"]
        : ["error-pattern-remediation", "retrieval-practice", "desirable-difficulty"],
    evidenceUsed: args.questEvidence ? [args.questEvidence.contentId, args.questEvidence.nodeId] : ["baselineEvidence"],
    artifactStatus: "brief_only",
    validationRequired: true,
  };
}

function candidateForRuntimeShell(candidate: QuestBossCandidate): QuestBossCandidate {
  const skin = candidate.experienceSkin;
  if (!skin) return candidate;
  const worldImagePath = skin.worldImagePath && fs.existsSync(skin.worldImagePath)
    ? runtimeAssetUrl(skin.worldImagePath)
    : skin.worldImagePath;
  return {
    ...candidate,
    experienceSkin: {
      ...skin,
      worldImagePath,
    },
  };
}

function renderLabRuntimeShell(args: {
  runtime: Args["runtime"];
  candidate: QuestBossCandidate;
  assignment: ReturnType<typeof assignmentFromCycle>;
}): string {
  const candidate = candidateForRuntimeShell(args.candidate);
  if (args.runtime === "free-vision") {
    return renderQuestBossFreeVisionShell({ candidate, assignment: args.assignment });
  }
  return renderQuestBossShell({ candidate, assignment: args.assignment });
}

function addBrief(rootDir: string, childId: string, brief: GeneratedExperienceBrief): void {
  const plan = loadLabPlan(rootDir, childId);
  const briefs = (plan.generatedExperienceBriefs ?? []).filter((item) => item.briefId !== brief.briefId);
  writeLabPlan(rootDir, childId, {
    ...plan,
    generatedExperienceBriefs: [...briefs, brief],
  });
}

async function serveHtml(html: string) {
  const publicDir = path.join(process.cwd(), "web", "public");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/artifact.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (url.pathname.startsWith("/games/")) {
      const file = path.join(publicDir, url.pathname.replace(/^\//, ""));
      if (file && fs.existsSync(file)) {
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
        res.end(fs.readFileSync(file));
        return;
      }
    }
    if (url.pathname.startsWith("/generated-asset/")) {
      const token = decodeURIComponent(url.pathname.replace("/generated-asset/", ""));
      const file = runtimeAssetRegistry.get(token);
      if (file && fs.existsSync(file)) {
        const ext = path.extname(file).toLowerCase();
        const contentType = ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".svg"
            ? "image/svg+xml"
            : "image/png";
        res.writeHead(200, { "content-type": contentType });
        res.end(fs.readFileSync(file));
        return;
      }
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start lab artifact server.");
  return {
    url: `http://127.0.0.1:${address.port}/artifact.html`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function validateRuntimeWithPlaywright(input: {
  html: string;
  childId: string;
  stage: "quest" | "boss";
  homeworkType: string;
  words: string[];
  outputDir: string;
  now: Date;
}) {
  fs.mkdirSync(input.outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 });
  const attemptEvents: unknown[] = [];
  const completionEvents: unknown[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(`
    window.addEventListener("message", (event) => {
      const list = (window.__sunnyMessages ||= []);
      list.push(event.data);
    });
  `);
  const server = await serveHtml(input.html);
  try {
    await page.goto(`${server.url}?preview=go-live&childId=${input.childId}&nodeId=${input.stage}&words=${encodeURIComponent(input.words.join(","))}`, {
      waitUntil: "networkidle",
    });
    const visualQa = await page.evaluate(() => {
      const doc = (globalThis as unknown as {
        document: {
          querySelector: (selector: string) => unknown;
          querySelectorAll: (selector: string) => { length: number };
        };
      }).document;
      const runtime = doc.querySelector("[data-free-vision-runtime='true']") as { getAttribute: (name: string) => string | null } | null;
      if (!runtime) return null;
      const image = doc.querySelector("[data-free-vision-raw-image]") as {
        complete?: boolean;
        naturalWidth?: number;
        naturalHeight?: number;
      } | null;
      const naturalWidth = image?.naturalWidth ?? 0;
      const naturalHeight = image?.naturalHeight ?? 0;
      return {
        isFreeVision: true,
        imageLoaded: Boolean(image?.complete && naturalWidth > 0 && naturalHeight > 0),
        naturalWidth,
        naturalHeight,
        overlayCount: doc.querySelectorAll("[data-free-vision-overlay]").length,
        overlayPolicy: runtime.getAttribute("data-overlay-policy"),
      };
    });
    const beforePath = path.join(input.outputDir, `${input.stage}-first-screen.png`);
    await page.screenshot({ path: beforePath, fullPage: true });
    let hook = false;
    try {
      hook = await page.evaluate(async (words) => {
        const hooks = (globalThis as unknown as { SUNNY_VALIDATION_HOOKS?: { playthrough?: (input: { words: string[] }) => Promise<void> } }).SUNNY_VALIDATION_HOOKS;
        if (!hooks?.playthrough) return false;
        await hooks.playthrough({ words });
        return true;
      }, input.words);
    } catch (err: unknown) {
      pageErrors.push(err instanceof Error ? err.message : String(err));
    }
    await page.waitForTimeout(350);
    const messages = await page.evaluate(() => ((globalThis as unknown as { __sunnyMessages?: unknown[] }).__sunnyMessages ?? []));
    for (const message of messages as Array<{ type?: string; payload?: unknown }>) {
      if (message?.type === "attempt_event") attemptEvents.push(message.payload ?? message);
      if (message?.type === "game_complete" || message?.type === "node_complete") completionEvents.push(message.payload ?? message);
    }
    const afterPath = path.join(input.outputDir, `${input.stage}-completion.png`);
    await page.screenshot({ path: afterPath, fullPage: true });
    const failures: string[] = [];
    if (!hook) failures.push("SUNNY_VALIDATION_HOOKS.playthrough missing.");
    if (attemptEvents.length < input.words.length) failures.push("Attempt event count below target count.");
    if (completionEvents.length === 0) failures.push("Completion event missing.");
    if (consoleErrors.length > 0) failures.push("Console errors emitted.");
    if (pageErrors.length > 0) failures.push("Page errors emitted.");
    if (visualQa) {
      if (!visualQa.imageLoaded) failures.push("Free-vision image did not load.");
      if (visualQa.overlayCount > 4) failures.push("Free-vision overlay count exceeded minimal policy.");
    }
    return {
      passed: failures.length === 0,
      score: failures.length === 0 ? 100 : 40,
      failures,
      warnings: [],
      attempts: 1,
      validatedAt: input.now.toISOString(),
      runtimeValidation: {
        passed: failures.length === 0,
        screenshotPaths: [beforePath, afterPath],
        consoleErrors,
        pageErrors,
        attemptedTargets: attemptEvents.length,
        completed: completionEvents.length > 0,
        completionPayloads: completionEvents,
        usedValidationHook: hook,
        engine: "playwright",
        visualQa,
      },
    };
  } finally {
    await browser.close();
    await server.close();
  }
}

async function screenshotHtml(html: string, screenshotPath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 });
  const file = path.join(path.dirname(screenshotPath), `${path.basename(screenshotPath)}.html`);
  fs.writeFileSync(file, html, "utf8");
  await page.goto(`file://${file}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await browser.close();
}

function cardsHtml(title: string, candidates: QuestBossCandidate[]): string {
  const imageSrc = (candidate: QuestBossCandidate): string => {
    const imagePath = candidate.experienceSkin?.cardImagePath ?? candidate.imagePath;
    if (!imagePath) return "";
    if (/^(data:|https?:)/i.test(imagePath)) return imagePath;
    return pathToFileURL(imagePath).href;
  };
  const childHook = (candidate: QuestBossCandidate): string =>
    candidate.experienceSkin?.companionLines[0]
      ?? candidate.experienceSkin?.mechanicMetaphor
      ?? candidate.description;
  return `<!doctype html><html><head><meta charset="utf-8" />
  <style>
  body{margin:0;background:#07131f;color:#fff7e1;font-family:Inter,system-ui,sans-serif;padding:34px}
  h1{font-size:56px;margin:0 0 10px}.sub{font-size:20px;color:#dbeafe;margin-bottom:24px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{border:2px solid #46f0ce;border-radius:22px;overflow:hidden;background:#101933;min-height:560px}
  .art{height:280px;background:radial-gradient(circle at 50% 36%,#ffe46b,#14b8a6 30%,#24315f 58%,#080d1a 82%);overflow:hidden}
  .art img{width:100%;height:100%;object-fit:cover;display:block}
  .body{padding:24px}.purpose{color:#67e8f9;text-transform:uppercase;font-size:13px;font-weight:950;letter-spacing:.16em}
  h2{font-size:34px;line-height:1;margin:12px 0}.desc{font-size:19px;line-height:1.35;color:#f8fafc}.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.tag{padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.12);font-weight:850}
  </style></head><body><h1>${title}</h1><div class="sub">Validated concepts. Answers remain hidden until the Sunny shell asks for recall.</div><section class="grid">
  ${candidates.map((candidate) => `<article class="card"><div class="art">${imageSrc(candidate) ? `<img alt="" src="${imageSrc(candidate)}" />` : ""}</div><div class="body"><div class="purpose">${candidate.kind === "boss" ? "Final door" : "Adventure door"}</div><h2>${candidate.title}</h2><div class="desc">${childHook(candidate)}</div><div class="tags">${candidate.wrapperTraits.slice(0, 3).map((trait) => `<span class="tag">${trait}</span>`).join("")}</div></div></article>`).join("")}
  </section></body></html>`;
}

function worldImageFile(candidate: QuestBossCandidate): string | null {
  const image = candidate.experienceSkin?.worldImagePath ?? candidate.experienceSkin?.cardImagePath ?? candidate.imagePath;
  return image && fs.existsSync(image) ? image : null;
}

function rawImageHtml(title: string, imagePath: string, fit: "contain" | "cover"): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
  <style>body{margin:0;background:#02040a;color:#fff7e1;font-family:Inter,system-ui,sans-serif}main{width:100vw;height:100vh;display:grid;place-items:center;overflow:hidden;background:#02040a}img{width:100%;height:100%;object-fit:${fit};display:block}</style></head><body><main aria-label="${title} raw ${fit}"><img alt="" src="${pathToFileURL(imagePath).href}" /></main></body></html>`;
}

async function captureRawVisionScreenshots(args: {
  outDir: string;
  candidate: QuestBossCandidate;
  stage: QuestBossKind;
}): Promise<ScreenshotEntry[]> {
  const image = worldImageFile(args.candidate);
  if (!image) return [];
  const containPath = path.join(args.outDir, `${args.stage}-raw-image-contain.png`);
  const coverPath = path.join(args.outDir, `${args.stage}-raw-image-cover.png`);
  await screenshotHtml(rawImageHtml(`${args.stage} ${args.candidate.title}`, image, "contain"), containPath);
  await screenshotHtml(rawImageHtml(`${args.stage} ${args.candidate.title}`, image, "cover"), coverPath);
  return [
    { name: `${args.stage === "quest" ? "Quest" : "Boss"} raw AI image (contain)`, path: containPath },
    { name: `${args.stage === "quest" ? "Quest" : "Boss"} raw AI image (cover comparison)`, path: coverPath },
  ];
}

function latestContactSheet(rootDir: string, excludeDir: string): string | null {
  if (!fs.existsSync(rootDir)) return null;
  const candidates = fs.readdirSync(rootDir)
    .map((name) => path.join(rootDir, name, "contact-sheet.png"))
    .filter((file) => fs.existsSync(file) && !file.startsWith(excludeDir))
    .sort()
    .reverse();
  return candidates[0] ?? null;
}

function contactSheetHtml(entries: ScreenshotEntry[], title = "Quest -> Boss Team Proof"): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
  <style>body{margin:0;background:#07131f;color:#fff7e1;font-family:Inter,system-ui,sans-serif;padding:24px}h1{margin:0 0 18px;font-size:40px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}figure{margin:0;border:1px solid rgba(255,255,255,.18);border-radius:14px;overflow:hidden;background:#142232}img{display:block;width:100%}figcaption{padding:12px 14px;font-weight:950}</style></head><body><h1>${title}</h1><section class="grid">${entries.map((entry) => `<figure><img src="${pathToFileURL(entry.path).href}" /><figcaption>${entry.name}</figcaption></figure>`).join("")}</section></body></html>`;
}

function comparisonSheetHtml(entries: ScreenshotEntry[]): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
  <style>body{margin:0;background:#050b16;color:#fff7e1;font-family:Inter,system-ui,sans-serif;padding:24px}h1{margin:0 0 18px;font-size:42px}.grid{display:grid;grid-template-columns:repeat(${Math.min(3, Math.max(1, entries.length))},minmax(0,1fr));gap:14px}figure{margin:0;border:1px solid rgba(255,255,255,.2);border-radius:16px;overflow:hidden;background:#111c2d}img{display:block;width:100%;height:520px;object-fit:contain;background:#02040a}figcaption{padding:12px 14px;font-weight:1000}</style></head><body><h1>Free Vision Comparison</h1><section class="grid">${entries.map((entry) => `<figure><img src="${pathToFileURL(entry.path).href}" /><figcaption>${entry.name}</figcaption></figure>`).join("")}</section></body></html>`;
}

function questEvidenceFromValidation(result: {
  contentId: string;
  validationReport: {
    runtimeValidation?: {
      completionPayloads?: unknown[];
    };
  };
}, words: string[]): QuestBossEvidence {
  const accuracy = Number(
    (result.validationReport.runtimeValidation?.completionPayloads?.[0] as { accuracy?: unknown } | undefined)?.accuracy ?? 1,
  );
  return {
    nodeId: "node-4-quest",
    contentId: result.contentId,
    kind: "quest",
    completedAt: new Date().toISOString(),
    accuracy: Number.isFinite(accuracy) ? accuracy : 1,
    targetResults: words.map((word, index) => ({
      target: word,
      correct: index % 4 !== 3,
      attempts: index % 4 === 3 ? 2 : 1,
      recovered: index % 4 === 3,
    })),
    engagement: {
      selectedCandidateId: "quest",
      replayRequested: false,
      activePlayTime_ms: 90_000,
      frustrationScore: 0.15,
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  process.env.SUNNY_QUEST_BOSS_MODEL = args.model;
  requirePaidReadiness(args);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(args.outRoot, timestamp);
  const labRoot = path.join(outDir, "lab-root");
  fs.mkdirSync(outDir, { recursive: true });
  copyChildContext(args.childId, labRoot);

  const plan = loadLabPlan(labRoot, args.childId);
  const homework = loadLabHomework(labRoot, args.childId);
  const homeworkId = String(plan.activeHomeworkId ?? homework.homeworkId ?? "");
  if (!homeworkId) throw new Error("Active homework id missing.");
  let cycle = loadCycle(labRoot, args.childId, homeworkId);
  const assignment = assignmentFromCycle(cycle);
  const designerBrief = buildDesignerBriefFromLabContext(labRoot, args.childId);
  const baselineEvidence = (cycle.interventionHistory ?? []).map((item) => ({
    nodeId: item.nodeId,
    summary: `${item.nodeType}:accuracy=${item.interventionAccuracy}:status=${item.status}`,
  }));
  if (baselineEvidence.length === 0) {
    baselineEvidence.push({ nodeId: "lab-baseline", summary: "Lab copy baseline placeholder from active plan." });
    cycle = {
      ...cycle,
      interventionHistory: [
        {
          nodeId: "lab-baseline",
          nodeType: "spell-check",
          measuredAt: new Date().toISOString(),
          baselineAccuracy: 0.7,
          interventionAccuracy: 0.7,
          improvement: 0,
          predictionMet: false,
          status: "inconclusive",
        },
      ],
    };
    writeCycle(labRoot, args.childId, cycle);
  }

  const modelUsage: unknown[] = [];
  const visualGenerations: OpenAiImageGenerationResult[] = [];
  const screenshots: ScreenshotEntry[] = [];

  const questGenerated = args.paid
    ? await anthropicCandidates({
        model: args.model,
        childId: args.childId,
        kind: "quest",
        assignment,
        baselineEvidence,
        designerBrief,
      })
    : { candidates: fixtureCandidates("quest", assignment), latencyMs: 0 };
  if ("usage" in questGenerated) modelUsage.push({ stage: "quest_cards", usage: questGenerated.usage, latencyMs: questGenerated.latencyMs });
  const questPrepared = await prepareQuestBossCandidates({
    childId: args.childId,
    kind: "quest",
    homeworkId,
    nodeId: "node-4-quest",
    choiceSetId: "quest-choice",
    assignment,
    baselineEvidence,
    generator: async () => questGenerated.candidates,
  });
  if (!questPrepared.ok) throw new Error(`Quest prepare failed: ${questPrepared.reason}`);
  const questWithArt = await attachOpenAiCardArt({
    paid: args.paid,
    outDir,
    kind: "quest",
    childId: args.childId,
    assignment,
    candidates: questPrepared.candidates,
    runtime: args.runtime,
  });
  questPrepared.candidates = questWithArt.candidates;
  visualGenerations.push(...questWithArt.visuals);
  const questCardsPath = path.join(outDir, "quest-cards.png");
  await screenshotHtml(cardsHtml("Quest Unlocked", questPrepared.candidates), questCardsPath);
  screenshots.push({ name: "Quest unlock choice cards", path: questCardsPath });

  const questSelectionDecision = selectQuestBossLabCandidate({
    candidates: questPrepared.candidates,
    requestedSelection: args.selectQuest,
    stage: "quest",
    allowDefaultFirst: args.autoSelectFirst || !args.paid,
  });
  const selectedQuest = questSelectionDecision.candidate;
  console.log(
    `🎮 [quest-boss-team-lab] [select] [quest] source=${questSelectionDecision.source} selected=${selectedQuest.candidateId} available=${questSelectionDecision.availableCandidates.map((candidate) => `${candidate.index}:${candidate.candidateId}`).join(",")}`,
  );
  if (args.runtime === "free-vision") {
    screenshots.push(...await captureRawVisionScreenshots({ outDir, candidate: selectedQuest, stage: "quest" }));
  }
  const questBrief = briefFromCandidate({
    candidate: selectedQuest,
    childId: args.childId,
    homeworkId,
    assignmentTitle: assignment.title,
    now: new Date(),
  });
  addBrief(labRoot, args.childId, questBrief);
  const useAiRuntime = args.paid && args.runtime === "ai-html";
  const questSelection = await selectQuestBossCandidate({
    childId: args.childId,
    kind: "quest",
    nodeId: "node-4-quest",
    choiceSetId: "quest-choice",
    candidates: questPrepared.candidates,
    selectedCandidateId: selectedQuest.candidateId,
    buildArtifact: async (candidate) => {
      const result = await generateExperienceArtifactFromChart({
        childId: args.childId,
        rootDir: labRoot,
        briefId: questBrief.briefId,
        generateHtml: useAiRuntime
          ? generateExperienceHtmlWithSonnet
          : () => renderLabRuntimeShell({ runtime: args.runtime, candidate, assignment }),
        validateRuntime: (input) => validateRuntimeWithPlaywright(input) as never,
      });
      if (!result.ok) {
        return { ok: false, reason: result.reason, validationReport: result.validationReport };
      }
      return {
        ok: true,
        filename: result.filename,
        contentId: result.contentId,
        validationReport: result.validationReport,
      };
    },
  });
  if (!questSelection.ok) throw new Error(`Quest build failed: ${questSelection.reason}`);
  const questRuntime = (questSelection.validationReport as { runtimeValidation?: { screenshotPaths?: string[] } }).runtimeValidation?.screenshotPaths ?? [];
  questRuntime.forEach((shot, index) => screenshots.push({ name: index === 0 ? "Selected Quest first screen" : "Quest completion evidence screen", path: shot }));

  const questEvidence = questEvidenceFromValidation({
    contentId: questSelection.contentId,
    validationReport: questSelection.validationReport as { runtimeValidation?: { completionPayloads?: unknown[] } },
  }, selectedQuest.targetWords);
  const updatedCycle: HomeworkCycle = {
    ...cycle,
    questMeasurement: {
      nodeId: questEvidence.nodeId,
      nodeType: "quest",
      measuredAt: questEvidence.completedAt,
      baselineAccuracy: 0.7,
      interventionAccuracy: questEvidence.accuracy,
      improvement: Number((questEvidence.accuracy - 0.7).toFixed(3)),
      predictionMet: questEvidence.accuracy >= 0.8,
      status: questEvidence.accuracy >= 0.8 ? "supported" : "falsified",
    },
    interventionHistory: [
      ...(cycle.interventionHistory ?? []),
      {
        nodeId: questEvidence.nodeId,
        nodeType: "quest",
        measuredAt: questEvidence.completedAt,
        baselineAccuracy: 0.7,
        interventionAccuracy: questEvidence.accuracy,
        improvement: Number((questEvidence.accuracy - 0.7).toFixed(3)),
        predictionMet: questEvidence.accuracy >= 0.8,
        status: questEvidence.accuracy >= 0.8 ? "supported" : "falsified",
      },
    ],
  };
  writeCycle(labRoot, args.childId, updatedCycle);

  const bossGenerated = args.paid
    ? await anthropicCandidates({
        model: args.model,
        childId: args.childId,
        kind: "boss",
        assignment,
        baselineEvidence,
        designerBrief,
        questEvidence,
      })
    : { candidates: fixtureCandidates("boss", assignment, questEvidence), latencyMs: 0 };
  if ("usage" in bossGenerated) modelUsage.push({ stage: "boss_cards", usage: bossGenerated.usage, latencyMs: bossGenerated.latencyMs });
  const bossPrepared = await prepareQuestBossCandidates({
    childId: args.childId,
    kind: "boss",
    homeworkId,
    nodeId: "node-5-boss",
    choiceSetId: "boss-choice",
    assignment,
    baselineEvidence,
    questEvidence,
    generator: async () => bossGenerated.candidates,
  });
  if (!bossPrepared.ok) throw new Error(`Boss prepare failed: ${bossPrepared.reason}`);
  const bossWithArt = await attachOpenAiCardArt({
    paid: args.paid,
    outDir,
    kind: "boss",
    childId: args.childId,
    assignment,
    candidates: bossPrepared.candidates,
    runtime: args.runtime,
    questEvidence,
  });
  bossPrepared.candidates = bossWithArt.candidates;
  visualGenerations.push(...bossWithArt.visuals);
  const bossCardsPath = path.join(outDir, "boss-cards.png");
  await screenshotHtml(cardsHtml("Boss Unlocked", bossPrepared.candidates), bossCardsPath);
  screenshots.push({ name: "Boss unlock choice cards", path: bossCardsPath });

  const bossSelectionDecision = selectQuestBossLabCandidate({
    candidates: bossPrepared.candidates,
    requestedSelection: args.selectBoss,
    stage: "boss",
    allowDefaultFirst: args.autoSelectFirst || !args.paid,
  });
  const selectedBoss = bossSelectionDecision.candidate;
  console.log(
    `🎮 [quest-boss-team-lab] [select] [boss] source=${bossSelectionDecision.source} selected=${selectedBoss.candidateId} available=${bossSelectionDecision.availableCandidates.map((candidate) => `${candidate.index}:${candidate.candidateId}`).join(",")}`,
  );
  if (args.runtime === "free-vision") {
    screenshots.push(...await captureRawVisionScreenshots({ outDir, candidate: selectedBoss, stage: "boss" }));
  }
  const bossBrief = briefFromCandidate({
    candidate: selectedBoss,
    childId: args.childId,
    homeworkId,
    assignmentTitle: assignment.title,
    questEvidence,
    now: new Date(),
  });
  addBrief(labRoot, args.childId, bossBrief);
  const bossSelection = await selectQuestBossCandidate({
    childId: args.childId,
    kind: "boss",
    nodeId: "node-5-boss",
    choiceSetId: "boss-choice",
    candidates: bossPrepared.candidates,
    selectedCandidateId: selectedBoss.candidateId,
    buildArtifact: async (candidate) => {
      const result = await generateExperienceArtifactFromChart({
        childId: args.childId,
        rootDir: labRoot,
        briefId: bossBrief.briefId,
        generateHtml: useAiRuntime
          ? generateExperienceHtmlWithSonnet
          : () => renderLabRuntimeShell({ runtime: args.runtime, candidate, assignment }),
        validateRuntime: (input) => validateRuntimeWithPlaywright(input) as never,
      });
      if (!result.ok) {
        return { ok: false, reason: result.reason, validationReport: result.validationReport };
      }
      return {
        ok: true,
        filename: result.filename,
        contentId: result.contentId,
        validationReport: result.validationReport,
      };
    },
  });
  if (!bossSelection.ok) throw new Error(`Boss build failed: ${bossSelection.reason}`);
  const bossRuntime = (bossSelection.validationReport as { runtimeValidation?: { screenshotPaths?: string[] } }).runtimeValidation?.screenshotPaths ?? [];
  bossRuntime.forEach((shot, index) => screenshots.push({ name: index === 0 ? "Selected Boss first screen" : "Boss completion mastery result", path: shot }));

  const contactPath = path.join(outDir, "contact-sheet.png");
  await screenshotHtml(
    contactSheetHtml(
      screenshots,
      args.runtime === "free-vision" ? "Quest -> Boss Free Vision Proof" : "Quest -> Boss Team Proof",
    ),
    contactPath,
  );
  let comparisonPath: string | null = null;
  if (args.runtime === "free-vision") {
    const comparisonEntries: ScreenshotEntry[] = [];
    if (fs.existsSync(NORTH_STAR_MOCK_PATH)) {
      comparisonEntries.push({ name: "Earlier north-star visual mock", path: NORTH_STAR_MOCK_PATH });
    }
    const trustedShellContact = latestContactSheet(TEAM_LAB_OUT_ROOT, outDir);
    if (trustedShellContact) {
      comparisonEntries.push({ name: "Previous trusted-shell proof", path: trustedShellContact });
    }
    comparisonEntries.push({ name: "Current free-vision proof", path: contactPath });
    comparisonPath = path.join(outDir, "free-vision-comparison.png");
    await screenshotHtml(comparisonSheetHtml(comparisonEntries), comparisonPath);
  }

  const questChoiceEvent = questBossChoiceEventInput({
    childId: args.childId,
    nodeId: "node-4-quest",
    kind: "quest",
    choiceSetId: "quest-choice",
    candidates: questPrepared.candidates,
    selectedCandidateId: selectedQuest.candidateId,
    createdAt: new Date().toISOString(),
  });
  const bossChoiceEvent = questBossChoiceEventInput({
    childId: args.childId,
    nodeId: "node-5-boss",
    kind: "boss",
    choiceSetId: "boss-choice",
    candidates: bossPrepared.candidates,
    selectedCandidateId: selectedBoss.candidateId,
    createdAt: new Date().toISOString(),
  });
  const report = {
    ok: true,
    paid: args.paid,
    model: args.model,
    runtime: args.runtime,
    estimatedCostUsd: args.paid ? ESTIMATED_PAID_COST_USD : 0,
    estimatedCardArtCostUsd: args.paid ? ESTIMATED_CARD_ART_COST_USD : 0,
    maxCostUsd: args.maxCostUsd,
    childId: args.childId,
    homeworkId,
    assignment,
    designerBrief,
    modelUsage,
    visualGenerations,
    quest: {
      candidates: questPrepared.candidates,
      selectedCandidateId: selectedQuest.candidateId,
      selectionSource: questSelectionDecision.source,
      requestedSelection: questSelectionDecision.requestedSelection,
      availableCandidates: questSelectionDecision.availableCandidates,
      notSelectedCandidateIds: questSelection.notSelectedCandidateIds,
      choiceEvent: questChoiceEvent,
      contentId: questSelection.contentId,
      validationReport: questSelection.validationReport,
      evidence: questEvidence,
    },
    boss: {
      candidates: bossPrepared.candidates,
      selectedCandidateId: selectedBoss.candidateId,
      selectionSource: bossSelectionDecision.source,
      requestedSelection: bossSelectionDecision.requestedSelection,
      availableCandidates: bossSelectionDecision.availableCandidates,
      notSelectedCandidateIds: bossSelection.notSelectedCandidateIds,
      choiceEvent: bossChoiceEvent,
      contentId: bossSelection.contentId,
      validationReport: bossSelection.validationReport,
      brief: bossBrief,
    },
    screenshots,
    contactSheetPath: contactPath,
    comparisonPath,
    labRoot,
    rubric: {
      bossUsedQuestEvidence: bossBrief.evidenceUsed.includes(questSelection.contentId),
      noSparkOrb: [...questPrepared.candidates, ...bossPrepared.candidates].every((candidate) => !/spark orb/i.test(JSON.stringify(candidate))),
      noMasteryFromCardChoice: questChoiceEvent.accuracy == null && bossChoiceEvent.accuracy == null,
      questValidated: (questSelection.validationReport as { passed?: boolean }).passed === true,
      bossValidated: (bossSelection.validationReport as { passed?: boolean }).passed === true,
    },
  };
  writeJson(path.join(outDir, "report.json"), report);
  console.log(`🎮 [quest-boss-team-lab] [report] [written] ${path.join(outDir, "report.json")}`);
  console.log(`🎮 [quest-boss-team-lab] [screenshots] [contact-sheet] ${contactPath}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`🎮 [quest-boss-team-lab] [error] ${message}`);
  process.exitCode = 1;
});
