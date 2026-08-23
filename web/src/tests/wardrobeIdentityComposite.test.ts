import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  alignIdentityOverlayToStandardHead,
  configureIdentityCompositeVisibility,
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

    const result = configureIdentityCompositeVisibility(standard, identity);

    expect(result).toEqual({
      hiddenStandardIdentityMaterials: 3,
      hiddenSourceBodyMaterials: 2,
      visibleSourceIdentityMaterials: 3,
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
});
