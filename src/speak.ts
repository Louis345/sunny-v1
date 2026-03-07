import "dotenv/config";
import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

let activeVoiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

export function setVoiceId(voiceId: string): void {
  activeVoiceId = voiceId;
}

function getPronunciationLocators() {
  const dictId = process.env.ELEVENLABS_PRONUNCIATION_DICT_ID;
  const versionId = process.env.ELEVENLABS_PRONUNCIATION_DICT_VERSION;
  if (!dictId || !versionId) return undefined;
  return [{ pronunciationDictionaryId: dictId, versionId }];
}

export async function speak(text: string): Promise<void> {
  const locators = getPronunciationLocators();
  const audio = await client.textToSpeech.convert(activeVoiceId, {
    text,
    modelId: "eleven_multilingual_v2",
    ...(locators && { pronunciationDictionaryLocators: locators }),
  });

  await play(audio);
}

if (require.main === module) {
  speak("Hello! I'm Sunny, your learning companion.").catch(console.error);
}
