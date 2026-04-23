import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
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
    const wrap = container.querySelector("div.fixed.inset-0");
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
    const wrap = container.querySelector("div.fixed.inset-0") as HTMLElement;
    expect(wrap.style.display).toBe("none");

    rerender(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} />,
    );
    expect(wrap.style.display).toBe("block");
  });
});

describe("CompanionLayer mode transition", () => {
  beforeEach(() => {
    vi.mocked(loadCompanionVrm).mockClear();
    WebGPURendererConstructor.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("canvas persists after mode switch full→portrait", async () => {
    const { rerender, container } = render(
      <CompanionLayer mode="full" childId="fixture" companion={companion} toggledOff={false} />,
    );
    await waitFor(() => expect(container.querySelector("canvas")).toBeTruthy());

    rerender(
      <CompanionLayer mode="portrait" childId="fixture" companion={companion} toggledOff={false} />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-testid="companion-portrait"] canvas')).toBeTruthy(),
    );
  });
});

describe("CompanionLayer portrait mode", () => {
  beforeEach(() => {
    vi.mocked(loadCompanionVrm).mockClear();
    WebGPURendererConstructor.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("canvas appears inside portrait container when starting directly in portrait mode", async () => {
    const { container } = render(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} mode="portrait" />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-testid="companion-portrait"] canvas')).toBeTruthy(),
    );
  });

  it("canvas appears after portrait→full→portrait round-trip", async () => {
    const { rerender, container } = render(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} mode="portrait" />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-testid="companion-portrait"] canvas')).toBeTruthy(),
    );

    rerender(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} mode="full" />,
    );
    await waitFor(() => expect(container.querySelector("canvas")).toBeTruthy());

    rerender(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} mode="portrait" />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-testid="companion-portrait"] canvas')).toBeTruthy(),
    );
  });

  it("renders 120×120 circle container when mode='portrait'", () => {
    const { getByTestId } = render(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} mode="portrait" />,
    );
    const el = getByTestId("companion-portrait") as HTMLElement;
    expect(el.style.width).toBe("120px");
    expect(el.style.height).toBe("120px");
    expect(el.style.borderRadius).toBe("50%");
  });

  it("portrait container z-index is above game overlays (> 100)", () => {
    // Game iframe overlay: z-index 100 (AdventureMap launchedUrl container)
    // Karaoke/pronunciation wrappers: z-50 in App.tsx
    // Portrait companion must float above all of them.
    const { getByTestId } = render(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} mode="portrait" />,
    );
    const el = getByTestId("companion-portrait") as HTMLElement;
    expect(Number(el.style.zIndex)).toBeGreaterThan(100);
  });

  it("does not render portrait container when mode='full'", () => {
    const { container } = render(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} mode="full" />,
    );
    expect(container.querySelector('[data-testid="companion-portrait"]')).toBeNull();
    expect(container.querySelector("div.fixed.inset-0")).toBeTruthy();
  });

  it("CompanionLayer calls onToggleMute when portrait tapped", () => {
    const onToggleMute = vi.fn();
    const { getByTestId } = render(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        toggledOff={false}
        mode="portrait"
        micMuted={false}
        onToggleMute={onToggleMute}
      />,
    );
    fireEvent.click(getByTestId("companion-portrait"));
    expect(onToggleMute).toHaveBeenCalledOnce();
  });

  it("CompanionLayer shows mute indicator when micMuted is true", () => {
    const { getByTestId } = render(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        toggledOff={false}
        mode="portrait"
        micMuted={true}
        onToggleMute={() => {}}
      />,
    );
    expect(getByTestId("companion-muted-overlay").textContent).toBe("🔇");
  });

  it("CompanionLayer does not show mute indicator when micMuted is false", () => {
    const { queryByTestId } = render(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        toggledOff={false}
        mode="portrait"
        micMuted={false}
        onToggleMute={() => {}}
      />,
    );
    expect(queryByTestId("companion-muted-overlay")).toBeNull();
  });
});
