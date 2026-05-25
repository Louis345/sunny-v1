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
import { CompanionMotor } from "../companion/CompanionMotor";
import type { CompanionBehavior } from "../context/companionCareBehavior";

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

  it("can use the stronger centered idle for full-body companion boards", async () => {
    const idleSpy = vi.spyOn(CompanionMotor.prototype, "setShowroomIdle");
    render(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        toggledOff={false}
        mode="full"
        idlePose="center"
      />,
    );

    await waitFor(() => expect(idleSpy).toHaveBeenCalledWith("center", 0.37));
    idleSpy.mockRestore();
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

  it("reflects companion care mood on the live layer", () => {
    const behavior: CompanionBehavior = {
      mood: "tired",
      presentationState: "needs-care",
      low: true,
      emote: "sad",
      intensity: 0.48,
      movementIntensity: 0.45,
      visualTreatment: {
        filter: "saturate(0.78) brightness(0.9)",
        opacity: 0.84,
      },
    };
    const { container } = render(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        companionBehavior={behavior}
        toggledOff={false}
      />,
    );
    const wrap = container.querySelector("[data-companion-care-mood]");
    expect(wrap).toBeTruthy();
    expect(wrap?.getAttribute("data-companion-care-mood")).toBe("tired");
    expect(wrap?.getAttribute("data-companion-care-low")).toBe("true");
    expect(wrap?.getAttribute("data-companion-care-state")).toBe("needs-care");
  });

  it("replays the same feed animation when the behavior event id changes", async () => {
    const commandSpy = vi.spyOn(
      CompanionMotor.prototype,
      "processCompanionCommands",
    );
    const firstBehavior: CompanionBehavior = {
      mood: "happy",
      presentationState: "feeding",
      low: false,
      emote: "happy",
      intensity: 0.62,
      movementIntensity: 0.78,
      visualTreatment: { filter: "none", opacity: 1 },
      animationEventId: "feed-1",
    };
    const { rerender } = render(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        companionBehavior={firstBehavior}
        toggledOff={false}
      />,
    );
    await waitFor(() =>
      expect(commandSpy.mock.calls.some(([commands]) =>
        commands.some((cmd) => cmd.type === "emote" && cmd.payload.emote === "happy"),
      )).toBe(true),
    );
    const happyCallsBefore = commandSpy.mock.calls.filter(([commands]) =>
      commands.some((cmd) => cmd.type === "emote" && cmd.payload.emote === "happy"),
    ).length;

    rerender(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        companionBehavior={{ ...firstBehavior, animationEventId: "feed-2" }}
        toggledOff={false}
      />,
    );

    await waitFor(() => {
      const happyCallsAfter = commandSpy.mock.calls.filter(([commands]) =>
        commands.some((cmd) => cmd.type === "emote" && cmd.payload.emote === "happy"),
      ).length;
      expect(happyCallsAfter).toBeGreaterThan(happyCallsBefore);
    });
  });

  it("lifts feed effects above the bookbag overlay and renders the chomp arc contract", () => {
    const behavior: CompanionBehavior = {
      mood: "happy",
      presentationState: "feeding",
      low: false,
      emote: "happy",
      intensity: 0.66,
      movementIntensity: 0.82,
      visualTreatment: { filter: "none", opacity: 1 },
      animationEventId: "feed-visible-1",
      feedAnimation: {
        kind: "normal-feed",
        reference: "animation-a",
        itemId: "apple_bite",
      },
    };

    const { getByTestId } = render(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        companionBehavior={behavior}
        toggledOff={false}
      />,
    );

    const stack = getByTestId("companion-layer-stack");
    const effect = getByTestId("companion-feed-effect");
    expect(stack).toHaveStyle({ zIndex: "12050" });
    expect(effect.getAttribute("data-feed-animation")).toBe("animation-a");
    expect(effect).toHaveStyle({ animationName: "companion-chomp-arc" });
  });

  it("renders a prominent loot banner for rare feed animation-b", () => {
    const behavior: CompanionBehavior = {
      mood: "bright",
      presentationState: "celebrating",
      low: false,
      emote: "celebrating",
      intensity: 0.85,
      movementIntensity: 1,
      visualTreatment: { filter: "none", opacity: 1 },
      animation: "dance_victory",
      animationEventId: "feed-rare-1",
      feedAnimation: {
        kind: "rare-reward",
        reference: "animation-b",
        itemId: "mystery_snack",
      },
    };

    const { getByTestId } = render(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        companionBehavior={behavior}
        toggledOff={false}
      />,
    );

    expect(getByTestId("companion-loot-banner")).toHaveTextContent("RARE");
    expect(getByTestId("companion-feed-effect")).toHaveStyle({
      animationName: "companion-loot-drop",
      animationDuration: "2600ms",
    });
  });

  it("escalates repeated feed events into combo badges and burst particles", async () => {
    const firstBehavior: CompanionBehavior = {
      mood: "happy",
      presentationState: "feeding",
      low: false,
      emote: "happy",
      intensity: 0.66,
      movementIntensity: 0.82,
      visualTreatment: { filter: "none", opacity: 1 },
      animationEventId: "feed-combo-1",
      feedAnimation: {
        kind: "normal-feed",
        reference: "animation-a",
        itemId: "apple_bite",
      },
    };

    const { getByTestId, rerender } = render(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        companionBehavior={firstBehavior}
        toggledOff={false}
      />,
    );

    rerender(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        companionBehavior={{ ...firstBehavior, animationEventId: "feed-combo-2" }}
        toggledOff={false}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("companion-combo-badge")).toHaveTextContent("2x COMBO");
    });
    expect(getByTestId("companion-feed-burst").children.length).toBeGreaterThan(3);
  });

  it("plays local feed sound effects without browser speech synthesis", async () => {
    const oscillatorStart = vi.fn();
    const gainRamp = vi.fn();
    const audioContext = {
      currentTime: 0,
      state: "running",
      destination: {},
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: gainRamp,
        },
        connect: vi.fn(),
      })),
      createOscillator: vi.fn(() => ({
        type: "sine",
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: oscillatorStart,
        stop: vi.fn(),
      })),
      resume: vi.fn().mockResolvedValue(undefined),
    };
    const AudioContextMock = vi.fn(() => audioContext);
    const speechSpeak = vi.fn();
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: AudioContextMock,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak: speechSpeak },
    });

    const behavior: CompanionBehavior = {
      mood: "happy",
      presentationState: "feeding",
      low: false,
      emote: "happy",
      intensity: 0.66,
      movementIntensity: 0.82,
      visualTreatment: { filter: "none", opacity: 1 },
      animation: "silly_laugh",
      animationEventId: "feed-sfx-1",
      feedAnimation: {
        kind: "normal-feed",
        reference: "animation-a",
        itemId: "apple_bite",
      },
    };

    render(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        companionBehavior={behavior}
        toggledOff={false}
      />,
    );

    await waitFor(() => expect(oscillatorStart).toHaveBeenCalled());
    expect(gainRamp).toHaveBeenCalled();
    expect(speechSpeak).not.toHaveBeenCalled();
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

  it("portrait stack z-index is above game overlays (> 100)", () => {
    // Game iframe overlay: z-index 100 (AdventureMap launchedUrl container)
    // Karaoke/pronunciation wrappers: z-50 in App.tsx
    // Portrait companion must float above all of them.
    const { getByTestId } = render(
      <CompanionLayer childId="fixture" companion={companion} toggledOff={false} mode="portrait" />,
    );
    const el = getByTestId("companion-portrait-stack") as HTMLElement;
    expect(Number(el.style.zIndex)).toBeGreaterThan(100);
  });

  it("renders speech bubble above portrait when speechBubbleText is set", () => {
    const { getByTestId } = render(
      <CompanionLayer
        childId="fixture"
        companion={companion}
        toggledOff={false}
        mode="portrait"
        speechBubbleText="Hello there"
      />,
    );
    const stack = getByTestId("companion-portrait-stack");
    const bubble = getByTestId("companion-speech-bubble");
    const portrait = getByTestId("companion-portrait");
    expect(stack.firstChild).toBe(bubble);
    expect(stack.lastChild).toBe(portrait);
    expect(bubble.textContent).toBe("Hello there");
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
