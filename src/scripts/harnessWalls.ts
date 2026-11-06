import path from "node:path";
import fs from "node:fs";
import { renderHarnessReport, wallsFromSavedConversations } from "../harness/plannerHarness";

/** Read-only: the walls Sunny's Planner hit in a context folder's saved conversations (e.g. on the kiosk Mac).
 * Usage: npm run harness:walls -- <context folder> [output.html]   Nothing is changed or sent anywhere. */
const contextRoot = path.resolve(process.argv[2] ?? path.join(process.env.HOME ?? "", "SunnyData"));
const output = path.resolve(process.argv[3] ?? path.join(process.cwd(), "outputs/harness/walls.html"));
const walls = wallsFromSavedConversations(contextRoot);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, renderHarnessReport({ title: "Planner walls", runs: [], walls, note: `Read only from ${contextRoot}. Each row is an error Sunny's tools answered the Planner with.` }));
console.log(` 🎮 [harness] [walls] [written] file=${output} walls=${walls.length} total=${walls.reduce((sum, row) => sum + row.count, 0)}`);
for (const row of walls.slice(0, 15)) console.log(`${String(row.count).padStart(4)}  ${row.phase}  ${row.wall}`);
