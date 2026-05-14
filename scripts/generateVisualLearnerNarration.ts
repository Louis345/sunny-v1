import { config as loadDotenv } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

loadDotenv({ override: false });
if (!process.env.ELEVENLABS_API_KEY && process.env.SUNNY_ENV_PATH) {
  loadDotenv({ path: process.env.SUNNY_ENV_PATH, override: false });
}

type NarrationTiming = {
  id: string;
  startProgress: number;
  endProgress: number;
  text: string;
};

type ArtifactConfig = {
  artifactId: string;
  concept: string;
  narration?: {
    enabled?: boolean;
    provider?: string;
    voiceId?: string;
    modelId?: string;
    audioPath?: string;
    scriptPath?: string;
    alignmentPath?: string;
    timings?: NarrationTiming[];
    characterCount?: number;
    estimatedCostCents?: number;
    generatedAt?: string;
  };
};

type Args = {
  artifact: string;
  voiceId?: string;
  modelId?: string;
  yes: boolean;
  dryRun: boolean;
};

const FLASH_OR_TURBO_CENTS_PER_1K = 5;
const MULTILINGUAL_CENTS_PER_1K = 10;

function log(action: string, result: string): void {
  console.log(`🎮 [visual-narration] ${action} ${result}`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    artifact: "",
    yes: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--artifact" && next) {
      args.artifact = next;
      index += 1;
    } else if (arg === "--voice" && next) {
      args.voiceId = next;
      index += 1;
    } else if (arg === "--model" && next) {
      args.modelId = next;
      index += 1;
    } else if (arg === "--yes") {
      args.yes = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function priceCentsPer1K(modelId: string): number {
  return /flash|turbo/i.test(modelId)
    ? FLASH_OR_TURBO_CENTS_PER_1K
    : MULTILINGUAL_CENTS_PER_1K;
}

function estimateCostCents(text: string, modelId: string): number {
  return Math.max(1, Math.ceil((text.length / 1000) * priceCentsPer1K(modelId)));
}

function artifactDirectory(artifactArg: string): string {
  if (!artifactArg.trim()) {
    throw new Error("--artifact is required.");
  }
  return artifactArg.endsWith(".html") ? path.dirname(artifactArg) : artifactArg;
}

function buildNarrationScript(timings: NarrationTiming[]): string {
  if (!timings.length) {
    throw new Error("artifact.config.json narration.timings is required.");
  }
  return timings
    .slice()
    .sort((a, b) => a.startProgress - b.startProgress)
    .map((timing) => timing.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

async function confirmOrAbort(message: string, yes: boolean): Promise<void> {
  if (yes) {
    log("confirm", "auto-approved by --yes");
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${message} Continue? [y/N] `);
    if (answer.trim().toLowerCase() !== "y") {
      throw new Error("Aborted before paid ElevenLabs call.");
    }
  } finally {
    rl.close();
  }
}

async function createSpeechWithTimestamps(params: {
  apiKey: string;
  voiceId: string;
  modelId: string;
  text: string;
}): Promise<{ audio_base64: string; alignment?: unknown; normalized_alignment?: unknown }> {
  const endpoint = new URL(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(params.voiceId)}/with-timestamps`,
  );
  endpoint.searchParams.set("output_format", "mp3_44100_128");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": params.apiKey,
    },
    body: JSON.stringify({
      text: params.text,
      model_id: params.modelId,
      voice_settings: {
        stability: 0.46,
        similarity_boost: 0.82,
        style: 0.18,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs API failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as {
    audio_base64: string;
    alignment?: unknown;
    normalized_alignment?: unknown;
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.resolve(artifactDirectory(args.artifact));
  const configPath = path.join(dir, "artifact.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as ArtifactConfig;
  const voiceId =
    args.voiceId ||
    config.narration?.voiceId ||
    process.env.ELEVENLABS_VOICE_ID_REINA ||
    process.env.ELEVENLABS_VOICE_ID ||
    "052jzHJceQiZr7ltnY0C";
  const modelId = args.modelId || config.narration?.modelId || "eleven_multilingual_v2";
  const timings = config.narration?.timings ?? [];
  const scriptText = buildNarrationScript(timings);
  const estimatedCostCents = estimateCostCents(scriptText, modelId);
  const audioDir = path.join(dir, "audio");
  const audioPath = path.join(audioDir, `narration-${voiceId}.mp3`);
  const scriptPath = path.join(audioDir, "narration.txt");
  const alignmentPath = path.join(audioDir, `narration-${voiceId}.alignment.json`);

  log("artifact", `${config.artifactId} (${config.concept})`);
  log("script", `${scriptText.length} characters across ${timings.length} segments`);
  log("estimate", `${modelId} with voice ${voiceId} ≈ ${formatDollars(estimatedCostCents)}`);

  if (args.dryRun) {
    log("dry-run", "no ElevenLabs call made");
    console.log(scriptText);
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is required. Set it in .env or pass SUNNY_ENV_PATH=/path/to/.env.");
  }

  await confirmOrAbort(
    `About to call ElevenLabs. Estimated cost: ${formatDollars(estimatedCostCents)}. `,
    args.yes,
  );

  const result = await createSpeechWithTimestamps({
    apiKey,
    voiceId,
    modelId,
    text: scriptText,
  });

  await mkdir(audioDir, { recursive: true });
  await writeFile(audioPath, Buffer.from(result.audio_base64, "base64"));
  await writeFile(scriptPath, scriptText);
  await writeFile(
    alignmentPath,
    JSON.stringify(
      {
        alignment: result.alignment ?? null,
        normalized_alignment: result.normalized_alignment ?? null,
      },
      null,
      2,
    ),
  );

  config.narration = {
    ...(config.narration ?? {}),
    enabled: true,
    provider: "elevenlabs",
    voiceId,
    modelId,
    audioPath: `./audio/narration-${voiceId}.mp3`,
    scriptPath: "./audio/narration.txt",
    alignmentPath: `./audio/narration-${voiceId}.alignment.json`,
    timings,
    characterCount: scriptText.length,
    estimatedCostCents,
    generatedAt: new Date().toISOString(),
  };

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  log("audio", audioPath);
  log("alignment", alignmentPath);
  log("config", configPath);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`🎮 [visual-narration] error ${message}`);
  process.exitCode = 1;
});
