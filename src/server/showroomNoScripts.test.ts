import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Audit 2026-11-22: the showroom intro/plead were scripts in showroom.json, a fallback in routes.ts and the generated
// manifest. Her words come only from the model (call-moment route); the voice route speaks only text it is given.
const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("the showroom holds no scripted intro or plead", () => {
  it("no companion's showroom.json carries scripts", () => {
    const dir = path.join(root, "src/prompts/companions");
    for (const id of fs.readdirSync(dir)) {
      const file = path.join(dir, id, "showroom.json");
      if (!fs.existsSync(file)) continue;
      expect(Object.keys(JSON.parse(fs.readFileSync(file, "utf8"))), id).not.toContain("scripts");
    }
  });

  it("the voice route has no scripted fallback and the generated manifest has no scripts", () => {
    const routes = read("src/server/routes.ts");
    expect(routes).not.toMatch(/readShowroomScript|Please pick me|I'm so excited to meet you/);
    const manifest = read("web/src/companion/companions.generated.ts");
    expect(manifest).not.toMatch(/"scripts"|Please pick me/);
    for (const page of ["web/src/CompanionShowroomPage.tsx", "web/src/dbz-preview.tsx"]) {
      expect(read(page), page).not.toMatch(/scripts\.en\.intro|Hi! I'm|excited to meet you/);
    }
  });
});
