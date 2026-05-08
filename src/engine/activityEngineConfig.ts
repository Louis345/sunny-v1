import type { CapturedHomeworkContent } from "../scripts/contentAwareHomeworkPlanner";

export type ActivityEngineDomain =
  | "science"
  | "social_studies"
  | "reading"
  | "spelling"
  | "vocabulary"
  | "math"
  | "language_arts"
  | "generic"
  | "other";

export type ActivityEngineMode =
  | "diagnostic"
  | "teaching"
  | "guided-practice"
  | "independent-recall"
  | "fluency"
  | "transfer"
  | "reward";

export type ActivityEvidenceKind = "practice" | "mastery" | "companion" | "reward";

export type ActivityTargetType = "concept" | "vocabulary" | "word" | "question" | "process";

export type ActivityRoundMechanic =
  | "choose"
  | "sequence"
  | "sort"
  | "drag"
  | "match"
  | "label"
  | "predict"
  | "hidden-word-recall"
  | "story-reveal";

export type ActivityEngineTarget = {
  id: string;
  label: string;
  type: ActivityTargetType;
  definition?: string;
};

export type ActivityRoundOption = {
  id: string;
  label: string;
  correct: boolean;
  misconception?: string;
};

export type ActivityEngineRound = {
  id: string;
  mechanic: ActivityRoundMechanic;
  targetId: string;
  prompt: string;
  options?: ActivityRoundOption[];
  scaffoldLevel: number;
  preAnswerHint?: string;
};

export type ActivityEngineAppearance = {
  palette: {
    bg1: string;
    bg2: string;
    bg3: string;
    accent: string;
  };
  typography: {
    display: string;
    body: string;
  };
  visuals: {
    heroGlyph: string;
    particles: string[];
    companionGlyph: string;
  };
};

export type ActivityEngineConfig = {
  schemaVersion: 1;
  activityId: string;
  engine: {
    id: string;
    mode: ActivityEngineMode;
  };
  topic: string;
  domain: ActivityEngineDomain | string;
  learningGoal: string;
  gradeBand: "early_elementary";
  appearance?: ActivityEngineAppearance;
  targets: ActivityEngineTarget[];
  rounds: ActivityEngineRound[];
  evidencePolicy: {
    writesPracticeEvidence: boolean;
    writesMasteryEvidence: boolean;
    requiresPerTargetResult: boolean;
    allowedEvidence: ActivityEvidenceKind[];
  };
};

export type ActivityConfigFindingCode =
  | "config_not_object"
  | "missing_required_field"
  | "unsupported_schema_version"
  | "target_missing_id"
  | "target_duplicate_id"
  | "round_missing_target"
  | "round_target_not_declared"
  | "round_missing_prompt"
  | "choose_round_requires_options"
  | "choose_round_requires_one_correct_option"
  | "diagnostic_round_must_be_unscaffolded"
  | "diagnostic_requires_per_target_results"
  | "appearance_invalid_color"
  | "appearance_invalid_glyph"
  | "letter_rush_invalid_mode"
  | "letter_rush_requires_words"
  | "letter_rush_mastery_scaffolded"
  | "letter_rush_mode_not_mastery_eligible"
  | "letter_rush_background_not_local"
  | "letter_rush_sfx_not_local"
  | "completion_requires_target_results";

export type ActivityConfigFinding = {
  code: ActivityConfigFindingCode;
  path: string;
  message: string;
};

export type ActivityEngineConfigValidationResult = {
  ok: boolean;
  errors: ActivityConfigFinding[];
  normalized?: ActivityEngineConfig;
};

export type ActivityTargetResultEvent = {
  type: "activity_target_result";
  activityId: string;
  nodeId: string;
  target: string;
  correct: boolean;
  attemptedValue: string;
  responseTime_ms: number;
  scaffoldLevel: number;
  concept?: string;
  misconception?: string | null;
};

export type ActivityCompleteEvent = {
  type: "activity_complete";
  activityId: string;
  nodeId: string;
  completed: boolean;
  accuracy: number;
  targetResults: ActivityTargetResultEvent[];
};

export type ActivityEvidenceEvent = ActivityTargetResultEvent | ActivityCompleteEvent;

export type ActivityEvidenceValidationResult = {
  ok: boolean;
  errors: ActivityConfigFinding[];
};

export type LetterRushMode =
  | "type-and-spell"
  | "hear-and-spell"
  | "read-and-race"
  | "trap-the-imposter"
  | "mastery-run";

export type LetterRushWord = {
  id: string;
  text: string;
  definition?: string;
  sentence?: string;
  traps?: string[];
  imposterChunks?: string[];
  targetPatterns?: string[];
  trapGoal?: number;
};

export type LetterRushTrapConfig = {
  goal?: number;
  timerSeconds?: number;
  imposterSpawnRate?: number;
  maxVisibleChunks?: number;
  spawnInterval_ms?: number;
  fallDuration_ms?: number;
};

export type LetterRushBonusRoundConfig = LetterRushTrapConfig & {
  enabled?: boolean;
  unlockAccuracy?: number;
  unlockStreak?: number;
  speedMultiplier?: number;
  stake?: number;
  multiplier?: number;
  riskSource?: string;
};

export type LetterRushSfxMilestone = {
  minStreak: number;
  label?: string;
  effect?: string;
  src?: string;
};

export type LetterRushSfxEventName =
  | "start"
  | "prompt"
  | "correct"
  | "combo"
  | "heatingUp"
  | "wordClear"
  | "lifeLost"
  | "bonusStart"
  | "bonusWin";

export type LetterRushSfxEventConfig = {
  enabled?: boolean;
  effect?: string;
  src?: string;
  volume?: number;
};

export type LetterRushSfxConfig = {
  enabled?: boolean;
  arcadeCombos?: boolean;
  comboThreshold?: number;
  heatingUpEvery?: number;
  comboBreakerStreak?: number;
  comboBreakerEvery?: number;
  comboMilestoneEvery?: number;
  comboVolume?: number;
  comboBreakerSrc?: string;
  eventMap?: Partial<Record<LetterRushSfxEventName, LetterRushSfxEventConfig>>;
  comboMilestones?: LetterRushSfxMilestone[];
};

export type LetterRushConfig = {
  schemaVersion: 1;
  activityId: "letter-rush";
  mode: LetterRushMode;
  topic: string;
  domain: "spelling" | "vocabulary" | string;
  learningGoal: string;
  gradeBand: "early_elementary";
  appearance?: {
    palette?: ActivityEngineAppearance["palette"];
    backgroundImage?: string;
    fallbackBackground?: string;
  };
  scaffolds: {
    showWord: boolean;
    letterBank: boolean;
    allowRetryBeforeScore: boolean;
    companionHints: boolean;
  };
  words: LetterRushWord[];
  trap?: LetterRushTrapConfig;
  bonusRound?: LetterRushBonusRoundConfig;
  sfx?: LetterRushSfxConfig;
  evidencePolicy: {
    writesPracticeEvidence: boolean;
    writesMasteryEvidence: boolean;
    requiresPerTargetResult: boolean;
    allowedEvidence: ActivityEvidenceKind[];
  };
};

export type LetterRushConfigValidationResult = {
  ok: boolean;
  errors: ActivityConfigFinding[];
  normalized?: LetterRushConfig;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pushError(
  errors: ActivityConfigFinding[],
  code: ActivityConfigFindingCode,
  path: string,
  message: string,
): void {
  errors.push({ code, path, message });
}

function requiredString(
  input: Record<string, unknown>,
  key: string,
  errors: ActivityConfigFinding[],
): string {
  const value = text(input[key]);
  if (!value) {
    pushError(errors, "missing_required_field", key, `${key} is required.`);
  }
  return value;
}

function normalizeTargets(raw: unknown, errors: ActivityConfigFinding[]): ActivityEngineTarget[] {
  if (!Array.isArray(raw)) {
    pushError(errors, "missing_required_field", "targets", "targets must be an array.");
    return [];
  }
  const seen = new Set<string>();
  const out: ActivityEngineTarget[] = [];
  raw.forEach((item, index) => {
    if (!isRecord(item)) {
      pushError(errors, "target_missing_id", `targets[${index}]`, "target must be an object.");
      return;
    }
    const id = text(item.id);
    if (!id) {
      pushError(errors, "target_missing_id", `targets[${index}].id`, "target id is required.");
      return;
    }
    if (seen.has(id)) {
      pushError(errors, "target_duplicate_id", `targets[${index}].id`, `duplicate target id: ${id}`);
      return;
    }
    seen.add(id);
    out.push({
      id,
      label: text(item.label) || id,
      type: (text(item.type) || "concept") as ActivityTargetType,
      ...(text(item.definition) ? { definition: text(item.definition) } : {}),
    });
  });
  return out;
}

function normalizeOptions(raw: unknown, path: string): ActivityRoundOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index): ActivityRoundOption[] => {
    if (!isRecord(item)) return [];
    const id = text(item.id) || `option-${index + 1}`;
    const label = text(item.label);
    if (!label) return [];
    return [{
      id,
      label,
      correct: item.correct === true,
      ...(text(item.misconception) ? { misconception: text(item.misconception) } : {}),
    }];
  });
}

function isSafeHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function normalizePalette(
  raw: unknown,
  errors: ActivityConfigFinding[],
): ActivityEngineAppearance["palette"] | null {
  if (!isRecord(raw)) return null;
  const out = {
    bg1: text(raw.bg1),
    bg2: text(raw.bg2),
    bg3: text(raw.bg3),
    accent: text(raw.accent),
  };
  (Object.keys(out) as Array<keyof typeof out>).forEach((key) => {
    if (!out[key] || !isSafeHexColor(out[key])) {
      pushError(
        errors,
        "appearance_invalid_color",
        `appearance.palette.${key}`,
        `${key} must be a safe six-digit hex color.`,
      );
    }
  });
  return out;
}

function normalizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => text(item)).filter(Boolean).slice(0, 6);
}

function normalizeUnboundedStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => text(item)).filter(Boolean);
}

const KNOWN_VISUAL_TOKENS = new Set([
  "air",
  "building",
  "drop",
  "heart",
  "leaf",
  "letter",
  "letters",
  "mountain",
  "rock",
  "scale",
  "scroll",
  "spark",
  "star",
  "sun",
  "sunny",
  "tree",
  "water",
]);

function isVisualGlyph(value: string): boolean {
  if (!value) return false;
  if (KNOWN_VISUAL_TOKENS.has(value.toLowerCase())) return true;
  return /\p{Extended_Pictographic}/u.test(value);
}

function validateVisualGlyph(
  value: string,
  path: string,
  errors: ActivityConfigFinding[],
): void {
  if (isVisualGlyph(value)) return;
  pushError(
    errors,
    "appearance_invalid_glyph",
    path,
    `${path} must be a known visual token or emoji, not plain display text.`,
  );
}

function normalizeAppearance(raw: unknown, errors: ActivityConfigFinding[]): ActivityEngineAppearance | undefined {
  if (!isRecord(raw)) return undefined;
  const palette = normalizePalette(raw.palette, errors);
  const typographyRaw = isRecord(raw.typography) ? raw.typography : {};
  const visualsRaw = isRecord(raw.visuals) ? raw.visuals : {};
  const particles = normalizeStringList(visualsRaw.particles);
  if (!palette) return undefined;
  const heroGlyph = text(visualsRaw.heroGlyph) || "spark";
  const normalizedParticles = particles.length ? particles : ["spark"];
  const companionGlyph = text(visualsRaw.companionGlyph) || "sunny";
  validateVisualGlyph(heroGlyph, "appearance.visuals.heroGlyph", errors);
  normalizedParticles.forEach((particle, index) => {
    validateVisualGlyph(particle, `appearance.visuals.particles[${index}]`, errors);
  });
  validateVisualGlyph(companionGlyph, "appearance.visuals.companionGlyph", errors);
  return {
    palette,
    typography: {
      display: text(typographyRaw.display) || "serif",
      body: text(typographyRaw.body) || "rounded",
    },
    visuals: {
      heroGlyph,
      particles: normalizedParticles,
      companionGlyph,
    },
  };
}

function normalizeRounds(
  raw: unknown,
  targetIds: Set<string>,
  config: Pick<ActivityEngineConfig, "activityId" | "engine" | "evidencePolicy">,
  errors: ActivityConfigFinding[],
): ActivityEngineRound[] {
  if (!Array.isArray(raw)) {
    pushError(errors, "missing_required_field", "rounds", "rounds must be an array.");
    return [];
  }
  const out: ActivityEngineRound[] = [];
  raw.forEach((item, index) => {
    const path = `rounds[${index}]`;
    if (!isRecord(item)) {
      pushError(errors, "round_missing_prompt", path, "round must be an object.");
      return;
    }
    const targetId = text(item.targetId);
    if (!targetId) {
      pushError(errors, "round_missing_target", `${path}.targetId`, "round targetId is required.");
    } else if (!targetIds.has(targetId)) {
      pushError(errors, "round_target_not_declared", `${path}.targetId`, `round targetId is not declared: ${targetId}`);
    }
    const prompt = text(item.prompt);
    if (!prompt) {
      pushError(errors, "round_missing_prompt", `${path}.prompt`, "round prompt is required.");
    }
    const mechanic = (text(item.mechanic) || "choose") as ActivityRoundMechanic;
    const scaffoldLevel = Number(item.scaffoldLevel ?? 0);
    const options = normalizeOptions(item.options, `${path}.options`);

    if (mechanic === "choose") {
      if (!options.length) {
        pushError(errors, "choose_round_requires_options", `${path}.options`, "choose rounds require options.");
      }
      const correctCount = options.filter((option) => option.correct).length;
      if (correctCount !== 1) {
        pushError(
          errors,
          "choose_round_requires_one_correct_option",
          `${path}.options`,
          "choose rounds require exactly one correct option.",
        );
      }
    }

    if (
      config.activityId === "concept-check" &&
      config.engine.mode === "diagnostic" &&
      (scaffoldLevel !== 0 || text(item.preAnswerHint))
    ) {
      pushError(
        errors,
        "diagnostic_round_must_be_unscaffolded",
        `${path}.scaffoldLevel`,
        "diagnostic Concept Check rounds must not provide pre-answer scaffolding.",
      );
    }

    out.push({
      id: text(item.id) || `round-${index + 1}`,
      mechanic,
      targetId,
      prompt,
      ...(options.length ? { options } : {}),
      scaffoldLevel: Number.isFinite(scaffoldLevel) ? scaffoldLevel : 0,
      ...(text(item.preAnswerHint) ? { preAnswerHint: text(item.preAnswerHint) } : {}),
    });
  });
  return out;
}

export function validateActivityEngineConfig(input: unknown): ActivityEngineConfigValidationResult {
  const errors: ActivityConfigFinding[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{
        code: "config_not_object",
        path: "",
        message: "activity engine config must be an object.",
      }],
    };
  }

  if (input.schemaVersion !== 1) {
    pushError(errors, "unsupported_schema_version", "schemaVersion", "schemaVersion must be 1.");
  }

  const activityId = requiredString(input, "activityId", errors);
  const engineRaw = isRecord(input.engine) ? input.engine : {};
  if (!isRecord(input.engine)) {
    pushError(errors, "missing_required_field", "engine", "engine is required.");
  }
  const engine = {
    id: text(engineRaw.id) || activityId,
    mode: (text(engineRaw.mode) || "diagnostic") as ActivityEngineMode,
  };
  const evidencePolicyRaw = isRecord(input.evidencePolicy) ? input.evidencePolicy : {};
  if (!isRecord(input.evidencePolicy)) {
    pushError(errors, "missing_required_field", "evidencePolicy", "evidencePolicy is required.");
  }
  const evidencePolicy = {
    writesPracticeEvidence: evidencePolicyRaw.writesPracticeEvidence === true,
    writesMasteryEvidence: evidencePolicyRaw.writesMasteryEvidence === true,
    requiresPerTargetResult: evidencePolicyRaw.requiresPerTargetResult === true,
    allowedEvidence: Array.isArray(evidencePolicyRaw.allowedEvidence)
      ? evidencePolicyRaw.allowedEvidence.map(String) as ActivityEvidenceKind[]
      : [],
  };

  if (
    activityId === "concept-check" &&
    engine.mode === "diagnostic" &&
    evidencePolicy.requiresPerTargetResult !== true
  ) {
    pushError(
      errors,
      "diagnostic_requires_per_target_results",
      "evidencePolicy.requiresPerTargetResult",
      "diagnostic Concept Check requires per-target results.",
    );
  }

  const targets = normalizeTargets(input.targets, errors);
  const appearance = normalizeAppearance(input.appearance, errors);
  const rounds = normalizeRounds(
    input.rounds,
    new Set(targets.map((target) => target.id)),
    { activityId, engine, evidencePolicy },
    errors,
  );

  const normalized: ActivityEngineConfig = {
    schemaVersion: 1,
    activityId,
    engine,
    topic: requiredString(input, "topic", errors),
    domain: requiredString(input, "domain", errors) as ActivityEngineDomain,
    learningGoal: requiredString(input, "learningGoal", errors),
    gradeBand: "early_elementary",
    ...(appearance ? { appearance } : {}),
    targets,
    rounds,
    evidencePolicy,
  };

  return {
    ok: errors.length === 0,
    errors,
    ...(errors.length === 0 ? { normalized } : {}),
  };
}

const LETTER_RUSH_MODES = new Set<LetterRushMode>([
  "type-and-spell",
  "hear-and-spell",
  "read-and-race",
  "trap-the-imposter",
  "mastery-run",
]);

function isLetterRushMasteryEligibleMode(mode: LetterRushMode): boolean {
  return mode === "type-and-spell" || mode === "hear-and-spell" || mode === "mastery-run";
}

function isLocalBackgroundImage(value: string): boolean {
  if (!value) return true;
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("data:image/")
  );
}

function isLocalAudioAsset(value: string): boolean {
  if (!value) return true;
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("data:audio/")
  );
}

function normalizeLetterRushPalette(raw: unknown, errors: ActivityConfigFinding[]) {
  if (!isRecord(raw)) return undefined;
  return normalizePalette(raw, errors) ?? undefined;
}

function normalizeLetterRushWords(raw: unknown, errors: ActivityConfigFinding[]): LetterRushWord[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    pushError(errors, "letter_rush_requires_words", "words", "Letter Rush requires at least one word.");
    return [];
  }
  return raw.flatMap((item, index): LetterRushWord[] => {
    if (!isRecord(item)) return [];
    const textValue = text(item.text) || text(item.word);
    if (!textValue) {
      pushError(errors, "letter_rush_requires_words", `words[${index}].text`, "word text is required.");
      return [];
    }
    const id = text(item.id) || normalizeId(textValue);
    return [{
      id,
      text: textValue,
      ...(text(item.definition) ? { definition: text(item.definition) } : {}),
      ...(text(item.sentence) ? { sentence: text(item.sentence) } : {}),
      ...(normalizeUnboundedStringList(item.traps).length
        ? { traps: normalizeUnboundedStringList(item.traps) }
        : {}),
      ...(normalizeUnboundedStringList(item.imposterChunks).length
        ? { imposterChunks: normalizeUnboundedStringList(item.imposterChunks) }
        : {}),
      ...(normalizeUnboundedStringList(item.targetPatterns).length
        ? { targetPatterns: normalizeUnboundedStringList(item.targetPatterns) }
        : {}),
      ...(Number.isFinite(Number(item.trapGoal)) ? { trapGoal: Number(item.trapGoal) } : {}),
    }];
  });
}

function optionalNumber(raw: Record<string, unknown>, key: string): number | undefined {
  const value = Number(raw[key]);
  return Number.isFinite(value) ? value : undefined;
}

function normalizeLetterRushTrapConfig(raw: unknown): LetterRushTrapConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const normalized: LetterRushTrapConfig = {
    ...(optionalNumber(raw, "goal") !== undefined ? { goal: optionalNumber(raw, "goal") } : {}),
    ...(optionalNumber(raw, "timerSeconds") !== undefined ? { timerSeconds: optionalNumber(raw, "timerSeconds") } : {}),
    ...(optionalNumber(raw, "imposterSpawnRate") !== undefined ? { imposterSpawnRate: optionalNumber(raw, "imposterSpawnRate") } : {}),
    ...(optionalNumber(raw, "maxVisibleChunks") !== undefined ? { maxVisibleChunks: optionalNumber(raw, "maxVisibleChunks") } : {}),
    ...(optionalNumber(raw, "spawnInterval_ms") !== undefined ? { spawnInterval_ms: optionalNumber(raw, "spawnInterval_ms") } : {}),
    ...(optionalNumber(raw, "fallDuration_ms") !== undefined ? { fallDuration_ms: optionalNumber(raw, "fallDuration_ms") } : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeLetterRushBonusRoundConfig(raw: unknown): LetterRushBonusRoundConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const trapShape = normalizeLetterRushTrapConfig(raw) ?? {};
  const normalized: LetterRushBonusRoundConfig = {
    ...trapShape,
    ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
    ...(optionalNumber(raw, "unlockAccuracy") !== undefined ? { unlockAccuracy: optionalNumber(raw, "unlockAccuracy") } : {}),
    ...(optionalNumber(raw, "unlockStreak") !== undefined ? { unlockStreak: optionalNumber(raw, "unlockStreak") } : {}),
    ...(optionalNumber(raw, "speedMultiplier") !== undefined ? { speedMultiplier: optionalNumber(raw, "speedMultiplier") } : {}),
    ...(optionalNumber(raw, "stake") !== undefined ? { stake: optionalNumber(raw, "stake") } : {}),
    ...(optionalNumber(raw, "multiplier") !== undefined ? { multiplier: optionalNumber(raw, "multiplier") } : {}),
    ...(text(raw.riskSource) ? { riskSource: text(raw.riskSource) } : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

const LETTER_RUSH_SFX_EVENTS: LetterRushSfxEventName[] = [
  "start",
  "prompt",
  "correct",
  "combo",
  "heatingUp",
  "wordClear",
  "lifeLost",
  "bonusStart",
  "bonusWin",
];

function normalizeLetterRushSfxEventMap(
  raw: unknown,
  errors: ActivityConfigFinding[],
): Partial<Record<LetterRushSfxEventName, LetterRushSfxEventConfig>> | undefined {
  if (!isRecord(raw)) return undefined;
  const eventMap: Partial<Record<LetterRushSfxEventName, LetterRushSfxEventConfig>> = {};
  for (const eventName of LETTER_RUSH_SFX_EVENTS) {
    const event = raw[eventName];
    if (!isRecord(event)) continue;
    const src = text(event.src);
    if (src && !isLocalAudioAsset(src)) {
      pushError(
        errors,
        "letter_rush_sfx_not_local",
        `sfx.eventMap.${eventName}.src`,
        "Letter Rush event SFX must use local paths or data audio URLs.",
      );
    }
    eventMap[eventName] = {
      ...(typeof event.enabled === "boolean" ? { enabled: event.enabled } : {}),
      ...(text(event.effect) ? { effect: text(event.effect) } : {}),
      ...(src ? { src } : {}),
      ...(optionalNumber(event, "volume") !== undefined ? { volume: optionalNumber(event, "volume") } : {}),
    };
  }
  return Object.keys(eventMap).length ? eventMap : undefined;
}

function normalizeLetterRushSfxConfig(
  raw: unknown,
  errors: ActivityConfigFinding[],
): LetterRushSfxConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const comboBreakerSrc = text(raw.comboBreakerSrc);
  if (comboBreakerSrc && !isLocalAudioAsset(comboBreakerSrc)) {
    pushError(
      errors,
      "letter_rush_sfx_not_local",
      "sfx.comboBreakerSrc",
      "Letter Rush SFX must use local paths or data audio URLs.",
    );
  }
  const comboMilestones = Array.isArray(raw.comboMilestones)
    ? raw.comboMilestones.flatMap((item, index): LetterRushSfxMilestone[] => {
        if (!isRecord(item)) return [];
        const minStreak = Number(item.minStreak);
        if (!Number.isFinite(minStreak)) return [];
        const src = text(item.src);
        if (src && !isLocalAudioAsset(src)) {
          pushError(
            errors,
            "letter_rush_sfx_not_local",
            `sfx.comboMilestones[${index}].src`,
            "Letter Rush milestone SFX must use local paths or data audio URLs.",
          );
        }
        return [{
          minStreak,
          ...(text(item.label) ? { label: text(item.label) } : {}),
          ...(text(item.effect) ? { effect: text(item.effect) } : {}),
          ...(src ? { src } : {}),
        }];
      })
    : [];
  const eventMap = normalizeLetterRushSfxEventMap(raw.eventMap, errors);
  const normalized: LetterRushSfxConfig = {
    ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
    ...(typeof raw.arcadeCombos === "boolean" ? { arcadeCombos: raw.arcadeCombos } : {}),
    ...(optionalNumber(raw, "comboThreshold") !== undefined ? { comboThreshold: optionalNumber(raw, "comboThreshold") } : {}),
    ...(optionalNumber(raw, "heatingUpEvery") !== undefined ? { heatingUpEvery: optionalNumber(raw, "heatingUpEvery") } : {}),
    ...(optionalNumber(raw, "comboBreakerStreak") !== undefined ? { comboBreakerStreak: optionalNumber(raw, "comboBreakerStreak") } : {}),
    ...(optionalNumber(raw, "comboBreakerEvery") !== undefined ? { comboBreakerEvery: optionalNumber(raw, "comboBreakerEvery") } : {}),
    ...(optionalNumber(raw, "comboMilestoneEvery") !== undefined ? { comboMilestoneEvery: optionalNumber(raw, "comboMilestoneEvery") } : {}),
    ...(optionalNumber(raw, "comboVolume") !== undefined ? { comboVolume: optionalNumber(raw, "comboVolume") } : {}),
    ...(comboBreakerSrc ? { comboBreakerSrc } : {}),
    ...(eventMap ? { eventMap } : {}),
    ...(comboMilestones.length ? { comboMilestones } : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

export function validateLetterRushConfig(input: unknown): LetterRushConfigValidationResult {
  const errors: ActivityConfigFinding[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{
        code: "config_not_object",
        path: "",
        message: "letter rush config must be an object.",
      }],
    };
  }

  if (input.schemaVersion !== 1) {
    pushError(errors, "unsupported_schema_version", "schemaVersion", "schemaVersion must be 1.");
  }
  if (text(input.activityId) !== "letter-rush") {
    pushError(errors, "missing_required_field", "activityId", "activityId must be letter-rush.");
  }

  const mode = text(input.mode) as LetterRushMode;
  if (!LETTER_RUSH_MODES.has(mode)) {
    pushError(errors, "letter_rush_invalid_mode", "mode", "Letter Rush mode must be one of the supported modes.");
  }

  const scaffoldsRaw = isRecord(input.scaffolds) ? input.scaffolds : {};
  if (!isRecord(input.scaffolds)) {
    pushError(errors, "missing_required_field", "scaffolds", "scaffolds are required.");
  }
  const scaffolds = {
    showWord: scaffoldsRaw.showWord === true,
    letterBank: scaffoldsRaw.letterBank === true,
    allowRetryBeforeScore: scaffoldsRaw.allowRetryBeforeScore === true,
    companionHints: scaffoldsRaw.companionHints === true,
  };

  const evidencePolicyRaw = isRecord(input.evidencePolicy) ? input.evidencePolicy : {};
  if (!isRecord(input.evidencePolicy)) {
    pushError(errors, "missing_required_field", "evidencePolicy", "evidencePolicy is required.");
  }
  const evidencePolicy = {
    writesPracticeEvidence: evidencePolicyRaw.writesPracticeEvidence === true,
    writesMasteryEvidence: evidencePolicyRaw.writesMasteryEvidence === true,
    requiresPerTargetResult: evidencePolicyRaw.requiresPerTargetResult === true,
    allowedEvidence: Array.isArray(evidencePolicyRaw.allowedEvidence)
      ? evidencePolicyRaw.allowedEvidence.map(String) as ActivityEvidenceKind[]
      : [],
  };

  if (mode && !isLetterRushMasteryEligibleMode(mode) && evidencePolicy.writesMasteryEvidence) {
    pushError(
      errors,
      "letter_rush_mode_not_mastery_eligible",
      "evidencePolicy.writesMasteryEvidence",
      "Read & Race and Trap the Imposter are practice-only modes.",
    );
  }
  if (isLetterRushMasteryEligibleMode(mode) && evidencePolicy.requiresPerTargetResult !== true) {
    pushError(
      errors,
      "diagnostic_requires_per_target_results",
      "evidencePolicy.requiresPerTargetResult",
      "Letter Rush evaluator modes require per-word target results.",
    );
  }
  if (mode === "mastery-run") {
    (Object.keys(scaffolds) as Array<keyof typeof scaffolds>).forEach((key) => {
      if (!scaffolds[key]) return;
      pushError(
        errors,
        "letter_rush_mastery_scaffolded",
        `scaffolds.${key}`,
        "Mastery Run cannot show answers, hints, letter banks, or retry-before-score support.",
      );
    });
  }

  const appearanceRaw = isRecord(input.appearance) ? input.appearance : {};
  const backgroundImage = text(appearanceRaw.backgroundImage);
  if (backgroundImage && !isLocalBackgroundImage(backgroundImage)) {
    pushError(
      errors,
      "letter_rush_background_not_local",
      "appearance.backgroundImage",
      "Letter Rush background images must be local paths or data image URLs.",
    );
  }
  const palette = normalizeLetterRushPalette(appearanceRaw.palette, errors);
  const appearance = isRecord(input.appearance)
    ? {
        ...(palette ? { palette } : {}),
        ...(backgroundImage ? { backgroundImage } : {}),
        ...(text(appearanceRaw.fallbackBackground)
          ? { fallbackBackground: text(appearanceRaw.fallbackBackground) }
          : {}),
      }
    : undefined;
  const trap = normalizeLetterRushTrapConfig(input.trap);
  const bonusRound = normalizeLetterRushBonusRoundConfig(input.bonusRound);
  const sfx = normalizeLetterRushSfxConfig(input.sfx, errors);

  const normalized: LetterRushConfig = {
    schemaVersion: 1,
    activityId: "letter-rush",
    mode,
    topic: requiredString(input, "topic", errors),
    domain: requiredString(input, "domain", errors),
    learningGoal: requiredString(input, "learningGoal", errors),
    gradeBand: "early_elementary",
    ...(appearance ? { appearance } : {}),
    scaffolds,
    words: normalizeLetterRushWords(input.words, errors),
    ...(trap ? { trap } : {}),
    ...(bonusRound ? { bonusRound } : {}),
    ...(sfx ? { sfx } : {}),
    evidencePolicy,
  };

  return {
    ok: errors.length === 0,
    errors,
    ...(errors.length === 0 ? { normalized } : {}),
  };
}

function targetTypeForConcept(raw: string): ActivityTargetType {
  return raw.includes(" ") ? "process" : "concept";
}

function conceptDefinition(concept: string, topic: string): string {
  if (concept.toLowerCase() === topic.toLowerCase()) {
    return `A key idea in ${topic}.`;
  }
  return `A homework target connected to ${topic}.`;
}

function conceptsFromCaptured(captured: CapturedHomeworkContent): string[] {
  const profile = captured.contentProfile;
  const out = [
    ...profile.concepts,
    ...captured.words,
    profile.topic,
  ]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  return [...new Set(out)].slice(0, 8);
}

function appearanceForTopic(topic: string): ActivityEngineAppearance {
  const normalized = topic.toLowerCase();
  if (normalized.includes("blood") || normalized.includes("cell")) {
    return {
      palette: { bg1: "#ffb3b3", bg2: "#c81d3a", bg3: "#3a0a14", accent: "#fff1c2" },
      typography: { display: "serif", body: "rounded" },
      visuals: { heroGlyph: "heart", particles: ["drop", "heart", "drop"], companionGlyph: "sunny" },
    };
  }
  if (normalized.includes("tree") || normalized.includes("photo") || normalized.includes("oxygen")) {
    return {
      palette: { bg1: "#a8e6a3", bg2: "#3aa861", bg3: "#0e3a1f", accent: "#fff58a" },
      typography: { display: "serif", body: "rounded" },
      visuals: { heroGlyph: "tree", particles: ["sun", "leaf", "air"], companionGlyph: "sunny" },
    };
  }
  if (normalized.includes("constitution") || normalized.includes("government") || normalized.includes("branch")) {
    return {
      palette: { bg1: "#e3d6b5", bg2: "#a8845c", bg3: "#3a2812", accent: "#ffd66b" },
      typography: { display: "serif", body: "rounded" },
      visuals: { heroGlyph: "building", particles: ["scroll", "scale", "star"], companionGlyph: "sunny" },
    };
  }
  if (normalized.includes("spell") || normalized.includes("word")) {
    return {
      palette: { bg1: "#a7d8ff", bg2: "#3276c7", bg3: "#0d2547", accent: "#fff08a" },
      typography: { display: "rounded", body: "rounded" },
      visuals: { heroGlyph: "letters", particles: ["letter", "spark", "letter"], companionGlyph: "sunny" },
    };
  }
  return {
    palette: { bg1: "#f2aa55", bg2: "#df7841", bg3: "#51281f", accent: "#ffe17b" },
    typography: { display: "serif", body: "rounded" },
    visuals: { heroGlyph: "mountain", particles: ["water", "rock", "water"], companionGlyph: "sunny" },
  };
}

function questionText(question: unknown): string {
  if (isRecord(question)) {
    return text(question.question) || text(question.prompt);
  }
  return "";
}

function questionCorrectAnswer(question: unknown): string {
  if (isRecord(question)) {
    return text(question.correctAnswer) || text(question.answer);
  }
  return "";
}

function questionDistractors(question: unknown): string[] {
  if (!isRecord(question)) return [];
  const raw = Array.isArray(question.distractors)
    ? question.distractors
    : Array.isArray(question.options)
      ? question.options
      : [];
  return raw.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function firstQuestionRound(input: {
  question: unknown;
  targetId: string;
  fallbackTopic: string;
}): ActivityEngineRound | null {
  const prompt = questionText(input.question);
  const correctAnswer = questionCorrectAnswer(input.question);
  if (!prompt || !correctAnswer) return null;
  const distractors = questionDistractors(input.question)
    .filter((value) => value.toLowerCase() !== correctAnswer.toLowerCase())
    .slice(0, 3);
  const options = [
    {
      id: normalizeId(correctAnswer) || "correct",
      label: correctAnswer,
      correct: true,
    },
    ...distractors.map((distractor, index) => ({
      id: normalizeId(distractor) || `distractor-${index + 1}`,
      label: distractor,
      correct: false,
      misconception: `${normalizeId(input.targetId || input.fallbackTopic)}_misread_${index + 1}`,
    })),
  ];
  if (options.length < 2) {
    options.push({
      id: "not-enough-evidence",
      label: `Something unrelated to ${input.fallbackTopic}`,
      correct: false,
      misconception: `${normalizeId(input.targetId || input.fallbackTopic)}_unrelated_choice`,
    });
  }
  return {
    id: normalizeId(prompt).slice(0, 48) || "concept-check-question",
    mechanic: "choose",
    targetId: input.targetId,
    prompt,
    options,
    scaffoldLevel: 0,
  };
}

export function buildConceptCheckConfigFromCapturedHomework(input: {
  childId: string;
  homeworkId: string;
  nodeId: string;
  captured: CapturedHomeworkContent;
}): ActivityEngineConfig {
  const profile = input.captured.contentProfile;
  const topic = profile.topic || input.captured.title || "homework";
  const concepts = conceptsFromCaptured(input.captured);
  const targets = concepts.map((concept): ActivityEngineTarget => ({
    id: normalizeId(concept),
    label: concept,
    type: targetTypeForConcept(concept),
    definition: conceptDefinition(concept, topic),
  })).filter((target) => target.id);
  const primaryTarget = targets[0]?.id ?? (normalizeId(topic) || "homework");
  if (targets.length === 0) {
    targets.push({
      id: primaryTarget,
      label: topic,
      type: "concept",
      definition: `A key idea in ${topic}.`,
    });
  }

  const questionRounds = input.captured.questions
    .map((question) => firstQuestionRound({
      question,
      targetId: primaryTarget,
      fallbackTopic: topic,
    }))
    .filter((round): round is ActivityEngineRound => round != null);
  const rounds = questionRounds.length > 0
    ? questionRounds
    : [{
        id: `${primaryTarget}-baseline`,
        mechanic: "choose" as const,
        targetId: primaryTarget,
        prompt: `Which choice best matches ${topic}?`,
        options: [
          { id: primaryTarget, label: targets[0]?.definition ?? topic, correct: true },
          {
            id: "unrelated",
            label: `Something unrelated to ${topic}`,
            correct: false,
            misconception: `${primaryTarget}_unrelated_choice`,
          },
        ],
        scaffoldLevel: 0,
      }];

  return {
    schemaVersion: 1,
    activityId: "concept-check",
    engine: {
      id: "concept-check",
      mode: "diagnostic",
    },
    topic,
    domain: profile.contentDomain,
    learningGoal: `Check what the child already understands about ${topic}.`,
    gradeBand: "early_elementary",
    appearance: appearanceForTopic(topic),
    targets,
    rounds,
    evidencePolicy: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery"],
    },
  };
}

export function validateActivityEvidenceEvent(input: unknown): ActivityEvidenceValidationResult {
  const errors: ActivityConfigFinding[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{
        code: "config_not_object",
        path: "",
        message: "activity evidence event must be an object.",
      }],
    };
  }
  const typeValue = text(input.type);
  if (typeValue === "activity_target_result") {
    for (const key of ["activityId", "nodeId", "target", "attemptedValue"]) {
      if (!text(input[key])) {
        pushError(errors, "missing_required_field", key, `${key} is required.`);
      }
    }
    if (typeof input.correct !== "boolean") {
      pushError(errors, "missing_required_field", "correct", "correct must be boolean.");
    }
    if (!Number.isFinite(Number(input.responseTime_ms))) {
      pushError(errors, "missing_required_field", "responseTime_ms", "responseTime_ms is required.");
    }
    if (Number(input.scaffoldLevel) !== 0 && text(input.activityId) === "concept-check") {
      pushError(
        errors,
        "diagnostic_round_must_be_unscaffolded",
        "scaffoldLevel",
        "diagnostic Concept Check evidence must be scaffoldLevel 0.",
      );
    }
  } else if (typeValue === "activity_complete") {
    for (const key of ["activityId", "nodeId"]) {
      if (!text(input[key])) {
        pushError(errors, "missing_required_field", key, `${key} is required.`);
      }
    }
    if (input.completed !== true && input.completed !== false) {
      pushError(errors, "missing_required_field", "completed", "completed must be boolean.");
    }
    if (!Number.isFinite(Number(input.accuracy))) {
      pushError(errors, "missing_required_field", "accuracy", "accuracy is required.");
    }
    if (!Array.isArray(input.targetResults) || input.targetResults.length === 0) {
      pushError(
        errors,
        "completion_requires_target_results",
        "targetResults",
        "activity_complete requires targetResults.",
      );
    }
  } else {
    pushError(errors, "missing_required_field", "type", "unsupported activity evidence event type.");
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}
