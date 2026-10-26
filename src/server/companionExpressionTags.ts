/**
 * Inline expression tags: Elli writes "[smile] Hey Ila!" and the avatar smiles
 * while she speaks, instead of calling a tool first (a full Claude round trip
 * before her first word). Tags come from COMPANION_EMOTES, so a new avatar
 * expression is automatically a new tag.
 */
import { COMPANION_EMOTES, isCompanionEmote, type CompanionEmote } from "../shared/companionEmotes";

/** Everyday words Elli may reach for, mapped onto avatar expressions. */
const EXPRESSION_ALIASES: Record<string, CompanionEmote> = {
  smile: "happy",
  frown: "sad",
};

/** Longest plausible tag ("[celebrating]" is 13); anything longer is ordinary text. */
const MAX_TAG_LENGTH = 24;

export const COMPANION_EXPRESSION_PROMPT = [
  "## Your expressions",
  "Your face and body are visible to the child. Optional inline tags show facial expressions, for example: \"[smile] Hi there!\".",
  // No [thinking] tag: offered one, she writes it and then her thoughts, which are spoken. Her avatar shows thinking on its own.
  `Available tags: ${[...Object.keys(EXPRESSION_ALIASES), ...COMPANION_EMOTES.filter((t) => t !== "thinking")].map((t) => `[${t}]`).join(" ")}.`,
  "Tags are silent: they are never spoken or shown. Body animation and camera actions remain available through companionAct.",
].join("\n");

function resolveExpression(tag: string): CompanionEmote | null {
  const name = tag.trim().toLowerCase();
  if (isCompanionEmote(name)) return name;
  return EXPRESSION_ALIASES[name] ?? null;
}

/**
 * Streaming filter: strips expression tags from Elli's text (including tags
 * split across chunks) and reports each one. Unknown bracketed text passes
 * through unchanged, and an unclosed bracket never holds speech back for long.
 */
export function createExpressionTagFilter(onExpression: (emote: CompanionEmote) => void) {
  let pending = "";
  let lastChar = "";
  let dropNextSpace = false;

  const emit = (text: string, out: string[]) => {
    if (!text) return;
    if (dropNextSpace && text.startsWith(" ")) text = text.slice(1);
    dropNextSpace = false;
    if (!text) return;
    out.push(text);
    lastChar = text[text.length - 1];
  };

  return {
    push(chunk: string): string {
      const text = pending + chunk;
      pending = "";
      const out: string[] = [];
      let pos = 0;
      while (pos < text.length) {
        const open = text.indexOf("[", pos);
        if (open < 0) {
          emit(text.slice(pos), out);
          break;
        }
        emit(text.slice(pos, open), out);
        const close = text.indexOf("]", open + 1);
        if (close < 0) {
          if (text.length - open <= MAX_TAG_LENGTH) {
            pending = text.slice(open);
          } else {
            emit(text.slice(open), out);
          }
          break;
        }
        const expression = close - open <= MAX_TAG_LENGTH ? resolveExpression(text.slice(open + 1, close)) : null;
        if (expression) {
          onExpression(expression);
          dropNextSpace = lastChar === "" || lastChar === " ";
        } else {
          emit(text.slice(open, close + 1), out);
        }
        pos = close + 1;
      }
      return out.join("");
    },
    /** End of reply: release any partial bracket text rather than dropping it. */
    flush(): string {
      const rest = pending;
      pending = "";
      return rest;
    },
  };
}
