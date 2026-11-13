import * as THREE from "three";

type IdentityCompositeVisibility = {
  hiddenStandardIdentityMaterials: number;
  hiddenSourceBodyMaterials: number;
  visibleSourceIdentityMaterials: number;
  transferredStandardBodyMaterials: number;
  maskedSourceMeshes: number;
};

type SkinMaterial = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
};

function materialsFor(object: THREE.Object3D): THREE.Material[] {
  const material = (object as THREE.Mesh).material;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function isIdentityMaterial(material: THREE.Material): boolean {
  const name = material.name.toUpperCase();
  return name.includes("FACE") || name.includes("EYE") || name.includes("HAIR");
}

function isIdentitySurfaceMaterial(material: THREE.Material): boolean {
  const name = material.name.toUpperCase();
  return name.includes("FACE") || name.includes("HAIR");
}

function isBodySkinMaterial(material: THREE.Material): boolean {
  const name = material.name.toUpperCase();
  return name.includes("BODY") && name.includes("SKIN");
}

function isBoneWithinHead(bone: THREE.Bone, identityHead: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = bone;
  while (current) {
    if (current === identityHead) return true;
    current = current.parent;
  }
  return false;
}

function headInfluenceForVertex(
  vertexIndex: number,
  skinIndex: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  skinWeight: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  headBoneIndices: ReadonlySet<number>,
): number {
  let influence = 0;
  for (let component = 0; component < Math.min(4, skinIndex.itemSize); component += 1) {
    const jointIndex = skinIndex.getComponent(vertexIndex, component);
    if (headBoneIndices.has(jointIndex)) {
      influence += skinWeight.getComponent(vertexIndex, component);
    }
  }
  return influence;
}

function maskSkinnedMeshToHead(
  mesh: THREE.SkinnedMesh,
  identityHead: THREE.Object3D,
): boolean {
  const skinIndex = mesh.geometry.getAttribute("skinIndex");
  const skinWeight = mesh.geometry.getAttribute("skinWeight");
  const position = mesh.geometry.getAttribute("position");
  if (!skinIndex || !skinWeight || !position) return false;

  const headBoneIndices = new Set<number>();
  mesh.skeleton.bones.forEach((bone, index) => {
    if (isBoneWithinHead(bone, identityHead)) headBoneIndices.add(index);
  });
  if (headBoneIndices.size === 0) return false;

  const originalIndex = mesh.geometry.index;
  const indexCount = originalIndex?.count ?? position.count;
  const sourceIndex = (offset: number) =>
    originalIndex ? originalIndex.getX(offset) : offset;
  const sourceGroups = mesh.geometry.groups.length > 0
    ? mesh.geometry.groups
    : [{ start: 0, count: indexCount, materialIndex: 0 }];
  const filteredIndices: number[] = [];
  const filteredGroups: Array<{ start: number; count: number; materialIndex: number }> = [];

  for (const group of sourceGroups) {
    const groupStart = filteredIndices.length;
    const groupEnd = Math.min(group.start + group.count, indexCount);
    for (let offset = group.start; offset + 2 < groupEnd; offset += 3) {
      const triangle = [
        sourceIndex(offset),
        sourceIndex(offset + 1),
        sourceIndex(offset + 2),
      ];
      const averageHeadInfluence = triangle.reduce(
        (sum, vertexIndex) =>
          sum + headInfluenceForVertex(
            vertexIndex,
            skinIndex,
            skinWeight,
            headBoneIndices,
          ),
        0,
      ) / 3;
      if (averageHeadInfluence >= 0.9) filteredIndices.push(...triangle);
    }
    const count = filteredIndices.length - groupStart;
    if (count > 0) {
      filteredGroups.push({
        start: groupStart,
        count,
        materialIndex: group.materialIndex ?? 0,
      });
    }
  }

  if (filteredIndices.length === 0 || filteredIndices.length === indexCount) {
    return false;
  }

  const filteredGeometry = mesh.geometry.clone();
  filteredGeometry.setIndex(filteredIndices);
  filteredGeometry.clearGroups();
  for (const group of filteredGroups) {
    filteredGeometry.addGroup(group.start, group.count, group.materialIndex);
  }
  mesh.geometry = filteredGeometry;
  return true;
}

export function configureIdentityCompositeVisibility(
  standardScene: THREE.Object3D,
  identityScene: THREE.Object3D,
  options: {
    bodySkinTint?: string;
    identityHead?: THREE.Object3D;
  } = {},
): IdentityCompositeVisibility {
  let hiddenStandardIdentityMaterials = 0;
  let hiddenSourceBodyMaterials = 0;
  let visibleSourceIdentityMaterials = 0;
  let transferredStandardBodyMaterials = 0;
  let maskedSourceMeshes = 0;

  standardScene.traverse((object) => {
    for (const material of materialsFor(object)) {
      const shouldHide = isIdentityMaterial(material);
      material.visible = !shouldHide;
      if (options.bodySkinTint && isBodySkinMaterial(material)) {
        const standardBodySkin = material as SkinMaterial;
        if (standardBodySkin.color) {
          standardBodySkin.color.set(options.bodySkinTint);
        }
        standardBodySkin.needsUpdate = true;
        transferredStandardBodyMaterials += 1;
      }
      if (shouldHide) hiddenStandardIdentityMaterials += 1;
    }
  });

  let hasNamedIdentitySurface = false;
  identityScene.traverse((object) => {
    if (materialsFor(object).some(isIdentitySurfaceMaterial)) {
      hasNamedIdentitySurface = true;
    }
  });

  identityScene.traverse((object) => {
    const shouldUseHeadMask =
      !hasNamedIdentitySurface &&
      options.identityHead &&
      object instanceof THREE.SkinnedMesh &&
      maskSkinnedMeshToHead(object, options.identityHead);
    if (shouldUseHeadMask) maskedSourceMeshes += 1;
    for (const material of materialsFor(object)) {
      const shouldShow = shouldUseHeadMask || isIdentityMaterial(material);
      material.visible = shouldShow;
      if (shouldShow) visibleSourceIdentityMaterials += 1;
      else hiddenSourceBodyMaterials += 1;
    }
  });

  return {
    hiddenStandardIdentityMaterials,
    hiddenSourceBodyMaterials,
    visibleSourceIdentityMaterials,
    transferredStandardBodyMaterials,
    maskedSourceMeshes,
  };
}

export function pinIdentityOverlayToStandardHead({
  standardHead,
  identityScene,
  identityHead,
  offsetY = 0,
}: {
  standardHead: THREE.Object3D;
  identityScene: THREE.Object3D;
  identityHead: THREE.Object3D;
  offsetY?: number;
}): void {
  standardHead.updateWorldMatrix(true, false);
  identityHead.updateWorldMatrix(true, false);
  const standardPosition = new THREE.Vector3();
  const identityPosition = new THREE.Vector3();
  standardHead.getWorldPosition(standardPosition);
  identityHead.getWorldPosition(identityPosition);
  identityScene.position.add(standardPosition.sub(identityPosition));
  identityScene.position.y += offsetY;
  identityScene.updateWorldMatrix(true, true);
}

export function alignIdentityOverlayToStandardHead({
  standardScene,
  standardHead,
  identityScene,
  identityHead,
  scaleMultiplier = 1,
  offsetY = 0,
}: {
  standardScene: THREE.Object3D;
  standardHead: THREE.Object3D;
  identityScene: THREE.Object3D;
  identityHead: THREE.Object3D;
  scaleMultiplier?: number;
  offsetY?: number;
}): { scale: number } {
  standardScene.updateWorldMatrix(true, true);
  identityScene.updateWorldMatrix(true, true);
  const standardPosition = new THREE.Vector3();
  const identityPosition = new THREE.Vector3();
  standardHead.getWorldPosition(standardPosition);
  identityHead.getWorldPosition(identityPosition);
  const baseScale = identityPosition.y > 0.001
    ? THREE.MathUtils.clamp(standardPosition.y / identityPosition.y, 0.9, 1.1)
    : 1;
  const scale = baseScale * scaleMultiplier;
  identityScene.scale.setScalar(scale);
  identityScene.updateWorldMatrix(true, true);
  pinIdentityOverlayToStandardHead({
    standardHead,
    identityScene,
    identityHead,
    offsetY,
  });
  return { scale };
}
