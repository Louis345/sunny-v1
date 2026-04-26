/**
 * generateCompanionPersonalities.ts
 * ──────────────────────────────────
 * Reads COMPANION_MANIFEST, generates deterministic personality data
 * for each companion (no API calls needed), and writes the result back.
 *
 * Usage:  npx tsx scripts/generateCompanionPersonalities.ts
 *
 * NOTE: This enriches companions.generated.ts with traits/bio/subjects.
 * If ingestCompanions.ts is re-run it will reset those fields — re-run
 * this script afterwards to restore them.
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";

// ── Curated pools ─────────────────────────────────────────────────────────────
const TRAIT_POOL = [
  "super curious",
  "really patient",
  "loves adventures",
  "always kind",
  "super funny",
  "really brave",
  "loves puzzles",
  "always cheerful",
  "really creative",
  "loves science",
  "always helpful",
  "remembers everything",
  "great listener",
  "really encouraging",
  "loves stories",
  "super imaginative",
  "really focused",
  "loves to explore",
  "always positive",
  "great at noticing things",
];

const BIO_TEMPLATES: Array<(name: string) => string> = [
  (n) =>
    `${n} has a gift for making even the trickiest problems feel like a fun game. Kids who work with ${n} tend to surprise themselves with how much they know.`,
  (n) =>
    `${n} pays attention to the little things — a misplaced letter, a tricky number — and celebrates every single win, no matter how small.`,
  (n) =>
    `${n} believes every wrong answer is just a stepping stone. Patient, warm, and always ready to try again until it clicks.`,
  (n) =>
    `${n} turns lessons into adventures. Each new word or equation is a clue in a bigger mystery, and ${n} is always there to help crack it.`,
  (n) =>
    `${n} brings energy to every session. When you're about to give up, ${n} is the one cheering loudest from the sidelines.`,
  (n) =>
    `${n} has a calm way of explaining things that makes even the scariest subjects feel totally manageable.`,
];

const SUBJECT_POOL = [
  { label: "Reading", emoji: "📖" },
  { label: "Math", emoji: "🔢" },
  { label: "Spelling", emoji: "✏️" },
  { label: "Science", emoji: "🔬" },
  { label: "Writing", emoji: "📝" },
];

// ── Seeded random (deterministic per companion id) ────────────────────────────
function seededRng(seed: number): () => number {
  let s = seed;
  return (): number => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = s ^ (s >>> 16);
    return (s >>> 0) / 0xffffffff;
  };
}

function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(...pool.splice(idx, 1));
  }
  return out;
}

function idToSeed(id: string): number {
  return id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const MANIFEST_PATH = path.join(
  process.cwd(),
  "web/src/companion/companions.generated.ts",
);

const raw = readFileSync(MANIFEST_PATH, "utf-8");

const arrayMatch = raw.match(/COMPANION_MANIFEST[^=]+=\s*(\[[\s\S]*?\]);/);
if (!arrayMatch) throw new Error("Could not locate COMPANION_MANIFEST array");

// eslint-disable-next-line no-eval
const manifest: Array<{
  id: string;
  name: string;
  vrmUrl: string;
  personality: string[];
}> = eval(arrayMatch[1]);

const enriched = manifest.map((entry) => {
  const rng = seededRng(idToSeed(entry.id));
  const traits = pickN(TRAIT_POOL, 3, rng);
  const subjects = pickN(SUBJECT_POOL, 3, rng).map((s) => ({
    ...s,
    level: Math.floor(rng() * 4) + 2, // 2–5
  }));
  const bioFn = BIO_TEMPLATES[Math.floor(rng() * BIO_TEMPLATES.length)];
  const bio = bioFn(entry.name);
  return { ...entry, traits, bio, subjects };
});

// Rebuild the file, preserving header comment
const header = raw.split("export const COMPANION_MANIFEST")[0];
const newContent =
  header +
  `export const COMPANION_MANIFEST: CompanionManifestEntry[] = ${JSON.stringify(
    enriched,
    null,
    2,
  )};\n`;

writeFileSync(MANIFEST_PATH, newContent, "utf-8");
console.log(`✅ Enriched ${enriched.length} companions → ${MANIFEST_PATH}`);
