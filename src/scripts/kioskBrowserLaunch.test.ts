import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { KIOSK_BROWSER_REOPEN_GUARD, KIOSK_DOUBLE_CLOSE_MS, kioskBrowserCommand, kioskBrowserExitAction, kioskWindowWatchAction, macKioskBrowserPid, nextEmptyWindowChecks } from "./kioskBrowserLaunch";

const browser = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = ["--kiosk", "--user-data-dir=/tmp/sunny-profile", "--app=http://localhost:3001/?sunnyKioskToken=owned"];

describe("macOS kiosk microphone responsibility", () => {
  // Saori's real speech exposed TCC's denial: Chrome inherited hardened Node's
  // responsibility, which lacks audio-input entitlement. Mocked capture and
  // visible-kiosk checks never exercised the OS permission boundary.
  it("launches a new app through LaunchServices and waits for that app to exit", () => {
    expect(kioskBrowserCommand("darwin", browser, args)).toEqual({
      executable: "/usr/bin/open", args: ["-n", "-W", "-a", "/Applications/Google Chrome.app", "--args", ...args],
    });
  });
  it("routes the canonical kiosk launcher through the platform adapter", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/launch-kiosk.ts"), "utf8");
    expect(source).toContain("kioskBrowserCommand(process.platform, browser, browserArgs)");
    expect(source).toContain("command.executable, command.args");
    expect(source).toContain("acceptVisibleMacKiosk(visible, runningProcessTable(), browser, browserArgs)");
  });
  it("keeps direct browser launch on non-macOS hosts", () => {
    expect(kioskBrowserCommand("linux", "chromium", args)).toEqual({ executable: "chromium", args });
  });
  it("owns only the actual Chrome process for this profile and launch token", () => {
    const table = [
      `100 /usr/bin/open -n -W -a /Applications/Google Chrome.app --args ${args.join(" ")}`,
      `101 ${browser} ${args.join(" ")}`,
      `102 ${browser} ${args.join(" ").replace("Token=owned", "Token=other")}`,
      `103 ${browser} ${args.join(" ").replace("sunny-profile", "personal-profile")}`,
      `104 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper ${args.join(" ")}`,
    ].join("\n");
    expect(macKioskBrowserPid(table, browser, args)).toBe(101);
    expect(macKioskBrowserPid("100 /usr/bin/open --args " + args.join(" "), browser, args)).toBeUndefined();
    expect(() => macKioskBrowserPid(table + `\n105 ${browser} ${args.join(" ")}`, browser, args)).toThrow("ambiguous");
  });
});

// Saori 2026-10-18: the log said "[visible-identity] [confirmed]" and then the launcher
// shut the kiosk down with visible_kiosk_not_confirmed, because it could not match
// Chrome's pid in Saori's process list. The same launch matches on the dev Mac, so no
// test or log here could see it. The visible page is the proof; a pid only helps close
// Chrome at shutdown, and the kiosk profile folder can do that instead.
describe("a visible kiosk is never shut down over its pid", () => {
  const table = `101 ${browser} ${args.join(" ")}`;
  it("keeps a visible kiosk whose Chrome pid cannot be matched", async () => {
    const { acceptVisibleMacKiosk } = await import("./kioskBrowserLaunch") as any;
    expect(acceptVisibleMacKiosk(true, "", browser, args)).toEqual({ accepted: true, browserPid: undefined });
    expect(acceptVisibleMacKiosk(true, `${table}\n${table.replace("101", "102")}`, browser, args)).toEqual({ accepted: true, browserPid: undefined });
    expect(acceptVisibleMacKiosk(true, table, browser, args)).toEqual({ accepted: true, browserPid: 101 });
  });
  it("still rejects a page that never became visible, and names its Chrome to stop", async () => {
    const { acceptVisibleMacKiosk } = await import("./kioskBrowserLaunch") as any;
    expect(acceptVisibleMacKiosk(false, table, browser, args)).toEqual({ accepted: false, browserPid: 101 });
  });
  it("closes Chrome by its kiosk profile when the pid was never matched", async () => {
    const { macShutdownBrowserTargets } = await import("./kioskBrowserLaunch") as any;
    expect(macShutdownBrowserTargets(101, table, "/tmp/sunny-profile")).toEqual([101]);
    expect(macShutdownBrowserTargets(undefined, table, "/tmp/sunny-profile")).toEqual([101]);
  });
  it("is what the launcher uses", () => {
    const source = fs.readFileSync(path.join(__dirname, "launch-kiosk.ts"), "utf8");
    expect(source).toContain("acceptVisibleMacKiosk(");
    expect(source).toContain("macShutdownBrowserTargets(");
    expect(source).not.toContain("if (!macBrowserPid) accepted = false");
  });
});

describe("kiosk window closed during a session", () => {
  // Human-caught: on Nov 2 Ila's kiosk window quit twice (browser-exit:0) and Sunny
  // shut down with nobody told; Ila sat waiting for Elli. The lab only ever started
  // kiosks and never quit the browser mid-session, so this exit path was untested.
  it("reopens the window every time a child closes it, however many earlier closes there were", () => {
    // 2026-11-12 19:41: one close shut Sunny down because an earlier close (lost with the overwritten log) used the only reopen.
    const minute = 60_000;
    expect(kioskBrowserExitAction([0])).toBe("reopen");
    expect(kioskBrowserExitAction([0, 10 * minute])).toBe("reopen");
    expect(kioskBrowserExitAction([0, 10 * minute, 25 * minute])).toBe("reopen");
  });
  it("stops Sunny only when the window is closed twice within a minute (a grown-up stopping it)", () => {
    expect(kioskBrowserExitAction([0, 40_000])).toBe("shutdown");
    expect(kioskBrowserExitAction([0, KIOSK_DOUBLE_CLOSE_MS])).toBe("shutdown");
    expect(kioskBrowserExitAction([0, KIOSK_DOUBLE_CLOSE_MS + 1])).toBe("reopen");
  });
  it("has a counter guard: the reopen loop ends after the guard's number of reopens", () => {
    const spaced = (count: number) => Array.from({ length: count }, (_, index) => index * 10 * 60_000);
    expect(kioskBrowserExitAction(spaced(KIOSK_BROWSER_REOPEN_GUARD))).toBe("reopen");
    expect(kioskBrowserExitAction(spaced(KIOSK_BROWSER_REOPEN_GUARD + 1))).toBe("shutdown");
    expect(KIOSK_BROWSER_REOPEN_GUARD).toBeLessThanOrEqual(10);
  });
  it("routes the visible browser's exit through the reopen rule", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/launch-kiosk.ts"), "utf8");
    expect(source).toContain("kioskBrowserExitAction(browserExitTimes)");
    expect(source).toContain("[kiosk] [browser-exit] [reopening]");
    expect(source).toContain("[kiosk] [browser-exit] [shutting-down]");
  });
  it("copies the kiosk's own lifecycle lines into the dated server log that survives restarts", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/launch-kiosk.ts"), "utf8");
    expect(source).toMatch(/installServerLogFile\(\{ dir: path\.join\(root, "logs", "server"\) \}\)/);
  });
});

// 2026-11-09 owner: Melty's call tile drew nothing on Saori, and the browser's own errors never reach the kiosk log.
// An opt-in debugging port lets the operator read the kiosk console over SSH; it listens on this Mac only.
describe("kiosk debugging port", () => {
  it("adds a local-only debugging port only when SUNNY_KIOSK_DEBUG_PORT is a port number", async () => {
    const { kioskDebugArgs } = await import("./kioskBrowserLaunch");
    expect(kioskDebugArgs({ SUNNY_KIOSK_DEBUG_PORT: "9222" })).toEqual(["--remote-debugging-port=9222", "--remote-debugging-address=127.0.0.1"]);
    expect(kioskDebugArgs({})).toEqual([]);
    expect(kioskDebugArgs({ SUNNY_KIOSK_DEBUG_PORT: "0.0.0.0:9222" })).toEqual([]);
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/launch-kiosk.ts"), "utf8");
    expect(source).toContain("...kioskDebugArgs(process.env)");
  });
});

describe("macOS kiosk window watch (owner 2026-11-12: closed window left Chrome running windowless)", () => {
  it("closes the windowless Chrome only after two empty checks in a row", () => {
    let empty = 0;
    empty = nextEmptyWindowChecks(empty, 0);
    expect(kioskWindowWatchAction(empty)).toBe("wait");
    empty = nextEmptyWindowChecks(empty, 0);
    expect(kioskWindowWatchAction(empty)).toBe("close-browser");
  });
  it("a window coming back resets the count, and a failed count never counts as empty", () => {
    expect(nextEmptyWindowChecks(1, 1)).toBe(0);
    expect(nextEmptyWindowChecks(1, null)).toBe(1);
    expect(kioskWindowWatchAction(nextEmptyWindowChecks(0, null))).toBe("wait");
  });
});

// Owner 2026-11-05: twice on Saori the kiosk was running but hidden behind other windows until a restart.
// The page handshake proves the page loaded, not that it is in front, so no log or lab check could see it.
describe("macOS kiosk comes to the front", () => {
  it("activates exactly the kiosk's Chrome by its pid, without a permission prompt", async () => {
    const { kioskBringToFrontCommand } = await import("./kioskBrowserLaunch") as any;
    const command = kioskBringToFrontCommand("darwin", 4242);
    expect(command.executable).toBe("/usr/bin/osascript");
    expect(command.args.slice(0, 2)).toEqual(["-l", "JavaScript"]);
    expect(command.args.at(-1)).toBe("4242");
    expect(command.args.join(" ")).toContain("runningApplicationWithProcessIdentifier");
    expect(command.args.join(" ")).toContain("activateWithOptions");
  });
  it("does nothing off macOS or without a matched pid", async () => {
    const { kioskBringToFrontCommand } = await import("./kioskBrowserLaunch") as any;
    expect(kioskBringToFrontCommand("linux", 4242)).toBeNull();
    expect(kioskBringToFrontCommand("darwin", undefined)).toBeNull();
  });
  it("is run by the launcher after every accepted macOS kiosk, and logged", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/launch-kiosk.ts"), "utf8");
    expect(source).toContain("bringKioskToFront(macBrowserPid)");
    expect(fs.readFileSync(path.join(process.cwd(), "src/scripts/kioskBrowserLaunch.ts"), "utf8")).toContain("[kiosk] [bring-to-front]");
  });
});
