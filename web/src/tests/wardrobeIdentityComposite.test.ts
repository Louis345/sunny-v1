import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  alignIdentityOverlayToStandardHead,
  configureIdentityCompositeVisibility,
  pinIdentityOverlayToStandardHead,
} from "../lib/wardrobeIdentityComposite";

function mesh(name: string, materialNames: string[]) {
  const node = new THREE.Mesh(
    new THREE.BufferGeometry(),
    materialNames.map((materialName) => {
      const material = new THREE.MeshBasicMaterial();
      material.name = materialName;
      return material;
    }),
  );
  node.name = name;
  return node;
}

describe("wardrobe identity composite", () => {
  it("keeps the standard body while replacing its face and hair", () => {
    const standard = new THREE.Group();
    const standardBody = mesh("Body", ["Body_00_SKIN", "HairBack_00_HAIR"]);
    const standardFace = mesh("Face", ["Face_00_SKIN"]);
    const standardHair = mesh("Hair", ["Hair_00_HAIR"]);
    standard.add(standardBody, standardFace, standardHair);

    const identity = new THREE.Group();
    const identityBody = mesh("Body", [
      "N00_Body_00_SKIN (Instance)",
      "N00_HairBack_00_HAIR (Instance)",
      "N00_Tops_01_CLOTH (Instance)",
    ]);
    const identityFace = mesh("Face", ["N00_Face_00_SKIN (Instance)"]);
    const identityHair = mesh("Hair", ["N00_Hair_00_HAIR (Instance)"]);
    identity.add(identityBody, identityFace, identityHair);
    const standardBodySkin = (standardBody.material as THREE.MeshBasicMaterial[])[0]!;
    const sourceBodySkin = (identityBody.material as THREE.MeshBasicMaterial[])[0]!;
    const standardSkinTexture = new THREE.Texture();
    const sourceSkinTexture = new THREE.Texture();
    standardBodySkin.map = standardSkinTexture;
    sourceBodySkin.map = sourceSkinTexture;

    const result = configureIdentityCompositeVisibility(standard, identity, {
      bodySkinTint: "#7a4a32",
    });

    expect(result).toEqual({
      hiddenStandardIdentityMaterials: 3,
      hiddenSourceBodyMaterials: 2,
      visibleSourceIdentityMaterials: 3,
      transferredStandardBodyMaterials: 1,
      maskedSourceMeshes: 0,
    });
    expect((standardBody.material as THREE.Material[])[0]?.visible).toBe(true);
    expect((standardBody.material as THREE.Material[])[1]?.visible).toBe(false);
    expect((standardFace.material as THREE.Material[])[0]?.visible).toBe(false);
    expect((standardHair.material as THREE.Material[])[0]?.visible).toBe(false);
    expect((identityBody.material as THREE.Material[])[0]?.visible).toBe(false);
    expect((identityBody.material as THREE.Material[])[1]?.visible).toBe(true);
    expect((identityBody.material as THREE.Material[])[2]?.visible).toBe(false);
    expect((identityFace.material as THREE.Material[])[0]?.visible).toBe(true);
    expect((identityHair.material as THREE.Material[])[0]?.visible).toBe(true);
    expect(
      standardBodySkin.color.getHexString(),
    ).toBe("7a4a32");
    expect(standardBodySkin.map).toBe(standardSkinTexture);
    expect(standardBodySkin.map).not.toBe(sourceSkinTexture);
  });

  it("uniformly scales and translates the identity model onto the standard head", () => {
    const standardScene = new THREE.Group();
    const standardHead = new THREE.Object3D();
    standardHead.position.set(0.1, 1.5, -0.02);
    standardScene.add(standardHead);

    const identityScene = new THREE.Group();
    const identityHead = new THREE.Object3D();
    identityHead.position.set(-0.05, 1.4, 0.03);
    identityScene.add(identityHead);

    const result = alignIdentityOverlayToStandardHead({
      standardScene,
      standardHead,
      identityScene,
      identityHead,
    });

    const aligned = new THREE.Vector3();
    identityHead.getWorldPosition(aligned);
    const target = new THREE.Vector3();
    standardHead.getWorldPosition(target);

    expect(result.scale).toBeCloseTo(1.5 / 1.4, 4);
    expect(aligned.distanceTo(target)).toBeLessThan(0.0001);
  });

  it("applies a reviewed identity scale around the pinned head anchor", () => {
    const standardScene = new THREE.Group();
    const standardHead = new THREE.Object3D();
    standardHead.position.set(0, 1.5, 0);
    standardScene.add(standardHead);

    const identityScene = new THREE.Group();
    const identityHead = new THREE.Object3D();
    identityHead.position.set(0, 1.5, 0);
    identityScene.add(identityHead);

    const result = alignIdentityOverlayToStandardHead({
      standardScene,
      standardHead,
      identityScene,
      identityHead,
      scaleMultiplier: 1.28,
    });

    const aligned = new THREE.Vector3();
    identityHead.getWorldPosition(aligned);
    const target = new THREE.Vector3();
    standardHead.getWorldPosition(target);
    expect(result.scale).toBeCloseTo(1.28, 4);
    expect(aligned.distanceTo(target)).toBeLessThan(0.0001);
  });

  it("keeps a reviewed vertical offset when repinning a moving identity", () => {
    const standardHead = new THREE.Object3D();
    standardHead.position.set(0, 1.5, 0);
    const identityScene = new THREE.Group();
    const identityHead = new THREE.Object3D();
    identityHead.position.set(0, 1.5, 0);
    identityScene.add(identityHead);

    pinIdentityOverlayToStandardHead({
      standardHead,
      identityScene,
      identityHead,
      offsetY: -0.03,
    });

    const aligned = new THREE.Vector3();
    identityHead.getWorldPosition(aligned);
    expect(aligned.y).toBeCloseTo(1.47, 4);
  });

  it("keeps head-weighted geometry when an identity model has opaque material names", () => {
    const standard = new THREE.Group();
    standard.add(mesh("Face", ["Face_00_SKIN"]));

    const hips = new THREE.Bone();
    hips.name = "hips";
    const head = new THREE.Bone();
    head.name = "head";
    hips.add(head);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.1, 1.5, 0,
          0.1, 1.5, 0,
          0, 1.7, 0,
          -0.2, 0.6, 0,
          0.2, 0.6, 0,
          0, 1.0, 0,
          -0.1, 1.35, 0,
          0.1, 1.35, 0,
          0, 1.45, 0,
        ],
        3,
      ),
    );
    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(
        [
          1, 0, 0, 0,
          1, 0, 0, 0,
          1, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 0, 0,
          1, 0, 0, 0,
          1, 0, 0, 0,
          1, 0, 0, 0,
        ],
        4,
      ),
    );
    geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(
        [
          1, 0, 0, 0,
          1, 0, 0, 0,
          1, 0, 0, 0,
          1, 0, 0, 0,
          1, 0, 0, 0,
          1, 0, 0, 0,
          0.7, 0.3, 0, 0,
          0.7, 0.3, 0, 0,
          0.7, 0.3, 0, 0,
        ],
        4,
      ),
    );
    geometry.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    geometry.addGroup(0, 9, 0);

    const opaqueMaterial = new THREE.MeshBasicMaterial();
    opaqueMaterial.name = "materialref1.001";
    const identityMesh = new THREE.SkinnedMesh(geometry, opaqueMaterial);
    identityMesh.name = "Cinderella";
    identityMesh.add(hips);
    identityMesh.bind(new THREE.Skeleton([hips, head]));
    const identity = new THREE.Group();
    identity.add(identityMesh);

    const result = configureIdentityCompositeVisibility(standard, identity, {
      identityHead: head,
    });

    expect(result.maskedSourceMeshes).toBe(1);
    expect(result.visibleSourceIdentityMaterials).toBe(1);
    expect(Array.from(identityMesh.geometry.index?.array ?? [])).toEqual([
      0, 1, 2,
    ]);
    expect(opaqueMaterial.visible).toBe(true);
  });
});
