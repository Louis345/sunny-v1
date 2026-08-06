import fs from "fs";
import path from "path";
import { getChildChart } from "../profiles/childChart";
import { writeActiveSessionPlan } from "./sessionPlanFromChart";
import { generateStoryImage } from "../utils/generateStoryImage";
import type { AdventureBoardNode } from "../shared/adventureBoardJson";

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
    if (!res.ok) return false;
    const bytes = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, bytes);
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
}): Promise<{ generated: number; skipped: string | null }> {
  const rootDir = input.rootDir ?? process.cwd();
  const childId = input.childId.trim().toLowerCase();
  if (!process.env.GROK_API_KEY?.trim()) {
    return { generated: 0, skipped: "no_grok_api_key" };
  }
  const chart = getChildChart(childId, { rootDir });
  const plan = chart.activeSessionPlan;
  const board = plan?.adventureBoard;
  if (!plan || !board) return { generated: 0, skipped: "no_active_board" };

  const domain = plan.domain ?? "learning";
  const title = board.title ?? input.homeworkId;
  const publicDir = path.resolve(rootDir, "web", "public");
  const relDir = path.join("generated", "adventure-board", childId);

  let generated = 0;
  const nextNodes: AdventureBoardNode[] = [];
  for (const node of board.nodes) {
    if (!BOARD_IMAGE_KINDS.has(node.kind) || generated >= MAX_NODE_IMAGES_PER_INGEST) {
      nextNodes.push(node);
      continue;
    }
    const relPath = path.join(relDir, `${input.homeworkId}-${node.id}.jpeg`);
    const destPath = path.join(publicDir, relPath);
    const servedUrl = `/${relPath.split(path.sep).join("/")}`;
    if (fs.existsSync(destPath)) {
      nextNodes.push({ ...node, thumbnailUrl: servedUrl });
      continue;
    }
    const prompt = node.thumbnailPrompt ?? nodeImagePrompt(node, domain, title);
    const remoteUrl = await generateStoryImage(prompt, {
      useDirectScene: true,
      purpose: "board-node-thumbnail",
      cacheKeyParts: [childId, input.homeworkId, node.id],
    });
    if (remoteUrl && await downloadImage(remoteUrl, destPath)) {
      nextNodes.push({ ...node, thumbnailUrl: servedUrl });
      generated += 1;
      console.log(`  🎮 [board-image] [node] ${node.id} → ${servedUrl}`);
    } else {
      nextNodes.push(node);
    }
  }

  if (generated > 0 || nextNodes.some((node, index) => node !== board.nodes[index])) {
    writeActiveSessionPlan(childId, {
      ...plan,
      adventureBoard: { ...board, nodes: nextNodes },
    }, { rootDir });
  }
  return { generated, skipped: null };
}
