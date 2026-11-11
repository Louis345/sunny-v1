/**
 * Experiment (owner, 2026-11-10): one retro platformer per child, built by the SAME Experience Creator path
 * (generateCanonicalProgressionArtifact) from the Planner's latest real node for her, with one owner style line added.
 * Runs only on a sandbox copy of her chart; nothing on Saori is written.
 *
 *   SUNNY_CHART_DIR=<sandbox>/chart npx tsx runPlatformer.ts <sandboxRoot> <child> <homeworkId> <sourceNodeId>
 */
import fs from "node:fs";
import path from "node:path";

const WT = "/Users/jamaltaylor/Development/sunny-retro-platformer";
const [root, childId, homeworkId, sourceNodeId] = process.argv.slice(2);

const STYLE = `

Owner experiment direction (2026-11-10): present this activity as a retro 8-bit side-scrolling platformer level. She runs and jumps through a short world of about three quick stages; each item lives in the level (a block she bumps, a gate, a gap to bridge). A correct answer clears the way with a satisfying pixel effect; a miss shows the correct answer and that item returns later in the level. The world ends with a small boss whose hits are the last items. Draw the pixel art in code (canvas or CSS), chiptune-style effects through Web Audio are welcome. Controls: arrow keys and space, plus large on-screen touch buttons for a touchscreen. The platformer is only the wrapper: keep exactly how the Planner said answers are produced (typed recall stays typed recall), and keep every academic target, evidence limit, unseen-item requirement and runtime contract above unchanged.`;

async function main(): Promise<void> {
  const { generateCanonicalProgressionArtifact } = await import(`${WT}/src/engine/canonicalProgressionGenerator`);
  const file = path.join(root, "src/context", childId, "homework/cycles", `${homeworkId}.json`);
  const cycle = JSON.parse(fs.readFileSync(file, "utf8"));
  const source = cycle.nodes.find((n: { nodeId: string }) => n.nodeId === sourceNodeId);
  if (!source?.generationPrompt) throw new Error(`no_source_node:${sourceNodeId}`);
  const nodeId = `${sourceNodeId}:retro-platformer`;
  cycle.nodes = cycle.nodes.filter((n: { nodeId: string }) => n.nodeId !== nodeId);
  const { artifactBinding: _drop, ...rest } = source;
  cycle.nodes.push({
    ...rest,
    nodeId,
    experimentId: `${source.experimentId ?? "exp"}-retro-platformer`,
    title: `${source.title} Platformer`,
    state: "generating",
    generationPrompt: { ...source.generationPrompt, promptId: `${source.generationPrompt.promptId}:retro-platformer`, text: source.generationPrompt.text + STYLE },
  });
  fs.writeFileSync(file, JSON.stringify(cycle, null, 2));
  console.log(` 🎮 [platformer-lab] [node-added] child=${childId} node=${nodeId} source="${source.title}"`);
  const started = Date.now();
  const result = await generateCanonicalProgressionArtifact({ childId, homeworkId, nodeId }, { rootDir: root });
  const node = result.nodes.find((n: { nodeId: string }) => n.nodeId === nodeId);
  console.log(` 🎮 [platformer-lab] [done] child=${childId} state=${node?.state} path=${node?.artifactBinding?.localArtifactPath ?? "none"} seconds=${Math.round((Date.now() - started) / 1000)}`);
}

main().catch((error: unknown) => {
  console.error(` 🎮 [platformer-lab] [failed] ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
