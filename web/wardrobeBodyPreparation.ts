import type { GltfJson } from '../scripts/prepareWardrobe';

type Asset = {json: GltfJson; binary: Buffer};

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
