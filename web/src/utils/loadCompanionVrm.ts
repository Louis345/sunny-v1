import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  MToonMaterialLoaderPlugin,
  VRMLoaderPlugin,
  VRM,
} from "@pixiv/three-vrm";
import { MToonNodeMaterial } from "@pixiv/three-vrm/nodes";
import { validateVrmRequirements } from "./vrmRequirements";

export type LoadCompanionVrmOptions = {
  /** When true (default), use MToonNodeMaterial for WebGPURenderer. When false, classic materials for WebGLRenderer. */
  webgpu?: boolean;
};

/**
 * Load a VRM from URL (same-origin path or absolute URL), validate, return VRM instance.
 * With `webgpu: true` (default), uses MToonNodeMaterial for WebGPURenderer (three-vrm README).
 * With `webgpu: false`, uses default VRMLoaderPlugin materials for WebGLRenderer.
 */
export async function loadCompanionVrm(
  modelUrl: string,
  options?: LoadCompanionVrmOptions,
): Promise<VRM> {
  const useWebGpuMaterials = options?.webgpu !== false;
  const loader = new GLTFLoader();
  if (useWebGpuMaterials) {
    loader.register((parser) => {
      const mtoonMaterialPlugin = new MToonMaterialLoaderPlugin(parser, {
        materialType: MToonNodeMaterial,
      });
      return new VRMLoaderPlugin(parser, { mtoonMaterialPlugin });
    });
  } else {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  }
  const gltf = await loader.loadAsync(modelUrl);
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) {
    throw new Error("CompanionLayer: glTF loaded but userData.vrm is missing (not a VRM?)");
  }
  validateVrmRequirements(vrm);
  logVrmFullCapabilityAudit(vrm);
  return vrm;
}

/**
 * One-shot audit after load — expressions, humanoid bones, meta, managers.
 * Run in the browser console to align `children.config.json` with this asset.
 */
export function logVrmFullCapabilityAudit(vrm: VRM): void {
  const expressions = vrm.expressionManager
    ? Object.keys((vrm.expressionManager as { expressionMap?: Record<string, unknown> }).expressionMap ?? {})
    : [];

  const bones = vrm.humanoid
    ? Object.keys((vrm.humanoid as { humanBones?: Record<string, unknown> }).humanBones ?? {})
    : [];

  const meta = (vrm as unknown as { meta?: { metaVersion?: string } }).meta;
  const metaVersion =
    meta && typeof meta === "object" && "metaVersion" in meta
      ? String((meta as { metaVersion?: string }).metaVersion ?? "unknown")
      : "unknown";

  console.group("[VRM] Full capability audit");
  console.log("Expressions available:", expressions);
  console.log("Humanoid bones:", bones);
  console.log("VRM version:", metaVersion);
  console.log("Has expressionManager:", Boolean(vrm.expressionManager));
  console.log("Has humanoid:", Boolean(vrm.humanoid));
  console.log("Has springBoneManager:", Boolean((vrm as { springBoneManager?: unknown }).springBoneManager));
  console.groupEnd();
}

/**
 * Reset all expression weights, then apply one blend shape by name if present.
 */
export function applyCompanionVrmExpression(vrm: VRM, blendShapeName: string): void {
  const manager = vrm.expressionManager;
  if (!manager) return;
  manager.resetValues();
  if (manager.getExpression(blendShapeName) != null) {
    manager.setValue(blendShapeName, 1);
  } else {
    console.warn(`[VRM] expression "${blendShapeName}" not found`);
    if (manager.getExpression("neutral") != null) {
      manager.setValue("neutral", 1);
    }
  }
  manager.update();
}
