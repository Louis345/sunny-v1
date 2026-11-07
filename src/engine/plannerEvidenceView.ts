/** What the Planner reads from the chart, never what the chart keeps (issue #56). These views are applied
 * only while the question is written: every record stays exactly as stored. They leave out codes the
 * Planner cannot use without a lookup, and keep every learning fact. */

/** Confounds that identify an operational artifact, not anything about her answer. */
const OPERATIONAL_CONFOUNDS = ["artifact_hash:", "launch_id:"];

/** A past decision with its evidence ID list replaced by its count; its reason, changes and evaluations stay. */
export function plannerDecisionView<T extends { evidenceIds: string[] }>(decision: T): Omit<T, "evidenceIds"> & { evidenceCount: number } {
  const { evidenceIds, ...rest } = decision;
  return { ...rest, evidenceCount: evidenceIds.length };
}

/** An attempt without the operational codes in its confounds; word, mode, role, help and session stay. */
export function plannerObservationView<T extends { confounds: string[] }>(observation: T): T {
  return { ...observation, confounds: observation.confounds.filter(value => !OPERATIONAL_CONFOUNDS.some(prefix => value.startsWith(prefix))) };
}
