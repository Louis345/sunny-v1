export type MathArtworkNode = {
  id: string;
  type: string;
  title?: string;
  mechanic?: string;
  theme?: string;
  targets: string[];
  thumbnailUrl?: string;
  thumbnailPrompt?: string;
};

export type MathArtworkGenerator = (prompt: string) => Promise<string | null>;

export type MathArtworkDownload = (url: string) => Promise<{
  bytes: Uint8Array;
  contentType: string;
} | null>;

export function mathNodeArtworkPrompt(node: MathArtworkNode): string {
  const title = node.title?.trim() || "Math learning activity";
  const mechanic = node.mechanic?.trim() || "math practice";
  const theme = node.theme?.trim() || "a bright child-safe learning adventure";
  const target = node.targets.filter(Boolean).slice(0, 3).join(", ") || "multiplication facts";
  return [
    "A child-friendly educational game icon for Sunny, no text and no letters in the image.",
    `Activity: ${title}.`,
    `Mechanic: ${mechanic}.`,
    `Theme: ${theme}.`,
    `Academic target context: ${target}.`,
    "Make the interaction idea unmistakable at small card size, with a distinct visual identity, warm lighting, and high contrast.",
  ].join(" ");
}

/**
 * Enrich the persisted plan with artwork while keeping the image provider
 * optional. A missing provider result is intentional: the board's approved
 * local fallback remains available and the prompt stays attached for later
 * retry/audit rather than silently losing the visual requirement.
 */
export async function enrichMathNodeArtwork<T extends MathArtworkNode>(
  nodes: T[],
  generate: MathArtworkGenerator,
): Promise<T[]> {
  return Promise.all(nodes.map(async (node) => {
    const prompt = node.thumbnailPrompt?.trim() || mathNodeArtworkPrompt(node);
    const existingUrl = node.thumbnailUrl?.trim() ?? "";
    const existingIsGenerated = /^https?:\/\//i.test(existingUrl) || existingUrl.startsWith("/generated/");
    if (existingIsGenerated) {
      return { ...node, thumbnailPrompt: prompt };
    }
    const thumbnailUrl = await generate(prompt).catch(() => null);
    return thumbnailUrl?.trim()
      ? { ...node, thumbnailUrl, thumbnailPrompt: prompt }
      : { ...node, thumbnailPrompt: prompt, ...(existingUrl ? { thumbnailUrl: existingUrl } : {}) };
  }));
}

function safeAssetName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "node";
}

function artworkExtension(contentType: string): string {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  return "jpeg";
}

async function defaultDownload(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) return null;
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType };
}

/** Convert temporary provider URLs into stable assets served by Sunny. */
export async function localizeMathNodeArtwork<T extends MathArtworkNode>(
  nodes: T[],
  options: {
    rootDir?: string;
    childId: string;
    homeworkId: string;
    download?: MathArtworkDownload;
  },
): Promise<T[]> {
  const rootDir = options.rootDir ?? process.cwd();
  const childId = safeAssetName(options.childId);
  const homeworkId = safeAssetName(options.homeworkId);
  const download = options.download ?? defaultDownload;
  return Promise.all(nodes.map(async (node) => {
    const source = node.thumbnailUrl?.trim() ?? "";
    if (!/^https?:\/\//i.test(source)) return { ...node };
    const downloaded = await download(source).catch(() => null);
    if (!downloaded?.bytes.length) {
      const { thumbnailUrl: _discarded, ...withoutTemporaryUrl } = node;
      return withoutTemporaryUrl as T;
    }
    const extension = artworkExtension(downloaded.contentType);
    const filename = `${safeAssetName(node.id)}.${extension}`;
    const relative = path.posix.join("generated", childId, homeworkId, filename);
    const file = path.join(rootDir, "web", "public", ...relative.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, downloaded.bytes);
    return { ...node, thumbnailUrl: `/${relative}` };
  }));
}
import fs from "fs";
import path from "path";
