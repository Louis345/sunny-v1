export type ShowroomVoiceOption = {
  id: string;
  label: string;
  language: string;
  default?: boolean;
};

export function resolveAllowedShowroomVoiceId(
  requestedVoiceId: unknown,
  voices: readonly ShowroomVoiceOption[],
  fallbackVoiceId: string | undefined,
): string {
  const fallback =
    voices.find((voice) => voice.default)?.id ??
    voices[0]?.id ??
    fallbackVoiceId?.trim();

  const requested =
    typeof requestedVoiceId === "string" && requestedVoiceId.trim()
      ? requestedVoiceId.trim()
      : undefined;

  if (!requested) {
    if (!fallback) throw new Error("voice_unavailable");
    return fallback;
  }

  if (voices.some((voice) => voice.id === requested)) {
    return requested;
  }

  throw new Error("voice_not_allowed");
}
