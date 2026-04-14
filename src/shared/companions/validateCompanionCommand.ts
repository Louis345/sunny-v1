/**
 * Server-side companion command validation (COMPANION-API-006).
 * Never throws; returns null and logs when invalid or unknown.
 */

import {
  COMPANION_API_VERSION,
  type CapabilityRegistry,
  type CompanionCommand,
} from "./companionContract";

export function validateCompanionCommand(
  raw: unknown,
  registry: CapabilityRegistry,
  opts: {
    childId: string;
    source: "claude" | "diag";
    now?: number;
  },
): CompanionCommand | null {
  if (!raw || typeof raw !== "object") {
    console.warn(" [companion-api] validate reject: not an object");
    return null;
  }
  const r = raw as Record<string, unknown>;
  const type = r.type;
  if (typeof type !== "string" || !type.trim()) {
    console.warn(" [companion-api] validate reject: missing type");
    return null;
  }
  const def = registry.get(type);
  if (!def) {
    console.warn(` [companion-api] unknown companion capability: ${type}`);
    return null;
  }
  const payloadRaw = r.payload;
  if (
    !payloadRaw ||
    typeof payloadRaw !== "object" ||
    Array.isArray(payloadRaw)
  ) {
    console.warn(" [companion-api] validate reject: payload must be an object");
    return null;
  }
  const parsed = def.payloadSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    console.warn(" [companion-api] validate reject: schema", parsed.error.flatten());
    return null;
  }
  return {
    apiVersion: COMPANION_API_VERSION,
    type,
    payload: parsed.data,
    childId: opts.childId,
    timestamp: opts.now ?? Date.now(),
    source: opts.source,
  };
}
