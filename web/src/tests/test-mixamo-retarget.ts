import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { retargetMixamoClipToVrm } from "../companion/mixamoRetarget";

describe("mixamoRetarget", () => {
  it("retargetMixamoClipToVrm returns null when VRM has no humanoid", () => {
    const mixamo = new THREE.Group();
    const vrm = { scene: new THREE.Group() } as unknown as VRM;
    const clip = new THREE.AnimationClip("t", 1, []);
    expect(retargetMixamoClipToVrm(clip, mixamo, vrm)).toBeNull();
  });

  it("retargetMixamoClipToVrm returns null for empty clip (no tracks)", () => {
    const mixamo = new THREE.Group();
    const vrm = {
      scene: new THREE.Group(),
      humanoid: {
        getNormalizedBoneNode: () => null,
      },
    } as unknown as VRM;
    const clip = new THREE.AnimationClip("t", 1, []);
    expect(retargetMixamoClipToVrm(clip, mixamo, vrm)).toBeNull();
  });
});
