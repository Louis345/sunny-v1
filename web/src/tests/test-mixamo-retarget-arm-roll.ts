import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import {
  resolveMixamoRetargetCompatibility,
  retargetMixamoClipToVrm,
} from "../utils/mixamoRetarget";

describe("mixamoRetarget legacy VRM0 arm roll", () => {
  it("normalizes legacy VRM0 arm roll direction", () => {
    const sourceArm = new THREE.Bone();
    sourceArm.name = "mixamorigLeftArm";
    const root = new THREE.Group();
    root.add(sourceArm);
    root.updateMatrixWorld(true);

    const inputQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, 0, 0.5, "XYZ"),
    );
    const clip = new THREE.AnimationClip("legacy-arm", 1, [
      new THREE.QuaternionKeyframeTrack(
        "mixamorigLeftArm.quaternion",
        [0],
        [inputQuat.x, inputQuat.y, inputQuat.z, inputQuat.w],
      ),
    ]);
    const targetArm = new THREE.Bone();
    targetArm.name = "leftUpperArmNode";
    const vrm = {
      meta: { metaVersion: "0" },
      humanoid: {
        getNormalizedBoneNode: (name: string) =>
          name === "leftUpperArm" ? targetArm : null,
      },
    } as unknown as VRM;

    const result = retargetMixamoClipToVrm(clip, root, vrm);

    expect(result?.tracks).toHaveLength(1);
    expect(result?.tracks[0]?.values[2]).toBeLessThan(0);
  });

  it("detects VRoidHub-style VRM0 mirrored arm axes from rest bone direction", () => {
    const leftLowerArm = new THREE.Bone();
    leftLowerArm.position.x = -0.22;
    const rightLowerArm = new THREE.Bone();
    rightLowerArm.position.x = 0.22;
    const vrm = {
      meta: { metaVersion: "0" },
      humanoid: {
        getNormalizedBoneNode: (name: string) => {
          if (name === "leftLowerArm") return leftLowerArm;
          if (name === "rightLowerArm") return rightLowerArm;
          return null;
        },
      },
    } as unknown as VRM;

    expect(resolveMixamoRetargetCompatibility(vrm).armCorrection).toBe(
      "mirrored-arm-rest-x",
    );
  });

  it("uses mirrored-axis correction for VRoidHub-style VRM0 arm quaternions", () => {
    const sourceArm = new THREE.Bone();
    sourceArm.name = "mixamorigLeftArm";
    const root = new THREE.Group();
    root.add(sourceArm);
    root.updateMatrixWorld(true);

    const inputQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.2, 0.3, 0.4, "XYZ"),
    );
    const clip = new THREE.AnimationClip("mirrored-arm", 1, [
      new THREE.QuaternionKeyframeTrack(
        "mixamorigLeftArm.quaternion",
        [0],
        [inputQuat.x, inputQuat.y, inputQuat.z, inputQuat.w],
      ),
    ]);
    const targetArm = new THREE.Bone();
    targetArm.name = "leftUpperArmNode";
    const leftLowerArm = new THREE.Bone();
    leftLowerArm.position.x = -0.22;
    const rightLowerArm = new THREE.Bone();
    rightLowerArm.position.x = 0.22;
    const vrm = {
      meta: { metaVersion: "0" },
      humanoid: {
        getNormalizedBoneNode: (name: string) => {
          if (name === "leftUpperArm") return targetArm;
          if (name === "leftLowerArm") return leftLowerArm;
          if (name === "rightLowerArm") return rightLowerArm;
          return null;
        },
      },
    } as unknown as VRM;

    const result = retargetMixamoClipToVrm(clip, root, vrm);
    const values = result?.tracks[0]?.values;

    expect(result?.tracks).toHaveLength(1);
    expect(values?.[0]).toBeCloseTo(-inputQuat.x);
    expect(values?.[1]).toBeCloseTo(inputQuat.y);
    expect(values?.[2]).toBeCloseTo(-inputQuat.z);
    expect(values?.[3]).toBeCloseTo(inputQuat.w);
  });

  it("uses official VRM0 x/z coordinate conversion for non-arm bones", () => {
    const sourceHead = new THREE.Bone();
    sourceHead.name = "mixamorigHead";
    const root = new THREE.Group();
    root.add(sourceHead);
    root.updateMatrixWorld(true);

    const inputQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.2, 0.3, 0.4, "XYZ"),
    );
    const clip = new THREE.AnimationClip("legacy-head", 1, [
      new THREE.QuaternionKeyframeTrack(
        "mixamorigHead.quaternion",
        [0],
        [inputQuat.x, inputQuat.y, inputQuat.z, inputQuat.w],
      ),
    ]);
    const targetHead = new THREE.Bone();
    targetHead.name = "headNode";
    const vrm = {
      meta: { metaVersion: "0" },
      humanoid: {
        getNormalizedBoneNode: (name: string) =>
          name === "head" ? targetHead : null,
      },
    } as unknown as VRM;

    const result = retargetMixamoClipToVrm(clip, root, vrm);
    const values = result?.tracks[0]?.values;

    expect(result?.tracks).toHaveLength(1);
    expect(values?.[0]).toBeCloseTo(-inputQuat.x);
    expect(values?.[1]).toBeCloseTo(inputQuat.y);
    expect(values?.[2]).toBeCloseTo(-inputQuat.z);
    expect(values?.[3]).toBeCloseTo(inputQuat.w);
  });

  it("negates VRM0 hips x/z root motion using the source and target hips scale", () => {
    const sourceHips = new THREE.Bone();
    sourceHips.name = "mixamorigHips";
    sourceHips.position.y = 100;
    const root = new THREE.Group();
    root.add(sourceHips);
    root.updateMatrixWorld(true);

    const clip = new THREE.AnimationClip("legacy-root-motion", 1, [
      new THREE.VectorKeyframeTrack(
        "mixamorigHips.position",
        [0, 1],
        [
          0, 100, 0,
          20, 80, -10,
        ],
      ),
    ]);
    const targetHips = new THREE.Bone();
    targetHips.name = "hipsNode";
    targetHips.position.set(0, 1, 0);
    const vrm = {
      meta: { metaVersion: "0" },
      humanoid: {
        normalizedRestPose: {
          hips: { position: [0, 1, 0] },
        },
        getNormalizedBoneNode: (name: string) =>
          name === "hips" ? targetHips : null,
      },
    } as unknown as VRM;

    const result = retargetMixamoClipToVrm(clip, root, vrm);
    const hipsTrack = result?.tracks.find(
      (track) => track.name === "hipsNode.position",
    );

    expect(Array.from(hipsTrack!.values)).toEqual([
      expect.closeTo(0),
      expect.closeTo(1),
      expect.closeTo(0),
      expect.closeTo(-0.2),
      expect.closeTo(0.8),
      expect.closeTo(0.1),
    ]);
  });

  it("applies the same mirrored-axis correction to VRM0 finger tracks", () => {
    const sourceFinger = new THREE.Bone();
    sourceFinger.name = "mixamorigLeftHandIndex1";
    const root = new THREE.Group();
    root.add(sourceFinger);
    root.updateMatrixWorld(true);

    const inputQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.1, 0.2, 0.3, "XYZ"),
    );
    const clip = new THREE.AnimationClip("mirrored-finger", 1, [
      new THREE.QuaternionKeyframeTrack(
        "mixamorigLeftHandIndex1.quaternion",
        [0],
        [inputQuat.x, inputQuat.y, inputQuat.z, inputQuat.w],
      ),
    ]);
    const targetFinger = new THREE.Bone();
    targetFinger.name = "leftIndexProximalNode";
    const leftLowerArm = new THREE.Bone();
    leftLowerArm.position.x = -0.22;
    const rightLowerArm = new THREE.Bone();
    rightLowerArm.position.x = 0.22;
    const vrm = {
      meta: { metaVersion: "0" },
      humanoid: {
        getNormalizedBoneNode: (name: string) => {
          if (name === "leftIndexProximal") return targetFinger;
          if (name === "leftLowerArm") return leftLowerArm;
          if (name === "rightLowerArm") return rightLowerArm;
          return null;
        },
      },
    } as unknown as VRM;

    const result = retargetMixamoClipToVrm(clip, root, vrm);
    const values = result?.tracks[0]?.values;

    expect(result?.tracks).toHaveLength(1);
    expect(values?.[0]).toBeCloseTo(-inputQuat.x);
    expect(values?.[1]).toBeCloseTo(inputQuat.y);
    expect(values?.[2]).toBeCloseTo(-inputQuat.z);
    expect(values?.[3]).toBeCloseTo(inputQuat.w);
  });
});

describe("mixamoRetarget root motion", () => {
  it("keeps hips position as rest pose plus scaled Mixamo root delta", () => {
    const sourceHips = new THREE.Bone();
    sourceHips.name = "mixamorigHips";
    const root = new THREE.Group();
    root.add(sourceHips);
    root.updateMatrixWorld(true);

    const clip = new THREE.AnimationClip("root-motion", 1, [
      new THREE.VectorKeyframeTrack(
        "mixamorigHips.position",
        [0, 1],
        [
          10, 100, -5,
          25, 90, 15,
        ],
      ),
    ]);
    const targetHips = new THREE.Bone();
    targetHips.name = "hipsNode";
    targetHips.position.set(0, 1, 0);
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: (name: string) =>
          name === "hips" ? targetHips : null,
      },
    } as unknown as VRM;

    const result = retargetMixamoClipToVrm(clip, root, vrm);
    const hipsTrack = result?.tracks.find(
      (track) => track.name === "hipsNode.position",
    );

    expect(hipsTrack).toBeDefined();
    expect(Array.from(hipsTrack!.values)).toEqual([
      expect.closeTo(0),
      expect.closeTo(1),
      expect.closeTo(0),
      expect.closeTo(0.15),
      expect.closeTo(0.9),
      expect.closeTo(0.2),
    ]);
  });
});
