import { config } from "dotenv";
config({ path: "/Users/jamaltaylor/Development/sunny/.env" });
import fs from "fs";
import path from "path";
import { drawJourney } from "../src/engine/directMathExperience";
import { renderBoardPreview } from "../src/engine/adventureBoardCanvas";
import { assembleAdventureBoardDefinition, journeyFromBoardDefinition } from "../src/shared/adventureBoardDefinition";
const draft = "src/context/demo-pashley/homework/direct-drafts/hw-spelling-110db7b7";
const out = path.resolve(".scratch/artist-compare");
(async () => {
  // The published Teaching plan carries the journey the Sonnet artist drew.
  const store = JSON.parse(fs.readFileSync("src/context/demo-pashley/plans/active_session_plan.json", "utf8"));
  const find = (node: any): any => !node || typeof node !== "object" ? undefined : node.boardDefinition?.pattern === "winding river with a diamond fork" ? node.boardDefinition : Object.values(node).map(find).find(Boolean);
  const sonnetBoard = find(store);
  const journey = journeyFromBoardDefinition(sonnetBoard);
  fs.mkdirSync(out, { recursive: true });
  await renderBoardPreview({ definition: sonnetBoard, directory: path.join(out, "sonnet"), rootDir: process.cwd() });
  const started = Date.now();
  const fable = await drawJourney({ journey, label: "compare-fable", stagePrefix: "compare-fable-design", identity: { compare: "fable", journey }, model: "claude-fable-5",
    checkpointFile: path.join(out, "fable-design.json"), rawResponseDir: path.join(out, "fable-diagnostics") });
  const fableBoard = assembleAdventureBoardDefinition(journey, fable.composition, fable.pattern);
  const preview = await renderBoardPreview({ definition: fableBoard, directory: path.join(out, "fable"), rootDir: process.cwd() });
  console.log("FABLE_DONE", Date.now() - started, "ms pattern=", fable.pattern, "overlaps=", JSON.stringify(preview.overlaps));
  for (let turn = 1; turn <= 3; turn++) { const f = path.join(out, "fable-diagnostics", `design-response-${turn}.json`); if (fs.existsSync(f)) console.log("USAGE", turn, JSON.stringify(JSON.parse(fs.readFileSync(f, "utf8")).usage)); }
})().catch(error => { console.log("COMPARE_FAILED", error instanceof Error ? error.stack : String(error)); });
