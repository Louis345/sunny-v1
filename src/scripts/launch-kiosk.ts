import "dotenv/config";
import { writeCanvasCapabilities } from "../utils/generateCanvasCapabilities";
writeCanvasCapabilities();

import { spawn, type ChildProcess } from "child_process";
import { execFileSync, execSync } from "child_process";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import {
  acceptOrStopKioskCandidate,
  buildKioskAppUrl,
  findStaleSunnyKioskPids,
  healthMatchesCertificationRun,
  kioskReadyMatches,
  mayReplaceExistingPortOwner,
  ownedKioskShutdownTargets,
  terminateProcessTargets,
} from "../server/certificationRuntime";
import { assertHumanAcceptanceAudioEnvironment } from "../server/humanAcceptanceAudio";
import { localNpmScriptCommand, localTsxCommand } from "./localRuntimeCommand";

const PORT = parseInt(process.env.PORT || "3001", 10);
const root = path.resolve(process.cwd());
const WEB_DIR = path.join(root, "web");
const DIST_DIR = path.join(WEB_DIR, "dist");
const KIOSK_TOKEN = randomUUID();
const BROWSER_PROFILE_DIR = process.env.SUNNY_BROWSER_PROFILE_DIR?.trim()
  || path.join(process.env.HOME || root, ".sunny", "kiosk-browser-profile");
const processTargetOps = {
  sendSignal: (target: number, signal: NodeJS.Signals) => process.kill(target, signal),
  isAlive: (target: number) => {
    try {
      process.kill(target, 0);
      return true;
    } catch {
      return false;
    }
  },
  wait: (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
};

function needsRebuild(): boolean {
  const distHtml = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(distHtml)) return true;

  const distMtime = fs.statSync(distHtml).mtimeMs;
  const pkgPath = path.join(WEB_DIR, "package.json");
  if (fs.existsSync(pkgPath) && fs.statSync(pkgPath).mtimeMs > distMtime) {
    return true;
  }
  const srcDir = path.join(WEB_DIR, "src");
  if (fs.existsSync(srcDir)) {
    const files = fs.readdirSync(srcDir, { recursive: true }) as string[];
    for (const f of files) {
      const full = path.join(srcDir, f);
      if (fs.statSync(full).isFile() && fs.statSync(full).mtimeMs > distMtime) {
        return true;
      }
    }
  }
  return false;
}

async function waitForServer(timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      if (res.ok && healthMatchesCertificationRun(await res.json(), process.env)) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function waitForKioskReady(timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/kiosk/ready?token=${encodeURIComponent(KIOSK_TOKEN)}`);
      if (res.ok && kioskReadyMatches(await res.json(), KIOSK_TOKEN)) return true;
    } catch {
      // The visible browser has not completed this launch yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function isPortInUse(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${PORT}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForPortFree(timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isPortInUse())) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return !(await isPortInUse());
}

function killProcessOnPort(port: number): void {
  try {
    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: "utf8" }).trim();
    if (!out) return;
    const pids = out.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
        console.log(`  🔄 Stopped stale process on port ${port} (pid ${pid})`);
      } catch {
        // process may already be gone
      }
    }
    execSync("sleep 0.5");
  } catch {
    // port not in use or lsof unavailable
  }
}

function runningProcessTable(): string {
  try {
    return execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  } catch (error) {
    console.error(" 🎮 [kiosk] [process-inventory] [failed]", error);
    throw error;
  }
}

async function stopStaleSunnyKiosks(profileDir: string): Promise<void> {
  const stalePids = findStaleSunnyKioskPids(runningProcessTable(), profileDir)
    .filter((pid) => pid !== process.pid);
  if (stalePids.length === 0) return;
  for (const pid of stalePids) {
    console.log(` 🎮 [kiosk] [stale-browser] [stopping] pid=${pid}`);
  }
  const { forceKilled } = await terminateProcessTargets(stalePids, processTargetOps);
  for (const pid of forceKilled) console.warn(` 🎮 [kiosk] [stale-browser] [force-stopped] pid=${pid}`);
  console.log(" 🎮 [kiosk] [stale-browser] [stopped]");
}

async function main() {
  assertHumanAcceptanceAudioEnvironment(process.env);
  console.log("\n  🌟 Project Sunny — Starting up...\n");

  if (await isPortInUse()) {
    if (!mayReplaceExistingPortOwner(process.env)) {
      console.error(`  ⚠️  Certification port ${PORT} is already owned by another process. Nothing was stopped.`);
      process.exit(1);
    }
    console.log(`  🔄 Port ${PORT} busy — restarting Sunny server for fresh bundle...`);
    killProcessOnPort(PORT);
    const released = await waitForPortFree(15000);
    if (!released) {
      console.error(
        `  ⚠️  Port ${PORT} is still in use. Stop the other Sunny process (lsof -ti tcp:${PORT} | xargs kill) and retry.`,
      );
      process.exit(1);
    }
  }

  // Check web/ exists
  if (!fs.existsSync(WEB_DIR)) {
    console.error("  web/ directory not found. Run 'npm run web:build' first.");
    process.exit(1);
  }

  // Step 1: Build frontend if dist doesn't exist or is stale
  if (needsRebuild()) {
    console.log("  📦 Building frontend...");
    const build = localNpmScriptCommand(root, "build");
    execFileSync(build.executable, build.args, { cwd: WEB_DIR, stdio: "inherit" });
    console.log("  ✅ Frontend built\n");
  }

  // Step 2: Start the server (serves both API and static files)
  console.log("  🚀 Starting server...");
  const serverCommand = localTsxCommand(root, "src/server.ts", ["--serve-static"]);
  const server = spawn(serverCommand.executable, serverCommand.args, {
    stdio: "inherit",
    env: { ...process.env, PORT: String(PORT), SUNNY_KIOSK_TOKEN: KIOSK_TOKEN },
  });

  let chromium: ChildProcess | null = null;
  let pendingChromium: ChildProcess | null = null;
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (signal: string, exitCode = 0): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      shuttingDown = true;
      console.log(` 🎮 [kiosk] [shutdown] [running] signal=${signal}`);
      const targets = ownedKioskShutdownTargets(server.pid, chromium?.pid, pendingChromium?.pid);
      let finalExitCode = exitCode;
      try {
        const { forceKilled } = await terminateProcessTargets(targets, processTargetOps);
        if (forceKilled.length > 0) {
          console.warn(` 🎮 [kiosk] [shutdown] [force-stopped] targets=${forceKilled.join(",")}`);
        }
        console.log(` 🎮 [kiosk] [shutdown] [complete] signal=${signal}`);
      } catch (error) {
        finalExitCode = 1;
        console.error(" 🎮 [kiosk] [shutdown] [failed]", error);
      }
      process.exit(finalExitCode);
    })();
    return shutdownPromise;
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGHUP", () => void shutdown("SIGHUP"));
  server.once("exit", (code, signal) => {
    if (!shuttingDown) void shutdown(`server-exit:${signal ?? code ?? "unknown"}`, code ?? 1);
  });

  try {
    const ready = await waitForServer();
    if (!ready) throw new Error("sunny_server_not_ready");

    const noBrowser = process.argv.includes("--no-browser");

    if (noBrowser) {
      console.log(`  🌐 App ready → http://localhost:${PORT}\n`);
      return;
    }

    fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });
    await stopStaleSunnyKiosks(BROWSER_PROFILE_DIR);
    // Step 3: Launch Chromium in kiosk mode
    const browsers = [
      "chromium-browser", // Pi OS
      "chromium", // Some Linux
      "google-chrome", // Mac/Linux with Chrome
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // macOS
    ];

    for (const browser of browsers) {
      if (shuttingDown) throw new Error("kiosk_startup_cancelled");
      let candidate: ChildProcess;
      try {
        candidate = spawn(
          browser,
          [
            "--kiosk",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-sync",
            "--password-store=basic",
            "--use-mock-keychain",
            "--use-fake-ui-for-media-stream",
            "--noerrdialogs",
            "--disable-infobars",
            "--disable-session-crashed-bubble",
            "--disable-restore-session-state",
            "--autoplay-policy=no-user-gesture-required",
            `--user-data-dir=${BROWSER_PROFILE_DIR}`,
            `--app=${buildKioskAppUrl(PORT, KIOSK_TOKEN)}`,
          ],
          {
            stdio: "ignore",
            detached: true,
          }
        );
        pendingChromium = candidate;
        candidate.on("error", (error) => {
          console.warn(` 🎮 [kiosk] [browser-launch] [failed] browser=${browser}`, error);
          if (pendingChromium === candidate) pendingChromium = null;
        });
        candidate.unref();
      } catch (error) {
        console.warn(` 🎮 [kiosk] [browser-launch] [failed] browser=${browser}`, error);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      const accepted = await acceptOrStopKioskCandidate(
        candidate.pid,
        waitForKioskReady,
        async (target) => { await terminateProcessTargets([target], processTargetOps); },
      );
      if (accepted) {
        chromium = candidate;
        pendingChromium = null;
        console.log(` 🎮 [kiosk] [kiosk-visible] [confirmed] port=${PORT}`);
        console.log(`  🖥️  Chromium kiosk launched → http://localhost:${PORT}\n`);
        break;
      }
      if (pendingChromium === candidate) pendingChromium = null;
    }

    if (!chromium?.pid) {
      throw new Error("visible_kiosk_not_confirmed");
    }
    const visibleBrowser = chromium;
    visibleBrowser.once("exit", (code, signal) => {
      if (!shuttingDown) void shutdown(`browser-exit:${signal ?? code ?? "unknown"}`, code ?? 1);
    });
  } catch (error) {
    console.error(" 🎮 [kiosk] [startup] [failed]", error);
    await shutdown("startup-failed", 1);
  }
}

void main().catch((error) => {
  console.error(" 🎮 [kiosk] [startup] [failed]", error);
  process.exitCode = 1;
});
