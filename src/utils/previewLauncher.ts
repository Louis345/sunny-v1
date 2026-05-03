import { spawnSync } from "child_process";
import readline from "readline/promises";
import type {
  SunnyNodeAccess,
  SunnyPreviewMode,
  SunnySessionMode,
  SunnySubject,
  SunnyVoiceMode,
} from "../shared/runtimeConfig";

export type PreviewBoardCommand = {
  display: string;
  command: string;
  args: string[];
};

export type PreviewBoardRequest = {
  childId: string;
  subject: SunnySubject;
  label?: string;
  sessionMode?: SunnySessionMode;
  previewMode?: Exclude<SunnyPreviewMode, "off">;
  nodeAccess?: SunnyNodeAccess;
  voiceMode?: SunnyVoiceMode;
  noBrowser?: boolean;
};

export function buildPreviewBoardCommand(
  request: PreviewBoardRequest,
): PreviewBoardCommand {
  const args = [
    "run",
    "sunny:run",
    "--",
    "--subject",
    request.subject,
    "--child",
    request.childId,
    "--session-mode",
    request.sessionMode ?? "as-child",
    "--preview",
    request.previewMode ?? "free",
    "--node-access",
    request.nodeAccess ?? "inspect-all",
  ];
  const voiceMode = request.voiceMode ?? "normal";
  if (voiceMode !== "normal") {
    args.push("--voice", voiceMode);
  }
  if (request.noBrowser) {
    args.push("--no-browser");
  }
  return {
    display: `npm ${args.join(" ")}`,
    command: "npm",
    args,
  };
}

export function previewBoardPrompt(request: Pick<PreviewBoardRequest, "childId" | "label">): string {
  const label = request.label?.trim() || "preview";
  return `Open read-only ${label} board for ${request.childId}? [Y/n] `;
}

export function launchPreviewBoard(command: PreviewBoardCommand): void {
  const result = spawnSync(command.command, command.args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exitCode = result.status;
  }
}

export async function maybeLaunchPreviewBoard(
  request: PreviewBoardRequest & {
    force?: boolean;
    prompt?: boolean;
    defaultOpen?: boolean;
    nonInteractiveMessage?: boolean;
  },
): Promise<void> {
  const command = buildPreviewBoardCommand(request);
  if (request.force) {
    launchPreviewBoard(command);
    return;
  }

  const shouldPrompt = request.prompt !== false;
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  if (!shouldPrompt || !interactive) {
    if (request.nonInteractiveMessage !== false) {
      console.log("");
      console.log(`Run preview:  ${command.display}`);
    }
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answerRaw = await rl.question(previewBoardPrompt(request));
    const answer = answerRaw.trim().toLowerCase();
    const open =
      answer === ""
        ? request.defaultOpen === true
        : answer === "y" || answer === "yes";
    if (open) {
      launchPreviewBoard(command);
    } else {
      console.log("");
      console.log(`Run preview:  ${command.display}`);
    }
  } finally {
    rl.close();
  }
}
