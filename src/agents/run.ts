import Anthropic from "@anthropic-ai/sdk";
import type { Profile } from "../profiles";

const client = new Anthropic();

export interface RunAgentOptions {
  history: Anthropic.MessageParam[];
  userMessage: string;
  profile: Profile;
  onToken: (token: string) => void;
  signal?: AbortSignal;
}

export async function runAgent(opts: RunAgentOptions): Promise<string> {
  const { history, userMessage, profile, onToken, signal } = opts;

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  const stream = client.messages.stream(
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: profile.systemPrompt,
      messages,
    },
    signal ? { signal } : undefined
  );

  let fullText = "";

  stream.on("text", (text) => {
    fullText += text;
    onToken(text);
  });

  await stream.finalMessage();
  return fullText;
}
