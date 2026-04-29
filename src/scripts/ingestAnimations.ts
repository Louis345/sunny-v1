import fs from "fs";
import path from "path";
import type { CompanionEmote } from "../shared/companionEmotes";

interface AnimationSidecar {
  name: string;
  label: string;
  defaultLoop: boolean;
}

export interface IngestAnimationsOptions {
  /** Create missing JSON sidecars for orphaned FBX files. Default true when omitted. */
  prepareSidecars?: boolean;
  /** Merge COMPANION_ANIMATION_IDS + companionAnimateBridge ingest map. Default false (tests omit). */
  syncContractFiles?: boolean;
}

export interface IngestAnimationsResult {
  sidecarNames: string[];
  newSidecars: Array<{ slug: string; sourceFbx: string }>;
  /** Populated only when syncContractFiles: true */
  contractAddedAnimationIds?: string[];
  contractRemovedAnimationIds?: string[];
}

const CONTRACT_REL = path.join("src/shared/companions/companionContract.ts");
const BRIDGE_REL = path.join("src/shared/companions/companionAnimateBridge.ts");

const MARKER_BEGIN =
  "// ingest:animations — INGEST_ANIMATION_EMOTES_BEGIN (do not edit this marker)";
const MARKER_END =
  "// ingest:animations — INGEST_ANIMATION_EMOTES_END (do not edit this marker)";

/**
 * `mapAnimationToEmote` explicit switch ids — omit from ingest map (switch wins).
 * When adding/removing arms in companionAnimateBridge.ts, update this Set.
 */
/** Curated switch arms in companionAnimateBridge — omit from ingest map (switch wins). */
const MAP_ANIMATION_EXPLICIT_SWITCH_IDS = new Set([
  "idle",
  "dance_victory",
  "think",
  "wave",
  "shrug",
]);

function validateSidecar(raw: unknown, file: string): AnimationSidecar {
  if (!raw || typeof raw !== "object") {
    throw new Error(`ingestAnimations: ${file} is not a JSON object`);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim()) {
    throw new Error(`ingestAnimations: ${file} missing "name" string`);
  }
  if (typeof r.label !== "string" || !r.label.trim()) {
    throw new Error(`ingestAnimations: ${file} missing "label" string`);
  }
  if (typeof r.defaultLoop !== "boolean") {
    throw new Error(`ingestAnimations: ${file} missing "defaultLoop" boolean`);
  }
  return {
    name: r.name.trim(),
    label: r.label.trim(),
    defaultLoop: r.defaultLoop,
  };
}

/** e.g. Hip Hop Dancing (1) → slug hip_hop_dancing_2, label "Hip Hop Dancing 2" */
export function deriveSlugLabelFromStem(stem: string): {
  slug: string;
  label: string;
} {
  const dupMatch = /\s*\((\d+)\)\s*$/.exec(stem.trim());
  const baseHumanStem = dupMatch
    ? stem.trim().slice(0, dupMatch.index).trimEnd()
    : stem.trim();

  const slugBase = snakeCaseFromHumanSegment(baseHumanStem);
  const slug =
    dupMatch !== null
      ? `${slugBase}_${Number(dupMatch[1]) + 1}`
      : slugBase;

  let finalSlug = slug.length > 0 ? slug : "animation";

  const label =
    dupMatch !== null
      ? `${baseHumanStem} ${Number(dupMatch[1]) + 1}`
      : baseHumanStem;

  return { slug: finalSlug, label };
}

function snakeCaseFromHumanSegment(human: string): string {
  return human
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

/** Order matches ingest spec; ingest map uses this; explicit switch arms still override in mapAnimationToEmote. */
export function inferEmoteFromSlug(
  slug: string,
): { emote: CompanionEmote; heuristicHit: boolean } {
  const s = slug.toLowerCase();

  if (s.includes("excited") || s.includes("cheer")) {
    return { emote: "celebrating", heuristicHit: true };
  }

  if (
    s.includes("dance") ||
    s.includes("hip_hop") ||
    s.includes("salsa") ||
    s.includes("victory")
  ) {
    return { emote: "celebrating", heuristicHit: true };
  }

  if (s.includes("think") || s.includes("ponder") || s.includes("wonder")) {
    return { emote: "thinking", heuristicHit: true };
  }

  if (s.includes("sad") || s.includes("defeat") || s.includes("cry") || s.includes("lost")) {
    return { emote: "sad", heuristicHit: true };
  }

  if (s.includes("kiss") || s.includes("wave") || s.includes("bow") || s.includes("clap") || s.includes("nod")) {
    return { emote: "happy", heuristicHit: true };
  }

  if (s.includes("shrug") || s.includes("idle") || s.includes("walk") || s.includes("sit")) {
    return { emote: "neutral", heuristicHit: true };
  }

  if (s.includes("silly") || s.includes("funny") || s.includes("laugh")) {
    return { emote: "happy", heuristicHit: true };
  }

  if (s.includes("surprise") || s.includes("shock")) {
    return { emote: "surprised", heuristicHit: true };
  }

  return { emote: "neutral", heuristicHit: false };
}

function deriveDefaultLoopForSlug(slug: string): boolean {
  const s = slug.toLowerCase();
  return s.includes("idle") || s.includes("walk");
}

const MIN_FBX_BYTES_TO_SKIP_OVERWRITE = 1024;

/**
 * Manifest URLs are always `/animations/{slug}.fbx`. Mixamo exports use human filenames
 * (e.g. `Hip Hop Dancing (1).fbx` → slug `hip_hop_dancing_2`). Copy each source FBX to
 * `{slug}.fbx` when names differ so the static server serves a real binary FBXLoader can parse.
 */
function ensureCanonicalFbxFiles(animationsDir: string): void {
  if (!fs.existsSync(animationsDir)) return;

  const fbxFiles = fs
    .readdirSync(animationsDir)
    .filter((f) => f.toLowerCase().endsWith(".fbx"));

  const slugToSource = new Map<string, string>();
  for (const fbxFile of fbxFiles) {
    const stem = fbxFile.replace(/\.fbx$/i, "");
    const { slug } = deriveSlugLabelFromStem(stem);
    const srcPath = path.join(animationsDir, fbxFile);
    const curSize = fs.statSync(srcPath).size;
    if (slugToSource.has(slug)) {
      const prevFile = slugToSource.get(slug)!;
      const prevPath = path.join(animationsDir, prevFile);
      const prevSize = fs.statSync(prevPath).size;
      if (curSize > prevSize) {
        slugToSource.set(slug, fbxFile);
        console.warn(
          `  ⚠️  ingest:animations canonical FBX: duplicate slug "${slug}" — using larger file "${fbxFile}" (${curSize}b) over "${prevFile}" (${prevSize}b)`,
        );
      } else {
        console.warn(
          `  ⚠️  ingest:animations canonical FBX: duplicate slug "${slug}" (keep "${prevFile}", skip "${fbxFile}")`,
        );
      }
      continue;
    }
    slugToSource.set(slug, fbxFile);
  }

  for (const [slug, fbxFile] of slugToSource) {
    const canonical = `${slug}.fbx`;
    if (fbxFile.toLowerCase() === canonical.toLowerCase()) {
      continue;
    }
    const src = path.join(animationsDir, fbxFile);
    const dest = path.join(animationsDir, canonical);
    if (fs.existsSync(dest)) {
      const st = fs.statSync(dest);
      if (st.size >= MIN_FBX_BYTES_TO_SKIP_OVERWRITE) {
        continue;
      }
    }
    fs.copyFileSync(src, dest);
    console.log(
      `  📎 ingest:animations copied FBX "${fbxFile}" → "${canonical}" (manifest URL /animations/${canonical})`,
    );
  }
}

/** Auto-create `{slug}.json` for each `.fbx` without sidecar (same basename rule). */
export function prepareMissingSidecars(animationsDir: string): IngestAnimationsResult {
  const newSidecars: Array<{ slug: string; sourceFbx: string }> = [];
  if (!fs.existsSync(animationsDir)) {
    fs.mkdirSync(animationsDir, { recursive: true });
  }

  ensureCanonicalFbxFiles(animationsDir);

  const files = fs.readdirSync(animationsDir);
  const fbxFiles = files.filter((f) => f.toLowerCase().endsWith(".fbx"));
  const usedSlugs = new Set<string>();

  for (const fbxFile of fbxFiles) {
    const stem = fbxFile.replace(/\.fbx$/i, "");
    const { slug, label } = deriveSlugLabelFromStem(stem);

    if (usedSlugs.has(slug)) {
      console.warn(
        `  ⚠️  ingest:animations skipped duplicate-derived slug "${slug}" from "${fbxFile}"`,
      );
      continue;
    }
    usedSlugs.add(slug);

    const jsonPath = path.join(animationsDir, `${slug}.json`);
    if (fs.existsSync(jsonPath)) {
      continue;
    }

    const defaultLoop = deriveDefaultLoopForSlug(slug);
    const payload: AnimationSidecar = {
      name: slug,
      label,
      defaultLoop,
    };
    fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    newSidecars.push({ slug, sourceFbx: fbxFile });
  }

  const sidecarNames = loadSidecarNames(animationsDir);
  return { sidecarNames, newSidecars };
}

function loadSidecarNames(animationsDir: string): string[] {
  const files = fs.existsSync(animationsDir)
    ? fs.readdirSync(animationsDir)
    : [];
  const names: string[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const fullPath = path.join(animationsDir, file);
    const raw = JSON.parse(fs.readFileSync(fullPath, "utf8")) as unknown;
    const s = validateSidecar(raw, file);
    names.push(s.name);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

export function ingestAnimations(
  animationsDir: string,
  outputPath: string,
  options?: IngestAnimationsOptions,
): IngestAnimationsResult {
  const prepare =
    options?.prepareSidecars === undefined ? true : options.prepareSidecars;
  const sync = Boolean(options?.syncContractFiles);

  let newSidecars: Array<{ slug: string; sourceFbx: string }> = [];

  if (prepare) {
    const prep = prepareMissingSidecars(animationsDir);
    newSidecars = prep.newSidecars;
  }

  const files = fs.existsSync(animationsDir) ? fs.readdirSync(animationsDir) : [];

  const sidecars: AnimationSidecar[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const fullPath = path.join(animationsDir, file);
    const raw = JSON.parse(fs.readFileSync(fullPath, "utf8")) as unknown;
    sidecars.push(validateSidecar(raw, file));
  }

  sidecars.sort((a, b) => a.name.localeCompare(b.name));

  const manifestEntries = sidecars
    .map(
      (s) =>
        `  { name: ${JSON.stringify(s.name)}, path: ${JSON.stringify(`/animations/${s.name}.fbx`)}, defaultLoop: ${s.defaultLoop}, label: ${JSON.stringify(s.label)} },`,
    )
    .join("\n");

  const idsEntries = sidecars.map((s) => `  ${JSON.stringify(s.name)},`).join("\n");

  const output = [
    `// AUTO-GENERATED by src/scripts/ingestAnimations.ts — do not edit by hand`,
    `// Run: npm run ingest:animations`,
    ``,
    `export interface AnimationManifestEntry {`,
    `  name: string;`,
    `  path: string;`,
    `  defaultLoop: boolean;`,
    `  label: string;`,
    `}`,
    ``,
    `export const ANIMATION_MANIFEST: readonly AnimationManifestEntry[] = [`,
    sidecars.length > 0 ? manifestEntries : ``,
    `] as const;`,
    ``,
    `export const ANIMATION_IDS = [`,
    sidecars.length > 0 ? idsEntries : ``,
    `] as const;`,
    `export type GeneratedAnimationName = (typeof ANIMATION_IDS)[number];`,
    ``,
  ].join("\n");

  fs.writeFileSync(outputPath, output, "utf8");

  const root = process.cwd();
  const sidecarNames = sidecars.map((s) => s.name);

  let contractAddedAnimationIds: string[] | undefined;
  let contractRemovedAnimationIds: string[] | undefined;

  if (sync) {
    const syncResult = syncCompanionContractAnimationIdsToManifest(
      path.join(root, CONTRACT_REL),
      sidecarNames,
    );
    contractAddedAnimationIds = syncResult.added;
    contractRemovedAnimationIds = syncResult.removed;

    const emoteEntries: Record<string, CompanionEmote> = {};
    for (const name of sidecarNames) {
      if (MAP_ANIMATION_EXPLICIT_SWITCH_IDS.has(name)) continue;
      emoteEntries[name] = inferEmoteFromSlug(name).emote;
    }

    rewriteCompanionAnimateBridgeEmoteBlock(
      path.join(root, BRIDGE_REL),
      emoteEntries,
    );
  }

  return {
    sidecarNames,
    newSidecars: prepare ? newSidecars : [],
    contractAddedAnimationIds,
    contractRemovedAnimationIds,
  };
}

/** Sync COMPANION_ANIMATION_IDS to manifest-only (JSON sidecars = shipped clips). Drops ids with no FBX/sidecar. */
function syncCompanionContractAnimationIdsToManifest(
  contractPath: string,
  manifestIds: string[],
): { added: string[]; removed: string[] } {
  let body = fs.readFileSync(contractPath, "utf8");
  const m = body.match(
    /export const COMPANION_ANIMATION_IDS\s*=\s*\[([\s\S]*?)\]\s+as\s+const\s*;/,
  );
  if (!m) {
    throw new Error(
      `ingestAnimations: could not find COMPANION_ANIMATION_IDS array in contract`,
    );
  }

  const inner = m[1] ?? "";
  const previous = new Set<string>();
  for (const [, id] of inner.matchAll(/\s*"([^"]+)"\s*,?/g)) {
    previous.add(id);
  }

  const sorted = [...new Set(manifestIds)].sort((a, b) => a.localeCompare(b));
  const manifestSet = new Set(sorted);

  const added = sorted.filter((id) => !previous.has(id));
  const removed = [...previous].filter((id) => !manifestSet.has(id));

  const innerLines =
    sorted.length === 0 ? "" : sorted.map((id) => `  "${id}",`).join("\n");

  const replacementBlock = [
    `export const COMPANION_ANIMATION_IDS = [`,
    `${innerLines}`,
    `] as const;`,
    ``,
  ].join("\n");

  body = body.replace(
    /export const COMPANION_ANIMATION_IDS\s*=\s*\[[\s\S]*?\]\s+as\s+const\s*;/,
    replacementBlock.trimEnd(),
  );

  fs.writeFileSync(contractPath, body, "utf8");

  pruneCompanionAnimateToExpressionKey(contractPath, manifestSet);

  return {
    added: [...new Set(added)].sort((a, b) => a.localeCompare(b)),
    removed: [...new Set(removed)].sort((a, b) => a.localeCompare(b)),
  };
}

/** Drop COMPANION_ANIMATE_TO_EXPRESSION_KEY entries that are not valid AnimationName ids. */
function pruneCompanionAnimateToExpressionKey(
  contractPath: string,
  validIds: Set<string>,
): void {
  let body = fs.readFileSync(contractPath, "utf8");
  const marker = "export const COMPANION_ANIMATE_TO_EXPRESSION_KEY";
  const start = body.indexOf(marker);
  if (start === -1) {
    throw new Error(`ingestAnimations: ${marker} not found`);
  }
  const assignBlock = body.indexOf("\n> = {", start);
  if (assignBlock === -1) {
    throw new Error(`ingestAnimations: could not find COMPANION_ANIMATE_TO_EXPRESSION_KEY object literal`);
  }
  const openBrace = assignBlock + "\n> = ".length;
  let depth = 0;
  let closeBrace = -1;
  for (let i = openBrace; i < body.length; i++) {
    const c = body[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        closeBrace = i;
        break;
      }
    }
  }
  if (closeBrace === -1) {
    throw new Error(`ingestAnimations: unbalanced braces in COMPANION_ANIMATE_TO_EXPRESSION_KEY`);
  }

  const inner = body.slice(openBrace + 1, closeBrace);
  const lines = inner.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const km = /^\s*([a-zA-Z0-9_]+)\s*:/.exec(line);
    if (!km) {
      kept.push(line);
      continue;
    }
    if (validIds.has(km[1])) {
      kept.push(line);
    }
  }
  const newInner = kept.join("\n");
  body =
    body.slice(0, openBrace + 1) + newInner + body.slice(closeBrace);
  fs.writeFileSync(contractPath, body, "utf8");
}

/** Replace ingest block with full inferred `{ animationId: CompanionEmote }` map body. */
function rewriteCompanionAnimateBridgeEmoteBlock(
  bridgePath: string,
  emoteEntries: Record<string, CompanionEmote>,
) {
  let body = fs.readFileSync(bridgePath, "utf8");
  const start = body.indexOf(MARKER_BEGIN);
  const end = body.indexOf(MARKER_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `ingestAnimations: ingest markers missing in companionAnimateBridge.ts (BEGIN/END),
      expected:\n ${MARKER_BEGIN}\n...\n ${MARKER_END}`,
    );
  }

  const keys = Object.keys(emoteEntries).sort((a, b) => a.localeCompare(b));

  const objectLines =
    keys.length === 0
      ? ""
      : `${keys.map((k) => `  "${k}": "${emoteEntries[k]}",`).join("\n")}\n`;

  const block = [
    MARKER_BEGIN,
    "",
    `const INGEST_INFERRED_ANIMATION_EMOTES: Partial<`,
    `  Record<CompanionAnimationId, CompanionEmote>`,
    `> = {`,
    objectLines.trimEnd(),
    `};`,
    "",
    MARKER_END,
  ].join("\n");

  const sliceEndExclusive = end + MARKER_END.length;
  body = `${body.slice(0, start)}${block}${body.slice(sliceEndExclusive)}`;

  fs.writeFileSync(bridgePath, body, "utf8");
}

export function main(): void {
  const animationsDir = path.join(process.cwd(), "web/public/animations");
  const outputPath = path.join(
    process.cwd(),
    "src/shared/companions/animations.generated.ts",
  );

  const result = ingestAnimations(animationsDir, outputPath, {
    prepareSidecars: true,
    syncContractFiles: true,
  });

  const count = result.sidecarNames.length;
  const contractAdds = result.contractAddedAnimationIds ?? [];

  console.log("");
  console.log(`  ✅ Ingested ${count} animation${count === 1 ? "" : "s"}`);
  console.log(
    `  📋 New sidecars created: [${result.newSidecars.map((n) => n.slug).join(", ")}]`,
  );

  console.log(`  🔄 Contract updated (new ids): [${contractAdds.join(", ")}]`);
  const contractRemoved = result.contractRemovedAnimationIds ?? [];
  if (contractRemoved.length) {
    console.log(`  🗑️  Contract removed (no sidecar): [${contractRemoved.join(", ")}]`);
  }

  const emoteAdds = contractAdds.map((id) => {
    const inn = inferEmoteFromSlug(id);
    return `${id} → ${inn.emote}`;
  });
  if (emoteAdds.length) {
    console.log(`  🎭 Emote mappings added: ${emoteAdds.join("; ")}`);
  } else {
    console.log(`  🎭 Emote mappings added: (none — no new ids in contract)`);
  }

  const ambiguous: string[] = [];
  for (const name of result.sidecarNames) {
    const inn = inferEmoteFromSlug(name);
    if (!inn.heuristicHit) ambiguous.push(name);
  }
  if (ambiguous.length) {
    console.log(`  ⚠️  Could not infer: ${ambiguous.join(", ")}`);
  } else {
    console.log(`  ⚠️  Could not infer: []`);
  }

  console.log(`  📋 animations.generated.ts written (${count} entries)`);
  console.log("");
}

/** True when CLI runs tsx/npm on `.../scripts/ingestAnimations.ts`; false when Vitest only imports helpers. */
const shouldRunIngestAnimationsCli = /(?:^|[\\/])scripts[\\/]ingestAnimations\.ts$/.test(
  path.normalize(process.argv[1] ?? "").replace(/\\/g, "/"),
);

if (shouldRunIngestAnimationsCli) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
