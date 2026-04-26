import { describe, expect, it, vi } from "vitest";
import {
  applyExpressionStateToVrm,
  createNeutralExpressionState,
} from "../utils/companionExpressions";

function createExpressionManagerMock() {
  const expressionMap = {
    happy: {},
    lookDown: {},
    blink: {},
  };
  return {
    expressionMap,
    getExpression: (name: string) =>
      Object.prototype.hasOwnProperty.call(expressionMap, name) ? {} : null,
    setValue: vi.fn(),
    update: vi.fn(),
  };
}

describe("applyExpressionStateToVrm", () => {
  it("does not call expressionManager.update directly", () => {
    const em = createExpressionManagerMock();
    const head = { rotation: { z: 0 } };
    const vrm = {
      expressionManager: em,
      humanoid: {
        getRawBoneNode: () => head,
      },
    } as any;
    const state = createNeutralExpressionState();
    state.faceExpression = "happy";
    state.faceWeight = 0.6;
    state.faceInitialWeight = 0.6;

    applyExpressionStateToVrm(vrm, state);

    expect(em.update).not.toHaveBeenCalled();
  });

  it("does not write head tilt in expression pass", () => {
    const em = createExpressionManagerMock();
    const head = { rotation: { z: 0 } };
    const vrm = {
      expressionManager: em,
      humanoid: {
        getRawBoneNode: () => head,
      },
    } as any;
    const state = createNeutralExpressionState();
    state.thinkingActive = true;
    state.thinkingElapsedMs = 1000;
    state.thinkingDurationMs = 2000;

    applyExpressionStateToVrm(vrm, state);

    expect(head.rotation.z).toBe(0);
  });
});
