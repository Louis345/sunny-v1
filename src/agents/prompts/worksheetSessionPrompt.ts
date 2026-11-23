/**
 * Worksheet session facts for the companion: where she is, what the tools do, and what reaches her record.
 * Facts only (owner 2026-11-24): her persona decides how to talk and teach. A walked-through problem is
 * saved as help, never as solved on her own.
 */

export function buildWorksheetToolPrompt(opts: {
  childName: string;
  companionName: string;
  subjectLabel: string;
  problemCount: number;
  rewardThreshold: number;
  rewardGame: string;
  pendingRewardFromLastSession: string | null;
  interactionMode: "answer_entry" | "review";
}): string {
  const { childName, companionName, subjectLabel, problemCount, rewardThreshold, rewardGame, pendingRewardFromLastSession, interactionMode } = opts;
  const lines = [
    `## Worksheet session: ${subjectLabel}`,
    ``,
    `You are ${companionName}, ${childName}'s companion. Her paper worksheet has ${problemCount} problems, and its image is pinned in this conversation. There are no extracted answers: you grade from the image.`,
    ...(pendingRewardFromLastSession
      ? [``, `${childName} earned ${pendingRewardFromLastSession} last session and has not played it yet; launchGame with type "reward" plays it.`]
      : []),
    ``,
    `### Tools`,
    `- sessionStatus: problems done, reward state, where you are. canvasStatus: what is on her screen.`,
    `- canvasShow type "worksheet" with a problemId puts that problem on her screen. It stays there until something else is shown.`,
    `- sessionLog records one answer attempt: correct means she got it herself, and childSaid is what she said about this problem. A logged verdict is final. When you walked her through the answer or she skipped it, it was not hers on her own: log what she said with correct: false, or skipped: true with the reason. That keeps her record honest.`,
    `- launchGame plays a reward or teaching game (type "reward" or "tool"); canvasClear clears the screen.`,
    ``,
    `### How it works`,
    `- Nothing moves on by itself: the worksheet changes only when you call a tool.`,
    `- After ${rewardThreshold} correct answers, sessionLog reports a reward earned: ${rewardGame}.`,
    `- She is looking at the paper itself; the image you have can be less clear than what she sees.`,
    `- Problems may come up in a different order from the paper. Words like "first box" in a problem mean its place on the paper.`,
  ];
  if (interactionMode === "review") {
    lines.push(
      ``,
      `### Review`,
      `Sunny's records say ${childName} has already filled in this worksheet. The image shows whether the answer boxes have her handwriting; if they are empty, it is a fresh worksheet.`,
    );
    if (/money|coin|count/i.test(subjectLabel)) {
      lines.push(`On coin worksheets a handwritten "$0." can look like "$1." in the image; these totals are under $1.00. Quarter 25¢, dime 10¢, nickel 5¢, penny 1¢.`);
    }
  }
  return lines.join("\n");
}
