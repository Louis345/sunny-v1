import {
  listActivityToolContracts,
  type ActivityPlannerVisibility,
  type ActivityToolContract,
} from "./activityToolCatalog";
import { NODE_REGISTRY_KEYS } from "../shared/nodeRegistry";

export type PlannerActivityCatalogEntry = {
  activityId: string;
  label: string;
  plannerVisibility: ActivityPlannerVisibility;
  launchable: boolean;
  intervention: boolean;
  domains: ActivityToolContract["domains"];
  purposes: ActivityToolContract["purposes"];
  skillTargets: ActivityToolContract["traits"]["skillTargets"];
  evidenceType: ActivityToolContract["traits"]["evidenceType"];
  preferenceDimensions: ActivityToolContract["traits"]["preferenceDimensions"];
};

export type PlannerActivityCatalog = {
  entries: PlannerActivityCatalogEntry[];
  byId: Map<string, PlannerActivityCatalogEntry>;
};

export type PlannerActivityValidation =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "unknown_activity"
        | "not_launchable_intervention";
    };

const COMPILER_OWNED_ACTIVITY_IDS = new Set(["mystery", "quest", "boss"]);

export function buildPlannerActivityCatalog(
  contracts: ActivityToolContract[] = listActivityToolContracts(),
  runtimeActivityIds: string[] = NODE_REGISTRY_KEYS,
): PlannerActivityCatalog {
  const runtimeIds = new Set(runtimeActivityIds);
  const entries = contracts.map((contract) => {
    const launchable = runtimeIds.has(contract.id);
    const compilerOwned = COMPILER_OWNED_ACTIVITY_IDS.has(contract.id);
    return {
      activityId: contract.id,
      label: contract.label,
      plannerVisibility: contract.plannerVisibility,
      launchable,
      intervention: launchable && contract.plannerVisibility === "map_node" && !compilerOwned,
      domains: contract.domains,
      purposes: contract.purposes,
      skillTargets: contract.traits.skillTargets,
      evidenceType: contract.traits.evidenceType,
      preferenceDimensions: contract.traits.preferenceDimensions,
    } satisfies PlannerActivityCatalogEntry;
  });
  return {
    entries,
    byId: new Map(entries.map((entry) => [entry.activityId, entry])),
  };
}

export function plannerLaunchableActivityIds(catalog = buildPlannerActivityCatalog()): string[] {
  return catalog.entries
    .filter((entry) => entry.intervention)
    .map((entry) => entry.activityId)
    .sort();
}

export function validatePlannerActivityId(
  activityId: string,
  catalog = buildPlannerActivityCatalog(),
): PlannerActivityValidation {
  const entry = catalog.byId.get(activityId);
  if (!entry) return { ok: false, reason: "unknown_activity" };
  if (!entry.intervention) return { ok: false, reason: "not_launchable_intervention" };
  return { ok: true };
}
