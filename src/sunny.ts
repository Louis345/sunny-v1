import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const DEFAULT_SYSTEM_PROMPT =
  "You are Sunny, a warm patient teacher. You speak in short, clear sentences. You encourage and celebrate effort. You never rush.";

let activeSystemPrompt = DEFAULT_SYSTEM_PROMPT;

export function setSystemPrompt(prompt: string): void {
  activeSystemPrompt = prompt;
}

export async function ask(userMessage: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: activeSystemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (block.type === "text") return block.text;
  throw new Error("Unexpected response type");
}
