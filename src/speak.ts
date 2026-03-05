import "dotenv/config";
import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "Rachel";

export async function speak(text: string): Promise<void> {
  const audio = await client.textToSpeech.convert(voiceId, {
    text,
    modelId: "eleven_multilingual_v2",
  });

  await play(audio);
}

if (require.main === module) {
  speak("Hello! I'm Sunny, your learning companion.").catch(console.error);
}
