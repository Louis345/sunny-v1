/**
 * Scout agent — reads a pre-processed metrics payload, calls Claude,
 * and returns a Markdown performance report.
 *
 * Called by src/scripts/metrics.ts after it assembles the payload.
 * Does NOT read files directly — that is metrics.ts's responsibility.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";

export interface ScoutPayload {
  sessions: SessionSummary[];
  git_log: GitEntry[];
  analysis_window: {
    from: string;
    to: string;
    session_count: number;
    commit_count: number;
  };
  previous_window?: WindowStats | null;
}

export interface SessionSummary {
  session_id: string;
  child: string;
  commit: string;
  date: string;
  duration_ms: number;
  turn_count: number;
  ttft_ms: number[];
  first_audio_ms: number[];
  turn_complete_ms: number[];
  tool_calls_per_turn: number[];
  barge_in_count: number;
  error_count: number;
  word_show_anomalies: number;
}

export interface GitEntry {
  hash: string;
  date: string;
  subject: string;
}

export interface WindowStats {
  mean_ttft_ms: number;
  mean_first_audio_ms: number;
  mean_turn_ms: number;
}

function loadSystemPrompt(): string {
  const rolePath = path.join(__dirname, "ROLE.md");
  try {
    return fs.readFileSync(rolePath, "utf8");
  } catch {
    return "You are Scout, a systems analyst for Project Sunny. Analyze the session metrics and produce a concise Markdown report.";
  }
}

export async function runScout(payload: ScoutPayload): Promise<string> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = loadSystemPrompt();

  const userMessage = `Analyze this session metrics payload and produce your report:

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\``;

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "(Scout returned no text)";
}
