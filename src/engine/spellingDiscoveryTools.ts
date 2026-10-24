import { z } from "zod";
import { expandJourneySequence, type AdventureJourneyDefinition } from "../shared/adventureBoardDefinition";
import { resolveSpellingDiagnosticSelection, type AssignmentPlanningPacket, type SpellingIntake } from "./assignmentPlanner";
import { toolFor, type PlannerTool } from "./plannerToolLoop";

/** The intake Planner's small locked tools: it reads the worksheet and chooses the Discovery
 * instrument. Code builds the one-stop journey (start, the diagnostic, finish) for the artist,
 * so the board's identity, links and version are never the model's to write. */
type Capture = Pick<SpellingIntake, "words" | "sourceNotes"> & { uncertainty: Array<{ kind: "unreadable_word" | "ambiguous_word" | "assignment_scope"; pageNumber: number; detail: string }> };
export type DiscoveryState = { capture?: Capture; diagnostic?: NonNullable<SpellingIntake["diagnostic"]>; result?: { capture: SpellingIntake; journey?: AdventureJourneyDefinition } };

const text = (description: string) => z.string().min(1).describe(description);
const enumOf = (values: readonly string[], fallback: string) => z.enum((values.length ? values : [fallback]) as [string, ...string[]]);

export function spellingDiscoveryToolkit(packet: AssignmentPlanningPacket) {
  const context = packet.spellingDiagnostics;
  if (!context) throw new Error("spelling_diagnostic_context_missing");
  const instruments = new Map(context.instruments.map(row => [`${row.activityId}:${row.modeId}`, row]));
  const pages = new Set(packet.sourceDocument.pages.map(page => page.pageNumber));
  const identity = (word: string) => word.normalize("NFC").toLocaleLowerCase("en-US");

  const tool = toolFor<DiscoveryState>();
  const tools: PlannerTool<DiscoveryState>[] = [
    tool({ name: "record_words", description: "Record every assigned spelling word from the worksheet, with its page. Calling it again replaces the list.",
      schema: z.object({
        words: z.array(z.object({ word: text("An assigned word, spelled exactly as printed."), page_number: z.number().int().min(1) }).strict()).min(1),
        uncertainty: z.array(z.object({ kind: z.enum(["unreadable_word", "ambiguous_word", "assignment_scope"]), page_number: z.number().int().min(1), detail: text("What is unclear.") }).strict()).describe("Only unresolved word identity or assignment scope. Empty when the words are clear."),
        source_notes: z.array(z.string()).describe("Informational notes about headers, OCR or repeated pages. They never block anything."),
      }).strict(),
      run: (state, input) => {
        const page = [...input.words, ...input.uncertainty].find(row => !pages.has(row.page_number));
        if (page) return { ok: false, error: `the worksheet has no page ${page.page_number}` };
        const ids = input.words.map(row => identity(row.word));
        const twice = ids.find((id, index) => ids.indexOf(id) !== index);
        if (twice) return { ok: false, error: `the word ${twice} is listed more than once` };
        state.capture = { words: input.words.map(row => ({ word: row.word.trim(), pageNumber: row.page_number })), sourceNotes: input.source_notes,
          uncertainty: input.uncertainty.map(row => ({ kind: row.kind, pageNumber: row.page_number, detail: row.detail })) };
        state.result = undefined;
        return { ok: true, result: { words: input.words.length } };
      } }),
    tool({ name: "choose_discovery", description: "Choose the validated instrument that can find her independent starting point on these words, or say none fits. Calling it again replaces the choice.",
      schema: z.object({
        action: z.enum(["select", "needs_instrument"]),
        instrument: enumOf([...instruments.keys(), "none"], "none").describe("The validated instrument and mode for select; none for needs_instrument."),
        reason: text("Why this choice fits her and these words."),
        evidence_ids: z.array(enumOf(context.evidenceIds, "none")).min(1).describe("The supplied evidence IDs behind the choice."),
        uncertainty: z.array(z.string().min(1)).min(1), next_evidence_needed: z.array(z.string().min(1)).min(1),
      }).strict(),
      run: (state, input) => {
        if (input.action === "select" && input.instrument === "none") return { ok: false, error: "select needs an instrument from the list" };
        if (input.action === "needs_instrument" && input.instrument !== "none") return { ok: false, error: "use instrument none with needs_instrument" };
        const chosen = instruments.get(input.instrument);
        const reasons = { reason: input.reason, evidenceIds: [...input.evidence_ids], uncertainty: [...input.uncertainty], nextEvidenceNeeded: [...input.next_evidence_needed] };
        state.diagnostic = chosen ? { action: "select", activityId: chosen.activityId, modeId: chosen.modeId, ...reasons } : { action: "needs_instrument", ...reasons };
        state.result = undefined;
        return { ok: true, result: { action: input.action } };
      } }),
    tool({ name: "finish_intake", description: "Finish when the words are recorded and the Discovery choice is made. Sunny checks it and replies accepted, or says exactly what to fix.",
      schema: z.object({ title: text("The assignment's title."), portal_label: text("The short name she sees on the Discovery portal: 2 to 4 words."), endpoint_label: text("Name of the finish portal.") }).strict(),
      run: (state, input) => {
        if (!state.capture) return { ok: false, error: "record the words first with record_words" };
        if (!state.diagnostic) return { ok: false, error: "choose the Discovery instrument first with choose_discovery" };
        const capture: SpellingIntake = { title: input.title, ...state.capture, diagnostic: state.diagnostic };
        try { resolveSpellingDiagnosticSelection(capture, packet); }
        catch (error) { return { ok: false, error: `the Discovery choice cannot run: ${error instanceof Error ? error.message : String(error)}` }; }
        const journey = state.diagnostic.action === "select" ? expandJourneySequence({ title: input.title, opening: ["diagnostic"], closing: [],
          singlePathReason: "Discovery is one independent check of every assigned word.", endpointLabel: input.endpoint_label }, [{ id: "diagnostic", title: input.portal_label }]) : undefined;
        state.result = { capture, ...(journey ? { journey } : {}) };
        return { ok: true, result: { accepted: true, words: capture.words.length } };
      } }),
  ];
  return {
    tools,
    initialState: (): DiscoveryState => ({}),
    finished: (state: DiscoveryState) => Boolean(state.result),
    result: (state: DiscoveryState) => { if (!state.result) throw new Error("spelling_intake_unfinished"); return state.result; },
  };
}
