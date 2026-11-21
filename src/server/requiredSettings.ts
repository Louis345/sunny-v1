/** Settings every kiosk start and every ingest needs; they belong in .env so no start can miss them (2026-11-07). */
const REQUIRED = ["SUNNY_CHART_DIR", "SUNNY_EXPERIENCE_PLANNER_MODEL"] as const;

export function requiredSettingsReport(env: NodeJS.ProcessEnv = process.env): { missing: string[]; line: string } {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  const line = missing.length
    ? ` 🎮 [startup] [settings] [missing] ${missing.join(", ")} (add them to .env)`
    : ` 🎮 [startup] [settings] [ready] chart_dir=${env.SUNNY_CHART_DIR} planner_model=${env.SUNNY_EXPERIENCE_PLANNER_MODEL}`;
  return { missing, line };
}
