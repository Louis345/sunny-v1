const HITODAMA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="140" height="175"><style>@keyframes hitodama-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}</style><g style="animation:hitodama-float 2s ease-in-out infinite"><circle cx="60" cy="65" r="28" fill="#4FC3F7" stroke="#111" stroke-width="2"/><circle cx="52" cy="60" r="3" fill="#111"/><circle cx="68" cy="60" r="3" fill="#111"/><path d="M48 78 Q60 88 72 78" stroke="#111" stroke-width="2" fill="none"/><path d="M55 95 L60 135 L65 95 Z" fill="#4FC3F7" stroke="#111" stroke-width="2"/></g></svg>`;

const ONI_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="140" height="175"><circle cx="60" cy="45" r="25" fill="#42A5F5" stroke="#111" stroke-width="2"/><path d="M45 25 L55 45 L45 35 Z" fill="#FFD600" stroke="#111" stroke-width="2"/><path d="M75 25 L65 45 L75 35 Z" fill="#FFD600" stroke="#111" stroke-width="2"/><path d="M42 55 Q60 68 78 55" stroke="#111" stroke-width="2" fill="none"/><rect x="42" y="68" width="36" height="28" fill="#42A5F5" stroke="#111" stroke-width="2"/><rect x="44" y="96" width="32" height="35" fill="#E53935" stroke="#111" stroke-width="2"/></svg>`;

/** Resolve reward `character` id from canvasShow args to inline SVG (test panel / agent). */
export const REWARD_CHARACTER_SVG: Record<string, string> = {
  hitodama: HITODAMA_SVG,
  oni: ONI_SVG,
  tengu: ONI_SVG,
};

export interface CanvasCapabilityPreview {
  svg?: string;
  lottieData?: unknown;
  text?: string;
}

export interface CanvasCapabilityEntry {
  description: string;
  params: Record<string, string>;
  example: { type: string; params: Record<string, unknown> };
  preview?: CanvasCapabilityPreview;
  /** Optional named variants for the test panel */
  variants?: Array<{
    label: string;
    args: Record<string, unknown>;
    preview?: CanvasCapabilityPreview;
  }>;
}

export const CANVAS_REGISTRY: Record<string, CanvasCapabilityEntry> = {
  riddle: {
    description:
      "Typewriter animation — riddle text centered on screen with 🤔 emoji",
    params: { text: "string" },
    example: {
      type: "riddle",
      params: {
        text: "I have keys but no locks. I have space but no room. What am I?",
      },
    },
    preview: { text: "🎭 Typewriter animation\n🤔 emoji + centered riddle text" },
  },
  place_value: {
    description:
      "Column grid with HUNDREDS/TENS/ONES labels. Highlights active column. Shows ? for unrevealed digits.",
    params: {
      operandA: "number",
      operandB: "number",
      operation: "addition | subtraction",
      activeColumn: "hundreds | tens | ones (optional)",
      scaffoldLevel: "full | partial | minimal (optional)",
      revealedColumns: "array of column names (optional)",
    },
    example: {
      type: "place_value",
      params: {
        operandA: 395,
        operandB: 77,
        operation: "subtraction",
        activeColumn: "tens",
      },
    },
    preview: {
      text: "HUNDREDS | TENS | ONES\n3-row grid · highlights active column · ? for unknowns",
    },
    variants: [
      {
        label: "PV: 743+124 expanded",
        args: {
          operandA: 743,
          operandB: 124,
          operation: "addition",
          layout: "expanded",
          scaffoldLevel: "full",
        },
        preview: { text: "Expanded layout" },
      },
      {
        label: "PV: full scaffold",
        args: {
          operandA: 743,
          operandB: 124,
          operation: "addition",
          layout: "column",
          scaffoldLevel: "full",
        },
        preview: { text: "Column full" },
      },
      {
        label: "PV: hundreds",
        args: {
          operandA: 743,
          operandB: 124,
          operation: "addition",
          layout: "column",
          activeColumn: "hundreds",
          scaffoldLevel: "full",
        },
        preview: { text: "Hundreds highlighted" },
      },
      {
        label: "PV: tens revealed",
        args: {
          operandA: 743,
          operandB: 124,
          operation: "addition",
          layout: "column",
          activeColumn: "tens",
          scaffoldLevel: "full",
          revealedColumns: ["hundreds"],
        },
        preview: { text: "Tens active" },
      },
      {
        label: "PV: minimal",
        args: {
          operandA: 278,
          operandB: 465,
          operation: "addition",
          layout: "column",
          scaffoldLevel: "minimal",
        },
        preview: { text: "Minimal scaffold" },
      },
    ],
  },
  spelling: {
    description:
      "Letter boxes for spelling. spellingRevealed must contain ALL letters of the word — use empty string '' for hidden letters, the actual letter for revealed ones. For tutoring: always use showWord: 'hidden' so the child cannot see the answer. Use showWord: 'hint' to reveal after a wrong attempt. Use showWord: 'always' only for demos.",
    params: {
      word: "string",
      spellingRevealed: "string[] (optional; same length as word; '' = hidden)",
      showWord: "hidden | hint | always (optional)",
      streakCount: "number (optional)",
    },
    example: {
      type: "spelling",
      params: {
        word: "railroad",
        spellingRevealed: ["r", "", "i", "l", "r", "o", "", "d"],
        showWord: "hidden",
      },
    },
    preview: {
      text: "□ □ □ □ □ □\nLetter boxes · progressive reveal · streak 🔥",
    },
    variants: [
      {
        label: "railroad (hidden)",
        args: {
          word: "railroad",
          spellingRevealed: ["r", "", "i", "l", "r", "o", "", "d"],
          showWord: "hidden",
          compoundBreak: 4,
        },
        preview: { text: "Compound word" },
      },
      {
        label: "honeycomb (streak)",
        args: {
          word: "honeycomb",
          spellingRevealed: ["h", "o", "n", "", "", "", "", "", ""],
          showWord: "hidden",
          streakCount: 4,
          personalBest: 6,
        },
        preview: { text: "With streak counter" },
      },
    ],
  },
  math_inline: {
    description: "Large math expression e.g. 8 + 5 = ? with animated answer slot",
    params: { expression: "string" },
    example: { type: "math_inline", params: { expression: "8 + 5" } },
    preview: { text: "8 + 5 = ?\nLarge monospace · animated ? slot" },
    variants: [
      {
        label: "743 + 124",
        args: { expression: "743 + 124" },
        preview: { text: "Addition" },
      },
      {
        label: "12 − 7",
        args: { expression: "12 − 7" },
        preview: { text: "Subtraction" },
      },
    ],
  },
  text: {
    description: "Plain text, any size — fallback for anything without a preset",
    params: {
      content: "string",
      fontSize: "string (optional)",
      color: "string (optional)",
    },
    example: {
      type: "text",
      params: { content: "NICKEL\n\nNIH-kul\n\n5 cents" },
    },
    preview: { text: "Plain centered text\nUse for words, pronunciations, labels" },
  },
  svg_raw: {
    description:
      "Render custom SVG — use when no preset fits. Claude generates the SVG inline.",
    params: { svg: "string — valid SVG markup" },
    example: {
      type: "svg_raw",
      params: {
        svg: "<svg width='200' height='200' xmlns='http://www.w3.org/2000/svg'><circle cx='100' cy='100' r='80' fill='#FFD700'/><text x='100' y='115' text-anchor='middle' font-size='48'>⭐</text></svg>",
      },
    },
    preview: { text: "🎨 Custom SVG\nClaude generates any visual" },
  },
  worksheet: {
    description: "Display the current homework worksheet image at the specified problem",
    params: { problemId: "string (optional)" },
    example: { type: "worksheet", params: { problemId: "1" } },
    preview: { text: "📄 Homework worksheet\nShows current problem image" },
  },
  game: {
    description: "Launch a game iframe by name from the game registry",
    params: { name: "string — must match a registered game name" },
    example: { type: "game", params: { name: "store-game" } },
    preview: {
      text: "🎮 Launch game\nstore-game · word-builder · space-invaders · space-frogger · asteroid · bd-reversal",
    },
  },
  reward: {
    description:
      "Show a reward character with celebration animation — use after correct answers",
    params: {
      label: "string — celebration text",
      svg: "string — character SVG (optional, use a built-in character name or custom SVG)",
    },
    example: {
      type: "reward",
      params: { label: "3 in a row!", character: "hitodama" },
    },
    preview: { svg: HITODAMA_SVG },
    variants: [
      {
        label: "3 in a row",
        args: { label: "3 in a row!", character: "hitodama" },
        preview: { svg: HITODAMA_SVG },
      },
      {
        label: "Correct!",
        args: { label: "Correct!", character: "tengu" },
        preview: { text: "Tengu character" },
      },
    ],
  },
  championship: {
    description:
      "Championship screen — use after completing a full worksheet or major milestone",
    params: { label: "string — championship text" },
    example: { type: "championship", params: { label: "CHAMPION! 🏆" } },
    preview: { svg: ONI_SVG },
    variants: [
      {
        label: "CHAMPION",
        args: { label: "CHAMPION!" },
        preview: { svg: ONI_SVG },
      },
      {
        label: "EPIC WIN",
        args: { label: "EPIC WIN! 🏆" },
        preview: { text: "Kitsune character" },
      },
    ],
  },
};

export type CanvasCapabilityType = keyof typeof CANVAS_REGISTRY;

export function generateCanvasCapabilitiesManifest(): string {
  const lines: string[] = [
    "[Canvas Capabilities]",
    "Call canvasShow with one of these types:",
    "",
  ];
  for (const [type, cap] of Object.entries(CANVAS_REGISTRY)) {
    lines.push(`• ${type} — ${cap.description}`);
    lines.push(`  Example: ${JSON.stringify(cap.example)}`);
    lines.push("");
  }
  return lines.join("\n");
}
