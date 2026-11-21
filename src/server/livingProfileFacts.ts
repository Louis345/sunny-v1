import crypto from "node:crypto";
import { openChart } from "../chart/db";
import { readLivingProfile } from "../chart/livingProfile";
export { livingProfileLines, readLivingProfile } from "../chart/livingProfile";
import { recordFact } from "../chart/spelling/record";

/** What the memory summarizer may propose about her; code decides what is kept. */
export type ProposedChildFact = { topic: string; kind: string; statement: string; quote: string; speaker: "child" | "someone_else" };
type CallEvent = { id: string; questionText: string; createdAt: string; activityContext?: unknown };

const KINDS = new Set(["like", "dislike", "life_event", "school", "friends", "family", "feeling", "health", "other"]);
const plain = (text: string) => text.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const chartReady = () => Boolean(process.env.SUNNY_CHART_DIR?.trim());

/**
 * Keeps each proposed fact only when it came from her (the child who opened the call) and its quote is found in her own
 * words in this call. Everything else is logged and dropped. Never throws into the call.
 */
export function recordLivingFactsFromCall(input: { childId: string; companionId: string; events: CallEvent[]; proposed: unknown }): number {
  const proposed = Array.isArray(input.proposed) ? input.proposed.slice(0, 6) as ProposedChildFact[] : [];
  if (!proposed.length) return 0;
  if (!chartReady()) {
    console.log(` 🎮 [living-profile] [facts] [skipped] child=${input.childId} reason=no_chart_dir proposed=${proposed.length}`);
    return 0;
  }
  const spoken = input.events.filter(event => !event.activityContext && event.questionText.trim());
  let db: ReturnType<typeof openChart> | undefined, kept = 0;
  try {
    db = openChart(input.childId);
    for (const fact of proposed) {
      const quote = typeof fact?.quote === "string" ? fact.quote.trim() : "";
      const sources = quote ? spoken.filter(event => plain(event.questionText).includes(plain(quote))) : [];
      const why = fact?.speaker !== "child" ? "someone_else" : !quote || !sources.length ? "quote_not_in_her_words" : !KINDS.has(fact.kind) || !fact.topic?.trim() || !fact.statement?.trim() ? "malformed" : null;
      if (why) { console.log(` 🎮 [living-profile] [fact] [dropped] child=${input.childId} reason=${why} topic=${JSON.stringify(fact?.topic ?? "")}`); continue; }
      const factId = `fact:${crypto.createHash("sha256").update(`${input.childId}:${fact.topic.trim().toLowerCase()}:${plain(quote)}:${sources[0].id}`).digest("hex").slice(0, 20)}`;
      recordFact(db, "child.fact_learned", { factId, topic: fact.topic.trim().slice(0, 80), kind: fact.kind as never, statement: fact.statement.trim().slice(0, 600), quote: quote.slice(0, 600),
        speaker: "caller_child", sessionId: `call:${input.companionId}:${sources[0].createdAt}`, companionId: input.companionId, sourceEventIds: sources.map(event => event.id) },
        { occurred_at: sources[0].createdAt });
      kept += 1;
      console.log(` 🎮 [living-profile] [fact] [recorded] child=${input.childId} companion=${input.companionId} topic=${JSON.stringify(fact.topic)}`);
    }
  } catch (error) {
    console.error(` 🎮 [living-profile] [facts] [failed] child=${input.childId} reason=${error instanceof Error ? error.message : String(error)}`);
  } finally {
    db?.close();
  }
  return kept;
}
