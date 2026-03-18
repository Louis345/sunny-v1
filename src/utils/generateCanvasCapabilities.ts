import fs from "fs";
import path from "path";

export const CANVAS_CAPABILITIES = {
  teaching: {
    description: "Plain text, word, or equation displayed center screen",
    useFor: ["showing a word", "displaying a math problem", "presenting a sentence"],
    props: ["content: string", "phonemeBoxes?: PhonemeBox[]"],
    example: '{ mode: "teaching", content: "railroad" }',
  },
  spelling: {
    description: "Word displayed as blank tiles revealed letter by letter",
    useFor: ["spelling practice", "confirming letters as child spells aloud"],
    props: ["spellingWord: string", "spellingRevealed: string[]"],
    example: '{ mode: "spelling", spellingWord: "railroad", spellingRevealed: ["r","a"] }',
  },
  place_value: {
    description: "Column layout showing hundreds, tens, ones with active column highlight",
    useFor: ["multi-digit addition", "multi-digit subtraction", "borrowing and carrying"],
    props: ["operandA: number", "operandB: number", "operation: string", "activeColumn: string", "revealedColumns: string[]"],
    example: '{ mode: "place_value", operandA: 395, operandB: 77, activeColumn: "ones" }',
  },
  reward: {
    description: "Celebration Lottie animation",
    useFor: ["correct answer celebration", "encouragement"],
    props: [],
    example: '{ mode: "reward" }',
  },
  championship: {
    description: "Trophy animation with session score",
    useFor: ["end of session summary", "milestone celebration"],
    props: ["score?: number"],
    example: '{ mode: "championship", score: 8 }',
  },
} as const;

export function generateCanvasCapabilities(): string {
  const lines = [
    "# Canvas Capabilities",
    "",
    "Auto-generated at startup from src/utils/generateCanvasCapabilities.ts",
    "DO NOT EDIT MANUALLY — changes will be overwritten on next launch",
    "",
    "## Available Modes",
    "",
  ];

  for (const [mode, info] of Object.entries(CANVAS_CAPABILITIES)) {
    lines.push(`### ${mode}`);
    lines.push(info.description);
    lines.push(`**Use for:** ${info.useFor.join(", ")}`);
    if (info.props.length > 0) {
      lines.push(`**Props:** ${info.props.join(", ")}`);
    }
    lines.push(`**Example:** \`${info.example}\``);
    lines.push("");
  }

  return lines.join("\n");
}

export function writeCanvasCapabilities(): void {
  const content = generateCanvasCapabilities();
  const outputPath = path.join(process.cwd(), "CANVAS_CAPABILITIES.md");
  fs.writeFileSync(outputPath, content, "utf-8");
  console.log("  📋 Canvas capabilities manifest written");
}

export function getCanvasCapabilities(): string {
  return generateCanvasCapabilities();
}
