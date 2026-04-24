import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), "children.config.json");

function getTtsName(childName: string): string {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    return config.childProfiles?.[childName.toLowerCase()]?.ttsName
      ?? childName;
  } catch {
    return childName;
  }
}

export function buildNamePrefix(childName: string): string {
  const ttsName = getTtsName(childName);
  const hasTts = ttsName !== childName;
  return [
    `YOU ARE TALKING TO ${childName.toUpperCase()}.`,
    `Their name is ${childName}.`,
    hasTts
      ? `IMPORTANT: The name is spelled '${childName}' but ` +
        `pronounced '${ttsName}'. In every response you write, ` +
        `always write '${ttsName}' — never write '${childName}' ` +
        `— so text-to-speech reads it correctly.`
      : "",
    "You already know their name.",
    "NEVER ask them their name.",
    "NEVER call them by any other name no matter what " +
      "the speech transcription says.",
    "",
  ].filter(Boolean).join("\n");
}
