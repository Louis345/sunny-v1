import { getChildChart } from "../profiles/childChart";
import { buildShowroomTalkMemoryPrompt } from "./companionShowroomTalk";
import { ensureCompanionRelationship, recordChildGivenCompanionName } from "./companionInteractionMemory";
import { REMEMBER_CHILD_GIVEN_NAME_TOOL } from "./companionShowroomTalk";

/** Facts any companion gets about the child, read from her chart (Law 12). No clinical notes. */
export type CompanionChildFacts = {
  name: string;
  sayName: string;
  age?: number;
  grade?: number;
  favorites: string[];
};

const MAX_FAVORITE_LINES = 10;

function favoriteThingsFromSoul(aboutHer: string | null): string[] {
  if (!aboutHer) return [];
  const section = aboutHer.split(/^(?=## )/m).find((part) => /^## favorite things/i.test(part.trim()));
  if (!section) return [];
  return section
    .split("\n")
    .slice(1)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter((line) => line && !/^-+$/.test(line))
    .map((line) => line.slice(0, 160));
}

export function readCompanionChildFacts(
  childId: string,
  opts: { rootDir?: string } = {},
): CompanionChildFacts | null {
  try {
    const chart = getChildChart(childId, { rootDir: opts.rootDir });
    const favorites = [...chart.childVoice.favorites, ...favoriteThingsFromSoul(chart.childVoice.aboutHer)];
    return {
      name: chart.identity.displayName,
      sayName: chart.identity.ttsName,
      ...(typeof chart.demographics?.age === "number" && { age: chart.demographics.age }),
      ...(typeof chart.demographics?.grade === "number" && { grade: chart.demographics.grade }),
      favorites: [...new Set(favorites)].slice(0, MAX_FAVORITE_LINES),
    };
  } catch (err: unknown) {
    // A call still happens without facts; the log says the companion is talking to someone it cannot name.
    console.warn(
      ` 🎮 [companion-memory] [child_facts] [unavailable] child=${childId} reason=${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export function formatCompanionChildFacts(facts: CompanionChildFacts | null): string | undefined {
  if (!facts) return undefined;
  return [
    "Who you are talking to (facts from the child's chart; you already know her, so never ask her name):",
    `Name: ${facts.name} (say it ${facts.sayName}).`,
    [facts.age != null && `age ${facts.age}`, facts.grade != null && `grade ${facts.grade}`].filter(Boolean).join(", ") || null,
    facts.favorites.length ? `Things she loves: ${facts.favorites.join("; ")}.` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/**
 * Everything a companion knows before it speaks to a child: her chart facts and its own memory of her. First contact
 * creates the relationship, so a companion she has never called still starts remembering from this turn.
 */
export function buildCompanionCallContext(
  input: { childId: string; companionId: string },
  opts: { rootDir?: string } = {},
): string | undefined {
  let memory;
  try {
    memory = ensureCompanionRelationship(input.childId, input.companionId, opts).memory;
  } catch (err: unknown) {
    console.error(
      ` 🔴 [companion-memory] [relationship_ensure] [error] child=${input.childId} companion=${input.companionId}`,
      err instanceof Error ? err.message : String(err),
    );
  }
  const parts = [
    formatCompanionChildFacts(readCompanionChildFacts(input.childId, opts)),
    buildShowroomTalkMemoryPrompt(memory),
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join("\n") : undefined;
}

type ToolUseBlockLike = { type: string; id?: string; name?: string; input?: unknown };

/**
 * Stores every nickname or role the companion chose to remember this turn, and answers each tool call so a
 * follow-up request stays valid. A failed save is reported to the companion and logged, never thrown into the call.
 */
export function applyCompanionRelationshipToolUses(
  input: { childId: string; companionId: string; content: ReadonlyArray<ToolUseBlockLike> },
  opts: { rootDir?: string } = {},
): Array<{ type: "tool_result"; tool_use_id: string; is_error: boolean; content: string }> {
  return input.content
    .filter((block) => block.type === "tool_use" && block.name === REMEMBER_CHILD_GIVEN_NAME_TOOL && block.id)
    .slice(0, 2)
    .map((block) => {
      const raw = (block.input && typeof block.input === "object" ? block.input : {}) as Record<string, unknown>;
      let result: ReturnType<typeof recordChildGivenCompanionName>;
      try {
        result = recordChildGivenCompanionName(
          { childId: input.childId, companionId: input.companionId, name: raw.name, kind: raw.kind, childWords: raw.childWords },
          opts,
        );
      } catch (err: unknown) {
        console.error(
          ` 🔴 [companion-memory] [child_given_name] [error] child=${input.childId} companion=${input.companionId}`,
          err instanceof Error ? err.message : String(err),
        );
        result = { recorded: false, reason: "save_failed" };
      }
      return {
        type: "tool_result" as const,
        tool_use_id: block.id as string,
        is_error: !result.recorded,
        content: JSON.stringify({
          type: "remember_child_given_name_result",
          remembered: result.recorded,
          instruction: "Answer with the exact short words you say aloud, playing along with what she calls you.",
        }),
      };
    });
}
