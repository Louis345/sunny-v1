/**
 * Companion capability API contract (COMPANION-API-001).
 * Single source for command shape and capability metadata shared by server, web, and prompts.
 */

import type { z } from "zod";

export type CompanionCapabilityPhase = 0.5 | 1 | 2 | 3;

export type CompanionApiVersion = "1.0";

export type DiagControl =
  | {
      kind: "dropdown";
      key: string;
      label: string;
      options: string[];
    }
  | {
      kind: "slider";
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
    }
  | { kind: "toggle"; key: string; label: string; default: boolean };

/**
 * One registered companion capability (emote, camera, …).
 * Each *.capability.ts file exports one of these; the registry barrel collects them.
 */
export interface CapabilityDefinition {
  type: string;
  version: string;
  phase: CompanionCapabilityPhase;
  description: string;
  whenToUse: string[];
  payloadSchema: z.ZodType<Record<string, unknown>>;
  defaultPayload: Record<string, unknown>;
  diagLabel: string;
  diagControls: DiagControl[];
}

/** Validated command broadcast to the client after server checks. */
export interface CompanionCommand {
  apiVersion: CompanionApiVersion;
  type: string;
  payload: Record<string, unknown>;
  childId: string;
  timestamp: number;
  source: "claude" | "diag";
}

export type CapabilityRegistry = Map<string, CapabilityDefinition>;
