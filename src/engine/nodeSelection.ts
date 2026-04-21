import type { ChildProfile } from "../shared/childProfile";
import type { NodeConfig, NodeType, SessionTheme } from "../shared/adventureTypes";
import { selectNodeType } from "./bandit";
import { planSession } from "./learningEngine";

const DOPAMINE_TYPES: NodeType[] = ["space-invaders", "asteroid"];

const WORD_DRIVEN_MAP_TYPES = new Set<string>([
  "pronunciation",
  "karaoke",
  "word-builder",
  "spell-check",
  "quest",
  "boss",
]);

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

function baseNode(
  id: string,
  type: NodeType,
  opts: Partial<NodeConfig> = {},
): NodeConfig {
  return {
    id,
    type,
    isLocked: opts.isLocked ?? false,
    isCompleted: opts.isCompleted ?? false,
    isGoal: opts.isGoal ?? false,
    difficulty: opts.difficulty ?? 1,
    thumbnailUrl: opts.thumbnailUrl,
    words: opts.words,
  };
}

/**
 * Ordered nodes for one adventure session: riddle → bandit picks → dopamine → castle boss.
 */
export async function buildNodeList(
  profile: ChildProfile,
  _theme: SessionTheme,
): Promise<NodeConfig[]> {
  const total = sessionTotalNodes(profile.attentionWindow_ms);
  const middleSlots = Math.max(0, total - 3);
  const childId = profile.childId;
  const plan = planSession(childId, "spelling");
  const dueWords =
    plan.dueWords?.length && plan.dueWords.length > 0
      ? plan.dueWords
      : [...plan.newWords, ...plan.reviewWords];

  const out: NodeConfig[] = [];

  out.push(baseNode("n-riddle", "riddle", { difficulty: 1, words: [] }));

  for (let i = 0; i < middleSlots; i++) {
    const t = await selectNodeType(childId, [...BANDIT_POOL]);
    const words = WORD_DRIVEN_MAP_TYPES.has(t) ? [...dueWords] : [];
    out.push(baseNode(`n-m-${i}-${t}`, t, { difficulty: 2, words }));
  }

  const dopamineType =
    DOPAMINE_TYPES[Math.random() < 0.5 ? 0 : 1] ?? "asteroid";
  out.push(baseNode("n-dopamine", dopamineType, { difficulty: 1, words: [] }));

  out.push(
    baseNode("n-castle", "boss", {
      difficulty: 3,
      words: [...dueWords],
    }),
  );
  const lastIdx = out.length - 1;
  if (lastIdx >= 0) {
    out[lastIdx] = { ...out[lastIdx], isGoal: true };
  }

  return out;
}
