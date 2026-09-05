import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import recipes from "./wardrobe-recipes.json";
import { resolveLocalWardrobeAsset } from "../web/wardrobeAssets";
import { restoreBodySurface, type BodyRepair } from "../web/wardrobeBodyPreparation";

// Asset metadata is deliberately retained verbatim; this is not a glTF re-exporter.
export type GltfJson = Record<string, any>;
export type WardrobeRecipe = {
  id: string;
  version: string;
  sourceUrl: string;
  sourceSha256: string;
  expectedMaterials: string[];
  clothingMaterials: Record<string, string>;
  bodyProfileId: string;
  bodyRepair?: BodyRepair & { donorSourceUrl: string; donorSha256: string };
};
export const WARDROBE_RECIPES = recipes as unknown as WardrobeRecipe[];
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function readVrm(bytes: Buffer): { json: GltfJson; binary: Buffer } {
  if (bytes.length < 28 || bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error("Invalid VRM GLB header");
  }
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength > bytes.length) throw new Error("Invalid VRM JSON chunk");
  return { json: JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength)), binary: bytes.subarray(20 + jsonLength) };
}

export function prepareWardrobeVrm(bytes: Buffer, recipe: WardrobeRecipe, donorBytes?: Buffer) {
  const source = readVrm(bytes);
  const json = structuredClone(source.json);
  if (JSON.stringify(json.materials.map((material: GltfJson) => material.name)) !== JSON.stringify(recipe.expectedMaterials)) {
    throw new Error(`Stale material inventory for ${recipe.id}; audit the source before preparing`);
  }
  if (hash(bytes) !== recipe.sourceSha256) throw new Error(`Source fingerprint changed for ${recipe.id}; re-audit required`);
  for (const [index, category] of Object.entries(recipe.clothingMaterials)) {
    const material = json.materials[Number(index)];
    if (!material || !["top", "bottom", "onepiece"].includes(category)) throw new Error("Invalid explicit clothing role");
    material.extras = { ...material.extras, sunnyClothingCategory: category };
  }
  json.scenes[json.scene ?? 0].extras = { ...json.scenes[json.scene ?? 0].extras, sunnyWardrobe: true };
  let binary = source.binary;
  if (recipe.bodyRepair && !donorBytes) throw new Error(`Missing required body donor for ${recipe.id}`);
  if (donorBytes && recipe.bodyRepair) {
    if (hash(donorBytes) !== recipe.bodyRepair.donorSha256) throw new Error("Body donor fingerprint changed");
    binary = restoreBodySurface({json, binary}, readVrm(donorBytes), recipe.bodyRepair);
  }
  // A whole rig, complete face and every expression survive. No head mask, scaling or texture substitution.
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonLength = Math.ceil(jsonBytes.length / 4) * 4;
  const output = Buffer.alloc(20 + jsonLength + binary.length, 0x20);
  output.write("glTF", 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonLength, 12); output.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(output, 20); binary.copy(output, 20 + jsonLength);
  return { bytes: output, manifest: {
    companionId: recipe.id, recipeVersion: recipe.version, sourceUrl: recipe.sourceUrl,
    sourceSha256: hash(bytes), preparedSha256: hash(output),
    modelUrl: `/companions/${recipe.id}-wardrobe-${recipe.version}.vrm`,
    bodyProfileId: recipe.bodyProfileId,
    clothingMaterials: recipe.clothingMaterials,
    bodyRepair: donorBytes ? recipe.bodyRepair : undefined,
    status: "candidate" as const,
  } };
}

export function prepareWardrobe(root: string) {
  const fitVersion = hash(readFileSync(path.join(root, "web/src/lib/xwearDress.ts")));
  const accessoryVersion = hash(readFileSync(path.join(root, "web/src/components/CompanionShowroom.tsx")));
  const versions: Record<string,string> = {};
  for (const [id, archive] of Object.entries({"ribbon-dress":"sleeveless-dress.xwear", "comet-hoodie":"comet-hoodie.xwear", "constellation-blazer":"constellation-blazer.xwear"})) {
    versions[id] = `${hash(readFileSync(resolveLocalWardrobeAsset(`/__wardrobe-assets/${archive}`)!))}:${fitVersion}`;
  }
  for (const id of ["royal-crown", "cat-ears", "star-halo"]) versions[id] = accessoryVersion;
  const manifests = WARDROBE_RECIPES.map(recipe => {
    const { bytes, manifest } = prepareWardrobeVrm(readFileSync(path.join(root, "web/public", recipe.sourceUrl)), recipe, recipe.bodyRepair ? readFileSync(path.join(root, "web/public", recipe.bodyRepair.donorSourceUrl)) : undefined);
    const destination = path.join(root, "web/public", manifest.modelUrl);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
    console.log(` 🎮 [wardrobe-prepare] complete companion=${recipe.id} sha256=${manifest.preparedSha256} status=candidate`);
    return manifest;
  });
  writeFileSync(path.join(root, "web/src/lib/wardrobeAssetVersions.generated.json"), JSON.stringify(versions, null, 2) + "\n");
  writeFileSync(path.join(root, "web/src/lib/wardrobePrepared.generated.json"), JSON.stringify(manifests, null, 2) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { prepareWardrobe(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")); }
  catch (error) { console.error(" 🎮 [wardrobe-prepare] failed", error); process.exitCode = 1; }
}
