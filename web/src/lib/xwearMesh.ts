export type XwearSubmesh = {
  topology: number;
  indices: Uint32Array;
};

export type XwearMesh = {
  indexFormat: number;
  name: string;
  vertexCount: number;
  positions: Float32Array;
  normals: Float32Array;
  tangents: Float32Array;
  colors: Float32Array;
  uv0: Float32Array;
  uv1: Float32Array;
  uv2: Float32Array;
  uv3: Float32Array;
  boneWeights: Float32Array;
  boneIndices: Int32Array;
  bindPoses: Float32Array[];
  submeshes: XwearSubmesh[];
};

class XwearReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  private require(byteLength: number) {
    if (byteLength < 0 || this.offset + byteLength > this.view.byteLength) {
      throw new Error("Unexpected end of XWear mesh");
    }
  }

  int32() {
    this.require(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  float32() {
    this.require(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  length(label: string) {
    const value = this.int32();
    if (value < 0 || value > 10_000_000) {
      throw new Error(`Invalid ${label} length in XWear mesh: ${value}`);
    }
    return value;
  }

  string() {
    let length = 0;
    let shift = 0;
    for (let byteIndex = 0; byteIndex < 5; byteIndex += 1) {
      this.require(1);
      const byte = this.view.getUint8(this.offset);
      this.offset += 1;
      length |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        this.require(length);
        const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
        this.offset += length;
        return new TextDecoder().decode(bytes);
      }
      shift += 7;
    }
    throw new Error("Invalid XWear mesh string length");
  }

  floatArray(count: number, arity: number) {
    const values = new Float32Array(count * arity);
    for (let index = 0; index < values.length; index += 1) values[index] = this.float32();
    return values;
  }

  intArray(count: number) {
    const values = new Int32Array(count);
    for (let index = 0; index < count; index += 1) values[index] = this.int32();
    return values;
  }

  uintArray(count: number) {
    const values = new Uint32Array(count);
    for (let index = 0; index < count; index += 1) values[index] = this.int32();
    return values;
  }

  remaining() {
    return this.view.byteLength - this.offset;
  }
}

export function parseXwearMesh(buffer: ArrayBuffer): XwearMesh {
  const reader = new XwearReader(buffer);
  const indexFormat = reader.int32();
  const name = reader.string();
  const vertexCount = reader.length("vertex");

  const positions = reader.floatArray(reader.length("position"), 3);
  const normals = reader.floatArray(reader.length("normal"), 3);
  const tangents = reader.floatArray(reader.length("tangent"), 4);
  const colors = reader.floatArray(reader.length("color"), 4);
  const uv0 = reader.floatArray(reader.length("UV0"), 2);
  const uv1 = reader.floatArray(reader.length("UV1"), 2);
  const uv2 = reader.floatArray(reader.length("UV2"), 2);
  const uv3 = reader.floatArray(reader.length("UV3"), 2);

  const boneWeightCount = reader.length("bone weight");
  const boneWeights = new Float32Array(boneWeightCount * 4);
  const boneIndices = new Int32Array(boneWeightCount * 4);
  for (let vertex = 0; vertex < boneWeightCount; vertex += 1) {
    for (let influence = 0; influence < 4; influence += 1) {
      boneWeights[vertex * 4 + influence] = reader.float32();
    }
    for (let influence = 0; influence < 4; influence += 1) {
      boneIndices[vertex * 4 + influence] = reader.int32();
    }
  }

  const bindPoseCount = reader.length("bind pose");
  const bindPoses = Array.from({ length: bindPoseCount }, () => reader.floatArray(1, 16));

  const submeshCount = reader.length("submesh");
  const submeshes = Array.from({ length: submeshCount }, () => {
    const topology = reader.int32();
    const indices = reader.uintArray(reader.length("submesh index"));
    return { topology, indices };
  });

  // XWear v2 closes the mesh payload with two currently-unused counted sections.
  // The sample contains zero entries for both; fail loudly if a later asset uses them.
  const trailingSectionCount = reader.int32();
  const trailingMetadataCount = reader.int32();
  if (trailingSectionCount !== 0 || trailingMetadataCount !== 0) {
    throw new Error("Unsupported non-empty trailing section in XWear mesh");
  }

  if (reader.remaining() !== 0) {
    throw new Error(`Unexpected trailing data in XWear mesh (${reader.remaining()} bytes)`);
  }
  if (positions.length !== vertexCount * 3 || boneWeights.length !== vertexCount * 4) {
    throw new Error("XWear mesh vertex attributes do not match its declared vertex count");
  }

  return {
    indexFormat,
    name,
    vertexCount,
    positions,
    normals,
    tangents,
    colors,
    uv0,
    uv1,
    uv2,
    uv3,
    boneWeights,
    boneIndices,
    bindPoses,
    submeshes,
  };
}
