import fs from "fs";
import path from "path";

export async function appendToContext(
  childName: "Ila" | "Reina",
  heading: string,
  content: string,
): Promise<void> {
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  const fileName = childName === "Ila" ? "ila_context.md" : "reina_context.md";
  const filePath = path.resolve(process.cwd(), "src", "context", fileName);
  const entry = `\n\n## ${heading} — ${timestamp}\n${content}`;
  await fs.promises.appendFile(filePath, entry, "utf-8");
  console.log(`  ✅ Appended to ${fileName}`);
}
