import fs from "fs";
import path from "path";
import { getChildChart } from "../profiles/childChart";
import { writeActiveSessionPlan } from "./sessionPlanFromChart";
import { generateStoryImage } from "../utils/generateStoryImage";
import type { AdventureBoardNode } from "../shared/adventureBoardJson";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";

const BOARD_IMAGE_KINDS = new Set(["activity", "mystery", "quest", "boss"]);
const MAX_NODE_IMAGES_PER_INGEST = 8;

function nodeImagePrompt(node: AdventureBoardNode, domain: string, title: string): string {
  const base = `Adventure map location icon for a children's learning game about "${title}" (${domain}).`;
  if (node.kind === "quest") {
    return `${base} A glowing quest gate on a hilltop, epic but friendly, treasure and banners.`;
  }
  if (node.kind === "boss") {
    return `${base} A grand castle arena entrance for a final friendly boss challenge, dramatic golden light.`;
  }
  if (node.kind === "mystery") {
    return `${base} A mysterious glowing gift portal with question-mark sparkles, inviting and safe.`;
  }
  const skill = node.target?.skill ?? node.label;
  return `${base} A playful landmark representing "${node.label}" (${skill}) practice: oversized friendly props related to the concept, one clear focal object.`;
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`image_download_http_${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const temporary = `${destPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, destPath);
    return true;
  } catch (err) {
    console.log(
      `  🎮 [board-image] [download-failed] ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * Best-effort per-node board images (Grok): each academic/destination node
 * gets its own illustration, downloaded into web/public so the board serves
 * it locally. Failures never block ingest — nodes keep their fallback look.
 */
export async function generateBoardNodeImages(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  /** Explicit assignment presentation: caller owns canonical publication. */
  plan?: ActiveSessionPlan;
  generateMissing?: boolean;
  onPlanUpdated?: (plan: ActiveSessionPlan) => void;
}): Promise<{ generated: number; reused: number; skipped: string | null; plan?: ActiveSessionPlan }> {
  const rootDir = input.rootDir ?? process.cwd();
  const childId = input.childId.trim().toLowerCase();
  const plan = input.plan ?? getChildChart(childId, { rootDir }).activeSessionPlan;
  if (plan && (plan.childId !== childId || (plan.activeHomeworkId && plan.activeHomeworkId !== input.homeworkId))) throw new Error("board_artwork_assignment_mismatch");
  const board = plan?.adventureBoard;
  if (!plan || !board) return { generated: 0, reused: 0, skipped: "no_active_board" };
  const skipped = input.generateMissing === false ? "reuse_only" : !process.env.GROK_API_KEY?.trim() ? "no_grok_api_key" : null;

  const domain = plan.domain ?? "learning";
  const title = board.title ?? input.homeworkId;
  const publicDir = path.resolve(rootDir, "web", "public");
  const relDir = path.join("generated", "adventure-board", childId);

  let generated = 0, reused = 0, attempted = 0;
  const nextNodes = [...board.nodes];
  const updatedPlan = (): ActiveSessionPlan => ({ ...plan, adventureBoard: { ...board, nodes: [...nextNodes] } });
  for (const [index, node] of board.nodes.entries()) {
    if (!BOARD_IMAGE_KINDS.has(node.kind)) continue;
    if (node.thumbnailUrl?.startsWith("/thumbnails/")) {
      reused++;
      continue;
    }
    const relPath = path.join(relDir, `${input.homeworkId}-${node.id}.jpeg`);
    const destPath = path.join(publicDir, relPath);
    const servedUrl = `/${relPath.split(path.sep).join("/")}`;
    if (fs.existsSync(destPath)) {
      nextNodes[index] = { ...node, thumbnailUrl: servedUrl };
      reused++;
      continue;
    }
    if (skipped || attempted >= MAX_NODE_IMAGES_PER_INGEST) continue;
    attempted++;
    try {
      const prompt = node.thumbnailPrompt ?? nodeImagePrompt(node, domain, title);
      const remoteUrl = await generateStoryImage(prompt, {
        useDirectScene: true,
        purpose: "board-node-thumbnail",
        cacheKeyParts: [childId, input.homeworkId, node.id],
      });
      if (remoteUrl && await downloadImage(remoteUrl, destPath)) {
        nextNodes[index] = { ...node, thumbnailUrl: servedUrl };
        generated++;
        console.log(`  🎮 [board-image] [node] [saved] ${node.id} → ${servedUrl}`);
      } else console.warn(` 🎮 [board-image] [node] [unavailable] node=${node.id} existing-presentation=preserved`);
    } catch (error) {
      console.warn(` 🎮 [board-image] [node] [failed] node=${node.id} ${error instanceof Error ? error.message : String(error)}`);
    }
    // Publication failures must propagate; they are not image-provider failures.
    if (nextNodes[index] !== node) input.onPlanUpdated?.(updatedPlan());
  }

  if (!input.plan && nextNodes.some((node, index) => node !== board.nodes[index])) {
    writeActiveSessionPlan(childId, updatedPlan(), { rootDir });
  }
  console.log(` 🎮 [board-image] [stage] [complete] homework=${input.homeworkId} generated=${generated} reused=${reused} attempted=${attempted} skipped=${skipped ?? "none"}`);
  return { generated, reused, skipped, plan: updatedPlan() };
}
