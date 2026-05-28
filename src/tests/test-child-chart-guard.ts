import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("child chart decision doorway", () => {
  it("keeps adaptive decision modules behind getChildChart instead of direct child config reads", () => {
    const decisionFiles = [
      "src/engine/learningDecisionContext.ts",
      "src/engine/homeworkCarePlan.ts",
    ];

    for (const rel of decisionFiles) {
      const source = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(source, rel).not.toMatch(/children\.config\.json/);
      expect(source, rel).not.toMatch(/from\s+["']\.\.\/profiles\/childrenConfig["']/);
    }
  });

  it("does not ship the audited child-specific runtime copy/default leaks", () => {
    const canvasSource = fs.readFileSync(
      path.join(process.cwd(), "web/src/components/Canvas.tsx"),
      "utf8",
    );
    const profileSources = [
      fs.readFileSync(path.join(process.cwd(), "src/profiles/buildProfile.ts"), "utf8"),
      fs.readFileSync(path.join(process.cwd(), "src/profiles/childChart.ts"), "utf8"),
      fs.readFileSync(path.join(process.cwd(), "src/engine/learningEngine.ts"), "utf8"),
    ].join("\n");

    expect(
      fs.existsSync(path.join(process.cwd(), "web/src/components/quest/QuestBriefingModal.tsx")),
    ).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), "web/src/components/AdventureMap.tsx"))).toBe(false);
    expect(canvasSource).not.toContain('gamePlayerName ?? "Ila"');
    expect(profileSources).not.toContain('childId === "ila"');
    expect(profileSources).not.toContain("childId === 'ila'");
    expect(profileSources).not.toContain('childId === "reina"');
    expect(profileSources).not.toContain("childId === 'reina'");
  });

  it("imports planSession wherever session bootstrap calls it", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/server/session-bootstrap.ts"),
      "utf8",
    );

    expect(source).toContain("planSession(");
    expect(source).toMatch(/import\s+\{[^}]*planSession[^}]*\}\s+from\s+["']\.\.\/engine\/learningEngine["']/s);
  });
});
