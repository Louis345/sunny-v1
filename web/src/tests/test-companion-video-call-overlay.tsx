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

  it("collapses to compact controls when hands-free voice owns the call", () => {
    render(
      <CompanionVideoCallOverlay
        open
        companionName="Elli"
        phase="live"
        cameraState="live"
        talkPhase="listening"
        responseText=""
        error={null}
        question=""
        statusCopy={{
          heading: "Video Chat with Elli",
          status: "Camera live",
          helperText: "Elli is here.",
        }}
        primaryBackground="linear-gradient(135deg, #7c5cff, #5b3ee0)"
        portrait={<div data-testid="portrait-slot">VRM portrait</div>}
        handsFree
        onAskVoice={vi.fn()}
        onQuestionChange={vi.fn()}
        onSubmitQuestion={vi.fn()}
        onLook={vi.fn()}
        onStartCamera={vi.fn()}
        onStopCamera={vi.fn()}
        onEnd={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Video chat hands-free controls")).toBeInTheDocument();
    expect(screen.getByText("Hands-free")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask by voice in video chat" })).toBeNull();
    expect(screen.queryByPlaceholderText("Ask Elli")).toBeNull();
    expect(screen.getByRole("button", { name: "Let companion look" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop camera" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End video chat" })).toBeInTheDocument();
  });

  it("makes the ringing and answered ceremony feel personal before the camera is live", () => {
    const { rerender } = render(
      <CompanionVideoCallOverlay
        open
        companionName="Elli"
        phase="calling"
        cameraState="off"
        talkPhase="idle"
        responseText=""
        error={null}
        question=""
        statusCopy={{
          heading: "Calling Elli...",
          status: "Ringing",
          helperText: "Elli will answer, then the camera starts.",
        }}
        primaryBackground="linear-gradient(135deg, #7c5cff, #5b3ee0)"
        portrait={<div data-testid="portrait-slot">VRM portrait</div>}
        onAskVoice={vi.fn()}
        onQuestionChange={vi.fn()}
        onSubmitQuestion={vi.fn()}
        onLook={vi.fn()}
        onStartCamera={vi.fn()}
        onStopCamera={vi.fn()}
        onEnd={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Calling Elli...").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("portrait-slot")).toBeInTheDocument();
    expect(screen.getByLabelText("Elli companion portrait")).toHaveAttribute(
      "data-call-phase",
      "calling",
    );

    rerender(
      <CompanionVideoCallOverlay
        open
        companionName="Elli"
        phase="answered"
        cameraState="off"
        talkPhase="speaking"
        responseText="Hiii Ila! I was hoping you'd call."
        error={null}
        question=""
        statusCopy={{
          heading: "Elli answered",
          status: "Saying hi",
          helperText: "Starting camera and listening.",
        }}
        primaryBackground="linear-gradient(135deg, #7c5cff, #5b3ee0)"
        portrait={<div data-testid="portrait-slot">VRM portrait</div>}
        onAskVoice={vi.fn()}
        onQuestionChange={vi.fn()}
        onSubmitQuestion={vi.fn()}
        onLook={vi.fn()}
        onStartCamera={vi.fn()}
        onStopCamera={vi.fn()}
        onEnd={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Video chat caption")).toHaveTextContent(
      "Hiii Ila! I was hoping you'd call.",
    );
  });

  it("floats FaceTime activities opposite the companion portrait controls", () => {
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
    expect(style).toContain("top: auto");
    expect(style).toContain("max-width: 300px");
    expect(style).toContain("right: auto");
    expect(style).not.toContain("right: clamp");
    expect(style).not.toContain("right: calc");
    expect(style).not.toContain("translateX(-50%)");

    const source = readFileSync(
      resolve(__dirname, "../components/CompanionVideoCallOverlay.tsx"),
      "utf8",
    );
    expect(source).toContain('left: "clamp(16px, 3vw, 34px)"');
    expect(source).toContain("right: \"auto\"");
    expect(source).toContain('bottom: "clamp(92px, 12vh, 118px)"');
    expect(source).toContain('width: "min(28vw, 300px)"');
  });

  it("uses a compact caption instead of a large transcript panel during activity play", () => {
    render(
      <CompanionVideoCallOverlay
        open
        companionName="Elli"
        phase="live"
        cameraState="live"
        talkPhase="listening"
        responseText="Your turn to make the first move!"
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
        onAskVoice={vi.fn()}
        onQuestionChange={vi.fn()}
        onSubmitQuestion={vi.fn()}
        onLook={vi.fn()}
        onStartCamera={vi.fn()}
        onStopCamera={vi.fn()}
        onEnd={vi.fn()}
      />,
    );

    const caption = screen.getByLabelText("Video chat caption");
    const style = caption.getAttribute("style") ?? "";
    expect(caption).toHaveTextContent("Elli");
    expect(caption).toHaveTextContent("Your turn to make the first move!");
    expect(caption).not.toHaveTextContent("Elli is listening");
    expect(style).toContain("bottom: auto");

    const source = readFileSync(
      resolve(__dirname, "../components/CompanionVideoCallOverlay.tsx"),
      "utf8",
    );
    expect(source).toContain('width: isPlayLayout ? "min(46vw, 420px)"');
    expect(source).toContain('top: isPlayLayout ? "clamp(84px, 12vh, 112px)"');
  });

  it("pops FaceTime activities into place without sliding across the camera", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionVideoCallOverlay.tsx"),
      "utf8",
    );

    expect(source).toContain('key="video-call-activity-tray"');
    expect(source).toContain("initial={{ opacity: 0, scale: 0.72 }}");
    expect(source).toContain("animate={{ opacity: 1, scale: [0.72, 1.04, 1] }}");
    expect(source).toContain("exit={{ opacity: 0, scale: 0.88 }}");
    expect(source).toContain("transformOrigin: \"center center\"");
    expect(source).toContain("transition={{ duration: 0.38, ease: \"easeOut\" }}");
    expect(source).not.toContain("initial={{ opacity: 0, x: 42");
    expect(source).toContain('data-testid="companion-activity-link"');
  });

  it("exposes portrait and full-body companion framing for activity play", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionVideoCallOverlay.tsx"),
      "utf8",
    );

    expect(source).toContain("companionView");
    expect(source).toContain("onCompanionViewChange");
    expect(source).toContain("Portrait view");
    expect(source).toContain("Full body view");
    expect(source).toContain("data-companion-view");
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
