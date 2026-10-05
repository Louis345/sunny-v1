type AudioEnvironment = Record<string, string | undefined>;

const NON_LIVE_CREDENTIAL = /^(?:dummy|fake|mock|placeholder|redacted|test)(?:[-_]|$)/i;
const RUNTIME_HOOK = /(?:^|\s)--(?:require|loader)(?:=|\s)/i;

function requireLiveCredential(
  value: string | undefined,
  missingCode: string,
  nonLiveCode: string,
): void {
  const credential = value?.trim() ?? "";
  if (!credential) throw new Error(missingCode);
  if (NON_LIVE_CREDENTIAL.test(credential)) throw new Error(nonLiveCode);
}

/**
 * A family member testing voice is not a simulation. Refuse startup instead of
 * presenting a kiosk whose microphone, recognition, or companion voice has
 * been replaced by a lab double.
 */
export function assertHumanAcceptanceAudioEnvironment(env: AudioEnvironment): void {
  if (env.SUNNY_HUMAN_ACCEPTANCE !== "true") return;

  if (env.TTS_ENABLED !== "true") throw new Error("human_acceptance_tts_disabled");
  requireLiveCredential(
    env.DEEPGRAM_API_KEY,
    "human_acceptance_stt_credentials_missing",
    "human_acceptance_stt_credentials_not_live",
  );
  requireLiveCredential(
    env.ELEVENLABS_API_KEY,
    "human_acceptance_tts_credentials_missing",
    "human_acceptance_tts_credentials_not_live",
  );
  requireLiveCredential(
    env.ANTHROPIC_API_KEY,
    "human_acceptance_companion_credentials_missing",
    "human_acceptance_companion_credentials_not_live",
  );
  if (RUNTIME_HOOK.test(env.NODE_OPTIONS ?? "")) {
    throw new Error("human_acceptance_runtime_hook_forbidden");
  }
}
