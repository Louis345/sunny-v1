import * as THREE from 'three';
import type { GltfJson } from '../scripts/prepareWardrobe';

type Asset = {json: GltfJson; binary: Buffer};
export type BodyRepair = { donorMesh: number; donorPrimitive: number; targetMesh: number; targetPrimitive: number; targetMaterial: number };

export function readAccessor(asset: Asset, index: number): number[][] {
  const accessor = asset.json.accessors[index];
  const view = asset.json.bufferViews[accessor.bufferView];
  if (accessor.sparse || view.buffer !== 0) throw new Error('Body preparation requires an embedded dense accessor');
  const sizes: Record<string, number> = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
  const arity = sizes[accessor.type];
  const components: Record<number, number> = {5121:1,5123:2,5125:4,5126:4};
  const size = components[accessor.componentType];
  if (!size || !arity) throw new Error('Unsupported body accessor format');
  const data = new DataView(asset.binary.buffer, asset.binary.byteOffset + 8, asset.binary.length - 8);
  return Array.from({length: accessor.count}, (_, vertex) => Array.from({length: arity}, (_, component) => {
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + vertex * (view.byteStride ?? arity * size) + component * size;
    const value = accessor.componentType === 5126 ? data.getFloat32(offset,true) : size === 4 ? data.getUint32(offset,true) : size === 2 ? data.getUint16(offset,true) : data.getUint8(offset);
    return accessor.normalized && accessor.componentType !== 5126 ? value / (size === 1 ? 255 : 65535) : value;
  }));
}

// Offline body-family conversion. Complete face meshes and the destination skeleton are never rewritten.
export function restoreBodySurface(target: Asset, donor: Asset, recipe: BodyRepair): Buffer {
  const sourcePrimitive = donor.json.meshes[recipe.donorMesh].primitives[recipe.donorPrimitive];
  const targetPrimitive = target.json.meshes[recipe.targetMesh].primitives[recipe.targetPrimitive];
  if (targetPrimitive.material !== recipe.targetMaterial) throw new Error('Body repair material selection changed');
  const skinFor = (asset: Asset, mesh: number) => asset.json.skins[asset.json.nodes.find((node: GltfJson) => node.mesh === mesh).skin];
  const sourceSkin = skinFor(donor, recipe.donorMesh);
  const targetSkin = skinFor(target, recipe.targetMesh);
  const targetNames = targetSkin.joints.map((index: number) => target.json.nodes[index].name);
  const parents = new Map<number, number>();
  donor.json.nodes.forEach((node: GltfJson, parent: number) => (node.children ?? []).forEach((child: number) => parents.set(child, parent)));
  const sourceAnchors: number[] = sourceSkin.joints.map((nodeIndex: number) => {
    let current = nodeIndex;
    for (let depth = 0; depth < 10; depth++) {
      const skinIndex = sourceSkin.joints.indexOf(current);
      if (skinIndex >= 0 && targetNames.includes(donor.json.nodes[current].name)) return skinIndex;
      const parent = parents.get(current);
      if (parent === undefined) return -1;
      current = parent;
    }
    throw new Error('Body joint ancestry exceeded 10 steps');
  });
  const mapping: number[] = sourceAnchors.map(index => index < 0 ? -1 : targetNames.indexOf(donor.json.nodes[sourceSkin.joints[index]].name));
  const sourceInverses = readAccessor(donor, sourceSkin.inverseBindMatrices).map(matrix => new THREE.Matrix4().fromArray(matrix));
  const targetWorld = readAccessor(target, targetSkin.inverseBindMatrices).map(matrix => new THREE.Matrix4().fromArray(matrix).invert());
  const coordinateRotation = new THREE.Matrix4().makeRotationY(Boolean(donor.json.extensions.VRM) !== Boolean(target.json.extensions.VRM) ? Math.PI : 0);
  const positions = readAccessor(donor, sourcePrimitive.attributes.POSITION);
  const normals = readAccessor(donor, sourcePrimitive.attributes.NORMAL);
  const joints = readAccessor(donor, sourcePrimitive.attributes.JOINTS_0);
  const weights = readAccessor(donor, sourcePrimitive.attributes.WEIGHTS_0);
  const outputPositions: number[] = []; const outputNormals: number[] = []; const outputJoints: number[] = [];
  for (let vertex = 0; vertex < positions.length; vertex++) {
    const position = new THREE.Vector3(); const normal = new THREE.Vector3();
    for (let influence = 0; influence < 4; influence++) {
      const index = joints[vertex][influence]; const weight = weights[vertex][influence];
      const mapped = mapping[index];
      if (weight > 0 && mapped < 0) throw new Error(`Unmapped active donor joint ${index}`);
      outputJoints.push(mapped < 0 ? 0 : mapped);
      if (weight === 0) continue;
      // Both meshes are already in their authored T pose. Local bone axes are
      // exporter-specific (the donor head even permutes XYZ); map joint positions.
      const sourceAnchor = new THREE.Vector3().setFromMatrixPosition(sourceInverses[sourceAnchors[index]].clone().invert());
      const targetAnchor = new THREE.Vector3().setFromMatrixPosition(targetWorld[mapped]);
      const transform = new THREE.Matrix4().makeTranslation(targetAnchor.x, targetAnchor.y, targetAnchor.z)
        .multiply(coordinateRotation).multiply(new THREE.Matrix4().makeTranslation(-sourceAnchor.x, -sourceAnchor.y, -sourceAnchor.z));
      position.add(new THREE.Vector3().fromArray(positions[vertex]).applyMatrix4(transform).multiplyScalar(weight));
      normal.add(new THREE.Vector3().fromArray(normals[vertex]).applyMatrix3(new THREE.Matrix3().getNormalMatrix(transform)).multiplyScalar(weight));
    }
    outputPositions.push(...position.toArray()); outputNormals.push(...normal.normalize().toArray());
  }
  const chunks = [target.binary.subarray(8)]; let length = chunks[0].length;
  const append = (values: number[], type: string, componentType: number, arity: number) => {
    const array = componentType === 5126 ? new Float32Array(values) : componentType === 5123 ? new Uint16Array(values) : new Uint32Array(values);
    const bytes = Buffer.from(array.buffer);
    const padding = (4 - length % 4) % 4;
    chunks.push(Buffer.alloc(padding)); length += padding;
    const view = target.json.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length}) - 1;
    chunks.push(bytes); length += bytes.length;
    const accessor: GltfJson = {bufferView:view,componentType,count:values.length / arity,type};
    if (type === 'VEC3') {
      accessor.min = Array.from({length:3},(_,axis)=>Math.min(...values.filter((_,i)=>i%3===axis)));
      accessor.max = Array.from({length:3},(_,axis)=>Math.max(...values.filter((_,i)=>i%3===axis)));
    }
    return target.json.accessors.push(accessor)-1;
  };
  target.json.meshes[recipe.targetMesh].primitives[recipe.targetPrimitive] = {
    ...targetPrimitive,
    attributes: {
      POSITION: append(outputPositions,'VEC3',5126,3), NORMAL: append(outputNormals,'VEC3',5126,3),
      TEXCOORD_0: append(readAccessor(donor,sourcePrimitive.attributes.TEXCOORD_0).flat(),'VEC2',5126,2),
      JOINTS_0: append(outputJoints,'VEC4',5123,4), WEIGHTS_0: append(weights.flat(),'VEC4',5126,4),
    },
    indices: append(readAccessor(donor,sourcePrimitive.indices).flat(),'SCALAR',5125,1),
  };
  target.json.materials[recipe.targetMaterial].alphaMode = 'OPAQUE';
  const mtoon = target.json.extensions.VRM?.materialProperties?.[recipe.targetMaterial];
  if (mtoon) {
    mtoon.floatProperties = {...mtoon.floatProperties,_BlendMode:0,_Cutoff:0,_ZWrite:1};
    mtoon.keywordMap = {...mtoon.keywordMap,_ALPHATEST_ON:false,_ALPHABLEND_ON:false,_ALPHAPREMULTIPLY_ON:false};
    mtoon.tagMap = {...mtoon.tagMap,RenderType:'Opaque'}; mtoon.renderQueue=2000;
  }
  const payload = Buffer.concat(chunks); target.json.buffers[0].byteLength=payload.length;
  const header = Buffer.alloc(8);header.writeUInt32LE(payload.length,0);header.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,payload]);
}
