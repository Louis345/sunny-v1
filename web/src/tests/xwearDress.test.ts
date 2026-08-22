import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  CELTIC_SWEATER_OUTFIT,
  COMET_HOODIE_OUTFIT,
  CONSTELLATION_BLAZER_OUTFIT,
  SLEEVELESS_DRESS_OUTFIT,
  applyXwearMaterialVariant,
  adjustGarmentVolumeAroundBones,
  applyGarmentSurfaceOffset,
  bindSkinnedMeshInAvatarSpace,
  createBindPoseSkeleton,
  createCurrentPoseSkeleton,
  fitGarmentToAvatarProportions,
  getApprovedXwearOutfitDefinitions,
  getXwearOutfitDefinition,
  isXwearCanonicalSkeletonBone,
  isXwearOutfitApprovedForAvatar,
  isXwearOutfitAnimationSupported,
  resolveGarmentBoneLocalMatrix,
  resolveXwearOutfitAssetUrls,
  resolveXwearMainTextureGuids,
  resolveXwearArchiveFiles,
  retargetGarmentVerticesToAvatarBindPose,
  setVrmBaseClothingVisible,
} from "../lib/xwearDress";

describe("XWear avatar-space binding", () => {
  it("creates an isolated material palette for each wardrobe variant", () => {
    const shared = new THREE.MeshBasicMaterial({ color: "#ffffff" });

    const [berry] = applyXwearMaterialVariant([shared], {
      id: "ribbon-dress-berry",
      tint: "#8e3f70",
    });

    expect(berry).not.toBe(shared);
    expect(berry?.color.getHexString()).toBe("8e3f70");
    expect(shared.color.getHexString()).toBe("ffffff");
  });

  it("shrinks oversized garments around their weighted bones without moving the bones", () => {
    const adjusted = adjustGarmentVolumeAroundBones({
      positions: new Float32Array([3, 4, 5, 8, 10, 12]),
      boneIndices: new Uint16Array([0, 0, 0, 0, 1, 0, 0, 0]),
      boneWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]),
      boneBindMatrices: [
        new THREE.Matrix4().makeTranslation(1, 2, 3),
        new THREE.Matrix4().makeTranslation(4, 6, 8),
      ],
      scale: { x: 0.5, y: 0.5, z: 0.5 },
    });

    expect(Array.from(adjusted)).toEqual([2, 3, 4, 6, 8, 10]);
  });

  it("resolves every sellable outfit through the skinned XWear catalog", () => {
    expect(getXwearOutfitDefinition("sleeveless-dress")).toBe(
      SLEEVELESS_DRESS_OUTFIT,
    );
    expect(getXwearOutfitDefinition("celtic-sweater")).toBe(
      CELTIC_SWEATER_OUTFIT,
    );
    expect(getXwearOutfitDefinition("comet-hoodie")).toBe(
      COMET_HOODIE_OUTFIT,
    );
    expect(getXwearOutfitDefinition("constellation-blazer")).toBe(
      CONSTELLATION_BLAZER_OUTFIT,
    );
    expect(getXwearOutfitDefinition("none")).toBeNull();
  });

  it("keeps visually rejected garments available for QA but out of the approved registry", () => {
    expect(SLEEVELESS_DRESS_OUTFIT.slots).toEqual({
      occupies: ["onepiece"],
      replaces: ["top", "bottom", "onepiece"],
    });
    expect(SLEEVELESS_DRESS_OUTFIT.qa).toMatchObject({ status: "approved" });
    expect(CELTIC_SWEATER_OUTFIT.slots).toEqual({
      occupies: ["top"],
      replaces: ["top"],
    });
    expect(CELTIC_SWEATER_OUTFIT.qa).toMatchObject({
      status: "rejected",
      reason: expect.stringContaining("silhouette"),
    });
    expect(COMET_HOODIE_OUTFIT.qa).toMatchObject({
      status: "rejected",
      reason: expect.stringContaining("full-size visual QA"),
    });
    expect(getApprovedXwearOutfitDefinitions()).toEqual([
      SLEEVELESS_DRESS_OUTFIT,
      CONSTELLATION_BLAZER_OUTFIT,
    ]);
    expect(
      isXwearOutfitApprovedForAvatar(
        CELTIC_SWEATER_OUTFIT,
        "/companions/sample.vrm",
      ),
    ).toBe(false);
  });

  it("lets partial outfits replace tops without hiding the avatar's bottoms", () => {
    const scene = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ name: "Tops_sample" }),
    );
    const bottom = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ name: "Bottoms_sample" }),
    );
    scene.add(top, bottom);

    setVrmBaseClothingVisible(scene, false, ["top"]);

    expect((top.material as THREE.Material).visible).toBe(false);
    expect((bottom.material as THREE.Material).visible).toBe(true);
    expect(CELTIC_SWEATER_OUTFIT.slots.replaces).toEqual(["top"]);
    expect(COMET_HOODIE_OUTFIT.slots).toEqual({
      occupies: ["top"],
      replaces: ["top"],
    });
    expect(CONSTELLATION_BLAZER_OUTFIT.slots).toEqual({
      occupies: ["top"],
      replaces: ["top"],
    });
    expect(CONSTELLATION_BLAZER_OUTFIT.volumeScale?.x).toBeLessThan(0.9);
  });

  it("only applies an outfit to avatar designs that passed visual fit QA", () => {
    expect(
      isXwearOutfitApprovedForAvatar(
        SLEEVELESS_DRESS_OUTFIT,
        "/companions/sample.vrm",
      ),
    ).toBe(true);
    expect(
      isXwearOutfitApprovedForAvatar(
        SLEEVELESS_DRESS_OUTFIT,
        "/companions/Kefla.vrm",
      ),
    ).toBe(false);
    expect(
      isXwearOutfitApprovedForAvatar(
        SLEEVELESS_DRESS_OUTFIT,
        "/companions/replacement-sample.vrm",
      ),
    ).toBe(false);
  });

  it("gives the downloaded bodice enough clearance for varied VRoid torsos", () => {
    expect(SLEEVELESS_DRESS_OUTFIT.surfaceOffset).toBeGreaterThanOrEqual(0.02);
  });

  it("reuses avatar anatomy but isolates outfit helper bones", () => {
    expect(isXwearCanonicalSkeletonBone("J_Bip_C_Chest")).toBe(true);
    expect(isXwearCanonicalSkeletonBone("J_Sec_L_Bust2")).toBe(false);
    expect(isXwearCanonicalSkeletonBone("user_custom_skirt_bone")).toBe(false);
  });

  it("uniformly scales a garment around source hips onto avatar proportions", () => {
    const fitted = fitGarmentToAvatarProportions(
      new Float32Array([0.1, 1.05, 0.02]),
      new THREE.Vector3(0, 0.85, 0),
      new THREE.Vector3(0, 1.25, 0),
      new THREE.Vector3(0, 0.91, -0.01),
      new THREE.Vector3(0, 1.39, -0.01),
    );

    expect(fitted.scale).toBeCloseTo(1.2);
    expect(fitted.positions[0]).toBeCloseTo(0.12);
    expect(fitted.positions[1]).toBeCloseTo(1.15);
    expect(fitted.positions[2]).toBeCloseTo(0.014);
  });

  it("retargets each garment vertex from its source bone into the avatar bind pose", () => {
    const retargeted = retargetGarmentVerticesToAvatarBindPose({
      positions: new Float32Array([1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([1, 0, 0, 0, 1, 0]),
      boneIndices: new Uint16Array([0, 0, 0, 0, 1, 0, 0, 0]),
      boneWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]),
      sourceBindWorldMatrices: [
        new THREE.Matrix4(),
        new THREE.Matrix4().makeTranslation(0, 1, 0),
      ],
      targetBindWorldMatrices: [
        new THREE.Matrix4().makeTranslation(2, 0, 0),
        new THREE.Matrix4().makeTranslation(0, 3, 0),
      ],
    });

    expect(Array.from(retargeted.positions)).toEqual([3, 0, 0, 0, 3, 0]);
    expect(Array.from(retargeted.normals)).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it("derives outfit-owned helper bones from mesh bind poses", () => {
    const parentWorld = new THREE.Matrix4().makeTranslation(0, 1, 0);
    const childWorld = new THREE.Matrix4().compose(
      new THREE.Vector3(0.2, 1.5, 0.1),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        Math.PI / 4,
      ),
      new THREE.Vector3(1, 1, 1),
    );

    const local = resolveGarmentBoneLocalMatrix(
      childWorld.clone().invert().toArray(),
      parentWorld.clone().invert().toArray(),
      1.1,
    );
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    local.decompose(position, rotation, scale);

    expect(position.x).toBeCloseTo(0.22);
    expect(position.y).toBeCloseTo(0.55);
    expect(position.z).toBeCloseTo(0.11);
    expect(rotation.angleTo(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 4,
    ))).toBeCloseTo(0);
    expect(scale.toArray()).toEqual([1, 1, 1]);
  });

  it("discovers GUID-named XWear files directly from an archive", () => {
    const mesh = new Uint8Array([1]);
    const resource = new Uint8Array([2]);
    const item = new Uint8Array([3]);
    const texture = new Uint8Array([4]);

    const resolved = resolveXwearArchiveFiles({
      "Mesh\\mesh-guid": mesh,
      "Body\\XResources\\resource-guid": resource,
      "Body\\XItem.json\\XItem.json": item,
      "Textures\\texture-guid.png": texture,
    });

    expect(resolved.mesh).toBe(mesh);
    expect(resolved.resource).toBe(resource);
    expect(resolved.item).toBe(item);
    expect(resolved.textures.get("texture-guid")).toBe(texture);
  });

  it("rejects animations that an outfit has not passed visual fit QA", () => {
    const outfit = {
      id: "party-dress",
      assetRoot: "/wardrobe/party-dress",
      meshPath: "Mesh/outfit.mesh.bin",
      resourcePath: "Body/XResources/outfit.json",
      itemPath: "Body/XItem.json/item.json",
      slots: { occupies: ["onepiece"] as const, replaces: ["onepiece"] as const },
      qa: {
        status: "approved" as const,
        approvedAvatarUrls: ["/companions/sample.vrm"],
        unsupportedAnimations: ["sitting"],
      },
    };

    expect(isXwearOutfitAnimationSupported(outfit, "wave")).toBe(true);
    expect(isXwearOutfitAnimationSupported(outfit, "sitting")).toBe(false);
  });

  it("resolves a complete XWear outfit from a reusable catalog definition", () => {
    expect(
      resolveXwearOutfitAssetUrls({
        id: "party-dress",
        assetRoot: "/wardrobe/party-dress",
        meshPath: "Mesh/outfit.mesh.bin",
        resourcePath: "Body/XResources/outfit.json",
        itemPath: "Body/XItem.json/item.json",
        surfaceOffset: 0.003,
        slots: { occupies: ["onepiece"], replaces: ["onepiece"] },
        qa: { status: "candidate" },
      }),
    ).toEqual({
      meshUrl: "/wardrobe/party-dress/Mesh/outfit.mesh.bin",
      resourceUrl: "/wardrobe/party-dress/Body/XResources/outfit.json",
      itemUrl: "/wardrobe/party-dress/Body/XItem.json/item.json",
      textureRoot: "/wardrobe/party-dress/Textures",
    });
  });

  it("applies a per-outfit surface clearance along normalized garment normals", () => {
    const positions = new Float32Array([1, 2, 3, -1, -2, -3]);
    const normals = new Float32Array([0, 2, 0, 0, 0, -4]);

    const adjusted = applyGarmentSurfaceOffset(positions, normals, 0.01);
    [1, 2.01, 3, -1, -2, -3.01].forEach((expected, index) => {
      expect(adjusted[index]).toBeCloseTo(expected);
    });
    expect(Array.from(positions)).toEqual([1, 2, 3, -1, -2, -3]);
  });

  it("parents the garment before capturing its bind matrix", () => {
    const avatarScene = new THREE.Group();
    avatarScene.position.set(0.4, 0.2, -0.3);
    avatarScene.rotation.y = Math.PI;
    avatarScene.scale.setScalar(1.25);

    const bone = new THREE.Bone();
    avatarScene.add(bone);
    avatarScene.updateMatrixWorld(true);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 1, 0], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    const garment = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    const skeleton = new THREE.Skeleton([bone], [bone.matrixWorld.clone().invert()]);

    bindSkinnedMeshInAvatarSpace(avatarScene, garment, skeleton);

    expect(garment.parent).toBe(avatarScene);
    expect(garment.bindMatrix.equals(garment.matrixWorld)).toBe(true);
    expect(garment.bindMatrix.equals(new THREE.Matrix4())).toBe(false);
  });

  it("retargets the garment from the avatar's current pose", () => {
    const root = new THREE.Group();
    root.position.set(0.2, 0.4, -0.1);
    const bone = new THREE.Bone();
    bone.position.set(0, 0.8, 0.05);
    root.add(bone);
    root.updateMatrixWorld(true);

    const skeleton = createCurrentPoseSkeleton([bone]);

    expect(skeleton.boneInverses[0]?.equals(bone.matrixWorld.clone().invert())).toBe(true);
  });

  it("binds to the captured rest pose even after an intro animation moves bones", () => {
    const bone = new THREE.Bone();
    bone.position.set(0.3, 1.2, 0.1);
    bone.updateMatrixWorld(true);
    const restWorld = new THREE.Matrix4().makeTranslation(0, 0.9, 0);

    const skeleton = createBindPoseSkeleton([bone], [restWorld]);

    expect(skeleton.boneInverses[0]?.equals(restWorld.clone().invert())).toBe(true);
    expect(skeleton.boneInverses[0]?.equals(bone.matrixWorld.clone().invert())).toBe(false);
  });

  it("discovers each renderer material's main texture from XWear metadata", () => {
    const item = {
      XResourceMaterials: [
        {
          Guid: "material-b",
          ShaderProperties: [
            { PropertyName: "_ShadeTex", TextureGuid: "shade-b" },
            { PropertyName: "_MainTex", TextureGuid: "main-b" },
          ],
        },
        {
          Guid: "material-a",
          ShaderProperties: [{ PropertyName: "_MainTex", TextureGuid: "main-a" }],
        },
      ],
    };

    expect(resolveXwearMainTextureGuids(item, ["material-a", "material-b"])).toEqual([
      "main-a",
      "main-b",
    ]);
  });
});
