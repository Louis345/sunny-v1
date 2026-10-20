import fs from "node:fs";

type VoiceEvent = { sessionId?: string; component?: string; event?: string; action?: string };

/** Capture setup is not hearing proof. Inspect one real session in event order. */
export function verifyVoiceAcceptance(events: VoiceEvent[], heardResponse: boolean): { ok: boolean; missing: string[] } {
  const sessions = new Set(events.map(e => e.sessionId).filter(Boolean));
  if (sessions.size !== 1) return { ok: false, missing: ["exactly_one_session"] };
  const sessionId = [...sessions][0];
  const stages = [
    ["client_audio", "event", "input_detected"],
    ["client_audio", "event", "speech_recognized"],
    ["transcript", "action", "accepted"],
    ["client_audio", "event", "playback_started"],
  ] as const;
  let cursor = 0;
  const missing: string[] = [];
  for (const [component, key, value] of stages) {
    const index = events.findIndex((e, i) => i >= cursor && e.sessionId === sessionId && e.component === component && e[key] === value);
    if (index < 0) missing.push(value);
    else cursor = index + 1;
  }
  if (!heardResponse) missing.push("human_confirmed_audible_reply");
  return { ok: missing.length === 0, missing };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("Usage: npm run sunny:voice:accept -- /absolute/session/events.ndjson --heard-response");
    process.exitCode = 1;
  } else {
    try {
      const events = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as VoiceEvent);
      const result = verifyVoiceAcceptance(events, process.argv.includes("--heard-response"));
      console.log(JSON.stringify({ ...result, evidenceFile: file }));
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      console.error("Voice acceptance evidence could not be read:", error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
