import * as THREE from "three";
// Reuse the ZIP reader Three bundles for its own loaders.
import { unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { parseXwearMesh } from "./xwearMesh";

export type XwearOutfitDefinition = {
  id: string;
  assetRoot: string;
  meshPath: string;
  resourcePath: string;
  itemPath: string;
  archiveUrl?: string;
  surfaceOffset?: number;
  volumeScale?: { x: number; y: number; z: number };
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
      approvedAvatarUrls: readonly string[];
      unsupportedAnimations?: readonly string[];
    };

export type XwearMaterialVariant = {
  id: string;
  tint: string;
};

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
  return (
    outfit.qa.status === "approved" &&
    outfit.qa.approvedAvatarUrls.includes(avatarUrl)
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
    "/@fs/Users/jamaltaylor/Development/sunny-companion-wardrobe-sandbox/.sunny-sandbox/wardrobe/sleeveless-dress/unpacked",
  meshPath: "Mesh/dress.mesh.bin",
  resourcePath: "Body/XResources/dress-resource.json",
  itemPath: "Body/XItem.json/dress-item.json",
  archiveUrl:
    "/@fs/Users/jamaltaylor/Development/sunny-companion-wardrobe-sandbox/.sunny-sandbox/wardrobe/sleeveless-dress/sleeveless_dress_Free.xwear",
  surfaceOffset: 0.025,
  slots: {
    occupies: ["onepiece"],
    replaces: ["top", "bottom", "onepiece"],
  },
  qa: {
    status: "approved",
    approvedAvatarUrls: ["/companions/sample.vrm"],
    unsupportedAnimations: ["sitting"],
  },
};

export const COMET_HOODIE_OUTFIT: XwearOutfitDefinition = {
  id: "comet-hoodie",
  assetRoot:
    "/@fs/Users/jamaltaylor/Development/sunny-companion-wardrobe-sandbox/.sunny-sandbox/wardrobe/vroid-hoodie",
  meshPath: "Mesh/b437b86c-152c-49ab-8342-1e72aee49d87",
  resourcePath: "Body/XResources/9f9bd7fa-42bb-4ff2-88af-e80d3570e171",
  itemPath: "Body/XItem.json/XItem.json",
  archiveUrl:
    "/@fs/Users/jamaltaylor/Development/sunny-companion-wardrobe-sandbox/.sunny-sandbox/wardrobe/vroid-hoodie/sunny-hoodie-neutral.xwear",
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
    "/@fs/Users/jamaltaylor/Development/sunny-companion-wardrobe-sandbox/.sunny-sandbox/wardrobe/vroid-blazer",
  meshPath: "Mesh/06cf93df-cfaf-469c-a65d-ad55d477984d",
  resourcePath: "Body/XResources/be8c7960-f0a3-4493-8d2b-f0eb6c2a6c07",
  itemPath: "Body/XItem.json/XItem.json",
  archiveUrl:
    "/@fs/Users/jamaltaylor/Development/sunny-companion-wardrobe-sandbox/.sunny-sandbox/wardrobe/vroid-blazer/sunny-blazer.xwear",
  surfaceOffset: 0.02,
  volumeScale: { x: 0.84, y: 0.9, z: 0.82 },
  slots: {
    occupies: ["top"],
    replaces: ["top"],
  },
  qa: {
    status: "approved",
    approvedAvatarUrls: ["/companions/sample.vrm"],
    unsupportedAnimations: ["sitting"],
  },
};

export const CELTIC_SWEATER_OUTFIT: XwearOutfitDefinition = {
  id: "celtic-sweater",
  assetRoot:
    "/@fs/Users/jamaltaylor/Development/sunny-companion-wardrobe-sandbox/.sunny-sandbox/wardrobe/celtic-sweater",
  meshPath: "Mesh/dde76183-4b1c-4298-b115-5a82364cbaa6",
  resourcePath: "Body/XResources/0e82dcce-9eba-4418-872d-9d3c312511f0",
  itemPath: "Body/XItem.json/XItem.json",
  archiveUrl:
    "/@fs/Users/jamaltaylor/Development/sunny-companion-wardrobe-sandbox/.sunny-sandbox/wardrobe/celtic-sweater/Celtic_Holiday_V1_Blue.xwear",
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
) {
  const selectedCategories = new Set(categories);
  let changed = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const isReplaceableClothing =
        (selectedCategories.has("top") && material.name.includes("Tops_")) ||
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

export function adjustGarmentVolumeAroundBones(args: {
  positions: Float32Array;
  boneIndices: ArrayLike<number>;
  boneWeights: ArrayLike<number>;
  boneBindMatrices: readonly THREE.Matrix4[];
  scale: { x: number; y: number; z: number };
}) {
  const vertexCount = args.positions.length / 3;
  if (
    args.boneIndices.length !== vertexCount * 4 ||
    args.boneWeights.length !== vertexCount * 4
  ) {
    throw new Error("Garment volume adjustment requires four bone weights per vertex");
  }

  const adjusted = args.positions.slice();
  const position = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const weightOffset = vertexIndex * 4;
    let dominantBoneIndex = args.boneIndices[weightOffset] ?? 0;
    let dominantWeight = args.boneWeights[weightOffset] ?? 0;
    for (let influence = 1; influence < 4; influence += 1) {
      const weight = args.boneWeights[weightOffset + influence] ?? 0;
      if (weight > dominantWeight) {
        dominantWeight = weight;
        dominantBoneIndex = args.boneIndices[weightOffset + influence] ?? 0;
      }
    }
    const bindMatrix = args.boneBindMatrices[dominantBoneIndex];
    if (!bindMatrix) continue;
    anchor.setFromMatrixPosition(bindMatrix);
    position
      .fromArray(adjusted, vertexIndex * 3)
      .sub(anchor)
      .multiply(args.scale)
      .add(anchor)
      .toArray(adjusted, vertexIndex * 3);
  }
  return adjusted;
}

export function retargetGarmentVerticesToAvatarBindPose(args: {
  positions: Float32Array;
  normals: Float32Array;
  boneIndices: ArrayLike<number>;
  boneWeights: ArrayLike<number>;
  sourceBindWorldMatrices: readonly THREE.Matrix4[];
  targetBindWorldMatrices: readonly THREE.Matrix4[];
}) {
  if (args.positions.length !== args.normals.length) {
    throw new Error("Garment positions and normals must have matching lengths");
  }
  if (args.boneIndices.length !== args.boneWeights.length) {
    throw new Error("Garment bone indices and weights must have matching lengths");
  }
  const boneDeltas = args.sourceBindWorldMatrices.map((sourceBind, index) =>
    (args.targetBindWorldMatrices[index] ?? new THREE.Matrix4())
      .clone()
      .multiply(sourceBind.clone().invert()),
  );
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

export async function attachXwearOutfit(
  avatarScene: THREE.Object3D,
  outfit: XwearOutfitDefinition,
  materialVariant?: XwearMaterialVariant | null,
) {
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
  const avatarCanonicalBonesByName = new Map<string, THREE.Bone>();
  avatarScene.traverse((object) => {
    if (
      object instanceof THREE.Bone &&
      isXwearCanonicalSkeletonBone(object.name)
    ) {
      avatarCanonicalBonesByName.set(object.name, object);
    }
  });

  const hips = avatarCanonicalBonesByName.get("J_Bip_C_Hips");
  if (!hips) throw new Error("Avatar does not use the VRoid XWear skeleton");
  const sourceHipsIndex = [...garmentBoneNames].find(
    ([, name]) => name === hips.name,
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
  const targetHipsMatrix = avatarBindPose.get(hips.name);
  const targetNeckMatrix = avatarBindPose.get("J_Bip_C_Neck");
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
  const garmentBonesByName = new Map(avatarCanonicalBonesByName);
  const garmentBindPoseByName = new Map(
    [...avatarBindPose]
      .filter(([name]) => isXwearCanonicalSkeletonBone(name))
      .map(([name, matrix]) => [name, matrix.clone()]),
  );

  const activeBoneIndices = new Set<number>();
  for (let index = 0; index < meshData.boneWeights.length; index += 1) {
    if ((meshData.boneWeights[index] ?? 0) > 0.000001) {
      activeBoneIndices.add(meshData.boneIndices[index] ?? 1);
    }
  }

  const requiredBoneIndices = new Set(activeBoneIndices);
  for (let pass = 0; pass < 10; pass += 1) {
    for (const index of [...requiredBoneIndices]) {
      const guid = garmentBoneGuids.get(index);
      const parentGuid = guid ? hierarchy.parents.get(guid) : undefined;
      const parentIndex = parentGuid
        ? garmentBoneIndicesByGuid.get(parentGuid)
        : undefined;
      if (parentIndex !== undefined) requiredBoneIndices.add(parentIndex);
    }
  }
  const unresolved = new Set(
    [...requiredBoneIndices].filter((index) => {
      const name = garmentBoneNames.get(index) ?? "";
      return (
        name &&
        (!isXwearCanonicalSkeletonBone(name) || !garmentBonesByName.has(name))
      );
    }),
  );
  for (let pass = 0; pass < 10 && unresolved.size > 0; pass += 1) {
    for (const index of [...unresolved]) {
      const guid = garmentBoneGuids.get(index);
      const object = guid ? hierarchy.objects.get(guid) : undefined;
      const parentGuid = guid ? hierarchy.parents.get(guid) : undefined;
      const parentName = parentGuid ? hierarchy.names.get(parentGuid) : undefined;
      const parentBone = parentName ? garmentBonesByName.get(parentName) : undefined;
      const parentBindMatrix = parentName
        ? garmentBindPoseByName.get(parentName)
        : undefined;
      const parentIndex = parentGuid
        ? garmentBoneIndicesByGuid.get(parentGuid)
        : undefined;
      const childBindPose = meshData.bindPoses[index];
      const parentBindPose = parentIndex !== undefined
        ? meshData.bindPoses[parentIndex]
        : undefined;
      if (
        !object ||
        !parentBone ||
        !parentBindMatrix ||
        !childBindPose ||
        !parentBindPose
      ) continue;

      const bone = new THREE.Bone();
      bone.name = object.Name;
      const localBindMatrix = resolveGarmentBoneLocalMatrix(
        childBindPose,
        parentBindPose,
        fitted.scale,
      );
      localBindMatrix.decompose(
        bone.position,
        bone.quaternion,
        bone.scale,
      );
      parentBone.add(bone);
      garmentBonesByName.set(bone.name, bone);
      garmentBindPoseByName.set(
        bone.name,
        parentBindMatrix.clone().multiply(localBindMatrix),
      );
      unresolved.delete(index);
    }
  }
  avatarScene.updateMatrixWorld(true);

  const bones = Array.from({ length: meshData.bindPoses.length }, (_, index) => {
    const name = garmentBoneNames.get(index) ?? "";
    return garmentBonesByName.get(name) ?? hips;
  });
  const hipsBindMatrix = garmentBindPoseByName.get(hips.name);
  if (!hipsBindMatrix) throw new Error("Avatar bind pose has no hips matrix");
  const boneBindLocalMatrices = Array.from(
    { length: meshData.bindPoses.length },
    (_, index) => {
      const name = garmentBoneNames.get(index) ?? "";
      return (garmentBindPoseByName.get(name) ?? hipsBindMatrix).clone();
    },
  );
  const boneBindWorldMatrices = boneBindLocalMatrices.map((localBindMatrix) =>
    avatarScene.matrixWorld.clone().multiply(localBindMatrix),
  );
  const retargeted = retargetGarmentVerticesToAvatarBindPose({
    positions: meshData.positions,
    normals: meshData.normals,
    boneIndices: meshData.boneIndices,
    boneWeights: meshData.boneWeights,
    sourceBindWorldMatrices: sourceBoneMatrices,
    targetBindWorldMatrices: boneBindLocalMatrices,
  });
  const volumeAdjustedPositions = outfit.volumeScale
    ? adjustGarmentVolumeAroundBones({
        positions: retargeted.positions,
        boneIndices: meshData.boneIndices,
        boneWeights: meshData.boneWeights,
        boneBindMatrices: boneBindLocalMatrices,
        scale: outfit.volumeScale,
      })
    : retargeted.positions;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      applyGarmentSurfaceOffset(
        volumeAdjustedPositions,
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
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
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
  );
  console.log(
    ` 🎮 [companion-wardrobe-lab] downloaded_outfit applied outfit=${outfit.id} variant=${materialVariant?.id ?? "base"} vertices=${meshData.vertexCount} fit_scale=${fitted.scale.toFixed(4)} volume_scale=${outfit.volumeScale ? `${outfit.volumeScale.x},${outfit.volumeScale.y},${outfit.volumeScale.z}` : "1,1,1"} surface_offset=${outfit.surfaceOffset ?? 0}`,
  );
  return dress;
}
