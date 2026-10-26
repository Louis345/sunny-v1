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
  return `This is the assignment-capture and Discovery-choice phase of Sunny's Planner. The goal: she wants to come back to Sunny, and she knows her words by the test. Use the tools.
1. record_words: every assigned spelling word from the complete school source, spelled exactly as printed, with its page. Notes about headers, OCR and repeated pages go in source_notes and are informational. Use uncertainty for a word you cannot read or an unclear assignment scope.
2. choose_discovery: you choose the Discovery check: the validated mode that best finds her independent starting point on these words, for this child. Hearing a whole word is stimulus; spelling or letter clues are assistance. If none fits, use action needs_instrument with instrument none.
3. finish_intake: the assignment title and the short names she sees.
Discovery comes first, before any teaching: Sunny builds this one-stop board from your choice and the map artist draws it.
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
