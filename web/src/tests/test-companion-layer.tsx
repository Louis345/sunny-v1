import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import type { CompanionConfig } from "../../../src/shared/companionTypes";
import { cloneCompanionDefaults } from "../../../src/shared/companionTypes";

vi.mock("../utils/loadCompanionVrm", async () => {
  const THREE = await import("three");
  return {
    loadCompanionVrm: vi.fn().mockImplementation(() =>
      Promise.resolve({
        scene: new THREE.Group(),
        update: vi.fn(),
        humanoid: { getRawBoneNode: () => null },
        expressionManager: {
          setValue: vi.fn(),
          getExpression: vi.fn((name: string) => (name ? {} : null)),
          expressionMap: {
            happy: {},
            sad: {},
            surprised: {},
            lookDown: {},
            angry: {},
            blink: {},
            neutral: {},
            aa: {},
          },
          update: vi.fn(),
          expressions: [
            { expressionName: "happy" },
            { expressionName: "sad" },
            { expressionName: "surprised" },
            { expressionName: "aa" },
          ],
        },
        lookAt: null,
      }),
    ),
  };
});

const WebGPURendererConstructor = vi.hoisted(() =>
  vi.fn().mockImplementation((opts?: { antialias?: boolean }) => {
    const el = document.createElement("canvas");
    (
      el as HTMLCanvasElement & { __webgpuOpts?: { antialias?: boolean } }
    ).__webgpuOpts = opts;
    Object.assign(el.style, { zIndex: "", pointerEvents: "" });
    return {
      isWebGPURenderer: true as const,
      domElement: el,
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      setClearColor: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      render: vi.fn(),
      dispose: vi.fn(),
    };
  }),
);

vi.mock("three/webgpu", async (importOriginal) => {
  const mod = await importOriginal<typeof import("three/webgpu")>();
  return {
    ...mod,
    WebGPURenderer: WebGPURendererConstructor as unknown as typeof mod.WebGPURenderer,
  };
});

import { loadCompanionVrm } from "../utils/loadCompanionVrm";
import { CompanionLayer } from "../components/CompanionLayer";

const companion: CompanionConfig = cloneCompanionDefaults();

describe("CompanionLayer (COMPANION-002)", () => {
  beforeEach(() => {
    vi.mocked(loadCompanionVrm).mockClear();
    WebGPURendererConstructor.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("returns null when childId is null", () => {
    const { container } = render(
      <CompanionLayer childId={null} companion={companion} toggledOff={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when childId is empty", () => {
    const { container } = render(
      <CompanionLayer childId="" companion={companion} toggledOff={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders wrapper when childId and companion are set", async () => {
    const { container } = render(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} />,
    );
    await waitFor(() => {
      expect(WebGPURendererConstructor).toHaveBeenCalled();
    });
    const call = WebGPURendererConstructor.mock.calls[0]?.[0] as
      | { antialias?: boolean }
      | undefined;
    expect(call?.antialias).toBe(true);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();
    expect(canvas?.style.zIndex).toBe("10");
    expect(canvas?.style.pointerEvents).toBe("none");
  });

  it("sets canvas display none when toggledOff", async () => {
    const { container, rerender } = render(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} />,
    );
    await waitFor(() => expect(container.querySelector("canvas")).toBeTruthy());
    const wrap = container.querySelector(".pointer-events-none.fixed");
    expect(wrap).toBeTruthy();
    expect((wrap as HTMLElement).style.display).not.toBe("none");

    rerender(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={true} />,
    );
    expect((wrap as HTMLElement).style.display).toBe("none");
  });

  it("shows wrapper when toggledOff becomes false again", async () => {
    const { container, rerender } = render(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={true} />,
    );
    await waitFor(() => expect(container.querySelector("canvas")).toBeTruthy());
    const wrap = container.querySelector(".pointer-events-none.fixed") as HTMLElement;
    expect(wrap.style.display).toBe("none");

    rerender(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} />,
    );
    expect(wrap.style.display).toBe("block");
  });
});
