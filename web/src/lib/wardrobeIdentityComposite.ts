import * as THREE from "three";

type IdentityCompositeVisibility = {
  hiddenStandardIdentityMaterials: number;
  hiddenSourceBodyMaterials: number;
  visibleSourceIdentityMaterials: number;
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

export function configureIdentityCompositeVisibility(
  standardScene: THREE.Object3D,
  identityScene: THREE.Object3D,
): IdentityCompositeVisibility {
  let hiddenStandardIdentityMaterials = 0;
  let hiddenSourceBodyMaterials = 0;
  let visibleSourceIdentityMaterials = 0;

  standardScene.traverse((object) => {
    for (const material of materialsFor(object)) {
      const shouldHide = isIdentityMaterial(material);
      material.visible = !shouldHide;
      if (shouldHide) hiddenStandardIdentityMaterials += 1;
    }
  });

  identityScene.traverse((object) => {
    for (const material of materialsFor(object)) {
      const shouldShow = isIdentityMaterial(material);
      material.visible = shouldShow;
      if (shouldShow) visibleSourceIdentityMaterials += 1;
      else hiddenSourceBodyMaterials += 1;
    }
  });

  return {
    hiddenStandardIdentityMaterials,
    hiddenSourceBodyMaterials,
    visibleSourceIdentityMaterials,
  };
}

export function pinIdentityOverlayToStandardHead({
  standardHead,
  identityScene,
  identityHead,
}: {
  standardHead: THREE.Object3D;
  identityScene: THREE.Object3D;
  identityHead: THREE.Object3D;
}): void {
  standardHead.updateWorldMatrix(true, false);
  identityHead.updateWorldMatrix(true, false);
  const standardPosition = new THREE.Vector3();
  const identityPosition = new THREE.Vector3();
  standardHead.getWorldPosition(standardPosition);
  identityHead.getWorldPosition(identityPosition);
  identityScene.position.add(standardPosition.sub(identityPosition));
  identityScene.updateWorldMatrix(true, true);
}

export function alignIdentityOverlayToStandardHead({
  standardScene,
  standardHead,
  identityScene,
  identityHead,
}: {
  standardScene: THREE.Object3D;
  standardHead: THREE.Object3D;
  identityScene: THREE.Object3D;
  identityHead: THREE.Object3D;
}): { scale: number } {
  standardScene.updateWorldMatrix(true, true);
  identityScene.updateWorldMatrix(true, true);
  const standardPosition = new THREE.Vector3();
  const identityPosition = new THREE.Vector3();
  standardHead.getWorldPosition(standardPosition);
  identityHead.getWorldPosition(identityPosition);
  const scale = identityPosition.y > 0.001
    ? THREE.MathUtils.clamp(standardPosition.y / identityPosition.y, 0.9, 1.1)
    : 1;
  identityScene.scale.setScalar(scale);
  identityScene.updateWorldMatrix(true, true);
  pinIdentityOverlayToStandardHead({ standardHead, identityScene, identityHead });
  return { scale };
}
