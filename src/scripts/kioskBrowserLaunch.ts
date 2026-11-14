import { execFile } from "child_process";
import { findStaleSunnyKioskPids } from "../server/certificationRuntime";

/** LaunchServices makes Chrome the responsible application for macOS TCC.
 * Directly spawning its executable inherits hardened Node's responsibility,
 * which cannot request microphone consent without an audio-input entitlement.
 */
export function kioskBrowserCommand(platform: string, browser: string, args: string[]): { executable: string; args: string[] } {
  if (platform !== "darwin") return { executable: browser, args };
  const suffix = "/Contents/MacOS/Google Chrome";
  if (!browser.endsWith(suffix)) throw new Error("mac_kiosk_requires_chrome_app");
  return { executable: "/usr/bin/open", args: ["-n", "-W", "-a", browser.slice(0, -suffix.length), "--args", ...args] };
}

/** open's PID is a waiter, not the browser. Match both profile and fresh token
 * before managing Chrome; never signal a LaunchServices process group.
 */
export function macKioskBrowserPid(table: string, browser: string, args: string[]): number | undefined {
  const identity = args.filter(arg => arg.startsWith("--user-data-dir=") || arg.startsWith("--app="));
  if (identity.length !== 2) throw new Error("mac_kiosk_identity_required");
  const matches = table.split("\n").flatMap(line => {
    const row = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!row || !row[2].startsWith(browser + " ")) return [];
    const commandArgs = row[2].slice(browser.length + 1).split(/\s+/);
    return commandArgs.includes("--kiosk") && identity.every(arg => commandArgs.includes(arg)) ? [Number(row[1])] : [];
  });
  if (matches.length > 1) throw new Error("mac_kiosk_identity_ambiguous");
  return matches[0];
}

/** The visible page is the proof the kiosk works. A pid only helps close Chrome at
 * shutdown, so a pid that cannot be matched is logged and never closes a visible kiosk.
 */
export function acceptVisibleMacKiosk(visible: boolean, table: string, browser: string, args: string[]): { accepted: boolean; browserPid?: number } {
  let browserPid: number | undefined;
  try {
    browserPid = macKioskBrowserPid(table, browser, args);
  } catch (error) {
    console.warn(` 🎮 [kiosk] [macos-launch] [pid-unmatched] reason=${error instanceof Error ? error.message : String(error)}`);
  }
  if (visible && !browserPid) console.warn(" 🎮 [kiosk] [macos-launch] [pid-unmatched] visible=true continuing; shutdown closes Chrome by its kiosk profile");
  return { accepted: visible, browserPid };
}

/** A child closing the kiosk window must never end Sunny, so it always reopens. Two closes within a minute are a
 * grown-up deliberately stopping Sunny (2026-11-12: a lifetime limit of one reopen shut Sunny down on a close made
 * long after the first). Law 2 guard: the reopen loop ends after KIOSK_BROWSER_REOPEN_GUARD reopens.
 * `exitTimes` holds every browser exit this run, oldest first, including the one being decided.
 */
export const KIOSK_DOUBLE_CLOSE_MS = 60_000;
export const KIOSK_BROWSER_REOPEN_GUARD = 10;
export function kioskBrowserExitAction(exitTimes: number[]): "reopen" | "shutdown" {
  if (exitTimes.length > KIOSK_BROWSER_REOPEN_GUARD) return "shutdown";
  const [previous, latest] = exitTimes.slice(-2);
  return exitTimes.length >= 2 && latest - previous <= KIOSK_DOUBLE_CLOSE_MS ? "shutdown" : "reopen";
}

/** Owner 2026-11-12: on macOS, closing the kiosk window leaves Chrome running with no window, so the quit
 * rule above never fired and Ila's test morning had no Sunny on screen. Two empty checks in a row count as
 * the window closing; a failed count (null) never does, so a slow check can't close a working kiosk.
 */
export const KIOSK_EMPTY_WINDOW_CHECKS = 2;
export function kioskWindowWatchAction(emptyChecksInARow: number): "wait" | "close-browser" {
  return emptyChecksInARow >= KIOSK_EMPTY_WINDOW_CHECKS ? "close-browser" : "wait";
}
export function nextEmptyWindowChecks(previous: number, windows: number | null): number {
  if (windows === null) return previous;
  return windows === 0 ? previous + 1 : 0;
}
const MAC_WINDOW_COUNT_JXA = `ObjC.import("CoreGraphics");
function run(argv) { const pid = parseInt(argv[0]); let n = 0;
  const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1 | 16, 0)));
  for (const w of list) if (w.kCGWindowOwnerPID === pid && w.kCGWindowLayer === 0 && w.kCGWindowBounds.Height > 200) n++;
  return String(n); }`;
/** Counts a process's real on-screen windows (no permission prompt needed); null when the count fails. */
export function countMacWindows(pid: number): Promise<number | null> {
  return new Promise((resolve) => {
    execFile("/usr/bin/osascript", ["-l", "JavaScript", "-e", MAC_WINDOW_COUNT_JXA, String(pid)], { timeout: 4000 }, (error, stdout) => {
      if (error) {
        console.warn(` 🎮 [kiosk] [window-count] [failed] pid=${pid} ${error.message}`);
        return resolve(null);
      }
      const count = Number.parseInt(stdout.trim(), 10);
      resolve(Number.isFinite(count) ? count : null);
    });
  });
}

/** Owner 2026-11-05: the kiosk could load behind other windows. Activate the kiosk's own Chrome by pid
 * (NSRunningApplication needs no Automation permission and never picks a personal Chrome instance).
 */
const MAC_ACTIVATE_JXA = `ObjC.import("AppKit");
function run(argv) { const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(parseInt(argv[0]));
  if (!app || app.isNil()) return "false";
  return String(app.activateWithOptions(3)); }`;
export function kioskBringToFrontCommand(platform: string, pid: number | undefined): { executable: string; args: string[] } | null {
  if (platform !== "darwin" || !pid) return null;
  return { executable: "/usr/bin/osascript", args: ["-l", "JavaScript", "-e", MAC_ACTIVATE_JXA, String(pid)] };
}
export function bringKioskToFront(pid: number | undefined): Promise<void> {
  const command = kioskBringToFrontCommand(process.platform, pid);
  if (!command) {
    console.warn(` 🎮 [kiosk] [bring-to-front] [skipped] platform=${process.platform} browserPid=${pid ?? "unmatched"}`);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    execFile(command.executable, command.args, { timeout: 4000 }, (error, stdout) => {
      if (error) console.warn(` 🎮 [kiosk] [bring-to-front] [failed] browserPid=${pid} ${error.message}`);
      else console.log(` 🎮 [kiosk] [bring-to-front] [${stdout.trim() === "true" ? "activated" : "not-activated"}] browserPid=${pid}`);
      resolve();
    });
  });
}

export function macShutdownBrowserTargets(browserPid: number | undefined, table: string, profileDir: string): number[] {
  return browserPid ? [browserPid] : findStaleSunnyKioskPids(table, profileDir);
}

/** Opt-in console access for the operator (owner 2026-11-09): a debugging port on this Mac only, never the network. */
export function kioskDebugArgs(env: Partial<Record<string, string | undefined>>): string[] {
  const port = env.SUNNY_KIOSK_DEBUG_PORT?.trim();
  if (!port || !/^\d{2,5}$/.test(port)) return [];
  console.log(` 🎮 [kiosk] [debug-port] [enabled] port=${port} address=127.0.0.1`);
  return [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"];
}
