import { createHash } from "node:crypto";

export type VisualRepairGeneration = {
  html: string;
  usage: Record<string, unknown>;
  latencyMs: number;
  raw?: unknown;
};

export type VisualRepairArm = {
  id: string;
  model: string;
  generate: (prompt: string) => Promise<VisualRepairGeneration>;
};

export type VisualRepairVerification = {
  passed: boolean;
  issues: string[];
  screenshotPaths?: string[];
};

export async function runVisualRepairModelComparison(input: {
  prompt: string;
  arms: VisualRepairArm[];
  verify: (arm: VisualRepairArm, generation: VisualRepairGeneration) => Promise<VisualRepairVerification>;
}) {
  const promptHash = createHash("sha256").update(input.prompt).digest("hex");
  const arms = [];
  for (const arm of input.arms) {
    try {
      const generation = await arm.generate(input.prompt);
      const verification = await input.verify(arm, generation);
      arms.push({
        id: arm.id,
        model: arm.model,
        promptHash,
        status: verification.passed ? "passed" : "verification_failed",
        generation,
        verification,
      });
    } catch (error) {
      arms.push({
        id: arm.id,
        model: arm.model,
        promptHash,
        status: "provider_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { promptHash, arms };
}
