import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resetAdaptabilityDemo,
  runAdaptabilityLab,
  sandboxContextRoot,
} from "./adaptabilityDemo";

describe("adaptability demo sandbox", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function root(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-adapt-demo-"));
    roots.push(dir);
    return dir;
  }

  it("resets demo_adaptive into an isolated sandbox context", () => {
    const projectRoot = root();
    const result = resetAdaptabilityDemo({ rootDir: projectRoot, scenario: "near_test" });

    expect(result.childId).toBe("demo_adaptive");
    expect(result.contextRoot).toBe(sandboxContextRoot(projectRoot));
    expect(fs.existsSync(path.join(result.childDir, "learning_profile.json"))).toBe(true);
    expect(fs.existsSync(path.join(result.childDir, "word_bank.json"))).toBe(true);
    expect(
      fs.existsSync(path.join(result.childDir, "homework", "cycles", "hw-adapt-near_test.json")),
    ).toBe(true);
    const cycle = JSON.parse(
      fs.readFileSync(
        path.join(result.childDir, "homework", "cycles", "hw-adapt-near_test.json"),
        "utf8",
      ),
    ) as { nodes?: Array<{ type?: string }> };
    expect(cycle.nodes?.map((node) => node.type)).toEqual([
      "word-radar",
      "spell-check",
      "pronunciation",
    ]);
    expect(fs.existsSync(path.join(projectRoot, "src", "context", "ila"))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, "src", "context", "reina"))).toBe(false);
  });

  it("prints an adaptability report from the sandbox chart", async () => {
    const projectRoot = root();
    resetAdaptabilityDemo({ rootDir: projectRoot, scenario: "weak_performance" });

    const report = await runAdaptabilityLab({
      rootDir: projectRoot,
      scenario: "weak_performance",
      reset: false,
      preview: false,
    });

    expect(report.childId).toBe("demo_adaptive");
    expect(report.contextRoot).toBe(sandboxContextRoot(projectRoot));
    expect(report.before.nodeTypes.length).toBeGreaterThan(0);
    expect(report.after.evidenceWritePath).toContain(".sunny-sandbox");
    expect(report.after.planTheory).toMatch(/adaptive|spelling|session|support/i);
    expect(report.after.plannedMeasurements.length).toBeGreaterThan(0);
    expect(report.after.questContextSourcePacketId).toBe(report.after.experiencePacketId);
    expect(report.after.bossContextSourcePacketId).toBe(report.after.experiencePacketId);
  });

  it("keeps demo preview stateless after fixture reset", async () => {
    const projectRoot = root();
    const reset = resetAdaptabilityDemo({ rootDir: projectRoot, scenario: "near_test" });
    const profilePath = path.join(reset.childDir, "learning_profile.json");
    const before = fs.readFileSync(profilePath, "utf8");

    await runAdaptabilityLab({
      rootDir: projectRoot,
      scenario: "near_test",
      reset: false,
      preview: true,
    });

    expect(fs.readFileSync(profilePath, "utf8")).toBe(before);
    expect(fs.existsSync(path.join(reset.childDir, "activity_evidence"))).toBe(false);
  });

  it("shows near-test Word Radar timed recall config in the lab report", async () => {
    const projectRoot = root();
    const report = await runAdaptabilityLab({
      rootDir: projectRoot,
      scenario: "near_test",
    });

    expect(report.after.wordRadarConfig).toMatchObject({
      showTimer: true,
      timerSeconds: 10,
      hideWordDuringResponse: true,
    });
  });
});
