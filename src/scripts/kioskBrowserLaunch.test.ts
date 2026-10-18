import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { kioskBrowserCommand, macKioskBrowserPid } from "./kioskBrowserLaunch";

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
