import fs from "fs";
import path from "path";

export type FullExperienceBaselineNode = {
  id: string;
  gameHtmlPath?: string | null;
  activityConfigPath?: string | null;
  title?: string;
  contentId?: string;
  mechanic?: string;
  engagementVariable?: string;
  targets?: string[];
  difficulty?: number;
  validationProof?: {
    engine: "playwright";
    passed: boolean;
    worldStateChanged: boolean;
    screenshotPaths: string[];
  };
};

export type FullExperienceBoardNode = {
  id: string;
  kind?: string;
  thumbnailUrl?: string;
};

export type FullExperienceReadiness = {
  failures: string[];
  launchableActivities: number;
  uniqueArtifacts: number;
};

function publicAssetExists(publicRoot: string, url: string): boolean {
  if (!url.trim()) return false;
  if (/^https?:\/\//i.test(url)) return true;
  const assetPath = path.join(publicRoot, url.replace(/^\//, ""));
  if (!fs.existsSync(assetPath)) return false;
  if (path.extname(assetPath).toLowerCase() !== ".svg") return true;
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(assetPath));
    return /^\s*<svg\b(?:[^>]*\/\s*>|[\s\S]*<\/svg>)\s*$/i.test(source)
      && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(source);
  } catch {
    return false;
  }
}

function artifactFailures(node: FullExperienceBaselineNode): string[] {
  const failures: string[] = [];
  if (!node.title?.trim()) failures.push(`${node.id}:missing_child_title`);
  if (!node.contentId?.trim()) failures.push(`${node.id}:missing_content_id`);
  if (!node.gameHtmlPath || !fs.existsSync(node.gameHtmlPath)) {
    failures.push(`${node.id}:missing_attached_artifact`);
    return failures;
  }
  if (!node.activityConfigPath) failures.push(`${node.id}:missing_activity_config`);
  if (
    node.validationProof?.engine !== "playwright" ||
    node.validationProof.passed !== true ||
    node.validationProof.worldStateChanged !== true ||
    node.validationProof.screenshotPaths.length < 3
  ) {
    failures.push(`${node.id}:missing_validated_world_state_reaction`);
  }
  const html = fs.readFileSync(node.gameHtmlPath, "utf8");
  if (node.title && !html.toLocaleLowerCase().includes(node.title.trim().toLocaleLowerCase())) {
    failures.push(`${node.id}:artifact_title_mismatch`);
  }
  const contracts: Array<[string, RegExp]> = [
    ["sfx", /AudioContext|webkitAudioContext/i],
    ["sound_control", /id\s*=\s*["'](?:mute|mute-toggle|sound-toggle)["']|(?:sound|mute).*onclick/i],
    ["attempt_evidence", /fireAttemptEvent/i],
    ["companion_evidence", /fireCompanionEvent/i],
    ["completion_evidence", /sendNodeComplete/i],
  ];
  for (const [name, pattern] of contracts) {
    if (!pattern.test(html)) failures.push(`${node.id}:missing_${name}`);
  }
  return failures;
}

export function validateFullExperienceReadiness(input: {
  baselineNodes: FullExperienceBaselineNode[];
  boardNodes: FullExperienceBoardNode[];
  publicRoot: string;
}): FullExperienceReadiness {
  const failures = input.baselineNodes.flatMap(artifactFailures);
  if (input.baselineNodes.length !== 2) {
    failures.push("baseline_experiment_requires_exactly_two_arms");
  }
  const contentIds = input.baselineNodes.map((node) => node.contentId).filter(Boolean) as string[];
  if (new Set(contentIds).size !== contentIds.length) failures.push("duplicate_content_identity");
  const titles = input.baselineNodes.map((node) => node.title?.trim()).filter(Boolean) as string[];
  if (new Set(titles).size !== titles.length) failures.push("duplicate_child_title");
  const artifactPaths = input.baselineNodes.map((node) => node.gameHtmlPath).filter(Boolean) as string[];
  const mechanics = input.baselineNodes.map((node) => node.mechanic).filter(Boolean) as string[];
  const engagementVariables = input.baselineNodes
    .map((node) => node.engagementVariable?.trim().toLowerCase())
    .filter(Boolean) as string[];
  if (engagementVariables.length !== 2 || new Set(engagementVariables).size !== 2) {
    failures.push("route_arms_must_vary_engagement_variable");
  }
  const academicSignatures = input.baselineNodes.map((node) => JSON.stringify({
    targets: [...(node.targets ?? [])].map((target) => target.trim().toLowerCase()).sort(),
    difficulty: node.difficulty ?? null,
  }));
  if (academicSignatures.length !== 2 || new Set(academicSignatures).size !== 1) {
    failures.push("route_arms_must_hold_academic_variables_constant");
  }
  if (input.baselineNodes.length > 1 && new Set(artifactPaths).size === 1 && new Set(mechanics).size === 1) {
    failures.push("shared_experiment_artifact");
  }
  for (const node of input.boardNodes) {
    if (node.kind === "start" || node.kind === "choice-gate") continue;
    if (!node.thumbnailUrl || !publicAssetExists(input.publicRoot, node.thumbnailUrl)) {
      failures.push(`${node.id}:artwork_missing_or_unresolved`);
    }
  }
  return {
    failures: [...new Set(failures)],
    launchableActivities: input.baselineNodes.filter((node) => Boolean(node.gameHtmlPath)).length,
    uniqueArtifacts: new Set(input.baselineNodes.map((node) => node.gameHtmlPath).filter(Boolean)).size,
  };
}
