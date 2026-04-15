/**
 * Markdown for Claude system prompts (COMPANION-API-005).
 * Same idea as generateCanvasCapabilities — registry-driven, no hand-written prose per capability.
 */

import type { CompanionCapabilityPhase } from "./companionContract";
import { COMPANION_CAPABILITIES } from "./registry";

const PHASE_ORDER: CompanionCapabilityPhase[] = [0.5, 1, 2, 3];

export function generateCompanionCapabilities(
  maxPhase: CompanionCapabilityPhase = 0.5,
): string {
  const defs = [...COMPANION_CAPABILITIES.values()].filter(
    (d) => d.phase <= maxPhase,
  );
  defs.sort(
    (a, b) =>
      PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) ||
      a.type.localeCompare(b.type),
  );

  const lines: string[] = [
    "# Companion Capabilities",
    "",
    "Use the **companionAct** tool with `type` and `payload` exactly as documented below.",
    "Do not invent capability types or payload fields that are not listed.",
    "",
    "## Available actions",
    "",
  ];

  for (const def of defs) {
    lines.push(`### ${def.type} (v${def.version}, phase ${def.phase})`);
    lines.push(def.description);
    lines.push("");
    lines.push("**When it can help:**");
    for (const w of def.whenToUse) {
      lines.push(`- ${w}`);
    }
    lines.push("");
    lines.push(`**Example:** \`companionAct({ type: "${def.type}", payload: ${JSON.stringify(def.defaultPayload)} })\``);
    lines.push("");
    if (def.type === "animate") {
      lines.push(
        "**Guidance:** Use **animate** for physical actions (wave, dance, think, shrug). Use **emote** only for facial expressions.",
      );
      lines.push(
        "Example: `companionAct({ type: 'animate', payload: { animation: 'wave' } })` — not `companionAct({ type: 'emote', payload: { emote: 'happy' } })` for body language.",
      );
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function getCompanionCapabilities(): string {
  return generateCompanionCapabilities();
}
