import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Audit 2026-11-22 (docs/audits/deterministic-code.md, Games): with no recorded announcer bank, Orb Catcher and Egg
// Hatch had the browser's speechSynthesis read fixed lines ("Shake it off, champ", "Listen.", "This one is just you.
// Ready? Go!"). Owner rule: no canned child-facing speech. The device voice may speak only a test word; everything
// else is a recorded announcer clip or silence (on-screen text may stay).
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), "src/components", rel), "utf8");

describe("Orb Catcher and Egg Hatch: the device voice speaks only test words", () => {
  it("the browser voice has one door, for test words", () => {
    const audio = read("orbAudio.ts");
    expect(audio).toMatch(/\bsayTestWord\(word: string/);
    expect(audio).not.toMatch(/\n\s+say\(text: string/);
  });

  it("no game line, cue or pack line is handed to the browser voice", () => {
    for (const file of ["OrbCatcher3D.tsx", "EggHatch3D.tsx", "orbAnnouncer.ts"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/\.say\(/);
      expect(source, file).not.toMatch(/sayTestWord\(\s*["'`]/);
      expect(source, file).not.toMatch(/sayTestWord\((?:theme|line)\b/);
    }
    const packs = read("orbThemePacks.ts");
    expect(packs).not.toMatch(/caughtLine|breakFreeLine/);
    expect(packs).not.toMatch(/ready: \{ text:/);
  });
});
