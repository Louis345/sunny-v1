import * as THREE from "three";
// Reuse the ZIP reader Three bundles for its own loaders.
import { unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { parseXwearMesh } from "./xwearMesh";
import { resolveWardrobeBodyProfileId, resolveWardrobeTemplateCertification } from "./wardrobeBodyProfiles";
import preparedBodies from './wardrobePrepared.generated.json';
import { resolvePreparedGarment, loadPreparedGarment } from "./wardrobePreparedGarment";

export type XwearOutfitDefinition = {
  id: string;
  assetRoot: string;
  meshPath: string;
  resourcePath: string;
  itemPath: string;
  archiveUrl?: string;
  surfaceOffset?: number;
  pocketLining?: {vertexCount:number;loops:number[][]};
  slots: {
    occupies: readonly XwearClothingSlot[];
    replaces: readonly XwearBaseClothingCategory[];
  };
  qa: XwearOutfitQa;
};

export type XwearBaseClothingCategory = "top" | "bottom" | "onepiece";
export type XwearClothingSlot =
  | XwearBaseClothingCategory
  | "outerwear"
  | "shoes";

export type XwearOutfitQa =
  | { status: "candidate" }
  | { status: "rejected"; reason: string }
  | {
      status: "approved";
      approvedBodyProfileIds: readonly string[];
      unsupportedAnimations?: readonly string[];
    };

export type XwearMaterialVariant = {
  id: string;
  tint: string;
};

// The source hoodie has open pocket bags. Seal only audited boundary loops;
// existing positions, UVs and skin bindings remain unchanged.
export function addGarmentPocketLinings(geometry:THREE.BufferGeometry,recipe:{vertexCount:number;loops:number[][]}) {
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),index=geometry.index!;
  if(position.count!==recipe.vertexCount)throw new Error('Stale garment pocket inventory');
  const edges=new Map<string,number>(),key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
  for(let t=0;t<index.count;t+=3)for(let k=0;k<3;k++){const id=key(index.getX(t+k),index.getX(t+(k+1)%3));edges.set(id,(edges.get(id)??0)+1);}
  const added:number[]=[];
  for(const loop of recipe.loops){
    if(loop.length<3||loop.length>64||new Set(loop).size!==loop.length||loop.some((v,k)=>!Number.isInteger(v)||v<0||v>=position.count||edges.get(key(v,loop[(k+1)%loop.length]))!==1))throw new Error('Stale garment pocket boundary');
    // These folded pocket rims self-overlap in XY. Triangulate the complete
    // spatial boundary with a bounded minimum-area disk, retaining every edge.
    const points=loop.map(v=>new THREE.Vector3().fromBufferAttribute(position,v));
    const disks:{cost:number;triangles:number[][]}[][]=Array.from({length:loop.length},()=>[]);
    for(let i=0;i<loop.length-1;i++)disks[i][i+1]={cost:0,triangles:[]};
    for(let span=2;span<loop.length;span++)for(let i=0;i+span<loop.length;i++){
      const j=i+span;let best={cost:Infinity,triangles:[] as number[][]};
      for(let k=i+1;k<j;k++){
        const area=points[k].clone().sub(points[i]).cross(points[j].clone().sub(points[i])).length();
        const cost=disks[i][k].cost+disks[k][j].cost+area;
        if(cost<best.cost)best={cost,triangles:[...disks[i][k].triangles,...disks[k][j].triangles,[i,k,j]]};
      }
      disks[i][j]=best;
    }
    for(const triangle of disks[0][loop.length-1].triangles){
      const ids=triangle.map(k=>loop[k]),a=new THREE.Vector3().fromBufferAttribute(position,ids[0]),b=new THREE.Vector3().fromBufferAttribute(position,ids[1]),c=new THREE.Vector3().fromBufferAttribute(position,ids[2]);
      const outward=ids.reduce((v,i)=>v.add(new THREE.Vector3().fromBufferAttribute(normal,i)),new THREE.Vector3());
      if(b.sub(a).cross(c.sub(a)).dot(outward)<0)[ids[1],ids[2]]=[ids[2],ids[1]];
      added.push(...ids);
    }
  }
  geometry.setIndex([...index.array,...added]);geometry.addGroup(index.count,added.length,0);geometry.computeVertexNormals();
  console.log(` 🎮 [wardrobe-prepare] pocket_lining loops=${recipe.loops.length} triangles=${added.length/3}`);
}

export function applyXwearMaterialVariant(
  materials: readonly THREE.MeshBasicMaterial[],
  variant: XwearMaterialVariant,
) {
  const tint = new THREE.Color(variant.tint);
  return materials.map((material) => {
    const variedMaterial = material.clone();
    variedMaterial.color.multiply(tint);
    variedMaterial.name = `${material.name || "xwear-material"}:${variant.id}`;
    variedMaterial.needsUpdate = true;
    return variedMaterial;
  });
}

export function isXwearOutfitApprovedForAvatar(
  outfit: XwearOutfitDefinition,
  avatarUrl: string,
) {
  const prepared=preparedBodies.find(body=>body.modelUrl===avatarUrl);
  if(prepared)return resolveWardrobeTemplateCertification(prepared.companionId,outfit.id==='sleeveless-dress'?'ribbon-dress':outfit.id,avatarUrl).status==='approved';
  const bodyProfileId = resolveWardrobeBodyProfileId(avatarUrl);
  return (
    outfit.qa.status === "approved" &&
    bodyProfileId !== null &&
    outfit.qa.approvedBodyProfileIds.includes(bodyProfileId)
  );
}

export function isXwearOutfitAnimationSupported(
  outfit: XwearOutfitDefinition,
  animation: string,
) {
  return !(
    outfit.qa.status === "approved" &&
    outfit.qa.unsupportedAnimations?.includes(animation)
  );
}

export function isXwearCanonicalSkeletonBone(name: string) {
  return name.startsWith("J_Bip_");
}

export function resolveXwearOutfitAssetUrls(outfit: XwearOutfitDefinition) {
  const assetRoot = outfit.assetRoot.replace(/\/$/, "");
  return {
    meshUrl: `${assetRoot}/${outfit.meshPath}`,
    resourceUrl: `${assetRoot}/${outfit.resourcePath}`,
    itemUrl: `${assetRoot}/${outfit.itemPath}`,
    textureRoot: `${assetRoot}/Textures`,
  };
}

export const SLEEVELESS_DRESS_OUTFIT: XwearOutfitDefinition = {
  id: "sleeveless-dress",
  assetRoot:
    "/__wardrobe-assets",
  meshPath: "Mesh/dress.mesh.bin",
  resourcePath: "Body/XResources/dress-resource.json",
  itemPath: "Body/XItem.json/dress-item.json",
  archiveUrl: "/__wardrobe-assets/sleeveless-dress.xwear",
  surfaceOffset: 0.025,
  slots: {
    occupies: ["onepiece"],
    replaces: ["top", "bottom", "onepiece"],
  },
  qa: {
    status: "approved",
    approvedBodyProfileIds: ["sunny-standard-v1"],
    unsupportedAnimations: ["sitting"],
  },
};

export const COMET_HOODIE_OUTFIT: XwearOutfitDefinition = {
  id: "comet-hoodie",
  assetRoot:
    "/__wardrobe-assets",
  meshPath: "Mesh/b437b86c-152c-49ab-8342-1e72aee49d87",
  resourcePath: "Body/XResources/9f9bd7fa-42bb-4ff2-88af-e80d3570e171",
  itemPath: "Body/XItem.json/XItem.json",
  archiveUrl: "/__wardrobe-assets/comet-hoodie.xwear",
  pocketLining: {vertexCount:1754,loops:[[994,1080,984,979,971,978,981,989],[1137,1139,1141,1163,1158,1156,1136,1135]]},
  surfaceOffset: 0.02,
  slots: {
    occupies: ["top"],
    replaces: ["top"],
  },
  qa: {
    status: "rejected",
    reason:
      "Rejected after full-size visual QA found an oversized silhouette and helper-bone separation on Elli.",
  },
};

export const CONSTELLATION_BLAZER_OUTFIT: XwearOutfitDefinition = {
  id: "constellation-blazer",
  assetRoot:
    "/__wardrobe-assets",
  meshPath: "Mesh/06cf93df-cfaf-469c-a65d-ad55d477984d",
  resourcePath: "Body/XResources/be8c7960-f0a3-4493-8d2b-f0eb6c2a6c07",
  itemPath: "Body/XItem.json/XItem.json",
  archiveUrl: "/__wardrobe-assets/constellation-blazer.xwear",
  surfaceOffset: 0.02,
  slots: {
    occupies: ["top"],
    replaces: ["top"],
  },
  qa: {
    status: "rejected",
    reason:
      "Rejected after full-size visual QA found oversized shoulders, sleeves, and torso volume on Elli.",
  },
};

export const CELTIC_SWEATER_OUTFIT: XwearOutfitDefinition = {
  id: "celtic-sweater",
  assetRoot:
    "/__wardrobe-assets",
  meshPath: "Mesh/dde76183-4b1c-4298-b115-5a82364cbaa6",
  resourcePath: "Body/XResources/0e82dcce-9eba-4418-872d-9d3c312511f0",
  itemPath: "Body/XItem.json/XItem.json",
  archiveUrl: "/__wardrobe-assets/celtic-sweater.xwear",
  surfaceOffset: 0.02,
  slots: {
    occupies: ["top"],
    replaces: ["top"],
  },
  qa: {
    status: "rejected",
    reason: "The source silhouette is incompatible with Elli's torso proportions.",
  },
};

const XWEAR_OUTFITS_BY_ID: Readonly<Record<string, XwearOutfitDefinition>> = {
  [SLEEVELESS_DRESS_OUTFIT.id]: SLEEVELESS_DRESS_OUTFIT,
  [COMET_HOODIE_OUTFIT.id]: COMET_HOODIE_OUTFIT,
  [CONSTELLATION_BLAZER_OUTFIT.id]: CONSTELLATION_BLAZER_OUTFIT,
  [CELTIC_SWEATER_OUTFIT.id]: CELTIC_SWEATER_OUTFIT,
};

export function getXwearOutfitDefinition(outfitId: string) {
  return XWEAR_OUTFITS_BY_ID[outfitId] ?? null;
}

export function getApprovedXwearOutfitDefinitions() {
  return Object.values(XWEAR_OUTFITS_BY_ID).filter(
    (outfit) => outfit.qa.status === "approved",
  );
}

type XwearGameObject = {
  Guid: string;
  Name: string;
  Transform: {
    LocalPosition: { x: number; y: number; z: number };
    LocalRotation: { x: number; y: number; z: number; w: number };
    LocalScale: { x: number; y: number; z: number };
  };
  Children?: XwearGameObject[];
};

type XwearRendererComponent = {
  $type?: string;
  Bones: Array<{ Index: number; BoneGuid: string }>;
  RefMaterialGuids: string[];
};

type XwearResource = {
  RootGameObject: XwearGameObject;
  Components: XwearRendererComponent[];
};

type XwearShaderTextureProperty = {
  PropertyName?: string;
  TextureGuid?: string;
};

const avatarBindPoseCache = new WeakMap<
  THREE.Object3D,
  Map<string, THREE.Matrix4>
>();

export function captureXwearAvatarBindPose(avatarScene: THREE.Object3D) {
  avatarScene.updateMatrixWorld(true);
  const avatarWorldInverse = avatarScene.matrixWorld.clone().invert();
  const bindPose = new Map<string, THREE.Matrix4>();
  avatarScene.traverse((object) => {
    if (!(object instanceof THREE.Bone)) return;
    bindPose.set(
      object.name,
      avatarWorldInverse.clone().multiply(object.matrixWorld),
    );
  });
  for(const [alias,nativeName] of Object.entries(avatarScene.userData.sunnyHumanoidBoneNames ?? {})) {
    const matrix=bindPose.get(THREE.PropertyBinding.sanitizeNodeName(nativeName as string));if(matrix)bindPose.set(alias,matrix.clone());
  }
  avatarBindPoseCache.set(avatarScene, bindPose);
  console.log(
    ` 🎮 [companion-wardrobe-lab] avatar_bind_pose captured bones=${bindPose.size}`,
  );
  return bindPose;
}

export function resolveXwearArchiveFiles(
  archiveEntries: Record<string, Uint8Array>,
) {
  let mesh: Uint8Array | undefined;
  let resource: Uint8Array | undefined;
  let item: Uint8Array | undefined;
  const textures = new Map<string, Uint8Array>();
  for (const [archivePath, bytes] of Object.entries(archiveEntries)) {
    const normalizedPath = archivePath.replaceAll("\\", "/");
    if (normalizedPath.startsWith("Mesh/") && !mesh) mesh = bytes;
    if (normalizedPath.startsWith("Body/XResources/") && !resource) {
      resource = bytes;
    }
    if (normalizedPath === "Body/XItem.json/XItem.json") item = bytes;
    const textureMatch = normalizedPath.match(/^Textures\/([^/]+)\.png$/i);
    if (textureMatch?.[1]) textures.set(textureMatch[1], bytes);
  }
  if (!mesh) throw new Error("XWear archive has no mesh");
  if (!resource) throw new Error("XWear archive has no skeleton resource");
  if (!item) throw new Error("XWear archive has no item metadata");
  return { mesh, resource, item, textures };
}

export type XwearItemMetadata = {
  XResourceMaterials: Array<{
    Guid: string;
    ShaderProperties: XwearShaderTextureProperty[];
  }>;
};

function collectGameObjects(root: XwearGameObject) {
  const names = new Map<string, string>();
  const objects = new Map<string, XwearGameObject>();
  const parents = new Map<string, string>();
  const pending: Array<{ object: XwearGameObject; parentGuid?: string }> = [{ object: root }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    names.set(current.object.Guid, current.object.Name);
    objects.set(current.object.Guid, current.object);
    if (current.parentGuid) parents.set(current.object.Guid, current.parentGuid);
    pending.push(
      ...(current.object.Children ?? []).map((child) => ({
        object: child,
        parentGuid: current.object.Guid,
      })),
    );
  }
  return { names, objects, parents };
}

function loadTexture(url: string) {
  return new THREE.TextureLoader().loadAsync(url).then((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  });
}

async function loadTextureBytes(bytes: Uint8Array) {
  const imageBytes = bytes.slice().buffer;
  const objectUrl = URL.createObjectURL(new Blob([imageBytes], { type: "image/png" }));
  try {
    return await loadTexture(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function resolveXwearMainTextureGuids(
  item: XwearItemMetadata,
  materialGuids: readonly string[],
) {
  return materialGuids.map((materialGuid) => {
    const material = item.XResourceMaterials.find(
      (candidate) => candidate.Guid === materialGuid,
    );
    const mainTexture = material?.ShaderProperties.find(
      (property) => property.PropertyName === "_MainTex",
    )?.TextureGuid;
    if (!mainTexture) {
      throw new Error(`XWear material ${materialGuid} has no main texture`);
    }
    return mainTexture;
  });
}

export function setVrmBaseClothingVisible(
  scene: THREE.Object3D,
  visible: boolean,
  categories: readonly XwearBaseClothingCategory[] = [
    "top",
    "bottom",
    "onepiece",
  ],
  outfitId?: string,
) {
  const selectedCategories = new Set(categories);
  let changed = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const explicitRole = material.userData.sunnyClothingCategory;
      const isReplaceableClothing = scene.userData.sunnyWardrobe
        ? selectedCategories.has(explicitRole) || (outfitId!==undefined && material.userData.sunnyCoveredByOutfit===outfitId)
        : (selectedCategories.has("top") && material.name.includes("Tops_")) ||
        (selectedCategories.has("bottom") && material.name.includes("Bottoms_")) ||
        (selectedCategories.has("onepiece") && material.name.includes("Onepiece_"));
      if (isReplaceableClothing) {
        material.visible = visible;
        changed += 1;
      }
    }
  });
  console.log(
    ` 🎮 [companion-wardrobe-lab] base_clothing visibility=${visible} materials=${changed}`,
  );
}

export function bindSkinnedMeshInAvatarSpace(
  avatarScene: THREE.Object3D,
  garment: THREE.SkinnedMesh,
  skeleton: THREE.Skeleton,
) {
  avatarScene.add(garment);
  avatarScene.updateMatrixWorld(true);
  garment.bind(skeleton, garment.matrixWorld.clone());
}

export function createCurrentPoseSkeleton(bones: THREE.Bone[]) {
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  return skeleton;
}

export function createBindPoseSkeleton(
  bones: THREE.Bone[],
  boneBindWorldMatrices: readonly THREE.Matrix4[],
) {
  if (bones.length !== boneBindWorldMatrices.length) {
    throw new Error("Garment bones and bind matrices must have matching lengths");
  }
  return new THREE.Skeleton(
    bones,
    boneBindWorldMatrices.map((matrix) => matrix.clone().invert()),
  );
}

export function applyGarmentSurfaceOffset(
  positions: Float32Array,
  normals: Float32Array,
  offset: number,
) {
  if (positions.length !== normals.length) {
    throw new Error("Garment positions and normals must have matching lengths");
  }
  const adjusted = positions.slice();
  if (offset === 0) return adjusted;
  for (let index = 0; index < adjusted.length; index += 3) {
    const normalX = normals[index] ?? 0;
    const normalY = normals[index + 1] ?? 0;
    const normalZ = normals[index + 2] ?? 0;
    const normalLength = Math.hypot(normalX, normalY, normalZ);
    if (normalLength <= Number.EPSILON) continue;
    adjusted[index] += (normalX / normalLength) * offset;
    adjusted[index + 1] += (normalY / normalLength) * offset;
    adjusted[index + 2] += (normalZ / normalLength) * offset;
  }
  return adjusted;
}

export function fitGarmentToAvatarProportions(
  positions: Float32Array,
  sourceHips: THREE.Vector3,
  sourceNeck: THREE.Vector3,
  targetHips: THREE.Vector3,
  targetNeck: THREE.Vector3,
) {
  const sourceTorsoLength = sourceHips.distanceTo(sourceNeck);
  const targetTorsoLength = targetHips.distanceTo(targetNeck);
  if (sourceTorsoLength <= Number.EPSILON || targetTorsoLength <= Number.EPSILON) {
    throw new Error("Garment fit anchors must have non-zero torso length");
  }
  const scale = THREE.MathUtils.clamp(
    targetTorsoLength / sourceTorsoLength,
    0.75,
    1.35,
  );
  const fittedPositions = new Float32Array(positions.length);
  const sourcePosition = new THREE.Vector3();
  for (let index = 0; index < positions.length; index += 3) {
    sourcePosition
      .fromArray(positions, index)
      .sub(sourceHips)
      .multiplyScalar(scale)
      .add(targetHips)
      .toArray(fittedPositions, index);
  }
  return { positions: fittedPositions, scale };
}

export function retargetGarmentVerticesToAvatarBindPose(args: {
  positions: Float32Array;
  normals: Float32Array;
  boneIndices: ArrayLike<number>;
  boneWeights: ArrayLike<number>;
  sourceBindWorldMatrices: readonly THREE.Matrix4[];
  targetBindWorldMatrices: readonly THREE.Matrix4[];
  coordinateRotationY?: number;
  reflectZ?: boolean;
  fitScale?: number;
  crossSectionScale?: number;
  boneNames?: readonly string[];
  bodyHeightMap?: {sourceY:number;targetY:number;scale:number};
}) {
  if (args.positions.length !== args.normals.length) {
    throw new Error("Garment positions and normals must have matching lengths");
  }
  if (args.boneIndices.length !== args.boneWeights.length) {
    throw new Error("Garment bone indices and weights must have matching lengths");
  }
  const rotation = new THREE.Matrix4().makeRotationY(args.coordinateRotationY ?? 0);
  if (args.reflectZ) rotation.scale(new THREE.Vector3(1, 1, -1));
  const boneDeltas = args.sourceBindWorldMatrices.map((sourceBind, index) => {
    const targetBind = args.targetBindWorldMatrices[index];
    if (!targetBind) throw new Error(`Garment target bind is missing joint ${index}`);
    const source = new THREE.Vector3().setFromMatrixPosition(sourceBind);
    const target = new THREE.Vector3().setFromMatrixPosition(targetBind);
    const lengthScale=args.fitScale??1,cross=args.crossSectionScale??lengthScale;
    if(!(cross>0&&Number.isFinite(cross)))throw new Error('Invalid garment cross-section scale');
    const arm=/_(UpperArm|LowerArm|Hand|Shoulder)$/.test(args.boneNames?.[index]??'');
    const scale=arm?new THREE.Vector3(lengthScale,cross,cross):new THREE.Vector3(cross,lengthScale,cross);
    if(args.bodyHeightMap&&/(Hips|UpperLeg|LowerLeg|Foot|Toes)$/.test(args.boneNames?.[index]??'')){const map=args.bodyHeightMap;target.y=map.targetY+(source.y-map.sourceY)*map.scale;scale.y=map.scale;}
    return new THREE.Matrix4().makeTranslation(target.x, target.y, target.z)
      .multiply(rotation).scale(scale)
      .multiply(new THREE.Matrix4().makeTranslation(-source.x, -source.y, -source.z));
  });
  const normalDeltas = boneDeltas.map((delta) =>
    new THREE.Matrix3().getNormalMatrix(delta),
  );
  const positions = new Float32Array(args.positions.length);
  const normals = new Float32Array(args.normals.length);
  const sourcePosition = new THREE.Vector3();
  const sourceNormal = new THREE.Vector3();
  const transformed = new THREE.Vector3();
  const accumulatedPosition = new THREE.Vector3();
  const accumulatedNormal = new THREE.Vector3();
  for (let vertexIndex = 0; vertexIndex < args.positions.length / 3; vertexIndex += 1) {
    sourcePosition.fromArray(args.positions, vertexIndex * 3);
    sourceNormal.fromArray(args.normals, vertexIndex * 3);
    accumulatedPosition.set(0, 0, 0);
    accumulatedNormal.set(0, 0, 0);
    let totalWeight = 0;
    for (let influence = 0; influence < 4; influence += 1) {
      const weightIndex = vertexIndex * 4 + influence;
      const weight = args.boneWeights[weightIndex] ?? 0;
      if (weight <= 0) continue;
      const boneIndex = args.boneIndices[weightIndex] ?? 0;
      const positionDelta = boneDeltas[boneIndex];
      const normalDelta = normalDeltas[boneIndex];
      if (!positionDelta || !normalDelta) continue;
      accumulatedPosition.add(
        transformed.copy(sourcePosition).applyMatrix4(positionDelta).multiplyScalar(weight),
      );
      accumulatedNormal.add(
        transformed.copy(sourceNormal).applyMatrix3(normalDelta).multiplyScalar(weight),
      );
      totalWeight += weight;
    }
    if (totalWeight <= Number.EPSILON) {
      accumulatedPosition.copy(sourcePosition);
      accumulatedNormal.copy(sourceNormal);
    } else if (Math.abs(totalWeight - 1) > 0.000001) {
      accumulatedPosition.divideScalar(totalWeight);
      accumulatedNormal.divideScalar(totalWeight);
    }
    accumulatedPosition.toArray(positions, vertexIndex * 3);
    accumulatedNormal.normalize().toArray(normals, vertexIndex * 3);
  }
  return { positions, normals };
}

export function resolveGarmentBoneLocalMatrix(
  childBindPose: ArrayLike<number>,
  parentBindPose: ArrayLike<number>,
  fitScale: number,
) {
  const childWorld = new THREE.Matrix4().fromArray(childBindPose).invert();
  const parentWorld = new THREE.Matrix4().fromArray(parentBindPose).invert();
  const local = parentWorld.clone().invert().multiply(childWorld);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  local.decompose(position, rotation, scale);
  position.multiplyScalar(fitScale);
  return new THREE.Matrix4().compose(position, rotation, scale);
}

export type GarmentClearancePlane={vertices?:number[];normal:[number,number,number];offset:number;fromY:number;toY:number};
export function applyGarmentClearancePlanes(positions:Float32Array,planes:readonly GarmentClearancePlane[]){
 const result=positions.slice();
 for(const plane of planes){
  const selected=plane.vertices?new Set(plane.vertices):undefined;
  const normal=new THREE.Vector3(...plane.normal);if(Math.abs(normal.length()-1)>1e-5||plane.toY<=plane.fromY)throw new Error('Invalid garment clearance plane');
  for(let v=0;v<result.length;v+=3){if(selected&&!selected.has(v/3))continue;const point=new THREE.Vector3().fromArray(result,v),distance=normal.dot(point)-plane.offset;
   if(distance<=0)continue;const t=Math.max(0,Math.min(1,(point.y-plane.fromY)/(plane.toY-plane.fromY)));
   point.addScaledVector(normal,-distance*t*t*(3-2*t)).toArray(result,v);
  }
 }
 return result;
}

export function conformXwearGarmentToBody(positions:Float32Array,scene:THREE.Object3D,materialNames:readonly string[]){
 const surfaces:THREE.Mesh[]=[],material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 scene.updateMatrixWorld(true);const inverse=scene.matrixWorld.clone().invert();
 try{
  scene.traverse(object=>{
   if(!(object instanceof THREE.Mesh)||object.name.startsWith('sunny-wardrobe-downloaded-'))return;
   const materials=Array.isArray(object.material)?object.material:[object.material];
   if(!materials.some(m=>m.visible&&(materialNames.includes(m.name)||m.userData.sunnyClothingCategory==='bottom')))return;
   const geometry=object.geometry.clone(),attribute=geometry.getAttribute('position'),point=new THREE.Vector3();
   for(let v=0;v<attribute.count;v++){
    point.fromBufferAttribute(attribute,v);if(object instanceof THREE.SkinnedMesh)object.applyBoneTransform(v,point);
    point.applyMatrix4(object.matrixWorld).applyMatrix4(inverse);attribute.setXYZ(v,point.x,point.y,point.z);
   }
   geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld(true);surfaces.push(mesh);
  });
  if(!surfaces.length)throw new Error('No original body surfaces for garment clearance');
  const bounds=new THREE.Box3();for(const surface of surfaces)bounds.expandByObject(surface);
  const center=bounds.getCenter(new THREE.Vector3()),extent=bounds.getSize(new THREE.Vector3()).length()+1,ray=new THREE.Raycaster(),result=positions.slice();let moved=0;
  for(let v=0;v<result.length;v+=3){
   ray.set(new THREE.Vector3(result[v],result[v+1],center.z-extent),new THREE.Vector3(0,0,1));
   const back=ray.intersectObjects(surfaces,false)[0];
   ray.set(new THREE.Vector3(result[v],result[v+1],center.z+extent),new THREE.Vector3(0,0,-1));
   const front=ray.intersectObjects(surfaces,false)[0];
   if(!back||!front)continue;
   const low=back.point.z-.008,high=front.point.z+.008,z=result[v+2];
   if(z>low&&z<high){result[v+2]=z-low<high-z?low:high;moved++;}
  }
  console.log(` 🎮 [wardrobe-prepare] surface_clearance adjusted=${moved} total=${positions.length/3}`);
  return result;
 }finally{for(const mesh of surfaces)mesh.geometry.dispose();material.dispose();}
}

export function resolveXwearFitPose(bind:Map<string,THREE.Matrix4>,anchors:Record<string,number[]>={}){
 const fit=new Map([...bind].map(([name,matrix])=>[name,matrix.clone()]));
 for(const [name,position] of Object.entries(anchors)){
  if(!fit.has(name)||position.length!==3||position.some(n=>!Number.isFinite(n)))throw new Error(`Invalid anatomical fit anchor ${name}`);
  fit.get(name)!.setPosition(new THREE.Vector3().fromArray(position));
 }
 return fit;
}

export async function attachXwearOutfit(
  avatarScene: THREE.Object3D,
  outfit: XwearOutfitDefinition,
  materialVariant?: XwearMaterialVariant | null,
  modelUrl?: string,
) {
  if (modelUrl) {
    const prepared = resolvePreparedGarment(modelUrl, outfit.id);
    if (prepared) {
      const garment = await loadPreparedGarment(avatarScene, prepared, materialVariant);
      setVrmBaseClothingVisible(avatarScene, false, outfit.slots.replaces, outfit.id);
      return garment;
    }
  }
  const cachedAvatarBindPose =
    avatarBindPoseCache.get(avatarScene) ?? captureXwearAvatarBindPose(avatarScene);
  const avatarBindPose = new Map(
    [...cachedAvatarBindPose].map(([name, matrix]) => [name, matrix.clone()]),
  );
  const urls = resolveXwearOutfitAssetUrls(outfit);
  let meshData: ReturnType<typeof parseXwearMesh>;
  let resource: XwearResource;
  let item: XwearItemMetadata;
  let archivedTextures: Map<string, Uint8Array> | null = null;
  if (outfit.archiveUrl) {
    const archiveResponse = await fetch(outfit.archiveUrl);
    if (!archiveResponse.ok) {
      throw new Error(`XWear archive failed to load (${archiveResponse.status})`);
    }
    const archive = resolveXwearArchiveFiles(
      unzipSync(new Uint8Array(await archiveResponse.arrayBuffer())),
    );
    meshData = parseXwearMesh(
      archive.mesh.buffer.slice(
        archive.mesh.byteOffset,
        archive.mesh.byteOffset + archive.mesh.byteLength,
      ) as ArrayBuffer,
    );
    const decoder = new TextDecoder();
    resource = JSON.parse(decoder.decode(archive.resource)) as XwearResource;
    item = JSON.parse(decoder.decode(archive.item)) as XwearItemMetadata;
    archivedTextures = archive.textures;
  } else {
    const [meshResponse, resourceResponse, itemResponse] = await Promise.all([
      fetch(urls.meshUrl),
      fetch(urls.resourceUrl),
      fetch(urls.itemUrl),
    ]);
    if (!meshResponse.ok) {
      throw new Error(`Dress mesh failed to load (${meshResponse.status})`);
    }
    if (!resourceResponse.ok) {
      throw new Error(`Dress skeleton failed to load (${resourceResponse.status})`);
    }
    if (!itemResponse.ok) {
      throw new Error(`Dress materials failed to load (${itemResponse.status})`);
    }
    meshData = parseXwearMesh(await meshResponse.arrayBuffer());
    resource = (await resourceResponse.json()) as XwearResource;
    item = (await itemResponse.json()) as XwearItemMetadata;
  }
  const renderer = resource.Components.find((component) =>
    component.$type?.includes("XResourceSkinnedMeshRenderer"),
  );
  if (!renderer) throw new Error("Dress has no skinned-mesh renderer metadata");
  const textures = await Promise.all(
    resolveXwearMainTextureGuids(item, renderer.RefMaterialGuids).map(
      (textureGuid) => {
        const archivedTexture = archivedTextures?.get(textureGuid);
        if (archivedTextures && !archivedTexture) {
          throw new Error(`XWear archive is missing texture ${textureGuid}`);
        }
        return archivedTexture
          ? loadTextureBytes(archivedTexture)
          : loadTexture(`${urls.textureRoot}/${textureGuid}.png`);
      },
    ),
  );

  const hierarchy = collectGameObjects(resource.RootGameObject);
  const garmentBoneNames = new Map(
    renderer.Bones.map((bone) => [bone.Index, hierarchy.names.get(bone.BoneGuid) ?? ""]),
  );
  const garmentBoneGuids = new Map(
    renderer.Bones.map((bone) => [bone.Index, bone.BoneGuid]),
  );
  const garmentBoneIndicesByGuid = new Map(
    renderer.Bones.map((bone) => [bone.BoneGuid, bone.Index]),
  );
  const sourceBoneMatrices = meshData.bindPoses.map((bindPose) =>
    new THREE.Matrix4().fromArray(bindPose).invert(),
  );
  const avatarFitPose=resolveXwearFitPose(avatarBindPose,avatarScene.userData.sunnyGarmentAnchors);
  const avatarCanonicalBonesByName = new Map<string, THREE.Bone>();
  avatarScene.traverse((object) => {
    if (
      object instanceof THREE.Bone &&
      isXwearCanonicalSkeletonBone(object.name)
    ) {
      avatarCanonicalBonesByName.set(object.name, object);
    }
  });

  for(const [alias,nativeName] of Object.entries(avatarScene.userData.sunnyHumanoidBoneNames ?? {})){
    const bone=avatarScene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(nativeName as string));if(bone instanceof THREE.Bone)avatarCanonicalBonesByName.set(alias,bone);
  }
  const hips = avatarCanonicalBonesByName.get("J_Bip_C_Hips");
  if (!hips) throw new Error("Avatar does not use the VRoid XWear skeleton");
  const sourceHipsIndex = [...garmentBoneNames].find(
    ([, name]) => name === "J_Bip_C_Hips",
  )?.[0];
  const sourceNeckIndex = [...garmentBoneNames].find(
    ([, name]) => name === "J_Bip_C_Neck",
  )?.[0];
  const sourceHipsMatrix = sourceHipsIndex !== undefined
    ? sourceBoneMatrices[sourceHipsIndex]
    : undefined;
  const sourceNeckMatrix = sourceNeckIndex !== undefined
    ? sourceBoneMatrices[sourceNeckIndex]
    : undefined;
  const targetHipsMatrix = avatarFitPose.get("J_Bip_C_Hips");
  const targetNeckMatrix = avatarFitPose.get("J_Bip_C_Neck");
  if (
    !sourceHipsMatrix ||
    !sourceNeckMatrix ||
    !targetHipsMatrix ||
    !targetNeckMatrix
  ) {
    throw new Error("XWear outfit or avatar is missing hips/neck fit anchors");
  }
  const fitted = fitGarmentToAvatarProportions(
    meshData.positions,
    new THREE.Vector3().setFromMatrixPosition(sourceHipsMatrix),
    new THREE.Vector3().setFromMatrixPosition(sourceNeckMatrix),
    new THREE.Vector3().setFromMatrixPosition(targetHipsMatrix),
    new THREE.Vector3().setFromMatrixPosition(targetNeckMatrix),
  );
  // Bind clothing helpers to a stable humanoid ancestor instead of adding
  // duplicate exporter-specific helper chains to the live companion skeleton.
  const sourceAnchors = meshData.bindPoses.map((_, index) => {
    let guid = garmentBoneGuids.get(index);
    for (let depth = 0; depth < 10 && guid; depth++) {
      const name = hierarchy.names.get(guid) ?? "";
      const anchorIndex = garmentBoneIndicesByGuid.get(guid);
      if (avatarCanonicalBonesByName.has(name) && anchorIndex !== undefined) return {name, index:anchorIndex};
      guid = hierarchy.parents.get(guid);
    }
    if (meshData.boneIndices.some((joint, influence) => joint === index && meshData.boneWeights[influence] > 0)) {
      throw new Error(`Unmapped active garment bone ${garmentBoneNames.get(index)} after 10 ancestor steps`);
    }
    return {name: "J_Bip_C_Hips", index: sourceHipsIndex!};
  });
  const bones = sourceAnchors.map(anchor => avatarCanonicalBonesByName.get(anchor.name)!);
  const boneBindLocalMatrices = sourceAnchors.map(anchor => avatarBindPose.get(anchor.name)!.clone());
  const sourceBindLocalMatrices = sourceAnchors.map(anchor => sourceBoneMatrices[anchor.index]);
  const boneBindWorldMatrices = boneBindLocalMatrices.map(matrix => avatarScene.matrixWorld.clone().multiply(matrix));
  const sourceLeft = [...garmentBoneNames].find(([,name]) => name === "J_Bip_L_UpperArm")?.[0];
  const targetLeft = avatarBindPose.get("J_Bip_L_UpperArm");
  if (sourceLeft === undefined || !targetLeft) throw new Error("Garment coordinate orientation requires left upper-arm anchors");
  const coordinateRotationY = sourceBoneMatrices[sourceLeft].elements[12] * targetLeft.elements[12] < 0 ? Math.PI : 0;
  const cross=avatarScene.userData.sunnyGarmentCrossSectionScales?.[outfit.id]??fitted.scale;
  const retargeted = retargetGarmentVerticesToAvatarBindPose({
    positions: meshData.positions,
    normals: meshData.normals,
    boneIndices: meshData.boneIndices,
    boneWeights: meshData.boneWeights,
    sourceBindWorldMatrices: sourceBindLocalMatrices,
    coordinateRotationY,
    reflectZ: true,
    fitScale: fitted.scale,
    crossSectionScale: cross,
    bodyHeightMap: avatarScene.userData.sunnyGarmentAnchors?{sourceY:sourceHipsMatrix.elements[13],targetY:targetHipsMatrix.elements[13],scale:fitted.scale}:undefined,
    boneNames: sourceAnchors.map(anchor=>anchor.name),
    targetBindWorldMatrices: sourceAnchors.map(anchor=>avatarFitPose.get(anchor.name)!),
  });
  if(avatarScene.userData.sunnyGarmentSurfaceMaterials){setVrmBaseClothingVisible(avatarScene,false,outfit.slots.replaces,outfit.id);retargeted.positions=conformXwearGarmentToBody(retargeted.positions,avatarScene,avatarScene.userData.sunnyGarmentSurfaceMaterials);}
  if(avatarScene.userData.sunnyGarmentClearancePlanes?.[outfit.id])retargeted.positions=applyGarmentClearancePlanes(retargeted.positions,avatarScene.userData.sunnyGarmentClearancePlanes[outfit.id]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      applyGarmentSurfaceOffset(
        retargeted.positions,
        retargeted.normals,
        outfit.surfaceOffset ?? 0,
      ),
      3,
    ),
  );
  geometry.setAttribute("normal", new THREE.BufferAttribute(retargeted.normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(meshData.uv0, 2));
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(new Uint16Array(meshData.boneIndices), 4),
  );
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(meshData.boneWeights, 4));

  const indexCount = meshData.submeshes.reduce(
    (total, submesh) => total + submesh.indices.length,
    0,
  );
  const indices = new Uint32Array(indexCount);
  let indexOffset = 0;
  meshData.submeshes.forEach((submesh, materialIndex) => {
    indices.set(submesh.indices, indexOffset);
    geometry.addGroup(indexOffset, submesh.indices.length, materialIndex);
    indexOffset += submesh.indices.length;
  });
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    [indices[triangle + 1], indices[triangle + 2]] = [indices[triangle + 2], indices[triangle + 1]];
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  if(outfit.pocketLining)addGarmentPocketLinings(geometry,outfit.pocketLining);
  if(avatarScene.userData.sunnyGarmentSurfaceMaterials)geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const materials = textures.map(
    (map) =>
      new THREE.MeshBasicMaterial({
        map,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      }),
  );
  const resolvedMaterials = materialVariant
    ? applyXwearMaterialVariant(materials, materialVariant)
    : materials;
  if (materialVariant) {
    materials.forEach((material) => material.dispose());
  }
  const dress = new THREE.SkinnedMesh(geometry, resolvedMaterials);
  dress.name = `sunny-wardrobe-downloaded-${outfit.id}`;
  dress.frustumCulled = false;
  bindSkinnedMeshInAvatarSpace(
    avatarScene,
    dress,
    createBindPoseSkeleton(bones, boneBindWorldMatrices),
  );
  setVrmBaseClothingVisible(
    avatarScene,
    false,
    outfit.slots.replaces,
    outfit.id,
  );
  console.log(
    ` 🎮 [companion-wardrobe-lab] downloaded_outfit applied outfit=${outfit.id} variant=${materialVariant?.id ?? "base"} vertices=${meshData.vertexCount} fit_scale=${fitted.scale.toFixed(4)} surface_offset=${outfit.surfaceOffset ?? 0}`,
  );
  return dress;
}
