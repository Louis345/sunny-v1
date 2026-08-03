import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { listChildProfileIds } from "../shared/childRegistry";

export type SunnyMenuDomain = "math" | "spelling" | "reading" | "science";
export type SunnyInvocation = { command: string; args: string[] };
type ParentPage = "returned-work" | "learning-report";

export type SunnyMenuDependencies = {
  children: string[];
  ask: (prompt: string) => Promise<string>;
  execute: (invocation: SunnyInvocation) => Promise<number>;
  openParentPage: (url: string) => Promise<void>;
  close: () => Promise<void>;
  log: (message: string) => void;
};

const DOMAINS: SunnyMenuDomain[] = ["math", "spelling", "reading", "science"];

export function listParentChildIds(rootDir = process.cwd()): string[] {
  return listChildProfileIds(rootDir).filter((childId) =>
    fs.existsSync(path.join(rootDir, "src", "context", childId, "learning_profile.json")),
  );
}

export function buildIngestInvocation(childId: string, domain: SunnyMenuDomain, sourceFile: string): SunnyInvocation {
  return {
    command: "npm",
    args: ["run", `sunny:ingest:${domain}`, "--", `--child=${childId}`, `--pdf=${sourceFile}`],
  };
}

export function buildSessionInvocation(
  childId: string,
  domain: SunnyMenuDomain,
  sessionMode: "real" | "as-child",
): SunnyInvocation {
  return {
    command: "npm",
    args: ["run", "sunny:run", "--", "--subject", "homework", "--child", childId, "--session-mode", sessionMode, "--homework-domain", domain],
  };
}

export function parentPageUrl(page: ParentPage, childId: string): string {
  return `http://localhost:3001/parent/${page}?child=${encodeURIComponent(childId)}`;
}

async function chooseNumber(inputValue: string, count: number): Promise<number | null> {
  const value = Number(inputValue.trim());
  return Number.isInteger(value) && value >= 1 && value <= count ? value - 1 : null;
}

async function chooseChild(deps: SunnyMenuDependencies): Promise<string | null> {
  deps.log(`\nChoose child\n${deps.children.map((child, index) => `${index + 1}. ${child}`).join("\n")}\n0. Cancel`);
  const selected = (await deps.ask("> ")).trim();
  if (selected === "0" || !selected) return null;
  const index = await chooseNumber(selected, deps.children.length);
  if (index == null) {
    deps.log("Invalid child selection.");
    return null;
  }
  return deps.children[index] ?? null;
}

async function chooseDomain(deps: SunnyMenuDependencies): Promise<SunnyMenuDomain | null> {
  deps.log(`\nChoose homework domain\n${DOMAINS.map((domain, index) => `${index + 1}. ${domain}`).join("\n")}\n0. Cancel`);
  const selected = (await deps.ask("> ")).trim();
  if (selected === "0" || !selected) return null;
  const index = await chooseNumber(selected, DOMAINS.length);
  if (index == null) {
    deps.log("Invalid domain selection.");
    return null;
  }
  return DOMAINS[index] ?? null;
}

export async function runSunnyMenu(deps: SunnyMenuDependencies): Promise<"exit"> {
  try {
    while (true) {
      deps.log("\nSunny\n\n1. Ingest homework\n2. Start child session\n3. Return marked work\n4. View learning report\n5. Exit");
      const action = (await deps.ask("> ")).trim();
      if (action === "5") return "exit";
      if (!new Set(["1", "2", "3", "4"]).has(action)) {
        deps.log("Choose 1–5.");
        continue;
      }
      const childId = await chooseChild(deps);
      if (!childId) continue;
      try {
        if (action === "1") {
          const domain = await chooseDomain(deps);
          if (!domain) continue;
          const source = (await deps.ask("Assignment file path (or 0 to cancel): ")).trim().replace(/^['"]|['"]$/g, "");
          if (!source || source === "0") continue;
          const sourceFile = path.resolve(source);
          const code = await deps.execute(buildIngestInvocation(childId, domain, sourceFile));
          deps.log(code === 0 ? "Homework ingestion finished." : `Homework ingestion failed with exit code ${code}. Saved checkpoints remain available.`);
          continue;
        }
        if (action === "2") {
          const domain = await chooseDomain(deps);
          if (!domain) continue;
          deps.log("\nWho is using Sunny?\n1. Child playing (records learning evidence)\n2. Parent preview (records nothing)\n0. Cancel");
          const modeChoice = (await deps.ask("> ")).trim();
          if (modeChoice === "0" || !modeChoice) continue;
          if (modeChoice !== "1" && modeChoice !== "2") {
            deps.log("Choose 1, 2, or 0.");
            continue;
          }
          const sessionMode = modeChoice === "1" ? "real" : "as-child";
          const code = await deps.execute(buildSessionInvocation(childId, domain, sessionMode));
          deps.log(code === 0 ? "Child session closed." : `Child session failed with exit code ${code}.`);
          continue;
        }
        const page = action === "3" ? "returned-work" : "learning-report";
        await deps.openParentPage(parentPageUrl(page, childId));
        await deps.ask("Press Enter here when you are finished in the parent page…");
      } catch (error) {
        deps.log(`Action failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await deps.close();
  }
}

function runtimeEnv(): NodeJS.ProcessEnv {
  if (process.env.DOTENV_CONFIG_PATH || fs.existsSync(path.join(process.cwd(), ".env"))) return { ...process.env };
  const commonDir = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: process.cwd(), encoding: "utf8" });
  if (commonDir.status !== 0) return { ...process.env };
  const candidate = path.join(path.dirname(path.resolve(process.cwd(), commonDir.stdout.trim())), ".env");
  return fs.existsSync(candidate) ? { ...process.env, DOTENV_CONFIG_PATH: candidate } : { ...process.env };
}

async function execute(invocation: SunnyInvocation): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, { cwd: process.cwd(), env: runtimeEnv(), stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

function healthAvailable(): Promise<boolean> {
  return fetch("http://127.0.0.1:3001/api/health").then((response) => response.ok).catch(() => false);
}

async function waitForHealth(timeoutMs = 15_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await healthAvailable()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Sunny parent server did not become ready within 15 seconds.");
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  let ownedServer: ChildProcess | null = null;
  const openParentPage = async (url: string) => {
    if (!await healthAvailable()) {
      if (!fs.existsSync(path.join(process.cwd(), "web", "dist", "index.html"))) {
        const buildCode = await execute({ command: "npm", args: ["run", "web:build"] });
        if (buildCode !== 0) throw new Error(`Web build failed with exit code ${buildCode}.`);
      }
      ownedServer = spawn("npx", ["tsx", "src/server.ts", "--serve-static"], { cwd: process.cwd(), env: runtimeEnv(), stdio: "inherit" });
      await waitForHealth();
    }
    const opened = spawnSync("open", [url], { stdio: "ignore" });
    if (opened.status !== 0) throw new Error(`Could not open ${url}`);
  };

  await runSunnyMenu({
    children: listParentChildIds(),
    ask: (prompt) => rl.question(prompt),
    execute,
    openParentPage,
    close: async () => {
      rl.close();
      if (ownedServer && !ownedServer.killed) ownedServer.kill("SIGTERM");
    },
    log: console.log,
  });
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(`Sunny menu failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
