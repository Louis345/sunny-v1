import fs from "fs";
import path from "path";
import { REWARD_GAMES, TEACHING_TOOLS } from "../server/games/registry";

export const CANVAS_CAPABILITIES = {
  teaching: {
    description: "Plain text, word, or equation displayed center screen",
    useFor: ["showing a word", "displaying a math problem", "presenting a sentence"],
    props: ["content: string", "phonemeBoxes?: PhonemeBox[]"],
    example: '{ mode: "teaching", content: "railroad" }',
  },
  spelling: {
    description: "Blank tiles revealed letter by letter as child spells aloud. Word hidden by default.",
    useFor: [
      "spelling practice",
      "spelling tests",
      "compound word morpheme work",
      "competitive streak spelling",
    ],
    props: [
      "spellingWord: string — the full word to spell",
      "spellingRevealed: string[] — letters confirmed so far",
      "showWord: 'hidden' | 'hint' | 'always' — default hidden",
      "compoundBreak?: number — tile index where compound word splits",
      "streakCount?: number — current streak (competitive mode)",
      "personalBest?: number — session personal best (competitive mode)",
    ],
    example: '{ mode: "spelling", spellingWord: "railroad", spellingRevealed: ["r","a"], showWord: "hidden", compoundBreak: 3 }',
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
  "word-builder": {
    description:
      "Fill-in-the-blanks spelling game. Child completes the word with decreasing visual support across 4 rounds. Tap letters on keyboard.",
    useFor: ["reward after a correct spelling", "decoding practice"],
    props: [
      "gameUrl: string (static page)",
      "gameWord: string",
      "gamePlayerName?: string",
      "wordBuilderRound?: number",
      "wordBuilderMode?: \"fill_blanks\"",
    ],
    example:
      '{ mode: "word-builder", gameUrl: "/games/wordd-builder.html", gameWord: "cowboy", wordBuilderRound: 1, wordBuilderMode: "fill_blanks" }',
  },
  "spell-check": {
    description:
      "Typing-only spelling check. Child types the full word on an on-screen keyboard; target word is never shown.",
    useFor: [
      "after repeated voice spelling failures",
      "when ASR may be scrambling letter order",
    ],
    props: [
      "gameUrl: string (static page)",
      "gameWord: string",
      "gamePlayerName?: string",
    ],
    example:
      '{ mode: "spell-check", gameUrl: "/games/spell-check.html", gameWord: "bathroom", gamePlayerName: "Ila" }',
  },
} as const;

export function generateCanvasCapabilities(): string {
  const lines = [
    "# Canvas Capabilities",
    "",
    "Auto-generated at startup from src/utils/generateCanvasCapabilities.ts",
    "DO NOT EDIT MANUALLY — changes will be overwritten on next launch",
    "",
    "## Game names",
    "",
    "- **Only use names that appear exactly** in this manifest under **Teaching Tools** and **Reward Games** (each `###` heading is a valid game id).",
    "- If the request does not match exactly, choose the **closest** name in those sections **by meaning**—never guess a new slug.",
    "- **Never invent** a game name that is not listed in this manifest.",
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

  lines.push("## Teaching Tools");
  for (const [name, def] of Object.entries(TEACHING_TOOLS)) {
    lines.push(`### ${name}`);
    if (name === "word-builder") {
      lines.push(
        `Launch: **launchGame** with \`{ name: "word-builder", type: "tool", word: "<homework word>" }\`.`,
      );
    } else if (name === "spell-check") {
      lines.push(
        `Launch: **launchGame** with \`{ name: "spell-check", type: "tool", word: "<homework word>" }\`.`,
      );
    } else {
      lines.push(`Launch: launchGame("${name}", "tool")`);
    }
    lines.push(`Voice enabled: ${def.voiceEnabled}`);
    lines.push(`Default config: ${JSON.stringify(def.defaultConfig)}`);
    lines.push("");
  }

  lines.push("## Reward Games");
  for (const [name, def] of Object.entries(REWARD_GAMES)) {
    lines.push(`### ${name}`);
    lines.push(`Launch: launchGame("${name}", "reward")`);
    lines.push(`Voice enabled: ${def.voiceEnabled}`);
    lines.push(`Default config: ${JSON.stringify(def.defaultConfig)}`);
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
