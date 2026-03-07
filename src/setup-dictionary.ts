import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const ENV_PATH = path.resolve(__dirname, "..", ".env");

function saveEnvValue(key: string, value: string): void {
  let content = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf-8")
    : "";

  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }

  fs.writeFileSync(ENV_PATH, content, "utf-8");
}

async function main(): Promise<void> {
  const existing = process.env.ELEVENLABS_PRONUNCIATION_DICT_ID;
  if (existing) {
    console.log(`  Pronunciation dictionary already set: ${existing}`);
    console.log("  Delete ELEVENLABS_PRONUNCIATION_DICT_ID and ELEVENLABS_PRONUNCIATION_DICT_VERSION from .env to recreate.");
    return;
  }

  const client = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
  });

  console.log("  Creating pronunciation dictionary...");

  const response = await client.pronunciationDictionaries.createFromRules({
    name: "Sunny - Name Pronunciations",
    rules: [
      {
        type: "phoneme",
        stringToReplace: "Ila",
        phoneme: "AY1 L AH0",
        alphabet: "cmu-arpabet",
        caseSensitive: false,
        wordBoundaries: true,
      },
      {
        type: "phoneme",
        stringToReplace: "ILA",
        phoneme: "AY1 L AH0",
        alphabet: "cmu-arpabet",
        caseSensitive: true,
        wordBoundaries: true,
      },
    ],
  });

  const dictId = response.id;
  const versionId = response.versionId;

  saveEnvValue("ELEVENLABS_PRONUNCIATION_DICT_ID", dictId);
  saveEnvValue("ELEVENLABS_PRONUNCIATION_DICT_VERSION", versionId);

  console.log(`  Dictionary created: ${dictId}`);
  console.log(`  Version: ${versionId}`);
  console.log("  Saved to .env");
}

main().catch((err) => {
  console.error("  Failed:", err.message);
  process.exit(1);
});
