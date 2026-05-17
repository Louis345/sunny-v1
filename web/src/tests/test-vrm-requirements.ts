import { describe, it, expect } from "vitest";
import {
  REQUIRED_VRM_BONES,
  REQUIRED_VRM_EXPRESSIONS,
  VRM_EXPRESSION_ALIASES,
  validateVrmRequirements,
} from "../utils/vrmRequirements";

function mockVrm(overrides: {
  expressions?: Partial<Record<string, boolean>>;
  bones?: Partial<Record<(typeof REQUIRED_VRM_BONES)[number], boolean>>;
  omitExpressionManager?: boolean;
}) {
  const exprPresent = overrides.expressions ?? {};
  const bonePresent = overrides.bones ?? {};
  const defaultExpressions = new Set<string>(
    REQUIRED_VRM_EXPRESSIONS.flatMap((name) => VRM_EXPRESSION_ALIASES[name]),
  );
  return {
    expressionManager: overrides.omitExpressionManager
      ? null
      : {
          getExpression(name: string) {
            if (exprPresent[name] === false) return null;
            if (exprPresent[name] === true || defaultExpressions.has(name)) return {};
            return null;
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
            Joy: false,
            joy: false,
            Fun: false,
            fun: false,
            sad: true,
            surprised: true,
            aa: true,
          },
        }),
      ),
    ).toThrow(/happy/);
  });

  it("passes when a VRM0 expression alias is present", () => {
    expect(() =>
      validateVrmRequirements(
        mockVrm({
          expressions: {
            happy: false,
            Joy: true,
            sad: false,
            Sorrow: true,
            surprised: false,
            Surprised: true,
            aa: false,
            A: true,
          },
        }),
      ),
    ).not.toThrow();
  });

  it("does not reject a companion that is missing optional surprised expressions", () => {
    expect(() =>
      validateVrmRequirements(
        mockVrm({
          expressions: {
            happy: true,
            sad: true,
            surprised: false,
            Surprised: false,
            aa: true,
          },
        }),
      ),
    ).not.toThrow();
  });

  it("passes when aliases are present only in expressionMap", () => {
    expect(() =>
      validateVrmRequirements({
        expressionManager: {
          expressionMap: {
            happy: {},
            sad: {},
            Surprised: {},
            aa: {},
          },
          getExpression() {
            return null;
          },
        },
        humanoid: {
          getRawBoneNode() {
            return {};
          },
        },
      }),
    ).not.toThrow();
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
