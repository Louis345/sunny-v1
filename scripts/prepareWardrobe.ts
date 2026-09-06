import {appendNativeSurfacePatches, type NativeSurfacePatch} from '../web/wardrobeNativeSurface';
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import recipes from "./wardrobe-recipes.json";
import { resolveLocalWardrobeAsset } from "../web/wardrobeAssets";
import { readAccessor } from "../web/wardrobeBodyPreparation";

// Asset metadata is deliberately retained verbatim; this is not a glTF re-exporter.
export type GltfJson = Record<string, any>;
export type WardrobeRecipe = {
  id: string;
  version: string;
  sourceUrl: string;
  sourceSha256: string;
  expectedMaterials: string[];
  clothingMaterials: Record<string, string>;
  garmentSurfaceMaterials?: number[];
  wardrobeHairRoots?: string[];
  garmentColliders?: Record<string,{bone:string;center:[number,number,number];radius?:number;normal?:[number,number,number];hairRoots?:string[]}[]>;
  garmentClearancePlanes?: Record<string,{vertices?:number[];normal:[number,number,number];offset:number;fromY:number;toY:number}[]>;
  restoreOpaqueBodyMaterials?: number[];
  garmentCrossSectionScales?: Record<string,number>;
  garmentAnchors?: Record<string,number[]>;
  nativeSurfacePatches?: NativeSurfacePatch[];
  clothingTriangles?: {mesh:number;primitive:number;category:string;coveredBy?:string;triangles:number[];fit?:{lowerY:number;upperY:number;upperScale:number}}[];
  intrinsicAccessoryMaterials?: Record<string,string>;
  accessoryFits?: Record<string,{baseY:number;scale:number;rotationY:number;lateralTilt?:number}>;
  bodyProfileId: string;
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

export function prepareWardrobeVrm(bytes: Buffer, recipe: WardrobeRecipe) {
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
  for(const index of recipe.restoreOpaqueBodyMaterials??[]){
    const material=json.materials[index];
    if(!material||!material.name.includes('SKIN')||recipe.clothingMaterials[index])throw new Error('Opaque restoration requires explicitly selected native skin');
    material.alphaMode='OPAQUE';delete material.alphaCutoff;
    const vrmMaterial=json.extensions?.VRM?.materialProperties?.[index];
    if(vrmMaterial){vrmMaterial.floatProperties={...vrmMaterial.floatProperties,_BlendMode:0,_Cutoff:0};vrmMaterial.keywordMap={...vrmMaterial.keywordMap,_ALPHATEST_ON:false};vrmMaterial.tagMap={...vrmMaterial.tagMap,RenderType:'Opaque'};vrmMaterial.renderQueue=2000;}
  }
  for (const [index, accessory] of Object.entries(recipe.intrinsicAccessoryMaterials ?? {})) {
    const material=json.materials[Number(index)];
    if(!material || !["halo","cat-ears"].includes(accessory))throw new Error("Invalid intrinsic accessory selection");
    material.extras={...material.extras,sunnyIntrinsicAccessory:accessory};
  }
  json.scenes[json.scene ?? 0].extras = { ...json.scenes[json.scene ?? 0].extras, sunnyWardrobe: true };
  // Canonical garment aliases refer to the original humanoid nodes; identity names/rig stay intact.
  const aliases: Record<string,string> = {};
  for (const bone of json.extensions?.VRM?.humanoid?.humanBones ?? []) {
    const side=bone.bone.startsWith('left')?'L':bone.bone.startsWith('right')?'R':'C';
    const part=bone.bone.replace(/^(left|right)/,'');
    aliases[`J_Bip_${side}_${part[0].toUpperCase()+part.slice(1)}`]=json.nodes[bone.node].name;
  }
  json.scenes[json.scene ?? 0].extras.sunnyHumanoidBoneNames=aliases;
  if(recipe.garmentSurfaceMaterials)json.scenes[json.scene ?? 0].extras.sunnyGarmentSurfaceMaterials=recipe.garmentSurfaceMaterials.map(index=>recipe.expectedMaterials[index]);
  if(recipe.garmentCrossSectionScales)json.scenes[json.scene ?? 0].extras.sunnyGarmentCrossSectionScales=recipe.garmentCrossSectionScales;
  if(recipe.garmentAnchors)json.scenes[json.scene ?? 0].extras.sunnyGarmentAnchors=recipe.garmentAnchors;
  if(recipe.garmentClearancePlanes)json.scenes[json.scene??0].extras.sunnyGarmentClearancePlanes=recipe.garmentClearancePlanes;
  if(recipe.wardrobeHairRoots)json.scenes[json.scene??0].extras.sunnyWardrobeHairRoots=recipe.wardrobeHairRoots;
  if(recipe.garmentColliders)json.scenes[json.scene??0].extras.sunnyGarmentColliders=recipe.garmentColliders;
  let binary = source.binary;
  if(recipe.clothingTriangles?.length){
    const chunks=[binary.subarray(8)];let length=chunks[0].length;
    const append=(indices:number[],float=false)=>{
      const padding=(4-length%4)%4;chunks.push(Buffer.alloc(padding));length+=padding;
      const bytes=Buffer.from((float?new Float32Array(indices):new Uint32Array(indices)).buffer);
      const view=json.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length})-1;
      chunks.push(bytes);length+=bytes.length;
      const accessor:GltfJson={bufferView:view,componentType:float?5126:5125,count:indices.length/(float?3:1),type:float?'VEC3':'SCALAR'};
      if(float){accessor.min=[0,1,2].map(k=>Math.min(...indices.filter((_,i)=>i%3===k)));accessor.max=[0,1,2].map(k=>Math.max(...indices.filter((_,i)=>i%3===k)));}
      return json.accessors.push(accessor)-1;
    };
    const selected=new Map<string,Set<number>>();
    for(const selection of recipe.clothingTriangles){
      const key=`${selection.mesh}:${selection.primitive}`;
      const primitive=source.json.meshes[selection.mesh].primitives[selection.primitive];
      const indices=readAccessor(source,primitive.indices).flat(),used=selected.get(key)??new Set<number>();
      if(!['top','bottom','onepiece'].includes(selection.category))throw new Error('Invalid triangle clothing role');
      for(const t of selection.triangles){if(!Number.isInteger(t)||t<0||t*3>=indices.length||used.has(t))throw new Error('Invalid or overlapping clothing triangle');used.add(t);}
      selected.set(key,used);
      const material=structuredClone(json.materials[primitive.material]);material.name+=`_wardrobe_${selection.category}`;material.extras={...material.extras,sunnyClothingCategory:selection.category};
      if(selection.coveredBy){if(!['sleeveless-dress','comet-hoodie','constellation-blazer'].includes(selection.coveredBy))throw new Error('Invalid garment coverage role');material.name+=`_covered_${selection.coveredBy}`;material.extras.sunnyCoveredByOutfit=selection.coveredBy;}
      const materialIndex=json.materials.push(material)-1;
      const vrmMaterial=json.extensions?.VRM?.materialProperties?.[primitive.material];
      if(vrmMaterial)json.extensions.VRM.materialProperties.push({...structuredClone(vrmMaterial),name:material.name});
      const fittedPrimitive={...structuredClone(primitive),material:materialIndex,indices:append(selection.triangles.flatMap(t=>indices.slice(t*3,t*3+3)))};
      if(selection.fit){
        const {lowerY,upperY,upperScale}=selection.fit;
        if(!(upperY>lowerY&&upperScale>0&&upperScale<=1))throw new Error('Invalid original-clothing fit');
        const positions=readAccessor(source,primitive.attributes.POSITION).map(([x,y,z])=>{const t=Math.max(0,Math.min(1,(y-lowerY)/(upperY-lowerY))),scale=1+t*(upperScale-1);return [x*scale,y,z*scale];});
        fittedPrimitive.attributes={...fittedPrimitive.attributes,POSITION:append(positions.flat(),true)};
      }
      json.meshes[selection.mesh].primitives.push(fittedPrimitive);
    }
    for(const [key,used] of selected){const [mesh,primitive]=key.split(':').map(Number);const p=json.meshes[mesh].primitives[primitive];p.indices=append(readAccessor(source,p.indices).flat().filter((_,i)=>!used.has(Math.floor(i/3))));}
    const payload=Buffer.concat(chunks);json.buffers[0].byteLength=payload.length;const header=Buffer.alloc(8);header.writeUInt32LE(payload.length,0);header.writeUInt32LE(0x004e4942,4);binary=Buffer.concat([header,payload]);
  }
  if(recipe.nativeSurfacePatches?.length)binary=appendNativeSurfacePatches({json,binary},recipe.nativeSurfacePatches);
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
    intrinsicAccessoryMaterials: recipe.intrinsicAccessoryMaterials,
    accessoryFits: recipe.accessoryFits,
    status: "candidate" as const,
  } };
}

export function prepareWardrobe(root: string) {
  const fitVersion = hash(Buffer.concat(["web/src/lib/xwearDress.ts", "web/src/lib/wardrobeHairCollision.ts", "web/src/lib/wardrobePreparedGarment.ts", "scripts/prepareWardrobeGarments.ts"].map(file => readFileSync(path.join(root, file)))));
  const accessoryVersion = hash(Buffer.concat(["web/src/components/CompanionShowroom.tsx", "web/src/lib/wardrobeAccessoryFit.ts", "scripts/wardrobe-recipes.json"].map(file=>readFileSync(path.join(root,file)))));
  const versions: Record<string,string> = {presentation:hash(Buffer.concat(["web/src/components/CompanionShowroom.tsx", "web/src/components/WardrobeCompatibilityLab.tsx", "web/src/lib/wardrobeInspection.ts", "web/src/lib/wardrobeHairCollision.ts", "web/src/lib/wardrobeAccessoryFit.ts"].map(file=>readFileSync(path.join(root,file)))))};
  for (const [id, archive] of Object.entries({"ribbon-dress":"sleeveless-dress.xwear", "comet-hoodie":"comet-hoodie.xwear", "constellation-blazer":"constellation-blazer.xwear"})) {
    versions[id] = `${hash(readFileSync(resolveLocalWardrobeAsset(`/__wardrobe-assets/${archive}`)!))}:${fitVersion}`;
  }
  for (const id of ["royal-crown", "cat-ears", "star-halo"]) versions[id] = accessoryVersion;
  const manifests = WARDROBE_RECIPES.map(recipe => {
    const { bytes, manifest } = prepareWardrobeVrm(readFileSync(path.join(root, "web/public", recipe.sourceUrl)), recipe);
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
