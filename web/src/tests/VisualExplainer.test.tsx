import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createActor } from "xstate";
import { describe, expect, it, vi } from "vitest";
import { VisualExplainerDemo } from "../components/VisualExplainer/VisualExplainerDemo";
import { erosionVisualExplainerConfig } from "../components/VisualExplainer/erosionDemoConfig";
import {
  getVisualBrief,
  visualBriefs,
} from "../components/VisualExplainer/visualBriefs";
import { validateVisualBrief } from "../components/VisualExplainer/visualBriefSchema";
import {
  validateVisualExplainerConfig,
} from "../components/VisualExplainer/visualExplainerSchema";
import { visualExplainerMachine } from "../components/VisualExplainer/visualExplainerMachine";

class MockSpeechSynthesisUtterance {
  text: string;
  rate = 1;
  pitch = 1;

  constructor(text: string) {
    this.text = text;
  }
}

describe("Visual Explainer config", () => {
  it("accepts the erosion demo config", () => {
    expect(validateVisualExplainerConfig(erosionVisualExplainerConfig).topic).toBe(
      "Erosion",
    );
    expect(validateVisualExplainerConfig(erosionVisualExplainerConfig).companion.provider).toBe(
      "elevenlabs",
    );
  });

  it("requires topic, checkpoints, prediction prompt, and options", () => {
    expect(() =>
      validateVisualExplainerConfig({
        ...erosionVisualExplainerConfig,
        topic: "",
      }),
    ).toThrow();
    expect(() =>
      validateVisualExplainerConfig({
        ...erosionVisualExplainerConfig,
        checkpoints: [],
      }),
    ).toThrow();
    expect(() =>
      validateVisualExplainerConfig({
        ...erosionVisualExplainerConfig,
        prediction: {
          ...erosionVisualExplainerConfig.prediction,
          prompt: "",
        },
      }),
    ).toThrow();
  });

  it("rejects empty prediction options", () => {
    expect(() =>
      validateVisualExplainerConfig({
        ...erosionVisualExplainerConfig,
        prediction: {
          ...erosionVisualExplainerConfig.prediction,
          options: [],
        },
      }),
    ).toThrow();
  });
});

describe("Visual Explainer visual briefs", () => {
  it("validates two carrier-flow topics with different content", () => {
    const erosionBrief = validateVisualBrief(getVisualBrief("erosion"));
    const redBloodCellsBrief = validateVisualBrief(getVisualBrief("red-blood-cells"));

    expect(Object.keys(visualBriefs)).toEqual(["erosion", "red-blood-cells"]);
    expect(erosionBrief.template).toBe("carrier-flow");
    expect(redBloodCellsBrief.template).toBe("carrier-flow");
    expect(erosionBrief.actors.carrier.label).toBe("water");
    expect(erosionBrief.actors.payload.label).toBe("sediment");
    expect(redBloodCellsBrief.actors.carrier.label).toBe("red blood cells");
    expect(redBloodCellsBrief.actors.payload.label).toBe("oxygen");
  });

  it("rejects briefs without enough checkpoints or prediction options", () => {
    const brief = getVisualBrief("erosion");
    expect(() =>
      validateVisualBrief({
        ...brief,
        checkpoints: brief.checkpoints.slice(0, 2),
      }),
    ).toThrow();
    expect(() =>
      validateVisualBrief({
        ...brief,
        prediction: { ...brief.prediction, options: [] },
      }),
    ).toThrow();
  });
});

describe("Visual Explainer machine", () => {
  it("moves through intro, prediction, answer, and complete with evidence", () => {
    const actor = createActor(visualExplainerMachine, { input: { now: 1000 } });
    actor.start();

    expect(actor.getSnapshot().value).toBe("intro");
    actor.send({ type: "START", now: 1000 });
    expect(actor.getSnapshot().value).toBe("playing");
    actor.send({ type: "REACH_PREDICTION", now: 1500 });
    expect(actor.getSnapshot().value).toBe("pausedForPrediction");
    actor.send({
      type: "ANSWER",
      now: 2000,
      option: erosionVisualExplainerConfig.prediction.options[0]!,
      activityId: erosionVisualExplainerConfig.activityId,
      nodeId: erosionVisualExplainerConfig.nodeId,
      roundId: erosionVisualExplainerConfig.prediction.roundId,
      targetConcept: erosionVisualExplainerConfig.prediction.targetConcept,
    });

    expect(actor.getSnapshot().value).toBe("reveal");
    expect(actor.getSnapshot().context.targetResults).toHaveLength(1);
    expect(actor.getSnapshot().context.targetResults[0]?.correct).toBe(true);

    actor.send({ type: "CONTINUE" });
    actor.send({ type: "EXIT_READY" });
    expect(actor.getSnapshot().value).toBe("exitCheck");
    actor.send({
      type: "COMPLETE",
      now: 3000,
      activityId: erosionVisualExplainerConfig.activityId,
      nodeId: erosionVisualExplainerConfig.nodeId,
    });

    expect(actor.getSnapshot().value).toBe("complete");
    expect(actor.getSnapshot().context.completion?.type).toBe("activity_complete");
    expect(actor.getSnapshot().context.completion?.accuracy).toBe(1);
    actor.stop();
  });
});

describe("VisualExplainerDemo", () => {
  it("renders the erosion scene, scrubber, prediction prompt, and evidence console", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel },
    });

    render(<VisualExplainerDemo />);

    expect(screen.getByText("Erosion Visual Explainer")).toBeInTheDocument();
    expect(screen.getByTestId("visual-explainer-scene")).toBeInTheDocument();
    expect(screen.getByTestId("visual-explainer-scrubber")).toBeInTheDocument();
    expect(screen.getByTestId("visual-explainer-evidence-console")).toHaveTextContent(
      "No events yet",
    );
    expect(screen.getByTestId("visual-explainer-companion")).toHaveTextContent(
      "Matilda",
    );
    expect(screen.getByTestId("visual-explainer-companion")).toHaveTextContent(
      "Watch the hill first",
    );
    expect(speak).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Start Treatment/i }));

    act(() => {
      fireEvent.change(screen.getByTestId("visual-explainer-scrubber"), {
        target: { value: "48" },
      });
    });

    expect(
      screen.getByTestId("visual-explainer-prediction-prompt"),
    ).toHaveTextContent("What is the water carrying?");
    expect(screen.getByTestId("visual-explainer-companion")).toHaveTextContent(
      "Prediction time",
    );
    expect(speak).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole("button", { name: /Tiny pieces of rock and soil/i }));
    expect(screen.getByTestId("visual-explainer-evidence-console")).toHaveTextContent(
      "activity_target_result",
    );
    vi.unstubAllGlobals();
  });

  it("shows a preview-only topic dropdown that swaps dynamic visual content", () => {
    const speak = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel: vi.fn() },
    });

    render(<VisualExplainerDemo />);

    const switcher = screen.getByTestId("visual-brief-switcher");
    expect(switcher).toBeInTheDocument();
    expect(screen.getByTestId("visual-explainer-scene")).toHaveTextContent("sediment");

    fireEvent.change(switcher, { target: { value: "red-blood-cells" } });

    expect(screen.getByText("Red Blood Cells Visual Explainer")).toBeInTheDocument();
    expect(screen.getByTestId("visual-explainer-scene")).toHaveTextContent("oxygen");
    expect(screen.getAllByText(/cells are the carriers/i).length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("keeps map-launched mode focused and leaves companion rendering to the map shell", () => {
    vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak: vi.fn(), cancel: vi.fn() },
    });

    render(<VisualExplainerDemo mapMode onExit={() => {}} />);

    expect(screen.queryByTestId("visual-brief-switcher")).not.toBeInTheDocument();
    expect(screen.queryByTestId("visual-explainer-companion")).not.toBeInTheDocument();
    expect(screen.queryByText("Tweak Panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("visual-explainer-evidence-console")).not.toBeInTheDocument();
    expect(screen.queryByText("Assumption")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("reports flow-game state, attempt evidence, and completion for the companion contract", () => {
    vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak: vi.fn(), cancel: vi.fn() },
    });
    const sendMessage = vi.fn();

    render(
      <VisualExplainerDemo
        mapMode
        childId="reina"
        sendMessage={sendMessage}
        onExit={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Start Treatment/i }));
    act(() => {
      fireEvent.change(screen.getByTestId("visual-explainer-scrubber"), {
        target: { value: "48" },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: /Tiny pieces of rock and soil/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /Exit Check/i }));
    fireEvent.click(screen.getByRole("button", { name: /Complete/i }));

    const events = sendMessage.mock.calls
      .map((call) => call[1]?.event)
      .filter(Boolean);
    expect(events.some((event) => event.type === "game_state_update")).toBe(true);
    expect(events.some((event) => event.type === "attempt_event")).toBe(true);
    expect(events.some((event) => event.type === "companion_event")).toBe(true);
    expect(events.some((event) => event.type === "game_complete")).toBe(true);
    expect(
      events.find((event) => event.type === "attempt_event")?.payload,
    ).toMatchObject({
      domain: "science",
      target: "sediment_movement",
      attemptedValue: "Tiny pieces of rock and soil",
      correct: true,
      scaffoldLevel: 2,
    });
    vi.unstubAllGlobals();
  });

  it("exposes a map-launched demo route and map node integration", () => {
    const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf-8");
    const mapDemo = readFileSync(
      join(process.cwd(), "src/components/VisualExplainer/VisualExplainerMapDemo.tsx"),
      "utf-8",
    );
    const adventureMap = readFileSync(
      join(process.cwd(), "src/components/AdventureMap.tsx"),
      "utf-8",
    );
    const activityCatalog = readFileSync(
      join(process.cwd(), "../src/engine/activityToolCatalog.ts"),
      "utf-8",
    );

    expect(main).toContain('runtimeConfig.demoRoute === "visual-explainer-map"');
    expect(mapDemo).toContain('type: "visual-explainer"');
    expect(mapDemo).toContain("<CompanionLayer");
    expect(adventureMap).toContain('launchedNode.type === "visual-explainer"');
    expect(adventureMap).toContain("VisualExplainerDemo");
    expect(activityCatalog).toContain('nodeType: "visual-explainer"');
  });
});
