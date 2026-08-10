import { describe, expect, it } from "vitest";
import { parseXwearMesh } from "../lib/xwearMesh";

const int32 = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return bytes;
};

const float32 = (...values: number[]) => {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytes;
};

const join = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

const counted = (values: Uint8Array, count: number) => join(int32(count), values);

function createTriangleFixture() {
  const name = new TextEncoder().encode("dress");
  const identity = float32(
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  );

  return join(
    int32(0),
    new Uint8Array([name.length]),
    name,
    int32(3),
    counted(float32(0, 0, 0, 1, 0, 0, 0, 1, 0), 3),
    counted(float32(0, 0, 1, 0, 0, 1, 0, 0, 1), 3),
    counted(float32(1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1), 3),
    int32(0),
    counted(float32(0, 0, 1, 0, 0, 1), 3),
    int32(0),
    int32(0),
    int32(0),
    counted(join(
      float32(1, 0, 0, 0), int32(0), int32(0), int32(0), int32(0),
      float32(1, 0, 0, 0), int32(0), int32(0), int32(0), int32(0),
      float32(1, 0, 0, 0), int32(0), int32(0), int32(0), int32(0),
    ), 3),
    counted(identity, 1),
    int32(1),
    int32(0),
    counted(join(int32(0), int32(1), int32(2)), 3),
    int32(0),
    int32(0),
  ).buffer;
}

describe("XWear mesh decoder", () => {
  it("recovers standard skinned-mesh attributes and submesh indices", () => {
    const mesh = parseXwearMesh(createTriangleFixture());

    expect(mesh.name).toBe("dress");
    expect(mesh.vertexCount).toBe(3);
    expect([...mesh.positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect([...mesh.uv0]).toEqual([0, 0, 1, 0, 0, 1]);
    expect([...mesh.boneIndices]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...mesh.boneWeights]).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(mesh.bindPoses).toHaveLength(1);
    expect(mesh.submeshes).toEqual([{ topology: 0, indices: new Uint32Array([0, 1, 2]) }]);
  });

  it("rejects truncated input instead of silently returning corrupt clothing", () => {
    const fixture = createTriangleFixture();
    expect(() => parseXwearMesh(fixture.slice(0, fixture.byteLength - 1))).toThrow(
      /unexpected end of XWear mesh/i,
    );
  });
});
