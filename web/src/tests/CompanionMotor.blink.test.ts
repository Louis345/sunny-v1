import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanionMotor } from "../companion/CompanionMotor";
import { COMPANION_DEFAULTS } from "../../../src/shared/companionTypes";

type ExpressionManagerMock = {
  expressionMap: Record<string, unknown>;
  getExpression: (name: string) => unknown | null;
  setValue: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function createExpressionManagerMock(): ExpressionManagerMock {
  const expressionMap = {
    neutral: {},
    blink: {},
    aa: {},
    happy: {},
  };
  return {
    expressionMap,
    getExpression: (name: string) =>
      Object.prototype.hasOwnProperty.call(expressionMap, name) ? {} : null,
    setValue: vi.fn(),
    update: vi.fn(),
  };
}

function createMotorHarness() {
  const motor = new CompanionMotor();
  const expressionManager = createExpressionManagerMock();
  const vrm: any = {
    expressionManager,
    humanoid: { getRawBoneNode: () => null },
    lookAt: null,
    scene: { position: new THREE.Vector3() },
    update: vi.fn(),
  };

  (motor as any).vrm = vrm;
  (motor as any).camera = new THREE.PerspectiveCamera(22, 1, 0.05, 50);
  return { motor, expressionManager };
}

const baseCtx = {
  dt: 1 / 60,
  dtMs: 16.67,
  companionEvents: [],
  companion: {
    ...COMPANION_DEFAULTS,
    companionId: "elli",
  },
  childId: "elli",
  toggledOff: false,
  activeNodeScreen: null,
  analyser: null,
};

describe("CompanionMotor blink loop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drives blink expression to 1 during random blink windows", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { motor, expressionManager } = createMotorHarness();

    for (let i = 0; i < 500; i++) {
      now += 16;
      motor.tick(baseCtx);
    }

    const blinkCalls = expressionManager.setValue.mock.calls.filter(
      ([name]) => name === "blink",
    );
    expect(blinkCalls.some(([, weight]) => weight === 1)).toBe(true);
  });

  it("returns blink expression weight to 0 between blinks", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { motor, expressionManager } = createMotorHarness();

    for (let i = 0; i < 500; i++) {
      now += 16;
      motor.tick(baseCtx);
    }

    const blinkCalls = expressionManager.setValue.mock.calls.filter(
      ([name]) => name === "blink",
    );
    expect(blinkCalls.some(([, weight]) => weight === 0)).toBe(true);
  });

  it("does not start new blink events while toggled off", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { motor, expressionManager } = createMotorHarness();

    for (let i = 0; i < 120; i++) {
      now += 16;
      motor.tick({
        ...baseCtx,
        toggledOff: true,
      });
    }

    const blinkCalls = expressionManager.setValue.mock.calls.filter(
      ([name]) => name === "blink" && name !== "blinkLeft" && name !== "blinkRight",
    );
    expect(blinkCalls.some(([, weight]) => weight === 1)).toBe(false);
  });

  it("resets blink schedule on session reset", () => {
    let now = 5000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(Math, "random").mockReturnValue(0.25);

    const { motor } = createMotorHarness();
    motor.resetSessionState();

    const blinkState = (motor as any).blinkState as {
      nextBlinkAt: number;
      blinkingUntil: number;
    };
    expect(blinkState.nextBlinkAt).toBeGreaterThan(now);
    expect(blinkState.blinkingUntil).toBe(0);
  });
});
