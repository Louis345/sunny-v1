import { selectNextProblemType } from "../algorithms/interleaving";
import type { ChildProfile } from "../shared/childProfile";
import type { NodeConfig, NodeType, SessionTheme } from "../shared/adventureTypes";
import { selectNodeType } from "./bandit";
import { planSession } from "./learningEngine";
import { readLearningProfile } from "../utils/learningProfileIO";

const DOPAMINE_TYPES: NodeType[] = ["space-invaders", "asteroid"];

/** Node types the bandit may place between riddle and dopamine. */
const BANDIT_POOL: NodeType[] = [
  "word-builder",
  "bubble-pop",
  "karaoke",
  "clock-game",
  "coin-counter",
  "spell-check",
];

function sessionTotalNodes(attentionWindow_ms: number): 3 | 4 | 5 {
  if (attentionWindow_ms < 180_000) return 3;
  if (attentionWindow_ms <= 360_000) return 4;
  return 5;
}

function nextMathLabel(childId: string): string {
  const lp = readLearningProfile(childId);
  const res = selectNextProblemType({
    availableTypes: ["addition", "subtraction"],
    recentHistory: [],
    performanceByType: {
      addition: { correct: 0, total: 0 },
      subtraction: { correct: 0, total: 0 },
    },
    params:
      lp?.algorithmParams.interleaving ?? {
        weakestWeight: 0.5,
        secondWeight: 0.3,
        randomWeight: 0.2,
        minTypeExposure: 0.15,
      },
  });
  return `${res.nextType}:practice`;
}

function baseNode(
  id: string,
  type: NodeType,
  themeName: string,
  opts: Partial<NodeConfig> = {},
): NodeConfig {
  return {
    id,
    type,
    words: opts.words ?? [],
    difficulty: opts.difficulty ?? 1,
    timeLimit_ms: opts.timeLimit_ms ?? 60_000,
    theme: opts.theme ?? themeName,
    thumbnailUrl: opts.thumbnailUrl,
    isCastle: opts.isCastle ?? false,
  };
}

/**
 * Ordered nodes for one adventure session: riddle → bandit picks → dopamine → castle boss.
 */
export async function buildNodeList(
  profile: ChildProfile,
  theme: SessionTheme,
): Promise<NodeConfig[]> {
  const total = sessionTotalNodes(profile.attentionWindow_ms);
  const middleSlots = Math.max(0, total - 3);
  const childId = profile.childId;
  const plan = planSession(childId, "spelling");
  const words =
    plan.focusWords.length > 0 ? plan.focusWords : ["practice", "session"];
  const hardest = words[words.length - 1] ?? words[0] ?? "focus";
  const themeName = theme.name;

  const out: NodeConfig[] = [];

  out.push(
    baseNode("n-riddle", "riddle", themeName, {
      words: [],
      difficulty: 1,
      timeLimit_ms: 45_000,
    }),
  );

  for (let i = 0; i < middleSlots; i++) {
    const t = await selectNodeType(childId, [...BANDIT_POOL]);
    const slice = words.slice(i, i + 3);
    const w =
      t === "clock-game" || t === "coin-counter"
        ? ["7", "3"]
        : slice.length > 0
          ? slice
          : words.slice(0, Math.min(3, words.length));
    out.push(
      baseNode(`n-m-${i}-${t}`, t, themeName, {
        words: w,
        difficulty: 2,
        timeLimit_ms: 120_000,
      }),
    );
  }

  const dopamineType =
    DOPAMINE_TYPES[Math.random() < 0.5 ? 0 : 1] ?? "asteroid";
  out.push(
    baseNode("n-dopamine", dopamineType, themeName, {
      words: [],
      difficulty: 1,
      timeLimit_ms: 180_000,
    }),
  );

  out.push(
    baseNode("n-castle", "boss", themeName, {
      words: [hardest],
      difficulty: 3,
      timeLimit_ms: 180_000,
      isCastle: true,
    }),
  );

  const mathIdx = out.findIndex((n) => n.type === "coin-counter");
  if (mathIdx >= 0) {
    const n = out[mathIdx];
    out[mathIdx] = {
      ...n,
      words: [nextMathLabel(childId)],
    };
  }

  return out;
}
