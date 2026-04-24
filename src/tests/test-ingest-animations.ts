import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { ingestAnimations } from "../scripts/ingestAnimations";

const FIXTURE_DIR = path.join(
  process.cwd(),
  "src/tests/fixtures/animations-ingest",
);

function tmpOutput(): string {
  return path.join(os.tmpdir(), `animations-test-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`);
}

const tmpFiles: string[] = [];

afterAll(() => {
  for (const f of tmpFiles) {
    try { fs.unlinkSync(f); } catch { /* already gone */ }
  }
});

describe("ingestAnimations (ANIM-REGISTRY-001)", () => {
  it("1. generates ANIMATION_MANIFEST with one entry per fixture sidecar", () => {
    const out = tmpOutput();
    tmpFiles.push(out);
    ingestAnimations(FIXTURE_DIR, out);
    const content = fs.readFileSync(out, "utf8");
    // Fixture dir has alpha_move.json and beta_loop.json
    expect(content).toContain(`"alpha_move"`);
    expect(content).toContain(`"beta_loop"`);
    expect(content).toContain("ANIMATION_MANIFEST");
  });

  it("2. generated file starts with AUTO-GENERATED header comment", () => {
    const out = tmpOutput();
    tmpFiles.push(out);
    ingestAnimations(FIXTURE_DIR, out);
    const content = fs.readFileSync(out, "utf8");
    expect(content.trimStart()).toMatch(/^\/\/ AUTO-GENERATED/);
  });

  it("3. ANIMATION_IDS array contains all fixture names", () => {
    const out = tmpOutput();
    tmpFiles.push(out);
    ingestAnimations(FIXTURE_DIR, out);
    const content = fs.readFileSync(out, "utf8");
    expect(content).toContain("ANIMATION_IDS");
    expect(content).toContain(`"alpha_move"`);
    expect(content).toContain(`"beta_loop"`);
    // Must end with `as const`
    expect(content).toMatch(/ANIMATION_IDS[\s\S]*?\] as const/);
  });

  it("4. entries are sorted alphabetically by name", () => {
    const out = tmpOutput();
    tmpFiles.push(out);
    ingestAnimations(FIXTURE_DIR, out);
    const content = fs.readFileSync(out, "utf8");
    const alphaIdx = content.indexOf('"alpha_move"');
    const betaIdx = content.indexOf('"beta_loop"');
    expect(alphaIdx).toBeLessThan(betaIdx);
  });

  it("5. each manifest entry has path, defaultLoop, and label", () => {
    const out = tmpOutput();
    tmpFiles.push(out);
    ingestAnimations(FIXTURE_DIR, out);
    const content = fs.readFileSync(out, "utf8");
    expect(content).toContain(`/animations/alpha_move.fbx`);
    expect(content).toContain(`/animations/beta_loop.fbx`);
    expect(content).toContain(`"Alpha Move"`);
    expect(content).toContain(`"Beta Loop"`);
    // beta_loop has defaultLoop: true
    expect(content).toMatch(/beta_loop[\s\S]{0,100}defaultLoop.*true/);
  });

  it("6. empty directory generates empty manifest and empty ANIMATION_IDS", () => {
    const emptyDir = path.join(os.tmpdir(), `anim-test-empty-${Date.now()}`);
    fs.mkdirSync(emptyDir, { recursive: true });
    const out = tmpOutput();
    tmpFiles.push(out);
    try {
      ingestAnimations(emptyDir, out);
      const content = fs.readFileSync(out, "utf8");
      expect(content).toContain("ANIMATION_MANIFEST");
      // Empty manifest
      expect(content).toMatch(/ANIMATION_MANIFEST[\s\S]*?\[\s*\]/);
    } finally {
      fs.rmdirSync(emptyDir);
    }
  });

  it("7. running ingest on web/public/animations/ produces entries for all 5 real sidecars", () => {
    const realAnimDir = path.join(process.cwd(), "web/public/animations");
    const out = tmpOutput();
    tmpFiles.push(out);
    ingestAnimations(realAnimDir, out);
    const content = fs.readFileSync(out, "utf8");
    for (const name of ["dance_victory", "idle", "shrug", "think", "wave"]) {
      expect(content, `missing ${name}`).toContain(`"${name}"`);
    }
  });
});
