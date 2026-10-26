import path from "path";
import { assembleAdventureBoardDefinition, type AdventureBoardComposition, type AdventureJourneyDefinition } from "../shared/adventureBoardDefinition";
import { ASSIGNMENT_PLANNER_PERSONA, resolveAssignmentPlannerModel, type AssignmentPlannerTelemetry, type AssignmentPlanningPacket, type SpellingIntake } from "./assignmentPlanner";
import { assignmentPlannerContent } from "./assignmentSourceExtraction";
import { drawJourney } from "./directMathExperience";
import { runPlannerToolLoop, type ToolLoopRequest } from "./plannerToolLoop";
import { providerTurnSender } from "./plannerToolProvider";
import { spellingDiscoveryToolkit } from "./spellingDiscoveryTools";
import type Anthropic from "@anthropic-ai/sdk";

export function buildSpellingIntakeToolPrompt(packet: AssignmentPlanningPacket): string {
  return `This is the assignment-capture and Discovery-choice phase of Sunny's Planner. Use the tools.
1. record_words: every assigned spelling word from the complete school source, spelled exactly, with its page. Do not add practice words or guess unreadable words. Put informational observations about headers, OCR and repeated pages in source_notes; they never block anything. Use uncertainty only for unresolved word identity or assignment scope, and leave it empty when the words and scope are clear.
2. choose_discovery: you own the Discovery choice. Choose a validated instrument whose capture can establish the assigned words' independent starting point for this child. Compare its capabilities and measurement risks with the source, child chart, factual observations and device uncertainty. Availability does not establish suitability. The instrument must offer every assigned word without first exposing its spelling, allow Not sure, exit and resume, and preserve unknown, support and confound status. Hearing a whole word is stimulus; spelling or letter clues are assistance. If none fits, use action needs_instrument with instrument none. Do not substitute an unvalidated practice game or invent a device or a permanent learning-style preference. Cite only the evidence IDs offered.
3. finish_intake: the assignment title and the short names she sees.
Do not prescribe a teaching board, predictions, games or mastered/weak labels: no Discovery evidence exists yet. Sunny builds the board and the map artist draws it; you never write positions, IDs or links.
SOURCE:
${JSON.stringify(packet.sourceDocument)}
CHILD CHART:
${JSON.stringify(packet.childChart)}
VALIDATED DIAGNOSTICS AND FACTUAL EVIDENCE:
${JSON.stringify(packet.spellingDiagnostics ?? null)}`;
}

/** Discovery intake through small locked tools, then the shared map artist. Returns the same
 * SpellingIntake the old single form produced; nothing downstream changes. */
export async function planSpellingIntakeWithTools(packet: AssignmentPlanningPacket, opts: {
  model?: string; draftDir?: string;
  send?: (request: ToolLoopRequest, turn: number) => Promise<Anthropic.Messages.Message>;
  draw?: (journey: AdventureJourneyDefinition) => Promise<{ composition: AdventureBoardComposition; pattern?: string }>;
} = {}): Promise<{ output: SpellingIntake; telemetry: AssignmentPlannerTelemetry }> {
  const model = resolveAssignmentPlannerModel({ model: opts.model });
  const started = Date.now();
  const kit = spellingDiscoveryToolkit(packet);
  const loop = await runPlannerToolLoop({
    label: "spelling-intake", prompt: buildSpellingIntakeToolPrompt(packet), system: ASSIGNMENT_PLANNER_PERSONA,
    content: prompt => assignmentPlannerContent(packet.sourceDocument, prompt),
    model, maxTokens: 16000, tools: kit.tools, state: kit.initialState(), finished: kit.finished,
    send: opts.send ?? providerTurnSender({ label: "spelling-intake", stagePrefix: "spelling-intake-tools", draftDir: opts.draftDir }),
  });
  // Without a capture there is nothing to publish; the intake stays unpublished and says why.
  if (!kit.finished(loop.state)) throw new Error(`spelling_intake_tools_unfinished:${loop.stats.stop}`);
  const { capture, journey } = kit.result(loop.state);
  if (!journey) return { output: capture, telemetry: { model, latencyMs: Date.now() - started } };
  const drawing = await (opts.draw ?? (given => drawJourney({ journey: given, label: `discovery:${packet.sourceDocument.fileHash.slice(0, 8)}`, stagePrefix: "discovery-design",
    identity: { childId: packet.childId, assignment: packet.sourceDocument.fileHash, journey: given }, ...(packet.childChart.childVoice ? { child: packet.childChart.childVoice } : {}),
    ...(opts.draftDir ? { checkpointFile: path.join(opts.draftDir, "discovery-design.json"), rawResponseDir: path.join(opts.draftDir, "provider-diagnostics") } : {}) })))(journey);
  return { output: { ...capture, boardDefinition: assembleAdventureBoardDefinition(journey, drawing.composition, drawing.pattern) }, telemetry: { model, latencyMs: Date.now() - started } };
}
