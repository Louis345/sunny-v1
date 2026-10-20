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

export function macShutdownBrowserTargets(browserPid: number | undefined, table: string, profileDir: string): number[] {
  return browserPid ? [browserPid] : findStaleSunnyKioskPids(table, profileDir);
}
