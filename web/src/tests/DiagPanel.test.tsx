import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagPanel } from "../components/DiagPanel";

function renderDiagPanel(overrides: Partial<Parameters<typeof DiagPanel>[0]> = {}) {
  const props = {
    startSession: vi.fn(),
    endSession: vi.fn(),
    voiceActive: false,
    onCameraAct: vi.fn(),
    onTestReading: vi.fn(),
    onTestPronunciation: vi.fn(),
    onTestWordRadar: vi.fn(),
    ...overrides,
  };

  render(<DiagPanel {...props} />);
  return props;
}

describe("DiagPanel game test buttons", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses local reading launch callback instead of POST endpoint", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const props = renderDiagPanel();

    fireEvent.click(screen.getByText("Test Reading Mode"));

    expect(props.onTestReading).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses local pronunciation launch callback instead of POST endpoint", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const props = renderDiagPanel();

    fireEvent.click(screen.getByText("Test Pronunciation"));

    expect(props.onTestPronunciation).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Enable Voice starts a responding diag companion session, not STT-only game mode", () => {
    const props = renderDiagPanel();

    fireEvent.click(screen.getByText("Enable Voice"));

    expect(props.startSession).toHaveBeenCalledWith("creator", {
      diagKiosk: true,
    });
  });
});
