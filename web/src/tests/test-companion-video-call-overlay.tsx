import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CompanionVideoCallOverlay } from "../components/CompanionVideoCallOverlay";

describe("CompanionVideoCallOverlay", () => {
  it("renders the reusable video-call shell from props", () => {
    const onAskVoice = vi.fn();
    const onQuestionChange = vi.fn();
    const onSubmitQuestion = vi.fn();
    const onLook = vi.fn();
    const onStartCamera = vi.fn();
    const onStopCamera = vi.fn();
    const onEnd = vi.fn();

    render(
      <CompanionVideoCallOverlay
        open
        companionName="Elli"
        phase="live"
        cameraState="live"
        talkPhase="idle"
        responseText="That drawing has brave colors."
        error={null}
        question="look at this"
        statusCopy={{
          heading: "Video Chat with Elli",
          status: "Camera live",
          helperText: "Elli is here.",
        }}
        primaryBackground="linear-gradient(135deg, #7c5cff, #5b3ee0)"
        portrait={<div data-testid="portrait-slot">VRM portrait</div>}
        onAskVoice={onAskVoice}
        onQuestionChange={onQuestionChange}
        onSubmitQuestion={onSubmitQuestion}
        onLook={onLook}
        onStartCamera={onStartCamera}
        onStopCamera={onStopCamera}
        onEnd={onEnd}
      />,
    );

    expect(screen.getByText("Video Chat with Elli")).toBeInTheDocument();
    expect(screen.getByText("Camera live")).toBeInTheDocument();
    expect(screen.getByTestId("portrait-slot")).toBeInTheDocument();
    expect(screen.getByDisplayValue("look at this")).toBeInTheDocument();
    expect(screen.getByText("That drawing has brave colors.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ask by voice in video chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Let companion look" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop camera" }));
    fireEvent.submit(screen.getByRole("form", { name: "Video chat question form" }));
    fireEvent.click(screen.getByRole("button", { name: "End video chat" }));

    expect(onAskVoice).toHaveBeenCalledTimes(1);
    expect(onLook).toHaveBeenCalledTimes(1);
    expect(onStopCamera).toHaveBeenCalledTimes(1);
    expect(onSubmitQuestion).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onStartCamera).not.toHaveBeenCalled();
  });

  it("can host a FaceTime activity overlay without owning game state", () => {
    render(
      <CompanionVideoCallOverlay
        open
        companionName="Elli"
        phase="live"
        cameraState="live"
        talkPhase="idle"
        responseText=""
        error={null}
        question=""
        statusCopy={{
          heading: "Video Chat with Elli",
          status: "Playing",
          helperText: "Elli is here.",
        }}
        primaryBackground="linear-gradient(135deg, #7c5cff, #5b3ee0)"
        portrait={<div data-testid="portrait-slot">VRM portrait</div>}
        activitySlot={<div data-testid="activity-slot">Tic-tac-toe board</div>}
        onAskVoice={vi.fn()}
        onQuestionChange={vi.fn()}
        onSubmitQuestion={vi.fn()}
        onLook={vi.fn()}
        onStartCamera={vi.fn()}
        onStopCamera={vi.fn()}
        onEnd={vi.fn()}
      />,
    );

    expect(screen.getByTestId("activity-slot")).toHaveTextContent("Tic-tac-toe board");
  });

  it("keeps FaceTime activities in a compact side tray instead of covering the child", () => {
    render(
      <CompanionVideoCallOverlay
        open
        companionName="Elli"
        phase="live"
        cameraState="live"
        talkPhase="idle"
        responseText=""
        error={null}
        question=""
        statusCopy={{
          heading: "Video Chat with Elli",
          status: "Playing",
          helperText: "Elli is here.",
        }}
        primaryBackground="linear-gradient(135deg, #7c5cff, #5b3ee0)"
        portrait={<div data-testid="portrait-slot">VRM portrait</div>}
        activitySlot={<div data-testid="activity-slot">Tic-tac-toe board</div>}
        onAskVoice={vi.fn()}
        onQuestionChange={vi.fn()}
        onSubmitQuestion={vi.fn()}
        onLook={vi.fn()}
        onStartCamera={vi.fn()}
        onStopCamera={vi.fn()}
        onEnd={vi.fn()}
      />,
    );

    const activityTray = screen.getByLabelText("Video chat activity");
    const style = activityTray.getAttribute("style") ?? "";
    expect(style).toContain("left: 3vw");
    expect(style).toContain("top: auto");
    expect(style).toContain("bottom: 14vh");
    expect(style).toContain("width: 34vw");
    expect(style).toContain("max-width: 360px");
    expect(style).not.toContain("translateX(-50%)");
  });

  it("slides FaceTime activities in and out without moving the call surface", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionVideoCallOverlay.tsx"),
      "utf8",
    );

    expect(source).toContain('key="video-call-activity-tray"');
    expect(source).toContain("initial={{ opacity: 0, x: -28, scale: 0.96 }}");
    expect(source).toContain("animate={{ opacity: 1, x: 0, scale: 1 }}");
    expect(source).toContain("exit={{ opacity: 0, x: -24, scale: 0.97 }}");
    expect(source).toContain("transition={{ duration: 0.24, ease: \"easeOut\" }}");
  });

  it("exposes Call and Play layouts so reward games can feel different from normal conversation", () => {
    const onLayoutChange = vi.fn();

    render(
      <CompanionVideoCallOverlay
        open
        companionName="Elli"
        phase="live"
        cameraState="live"
        talkPhase="idle"
        responseText=""
        error={null}
        question=""
        statusCopy={{
          heading: "Video Chat with Elli",
          status: "Playing",
          helperText: "Elli is here.",
        }}
        primaryBackground="linear-gradient(135deg, #7c5cff, #5b3ee0)"
        portrait={<div data-testid="portrait-slot">VRM portrait</div>}
        activitySlot={<div data-testid="activity-slot">Tic-tac-toe board</div>}
        layout="play"
        onLayoutChange={onLayoutChange}
        onAskVoice={vi.fn()}
        onQuestionChange={vi.fn()}
        onSubmitQuestion={vi.fn()}
        onLook={vi.fn()}
        onStartCamera={vi.fn()}
        onStopCamera={vi.fn()}
        onEnd={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Call view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play view" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Call view" }));

    expect(onLayoutChange).toHaveBeenCalledWith("call");
  });

  it("offers a tiny copy trace link action without owning trace state", () => {
    const onCopyTraceLink = vi.fn();

    render(
      <CompanionVideoCallOverlay
        open
        companionName="Elli"
        phase="live"
        cameraState="live"
        talkPhase="idle"
        responseText=""
        error={null}
        question=""
        statusCopy={{
          heading: "Video Chat with Elli",
          status: "Playing",
          helperText: "Elli is here.",
        }}
        primaryBackground="linear-gradient(135deg, #7c5cff, #5b3ee0)"
        portrait={<div data-testid="portrait-slot">VRM portrait</div>}
        traceLink="http://127.0.0.1:5173/api/companions/video-call-traces/trace123"
        traceCopyStatus="Trace ready"
        onCopyTraceLink={onCopyTraceLink}
        onAskVoice={vi.fn()}
        onQuestionChange={vi.fn()}
        onSubmitQuestion={vi.fn()}
        onLook={vi.fn()}
        onStartCamera={vi.fn()}
        onStopCamera={vi.fn()}
        onEnd={vi.fn()}
      />,
    );

    expect(screen.getByText("Trace ready")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy trace link" }));
    expect(onCopyTraceLink).toHaveBeenCalledTimes(1);
  });

  it("does not import showroom state or companion motor code", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionVideoCallOverlay.tsx"),
      "utf8",
    );

    expect(source).not.toContain("CompanionShowroom");
    expect(source).not.toContain("CompanionSlot");
    expect(source).not.toContain("CompanionMotor");
    expect(source).not.toContain("showroomVideoChat");
  });
});
