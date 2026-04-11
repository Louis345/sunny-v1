/**
 * TASK-018: log Node `ADVENTURE_MAP` once when the HTTP server boots.
 * `/api/map/*` handlers live in setupRoutes (map-coordinator); this file is the
 * explicit server-side hook for the feature flag.
 */
if (process.env.ADVENTURE_MAP === "true") {
  console.log(
    "  🎮 [server] ADVENTURE_MAP=true — map REST at /api/map/start, /api/map/node-complete",
  );
}
