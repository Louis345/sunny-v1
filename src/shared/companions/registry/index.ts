/**
 * Companion capability registry barrel (COMPANION-API-001+).
 * New capability: add *.capability.ts and one import line below.
 */

import type { CapabilityDefinition } from "../companionContract";
import { animateCapability } from "./animate.capability";
import { cameraCapability } from "./camera.capability";
import { emoteCapability } from "./emote.capability";
import { moveCapability } from "./move.capability";

const entries: CapabilityDefinition[] = [
  emoteCapability,
  cameraCapability,
  animateCapability,
  moveCapability,
];

export const COMPANION_CAPABILITIES: Map<string, CapabilityDefinition> = new Map(
  entries.map((def) => [def.type, def]),
);
