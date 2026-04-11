import fs from "fs";
import path from "path";
import type { NodeRating } from "../shared/adventureTypes";

function ratingsDir(childId: string): string {
  return path.resolve(
    process.cwd(),
    "src",
    "context",
    childId.toLowerCase().trim(),
    "ratings",
  );
}

function sessionDateToFileDate(sessionDate: string): string {
  const d = sessionDate.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  try {
    return new Date(sessionDate).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Append one rating line (NDJSON per day), same pattern as attempts. */
export async function appendNodeRating(rating: NodeRating): Promise<void> {
  const dir = ratingsDir(rating.childId);
  await fs.promises.mkdir(dir, { recursive: true });
  const fileDate = sessionDateToFileDate(rating.sessionDate);
  const filePath = path.join(dir, `${fileDate}.ndjson`);
  const line = JSON.stringify(rating) + "\n";
  await fs.promises.appendFile(filePath, line, "utf-8");
}

function readAllRatingsChronological(childId: string): NodeRating[] {
  const dir = ratingsDir(childId);
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ndjson"))
    .sort();
  const out: NodeRating[] = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), "utf-8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as NodeRating);
      } catch {
        // skip malformed
      }
    }
  }
  return out;
}

export async function getNodeRatings(
  childId: string,
  limit?: number,
): Promise<NodeRating[]> {
  const all = readAllRatingsChronological(childId);
  if (limit !== undefined && limit > 0 && all.length > limit) {
    return all.slice(-limit);
  }
  return all;
}

export async function getNodeRatingsByType(
  childId: string,
  nodeType: NodeRating["nodeType"],
): Promise<NodeRating[]> {
  const all = await getNodeRatings(childId);
  return all.filter((r) => r.nodeType === nodeType);
}
