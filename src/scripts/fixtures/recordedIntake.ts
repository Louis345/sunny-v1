import type { AssignmentPlanningPacket } from "../../engine/assignmentPlanner";
import type { ToolLoopRequest } from "../../engine/plannerToolLoop";
import { plainDraw } from "./successorToolConversation";

/** A recorded Discovery Planner answer, written the way the retired single form held it. */
export type RecordedIntakeDraft = { title?: string; words?: unknown[]; uncertainty?: unknown[]; sourceNotes?: string[]; boardDefinition?: { portals?: Array<{ kind?: string; label?: string; activityNodeId?: string }> };
  diagnostic?: { action?: string; activityId?: string; modeId?: string; reason?: string; evidenceIds?: string[]; uncertainty?: string[]; nextEvidenceNeeded?: string[] } };
export type RecordedIntakePlanner = (packet: AssignmentPlanningPacket, model: string) => Promise<{ draft: unknown }>;

/** Plays a recorded Discovery answer through the real intake tools at $0: each turn asks the recorded
 * Planner once and sends its answer as record_words, choose_discovery and finish_intake. A Planner that
 * answers differently on a later turn fixes its mistakes in the conversation, as the model would.
 * The map artist draws the plain layout. */
export function recordedIntake(planner: RecordedIntakePlanner) {
  return (packet: AssignmentPlanningPacket) => ({
    draw: plainDraw,
    send: async (request: ToolLoopRequest, turn: number) => {
      const draft = ((await planner(packet, request.model)).draft ?? {}) as RecordedIntakeDraft;
      const portal = (kind: string) => draft.boardDefinition?.portals?.find(row => row.kind === kind)?.label;
      const diagnostic = draft.diagnostic ?? {};
      const calls = [
        { name: "record_words", input: { words: (draft.words ?? []).map(row => row && typeof row === "object" && "word" in row ? { word: (row as { word: string }).word, page_number: (row as { pageNumber?: number }).pageNumber } : row),
          uncertainty: (draft.uncertainty ?? []).map(row => row && typeof row === "object" ? { kind: (row as { kind?: string }).kind, page_number: (row as { pageNumber?: number }).pageNumber, detail: (row as { detail?: string }).detail } : row),
          source_notes: draft.sourceNotes ?? [] } },
        { name: "choose_discovery", input: { action: diagnostic.action, instrument: diagnostic.action === "select" ? `${diagnostic.activityId}:${diagnostic.modeId}` : "none",
          reason: diagnostic.reason, evidence_ids: diagnostic.evidenceIds, uncertainty: diagnostic.uncertainty, next_evidence_needed: diagnostic.nextEvidenceNeeded } },
        { name: "finish_intake", input: { title: draft.title, portal_label: portal("activity") ?? "Word Check", endpoint_label: portal("endpoint") ?? "Finish" } },
      ];
      return { id: `recorded-intake-${turn}`, type: "message", role: "assistant", model: request.model, stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
        content: calls.map((call, index) => ({ type: "tool_use", id: `intake-${turn}-${index}`, ...call })) } as never;
    },
  });
}
