import { execSync } from "child_process";
import path from "path";
import {
  encodeSunnyRuntimeConfig,
  resolveSunnyRuntimeConfig,
  type RuntimeEnv,
  type SunnyNodeAccess,
  type SunnyPreviewMode,
  type SunnySessionMode,
  type SunnySubject,
  type SunnyVoiceMode,
} from "../shared/runtimeConfig";
import {
  hydratePendingHomeworkFromCycle,
  type HomeworkDomainFilter,
} from "./homeworkSelector";

type ParsedArgs = {
  subject?: SunnySubject;
  childId?: string;
  sessionMode?: SunnySessionMode;
  previewMode?: SunnyPreviewMode;
  nodeAccess?: SunnyNodeAccess;
  voiceMode?: SunnyVoiceMode;
  homeworkDomain?: HomeworkDomainFilter;
  noBrowser: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { noBrowser: false };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    const next = argv[i + 1];
    if (part === "--no-browser") {
      out.noBrowser = true;
      continue;
    }
    if (!part?.startsWith("--")) continue;
    const [flag, inline] = part.split("=", 2);
    const value = inline ?? next;
    switch (flag) {
      case "--subject":
        out.subject = value as SunnySubject;
        if (inline == null) i += 1;
        break;
      case "--child":
        out.childId = value;
        if (inline == null) i += 1;
        break;
      case "--session-mode":
        out.sessionMode = value as SunnySessionMode;
        if (inline == null) i += 1;
        break;
      case "--preview":
        out.previewMode = value as SunnyPreviewMode;
        if (inline == null) i += 1;
        break;
      case "--node-access":
        out.nodeAccess = value as SunnyNodeAccess;
        if (inline == null) i += 1;
        break;
      case "--voice":
        out.voiceMode = value as SunnyVoiceMode;
        if (inline == null) i += 1;
        break;
      case "--homework-domain":
        out.homeworkDomain = value as HomeworkDomainFilter;
        if (inline == null) i += 1;
        break;
      default:
        break;
    }
  }
  return out;
}

function buildRuntimeEnv(args: ParsedArgs): RuntimeEnv {
  const config = resolveSunnyRuntimeConfig(process.env, {
    subject: args.subject,
    childId: args.childId,
    sessionMode: args.sessionMode,
    previewMode: args.previewMode,
    nodeAccess: args.nodeAccess,
    voiceMode: args.voiceMode,
  });
  const encoded = encodeSunnyRuntimeConfig(config);
  return {
    ...process.env,
    ADVENTURE_MAP: "true",
    SUNNY_RUNTIME_CONFIG: encoded,
    VITE_SUNNY_RUNTIME_CONFIG: encoded,
    SUNNY_SUBJECT: config.subject,
    SUNNY_MODE: config.sessionMode,
    SUNNY_CHILD: config.childId ?? "",
    SUNNY_PREVIEW_MODE: config.previewMode === "off" ? "" : config.previewMode,
    SUNNY_NODE_ACCESS: config.nodeAccess,
    SUNNY_VOICE_MODE: config.voiceMode,
    DIAG_UNLOCK_MAP: config.nodeAccess === "inspect-all" ? "true" : "",
    VITE_ADVENTURE_MAP: "true",
    VITE_DIAG_UNLOCK_MAP: config.nodeAccess === "inspect-all" ? "true" : "",
    VITE_PREVIEW_MODE: config.previewMode === "off" ? "" : config.previewMode,
    VITE_MODE:
      config.sessionMode === "diag" || config.sessionMode === "intro"
        ? config.sessionMode
        : "",
    VITE_DIAG_CHILD_ID: config.childId ?? "",
    TTS_ENABLED: config.voiceMode === "normal" ? "true" : "false",
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.subject === "homework" && args.childId) {
    hydratePendingHomeworkFromCycle(args.childId, { domain: args.homeworkDomain });
  }
  const env = buildRuntimeEnv(args);
  const root = path.resolve(process.cwd());
  execSync("npm run build", {
    cwd: path.join(root, "web"),
    stdio: "inherit",
    env,
  });
  execSync(
    `npx tsx src/scripts/launch-kiosk.ts${args.noBrowser ? " --no-browser" : ""}`,
    {
      cwd: root,
      stdio: "inherit",
      env,
    },
  );
}

main();
