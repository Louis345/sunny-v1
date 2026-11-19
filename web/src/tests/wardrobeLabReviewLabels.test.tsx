import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WardrobeCompatibilityLab } from "../components/WardrobeCompatibilityLab";
import { WARDROBE_STORE_CERTIFICATION_CASES } from "../lib/wardrobeBodyProfiles";
import { WARDROBE_STORE_CATALOG } from "../lib/wardrobeStore";

// BUGS.md I7: the pink-jacket body (asset id "matilda") was relabelled "Pink body (Hikari)", but four wardrobe
// scripts and the asset-gated lab test still clicked "Review Matilda prepared identity". The lab test is skipped
// wherever the wardrobe assets are absent, so nothing caught the stale label. This check runs everywhere.
const CLICKERS = [
  "../../../scripts/verifyWardrobeAcceptance.mjs",
  "../../../scripts/verifyWardrobeSwitching.mjs",
  "../../../scripts/diagnoseWardrobeSurface.mjs",
  "../../../scripts/diagnoseWardrobeSkirt.mjs",
  "../tests/WardrobeCompatibilityLab.test.tsx",
].map(file => path.resolve(__dirname, file));

it("every review label a wardrobe script or lab test clicks is one the lab renders", () => {
  render(<WardrobeCompatibilityLab cases={WARDROBE_STORE_CERTIFICATION_CASES} items={WARDROBE_STORE_CATALOG} onExit={vi.fn()} renderSourceCompanion={() => null} renderCompanion={() => null} />);
  const clicked = new Set(CLICKERS.flatMap(file => [...fs.readFileSync(file, "utf8").matchAll(/name:\s*['"](Review [^'"]+ prepared identity)['"]/g)].map(match => match[1])));
  expect(clicked.size).toBeGreaterThan(1);
  for (const label of clicked) expect(screen.getByRole("button", { name: label }), label).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Review Matilda prepared identity" })).toBeNull();
});
