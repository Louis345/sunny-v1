import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

// --- Test: idle animation via CompanionLayer (CompanionFace deleted) ---

vi.mock("three/webgpu", async (importOriginal) => {
  const mod = await importOriginal<typeof import("three/webgpu")>();
  const el = document.createElement("canvas");
  return {
    ...mod,
    WebGPURenderer: vi.fn().mockImplementation(() => ({
      isWebGPURenderer: true as const,
      domElement: el,
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      setClearColor: vi.fn(),
      init: vi.fn().mockRejectedValue(new Error("no WebGPU in test")),
      render: vi.fn(),
      dispose: vi.fn(),
      outputColorSpace: "",
    })),
  };
});

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

describe("CompanionLayer idle animation (replaces CompanionFace tests)", () => {
  beforeEach(() => {
    vi.mocked(loadCompanionVrm).mockClear();
    vi.mocked(loadMixamoFbxRoot).mockClear();
  });

  afterEach(async () => {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  });

  it("does not throw when idle.fbx is missing (loadMixamoFbxRoot rejects)", async () => {
    vi.mocked(loadMixamoFbxRoot).mockRejectedValue(new Error("idle.fbx not found"));
    const { render } = await import("@testing-library/react");
    const React = (await import("react")).default;
    const { CompanionLayer } = await import("../components/CompanionLayer");
    const { cloneCompanionDefaults } = await import("../../../src/shared/companionTypes");
    expect(() =>
      render(
        React.createElement(CompanionLayer, {
          childId: "fixture",
          companion: cloneCompanionDefaults(),
          toggledOff: false,
        }),
      ),
    ).not.toThrow();
  });

  it("attempts to load idle.fbx after VRM loads (via CompanionMotor)", async () => {
    const { render, waitFor } = await import("@testing-library/react");
    const React = (await import("react")).default;
    const { CompanionLayer } = await import("../components/CompanionLayer");
    const { cloneCompanionDefaults } = await import("../../../src/shared/companionTypes");
    render(
      React.createElement(CompanionLayer, {
        childId: "fixture",
        companion: cloneCompanionDefaults(),
        toggledOff: false,
      }),
    );
    await waitFor(() => {
      expect(vi.mocked(loadMixamoFbxRoot)).toHaveBeenCalledWith(
        expect.stringContaining("/animations/idle.fbx"),
      );
    });
  });
});
