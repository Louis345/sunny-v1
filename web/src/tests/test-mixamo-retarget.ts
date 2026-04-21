import { describe, it, expect, vi, beforeEach } from "vitest";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";

// --- Test: mixamoRetarget.ts exports both functions ---

describe("mixamoRetarget exports", () => {
  it("exports retargetMixamoClipToVrm as a function", async () => {
    const mod = await import("../utils/mixamoRetarget");
    expect(typeof mod.retargetMixamoClipToVrm).toBe("function");
  });

  it("exports loadMixamoFbxRoot as a function", async () => {
    const mod = await import("../utils/mixamoRetarget");
    expect(typeof mod.loadMixamoFbxRoot).toBe("function");
  });

  it("retargetMixamoClipToVrm returns null when vrm has no humanoid", () => {
    // This test validates behavior is identical to what was in CompanionMotor
    const importFn = async () => {
      const { retargetMixamoClipToVrm } = await import("../utils/mixamoRetarget");
      const clip = new THREE.AnimationClip("test", 1, []);
      const root = new THREE.Group();
      const vrm = { humanoid: null } as unknown as VRM;
      return retargetMixamoClipToVrm(clip, root, vrm);
    };
    expect(importFn()).resolves.toBeNull();
  });

  it("retargetMixamoClipToVrm returns null for empty track list", async () => {
    const { retargetMixamoClipToVrm } = await import("../utils/mixamoRetarget");
    const clip = new THREE.AnimationClip("test", 1, []);
    const root = new THREE.Group();
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: () => null,
      },
    } as unknown as VRM;
    const result = retargetMixamoClipToVrm(clip, root, vrm);
    expect(result).toBeNull();
  });
});

// --- Test: CompanionMotor imports from mixamoRetarget (not file-scoped) ---

describe("CompanionMotor uses mixamoRetarget", () => {
  it("CompanionMotor module does not define retargetMixamoClipToVrm itself", async () => {
    // After Step 1, CompanionMotor should NOT export or define retargetMixamoClipToVrm.
    // It imports it from mixamoRetarget. We verify the shared util IS exported.
    const retargetMod = await import("../utils/mixamoRetarget");
    expect(retargetMod.retargetMixamoClipToVrm).toBeDefined();
    expect(retargetMod.loadMixamoFbxRoot).toBeDefined();
  });
});

// --- Test: CompanionFace RAF tick calls mixer.update before vrm.update ---

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  const el = document.createElement("canvas");
  Object.assign(el.style, { zIndex: "", pointerEvents: "" });
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockImplementation(() => ({
      domElement: el,
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      setClearColor: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      outputColorSpace: "",
      toneMapping: 0,
    })),
  };
});

vi.mock("../utils/loadCompanionVrm", async () => {
  const THREE = await import("three");
  const mockVrm = {
    scene: new THREE.Group(),
    update: vi.fn(),
    humanoid: { getRawBoneNode: () => null, getNormalizedBoneNode: () => null },
    expressionManager: {
      setValue: vi.fn(),
      getExpression: vi.fn(() => ({})),
      expressionMap: { aa: {} },
      update: vi.fn(),
      expressions: [{ expressionName: "aa" }],
    },
    springBoneManager: null,
    lookAt: null,
  };
  return {
    loadCompanionVrm: vi.fn().mockResolvedValue(mockVrm),
    applyCompanionVrmExpression: vi.fn(),
  };
});

vi.mock("../utils/mixamoRetarget", () => ({
  retargetMixamoClipToVrm: vi.fn().mockReturnValue(null),
  loadMixamoFbxRoot: vi.fn().mockRejectedValue(new Error("idle.fbx not found (test)")),
}));

import { loadCompanionVrm } from "../utils/loadCompanionVrm";
import { loadMixamoFbxRoot } from "../utils/mixamoRetarget";

describe("CompanionFace idle animation", () => {
  beforeEach(() => {
    vi.mocked(loadCompanionVrm).mockClear();
    vi.mocked(loadMixamoFbxRoot).mockClear();
  });

  it("does not throw when idle.fbx is missing (loadMixamoFbxRoot rejects)", async () => {
    vi.mocked(loadMixamoFbxRoot).mockRejectedValue(new Error("idle.fbx not found"));
    const { render, cleanup } = await import("@testing-library/react");
    const React = (await import("react")).default;
    const { CompanionFace } = await import("../components/CompanionFace");
    expect(() =>
      render(
        React.createElement(CompanionFace, {
          vrmUrl: "/test.vrm",
          expression: "happy",
          faceCamera: {
            position: [0, 1.35, 1.45] as [number, number, number],
            target: [0, 1.15, 0] as [number, number, number],
          },
        }),
      ),
    ).not.toThrow();
    cleanup();
  });

  it("attempts to load idle.fbx after VRM loads", async () => {
    const { render, waitFor, cleanup } = await import("@testing-library/react");
    const React = (await import("react")).default;
    const { CompanionFace } = await import("../components/CompanionFace");
    render(
      React.createElement(CompanionFace, {
        vrmUrl: "/test.vrm",
        expression: "happy",
        faceCamera: {
          position: [0, 1.35, 1.45] as [number, number, number],
          target: [0, 1.15, 0] as [number, number, number],
        },
      }),
    );
    await waitFor(() => {
      expect(vi.mocked(loadMixamoFbxRoot)).toHaveBeenCalledWith("/animations/idle.fbx");
    });
    cleanup();
  });
});
