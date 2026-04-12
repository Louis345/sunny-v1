import { describe, it, expect } from "vitest";
import {
  REQUIRED_VRM_BONES,
  REQUIRED_VRM_EXPRESSIONS,
  validateVrmRequirements,
} from "../utils/vrmRequirements";

function mockVrm(overrides: {
  expressions?: Partial<Record<(typeof REQUIRED_VRM_EXPRESSIONS)[number], boolean>>;
  bones?: Partial<Record<(typeof REQUIRED_VRM_BONES)[number], boolean>>;
  omitExpressionManager?: boolean;
}) {
  const exprPresent = overrides.expressions ?? {};
  const bonePresent = overrides.bones ?? {};
  return {
    expressionManager: overrides.omitExpressionManager
      ? null
      : {
          getExpression(name: string) {
            const required = REQUIRED_VRM_EXPRESSIONS as readonly string[];
            if (!required.includes(name)) return {};
            return exprPresent[name as keyof typeof exprPresent] === false ? null : {};
          },
        },
    humanoid: {
      getRawBoneNode(name: string) {
        const required = REQUIRED_VRM_BONES as readonly string[];
        if (!required.includes(name)) return {};
        return bonePresent[name as keyof typeof bonePresent] === false ? null : {};
      },
    },
  };
}

describe("validateVrmRequirements (COMPANION-002)", () => {
  it("passes when all required expressions and bones exist", () => {
    expect(() =>
      validateVrmRequirements(
        mockVrm({
          expressions: {
            happy: true,
            sad: true,
            surprised: true,
            aa: true,
          },
          bones: {
            head: true,
            leftHand: true,
            rightHand: true,
            spine: true,
          },
        }),
      ),
    ).not.toThrow();
  });

  it("throws when expression happy is missing", () => {
    expect(() =>
      validateVrmRequirements(
        mockVrm({
          expressions: {
            happy: false,
            sad: true,
            surprised: true,
            aa: true,
          },
        }),
      ),
    ).toThrow(/happy/);
  });

  it("throws when bone head is missing", () => {
    expect(() =>
      validateVrmRequirements(
        mockVrm({
          bones: {
            head: false,
            leftHand: true,
            rightHand: true,
            spine: true,
          },
        }),
      ),
    ).toThrow(/head/);
  });

  it("throws when expressionManager is missing", () => {
    expect(() =>
      validateVrmRequirements(mockVrm({ omitExpressionManager: true })),
    ).toThrow(/expressionManager/);
  });
});
