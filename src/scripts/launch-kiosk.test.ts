import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Sunny kiosk port handoff", () => {
  it("uses the homework-aware launcher as the default family entrypoint", () => {
    // Human-caught invariant: Saori clicked Ila after the raw kiosk was
    // restarted and landed in the generic companion canvas. The prior lab
    // always supplied homework runtime flags, so it never exercised this door.
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const start = pkg.scripts?.start ?? "";

    expect(start).toContain("src/scripts/sunnyRun.ts");
    expect(start).toContain("--subject homework");
    expect(start).toContain("--no-browser");
    expect(start).not.toContain("src/scripts/launch-kiosk.ts");
  });

  it("terminates only the process listening on Sunny's port", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/launch-kiosk.ts"), "utf8");

    expect(source).toContain("lsof -tiTCP:${port} -sTCP:LISTEN");
    expect(source).not.toContain("lsof -ti tcp:${port}");
  });

  it("never falls back to PATH-selected npx for the Sunny server", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/launch-kiosk.ts"), "utf8");

    expect(source).not.toContain('spawn("npx"');
    expect(source).toContain('localTsxCommand(root, "src/server.ts", ["--serve-static"])');
  });

  it("delegates owned-process cleanup and waits for the visible runtime identity", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/launch-kiosk.ts"), "utf8");

    expect(source).toContain('process.on("SIGTERM"');
    expect(source).toContain('process.on("SIGHUP"');
    expect(source).toContain("findStaleSunnyKioskPids");
    expect(source).toContain("terminateProcessTargets");
    expect(source).toContain("waitForKioskReady");
    expect(source).toContain("kiosk-visible");
  });

  it("launches the isolated Chrome profile without macOS Keychain or first-run blockers", () => {
    // Human-caught invariant: the automated checks only verified process and
    // readiness plumbing. On Saori's Mac, Chrome's profile startup UI blocked
    // navigation before Sunny could announce readiness, forcing a manual
    // restart and exposing a Keychain prompt that never appeared in the lab.
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/launch-kiosk.ts"), "utf8");

    expect(source).toContain('"--no-first-run"');
    expect(source).toContain('"--no-default-browser-check"');
    expect(source).toContain('"--disable-sync"');
    expect(source).toContain('"--password-store=basic"');
    expect(source).toContain('"--use-mock-keychain"');
  });

  it("auto-approves the real microphone inside the local family kiosk", () => {
    // Human-caught invariant: macOS and Chrome both showed microphone access
    // as allowed, but kiosk-mode getUserMedia remained pending behind browser
    // permission UI. The old readiness check proved only that Chrome opened.
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/launch-kiosk.ts"), "utf8");

    expect(source).toContain('"--use-fake-ui-for-media-stream"');
    expect(source).not.toContain('"--use-fake-device-for-media-stream"');
  });
});
