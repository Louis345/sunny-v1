import fs from "node:fs";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import readline from "node:readline/promises";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { listChildProfileIds } from "../shared/childRegistry";
import { resolveContextRoot } from "../utils/contextRoot";

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

export function listParentChildIds(
  rootDir = process.cwd(),
  env: Partial<Record<string, string | undefined>> = process.env,
): string[] {
  const contextRoot = resolveContextRoot({ rootDir, env });
  return listChildProfileIds(rootDir).filter((childId) =>
    fs.existsSync(path.join(contextRoot, childId, "learning_profile.json")),
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

export function buildImpersonatorInvocation(
  childId: string,
  domain: SunnyMenuDomain,
  assignmentPath: string,
): SunnyInvocation {
  return {
    command: "npm",
    args: ["run", "sunny:certify", "--", "--child", childId, "--homework-domain", domain, `--pdf=${assignmentPath}`],
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

function normalizeAssignmentPath(value: string): string {
  const trimmed = value.trim();
  const unquoted = trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ? trimmed.slice(1, -1)
    : trimmed;
  return unquoted.replace(/\\([\\\s"'(){}\[\]&;!#$`])/g, "$1");
}

async function chooseAssignmentFile(deps: SunnyMenuDependencies): Promise<string | null> {
  while (true) {
    const source = normalizeAssignmentPath(await deps.ask("Drag assignment here, paste its path, or enter 0 to cancel: "));
    if (!source || source === "0") return null;
    const candidate = path.resolve(source);
    try {
      if (!fs.statSync(candidate).isFile()) throw new Error("not_a_file");
      return candidate;
    } catch {
      deps.log(`Assignment file not found: ${candidate}`);
    }
  }
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
          const sourceFile = await chooseAssignmentFile(deps);
          if (!sourceFile) continue;
          const code = await deps.execute(buildIngestInvocation(childId, domain, sourceFile));
          deps.log(code === 0 ? "Homework ingestion finished." : `Homework ingestion failed with exit code ${code}. See the error above.`);
          continue;
        }
        if (action === "2") {
          const domain = await chooseDomain(deps);
          if (!domain) continue;
          const evidenceFirst = domain === "math" || domain === "spelling";
          deps.log(evidenceFirst
            ? "\nWho is using Sunny?\n1. Child playing — writes real learning evidence\n2. Impersonator test — full journey in an isolated copy\n0. Cancel"
            : "\nWho is using Sunny?\n1. Child playing (records learning evidence)\n2. Parent preview (records nothing)\n0. Cancel");
          const modeChoice = (await deps.ask("> ")).trim();
          if (modeChoice === "0" || !modeChoice) continue;
          if (modeChoice !== "1" && modeChoice !== "2") {
            deps.log("Choose 1, 2, or 0.");
            continue;
          }
          let invocation: SunnyInvocation;
          if (evidenceFirst && modeChoice === "2") {
            const sourceFile = await chooseAssignmentFile(deps);
            if (!sourceFile) continue;
            invocation = buildImpersonatorInvocation(childId, domain, sourceFile);
          } else {
            invocation = buildSessionInvocation(childId, domain, modeChoice === "1" ? "real" : "as-child");
          }
          const code = await deps.execute(invocation);
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

export function sunnyRuntimeEnv(rootDir = process.cwd(), env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (env.DOTENV_CONFIG_PATH || fs.existsSync(path.join(rootDir, ".env"))) return { ...env };
  const commonDir = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: rootDir, encoding: "utf8" });
  if (commonDir.status !== 0) return { ...env };
  const candidate = path.join(path.dirname(path.resolve(rootDir, commonDir.stdout.trim())), ".env");
  return fs.existsSync(candidate) ? { ...env, DOTENV_CONFIG_PATH: candidate } : { ...env };
}

export function loadSunnyRuntimeEnvironment(): void {
  const env = sunnyRuntimeEnv();
  loadEnv({path:env.DOTENV_CONFIG_PATH ?? path.join(process.cwd(),".env")});
}

async function execute(invocation: SunnyInvocation): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, { cwd: process.cwd(), env: sunnyRuntimeEnv(), stdio: "inherit" });
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
  let ownedServer: ChildProcess | null = null;
  const openParentPage = async (url: string) => {
    if (!await healthAvailable()) {
      if (!fs.existsSync(path.join(process.cwd(), "web", "dist", "index.html"))) {
        const buildCode = await execute({ command: "npm", args: ["run", "web:build"] });
        if (buildCode !== 0) throw new Error(`Web build failed with exit code ${buildCode}.`);
      }
      ownedServer = spawn("npx", ["tsx", "src/server.ts", "--serve-static"], { cwd: process.cwd(), env: sunnyRuntimeEnv(), stdio: "inherit" });
      await waitForHealth();
    }
    const opened = spawnSync("open", [url], { stdio: "ignore" });
    if (opened.status !== 0) throw new Error(`Could not open ${url}`);
  };

  await runSunnyMenu({
    children: listParentChildIds(),
    ask: async (prompt) => {
      // Only the active question owns stdin; spawned workflows must receive their own answers.
      const rl = readline.createInterface({ input, output });
      try { return await rl.question(prompt); }
      finally { rl.close(); }
    },
    execute,
    openParentPage,
    close: async () => {
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
