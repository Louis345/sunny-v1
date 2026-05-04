import { createOnboardingPlan, writeOnboardingPlan } from "../engine/onboardingPlan";
import type { OnboardingPlan } from "../engine/onboardingPlan";
import {
  buildPreviewBoardCommand,
  maybeLaunchPreviewBoard,
  previewBoardPrompt,
} from "../utils/previewLauncher";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] ?? null : null;
}

export function onboardingPreviewSummary(plan: OnboardingPlan): string {
  const policy = plan.selectedAttentionTask.transitionPolicy;
  const config = plan.selectedAttentionTaskConfig;
  const lines = [
    `Stateless preview: ${plan.childId}`,
    "Parent preview: full child experience, read-only",
    `Intake: ${plan.intakeMode}`,
    `Shape: ${plan.shape}`,
    `Care question: ${plan.careQuestion}`,
    `Attention task: ${plan.selectedAttentionTask.taskId}`,
    "",
    "Why this activity:",
    plan.selectedAttentionTaskReason,
    "",
    "Transition path:",
    "intro -> practice/demo -> measured baseline -> preview results -> return to map",
    `Practice threshold: ${Math.round(policy.practicePassAccuracy * 100)}% with ${policy.maxPracticeRepeats} retry`,
    `Companion: ${policy.companionDuringPractice} during practice, ${policy.companionDuringMeasurement} during measurement`,
    "",
    "Child config passed to activity:",
    `- trials: ${config.childPacing.trialCount}`,
    `- practice trials: ${config.childPacing.practiceTrials}`,
    `- stimulus duration: ${config.childPacing.stimulusDuration_ms}ms`,
    `- focused window: ${config.childPacing.maxFocusedWindow_ms}ms`,
    `- wrapper: ${config.wrapper}`,
    "",
    "What the child will do:",
    ...plan.nodes.map((node, idx) => {
      const baseline = node.affectsBaselineScore ? "counts for baseline" : "does not affect baseline";
      if (node.purpose === "attention_screening") {
        return `${idx + 1}. Attention screen - ${node.activityId} (${baseline})`;
      }
      if (node.purpose === "dopamine_reward") {
        return `${idx + 1}. Reward break - ${node.activityId} (${baseline})`;
      }
      if (node.purpose === "hybrid_learning_attention") {
        return `${idx + 1}. Tiny academic load check - ${node.activityId} (${baseline})`;
      }
      return `${idx + 1}. ${node.title} - ${node.activityId} (${baseline})`;
    }),
    "",
    "Companion:",
    "- can instruct before practice",
    "- quiet during measured attention trials",
    "- returns for reward/support after measurement",
    "",
    "Would write in live mode:",
    "- attention vitals only for attention_screening",
    "- no learning attempts unless the node is academically assessable",
    "- invalid baseline if the practice/demo gate fails",
    "",
    "Writes: none",
  ];
  return lines.join("\n");
}

export function onboardingPreviewBoardPrompt(childId: string): string {
  return previewBoardPrompt({ childId, label: "onboarding" });
}

export function buildOnboardingBoardPreviewCommand(childId: string): {
  command: string;
  args: string[];
} {
  const command = buildPreviewBoardCommand({
    childId,
    subject: "onboarding",
    sessionMode: "as-child",
    voiceMode: "muted",
  });
  return { command: command.command, args: command.args };
}

function planJson(plan: OnboardingPlan, file: string | null): Record<string, unknown> {
  return {
    childId: plan.childId,
    intakeMode: plan.intakeMode,
    shape: plan.shape,
    careQuestion: plan.careQuestion,
    selectedAttentionTask: plan.selectedAttentionTask.taskId,
    nodes: plan.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      purpose: node.purpose,
      activityId: node.activityId,
      affectsBaselineScore: node.affectsBaselineScore,
      companionMode: node.companionMode,
    })),
    theories: plan.theories,
    file,
  };
}

export async function main(): Promise<void> {
  const child = argValue("child") ?? "ila";
  const preview = process.argv.includes("--preview");
  const skipBoardPrompt = process.argv.includes("--no-board-prompt");
  const launchBoard = process.argv.includes("--board");
  const plan = createOnboardingPlan(child);
  const file = preview ? null : writeOnboardingPlan(plan);
  console.log(` 🎮 [onboarding] plan ${preview ? "previewed" : "written"} ${plan.childId}`);
  if (preview) {
    console.log(onboardingPreviewSummary(plan));
  }
  console.log(JSON.stringify(planJson(plan, file), null, 2));

  if (!preview) return;
  await maybeLaunchPreviewBoard({
    childId: plan.childId,
    subject: "onboarding",
    label: "onboarding",
    sessionMode: "as-child",
    voiceMode: "muted",
    force: launchBoard,
    prompt: !skipBoardPrompt,
    defaultOpen: false,
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
