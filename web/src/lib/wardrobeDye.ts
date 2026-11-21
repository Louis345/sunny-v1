import * as THREE from "three";

/**
 * A colored variant dyes the fabric's light and shade with its tint. Multiplying the tint into the navy dress texture
 * made Plum, Teal and Rose all look navy (owner audit 2026-11-12). White (the Navy dress) draws the fabric as is.
 */
export function dyeWardrobeMaterial(material: THREE.MeshBasicMaterial, tint: string): THREE.MeshBasicMaterial {
  const color = new THREE.Color(tint);
  material.color.multiply(color);
  if (color.getHex() === 0xffffff) return material;
  material.userData.sunnyDye = tint;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float sunnyDyeLuma = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  sampledDiffuseColor.rgb = vec3( clamp( pow( sunnyDyeLuma, 0.25 ) * 1.6, 0.0, 1.0 ) );
  diffuseColor *= sampledDiffuseColor;
#endif`);
  };
  material.customProgramCacheKey = () => "sunny-dye";
  return material;
}
