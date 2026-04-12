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
  return vrm;
}
