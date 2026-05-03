export type RuntimeEnv = Partial<Record<string, string | undefined>>;

export type SunnySubject =
  | "review"
  | "homework"
  | "reading"
  | "pronunciation"
  | "math"
  | "clocks"
  | "onboarding"
  | "diag";

export type SunnySessionMode = "real" | "diag" | "as-child" | "intro";
export type SunnyPreviewMode = "off" | "free" | "go-live";
export type SunnyNodeAccess = "normal" | "inspect-all";
export type SunnyVoiceMode = "normal" | "muted" | "off";
export type SunnyPersistenceMode = "live" | "blocked";

export interface SunnyRuntimeConfig {
  subject: SunnySubject;
  sessionMode: SunnySessionMode;
  previewMode: SunnyPreviewMode;
  nodeAccess: SunnyNodeAccess;
  voiceMode: SunnyVoiceMode;
  persistenceMode: SunnyPersistenceMode;
  childId: string | null;
}

export type SunnyRuntimeOverrides = Partial<
  Pick<
    SunnyRuntimeConfig,
    "subject" | "sessionMode" | "previewMode" | "nodeAccess" | "voiceMode" | "childId"
  >
>;

function normalizeChildId(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  return value ? value : null;
}

function normalizeSubject(raw: string | undefined): SunnySubject | null {
  const value = raw?.trim().toLowerCase();
  if (
    value === "review" ||
    value === "homework" ||
    value === "reading" ||
    value === "pronunciation" ||
    value === "math" ||
    value === "clocks" ||
    value === "onboarding" ||
    value === "diag"
  ) {
    return value;
  }
  return null;
}

function normalizeSessionMode(raw: string | undefined): SunnySessionMode | null {
  const value = raw?.trim().toLowerCase();
  if (value === "real" || value === "diag" || value === "as-child" || value === "intro") {
    return value;
  }
  return null;
}

function normalizePreviewMode(raw: string | undefined): SunnyPreviewMode | null {
  const value = raw?.trim().toLowerCase();
  if (value === "off" || value === "free" || value === "go-live") return value;
  if (value === "true") return "free";
  return null;
}

function normalizeNodeAccess(raw: string | undefined): SunnyNodeAccess | null {
  const value = raw?.trim().toLowerCase();
  if (value === "normal" || value === "inspect-all") return value;
  return null;
}

function normalizeVoiceMode(raw: string | undefined): SunnyVoiceMode | null {
  const value = raw?.trim().toLowerCase();
  if (value === "normal" || value === "muted" || value === "off") return value;
  return null;
}

function derivePersistenceMode(
  previewMode: SunnyPreviewMode,
  sessionMode: SunnySessionMode,
): SunnyPersistenceMode {
  if (previewMode !== "off") return "blocked";
  if (sessionMode !== "real") return "blocked";
  return "live";
}

function parseRuntimeJson(env: RuntimeEnv): SunnyRuntimeOverrides {
  const raw = env.SUNNY_RUNTIME_CONFIG ?? env.VITE_SUNNY_RUNTIME_CONFIG;
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      subject:
        typeof parsed.subject === "string"
          ? normalizeSubject(parsed.subject) ?? undefined
          : undefined,
      sessionMode:
        typeof parsed.sessionMode === "string"
          ? normalizeSessionMode(parsed.sessionMode) ?? undefined
          : undefined,
      previewMode:
        typeof parsed.previewMode === "string"
          ? normalizePreviewMode(parsed.previewMode) ?? undefined
          : undefined,
      nodeAccess:
        typeof parsed.nodeAccess === "string"
          ? normalizeNodeAccess(parsed.nodeAccess) ?? undefined
          : undefined,
      voiceMode:
        typeof parsed.voiceMode === "string"
          ? normalizeVoiceMode(parsed.voiceMode) ?? undefined
          : undefined,
      childId:
        typeof parsed.childId === "string" || parsed.childId === null
          ? normalizeChildId(parsed.childId as string | null)
          : undefined,
    };
  } catch {
    return {};
  }
}

export function applySunnyRuntimeOverrides(
  base: SunnyRuntimeConfig,
  overrides: SunnyRuntimeOverrides,
): SunnyRuntimeConfig {
  const next: SunnyRuntimeConfig = {
    subject: overrides.subject ?? base.subject,
    sessionMode: overrides.sessionMode ?? base.sessionMode,
    previewMode: overrides.previewMode ?? base.previewMode,
    nodeAccess: overrides.nodeAccess ?? base.nodeAccess,
    voiceMode: overrides.voiceMode ?? base.voiceMode,
    childId:
      overrides.childId === undefined
        ? base.childId
        : normalizeChildId(overrides.childId),
    persistenceMode: base.persistenceMode,
  };
  next.persistenceMode = derivePersistenceMode(next.previewMode, next.sessionMode);
  return next;
}

export function resolveSunnyRuntimeConfig(
  env: RuntimeEnv = {},
  overrides: SunnyRuntimeOverrides = {},
): SunnyRuntimeConfig {
  const parsed = parseRuntimeJson(env);
  const sessionMode =
    overrides.sessionMode ??
    parsed.sessionMode ??
    normalizeSessionMode(env.SUNNY_MODE) ??
    "real";
  const previewMode =
    overrides.previewMode ??
    parsed.previewMode ??
    normalizePreviewMode(env.SUNNY_PREVIEW_MODE) ??
    normalizePreviewMode(env.VITE_PREVIEW_MODE) ??
    "off";
  const nodeAccess =
    overrides.nodeAccess ??
    parsed.nodeAccess ??
    normalizeNodeAccess(env.SUNNY_NODE_ACCESS) ??
    (env.DIAG_UNLOCK_MAP === "true" || env.VITE_DIAG_UNLOCK_MAP === "true"
      ? "inspect-all"
      : "normal");
  const voiceMode =
    overrides.voiceMode ??
    parsed.voiceMode ??
    normalizeVoiceMode(env.SUNNY_VOICE_MODE) ??
    (env.TTS_ENABLED === "false" ? "muted" : "normal");
  const subject =
    overrides.subject ??
    parsed.subject ??
    normalizeSubject(env.SUNNY_SUBJECT) ??
    (sessionMode === "diag" ? "diag" : "review");
  const childId =
    overrides.childId ??
    parsed.childId ??
    normalizeChildId(env.SUNNY_CHILD) ??
    normalizeChildId(env.VITE_DIAG_CHILD_ID);

  const base: SunnyRuntimeConfig = {
    subject,
    sessionMode,
    previewMode,
    nodeAccess,
    voiceMode,
    persistenceMode: derivePersistenceMode(previewMode, sessionMode),
    childId: normalizeChildId(childId),
  };
  return applySunnyRuntimeOverrides(base, overrides);
}

export function encodeSunnyRuntimeConfig(config: SunnyRuntimeConfig): string {
  return JSON.stringify(config);
}
