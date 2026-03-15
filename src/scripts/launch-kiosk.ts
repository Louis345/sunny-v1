import "dotenv/config";
import { spawn, type ChildProcess } from "child_process";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const PORT = parseInt(process.env.PORT || "3001", 10);
const WEB_DIR = path.resolve(process.cwd(), "web");
const DIST_DIR = path.join(WEB_DIR, "dist");

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
      if (res.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
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

async function main() {
  console.log("\n  🌟 Project Sunny — Starting up...\n");

  // Avoid EADDRINUSE: if server is already running, just point user to it
  if (await isPortInUse()) {
    console.log(`  🌐 Server already running → http://localhost:${PORT}\n`);
    process.exit(0);
  }

  // Check web/ exists
  if (!fs.existsSync(WEB_DIR)) {
    console.error("  web/ directory not found. Run 'npm run web:build' first.");
    process.exit(1);
  }

  // Step 1: Build frontend if dist doesn't exist or is stale
  if (needsRebuild()) {
    console.log("  📦 Building frontend...");
    execSync("npm run build", { cwd: WEB_DIR, stdio: "inherit" });
    console.log("  ✅ Frontend built\n");
  }

  // Step 2: Start the server (serves both API and static files)
  console.log("  🚀 Starting server...");
  const server = spawn("npx", ["tsx", "src/server.ts", "--serve-static"], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(PORT) },
  });

  const ready = await waitForServer();
  if (!ready) {
    console.error("  ⚠️  Server did not become ready in time.");
    server.kill();
    process.exit(1);
  }

  let chromium: ChildProcess | null = null;
  const noBrowser = process.argv.includes("--no-browser");

  if (noBrowser) {
    console.log(`  🌐 App ready → http://localhost:${PORT}\n`);
  } else {
    // Step 3: Launch Chromium in kiosk mode
    const browsers = [
      "chromium-browser", // Pi OS
      "chromium", // Some Linux
      "google-chrome", // Mac/Linux with Chrome
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // macOS
    ];

    for (const browser of browsers) {
      try {
        chromium = spawn(
          browser,
          [
            "--kiosk",
            "--noerrdialogs",
            "--disable-infobars",
            "--disable-session-crashed-bubble",
            "--disable-restore-session-state",
            "--autoplay-policy=no-user-gesture-required",
            `--app=http://localhost:${PORT}`,
          ],
          {
            stdio: "ignore",
            detached: true,
          }
        );

        chromium.on("error", () => {
          chromium = null;
        });
        chromium.unref();

        await new Promise((resolve) => setTimeout(resolve, 500));
        if (chromium?.pid) {
          console.log(
            `  🖥️  Chromium kiosk launched → http://localhost:${PORT}\n`
          );
          break;
        }
      } catch {
        continue;
      }
    }

    if (!chromium?.pid) {
      console.log(
        `  ⚠️  Could not launch Chromium. Open http://localhost:${PORT} manually.\n`
      );
    }
  }

  // Shutdown: kill children and exit. Do NOT log — server.ts logs "Shutting down".
  process.on("SIGINT", () => {
    if (chromium?.pid) {
      try {
        process.kill(-chromium.pid, "SIGTERM");
      } catch {
        /* process may already be gone */
      }
    }
    server.kill();
    process.exit(0);
  });
}

main().catch(console.error);
