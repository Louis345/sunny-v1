import { describe, expect, it, vi } from "vitest";

import { createBrowserRequestId } from "../utils/browserRequestId";

describe("createBrowserRequestId", () => {
  it("uses the browser UUID implementation when the page is a secure context", () => {
    const randomUUID = vi.fn(() => "native-uuid");

    expect(createBrowserRequestId({ randomUUID, getRandomValues: vi.fn() })).toBe(
      "native-uuid",
    );
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("creates a collision-resistant ID when randomUUID is unavailable on LAN HTTP", () => {
    const bytes = Uint8Array.from([
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
      0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
    ]);
    const getRandomValues = vi.fn((target: Uint8Array) => {
      target.set(bytes);
      return target;
    });

    expect(createBrowserRequestId({ getRandomValues })).toBe(
      "00112233-4455-4677-8899-aabbccddeeff",
    );
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it("still returns a unique-shaped ID when the legacy browser exposes no crypto APIs", () => {
    const id = createBrowserRequestId({}, { now: () => 1234, random: () => 0.25 });

    expect(id).toMatch(/^sunny-4d2-4-[a-z0-9]+$/);
  });
});
