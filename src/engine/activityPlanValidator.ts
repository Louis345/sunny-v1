import {
  getActivityToolContract,
  type ActivityPurpose,
  type ActivityToolContract,
  type LearnerState,
} from "./activityToolCatalog";

export type DomainEvidence = {
  practiceDomain?: string | null;
  contentDomain?: string | null;
  primarySkill?: string | null;
  confidence: number;
  source: string;
};

export type ActivityPlanNode = {
  id: string;
  toolId: string;
  purpose?: ActivityPurpose | string;
  writesMasteryEvidence?: boolean;
  emitsPerTargetResults?: boolean;
};

export type ActivityPlanValidationInput = {
  learnerState: LearnerState;
  domainEvidence: DomainEvidence;
  nodes: ActivityPlanNode[];
};

export type ActivityPlanFindingCode =
  | "missing_activity_contract"
  | "practice_only_tool_cannot_write_mastery"
  | "mastery_requires_per_target_results"
  | "high_confidence_science_starts_with_scaffolded_practice"
  | "low_confidence_domain_starts_with_scaffolded_practice"
  | "high_confidence_spelling_requires_independent_recall"
  | "domain_evidence_conflict";

export type ActivityPlanFinding = {
  code: ActivityPlanFindingCode;
  message: string;
  nodeId?: string;
  toolId?: string;
  recommendation?: string;
};

export type ActivityPlanValidationResult = {
  ok: boolean;
  blockers: ActivityPlanFinding[];
  warnings: ActivityPlanFinding[];
  info: ActivityPlanFinding[];
};

const HIGH_CONFIDENCE = 0.75;

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function safeContract(toolId: string): ActivityToolContract | null {
  try {
    return getActivityToolContract(toolId);
  } catch {
    return null;
  }
}

function wantsMastery(node: ActivityPlanNode): boolean {
  return node.writesMasteryEvidence === true;
}

function contractIsPracticeOnly(contract: ActivityToolContract): boolean {
  return contract.evidence.writesPracticeEvidence && !contract.evidence.writesMasteryEvidence;
}

function isScaffoldedPractice(contract: ActivityToolContract, node: ActivityPlanNode): boolean {
  const purpose = normalize(node.purpose);
  return contract.scaffolds.length > 0 &&
    (purpose === "practice" || contract.purposes.includes("practice"));
}

function isIndependentRecall(contract: ActivityToolContract): boolean {
  return contract.purposes.includes("independent-retrieval") && contract.evidence.writesMasteryEvidence;
}

function isEvaluatorOrTeachingStart(contract: ActivityToolContract): boolean {
  return (
    contract.purposes.includes("evaluate") ||
    contract.purposes.includes("teach") ||
    contract.evidence.writesMasteryEvidence
  );
}

function domainHasScienceSignals(evidence: DomainEvidence): boolean {
  return normalize(evidence.contentDomain) === "science" ||
    normalize(evidence.primarySkill).includes("reading_comprehension");
}

function domainHasSpellingSignals(evidence: DomainEvidence): boolean {
  return normalize(evidence.practiceDomain) === "spelling" ||
    normalize(evidence.contentDomain) === "spelling" ||
    normalize(evidence.primarySkill).includes("spell");
}

function hasDomainConflict(evidence: DomainEvidence): boolean {
  const practiceDomain = normalize(evidence.practiceDomain);
  const contentDomain = normalize(evidence.contentDomain);
  const primarySkill = normalize(evidence.primarySkill);
  const spelling = practiceDomain === "spelling" || contentDomain === "spelling" || primarySkill.includes("spell");
  const science = contentDomain === "science" || primarySkill.includes("reading_comprehension");
  return spelling && science;
}

function missingContractFinding(node: ActivityPlanNode): ActivityPlanFinding {
  return {
    code: "missing_activity_contract",
    message: `Activity node ${node.id} uses ${node.toolId}, but no Activity Tool Contract exists.`,
    nodeId: node.id,
    toolId: node.toolId,
    recommendation: "add-activity-tool-contract",
  };
}

export function validateActivityPlan(input: ActivityPlanValidationInput): ActivityPlanValidationResult {
  const blockers: ActivityPlanFinding[] = [];
  const warnings: ActivityPlanFinding[] = [];
  const info: ActivityPlanFinding[] = [];
  const firstNode = input.nodes[0] ?? null;
  const firstContract = firstNode ? safeContract(firstNode.toolId) : null;

  for (const node of input.nodes) {
    const contract = safeContract(node.toolId);
    if (!contract) {
      blockers.push(missingContractFinding(node));
      continue;
    }

    if (wantsMastery(node) && contractIsPracticeOnly(contract)) {
      blockers.push({
        code: "practice_only_tool_cannot_write_mastery",
        message: `${contract.label} is practice-only and cannot write mastery evidence.`,
        nodeId: node.id,
        toolId: node.toolId,
        recommendation: "record-practice-evidence-or-use-mastery-eligible-evaluator",
      });
    }

    if (wantsMastery(node) && contract.evidence.requiresPerTargetResult && node.emitsPerTargetResults !== true) {
      blockers.push({
        code: "mastery_requires_per_target_results",
        message: `${contract.label} is mastery-eligible only with per-target results.`,
        nodeId: node.id,
        toolId: node.toolId,
        recommendation: "emit-target-results-before-writing-mastery",
      });
    }
  }

  if (hasDomainConflict(input.domainEvidence)) {
    warnings.push({
      code: "domain_evidence_conflict",
      message: "Classifier/domain signals disagree, so Sunny should not treat the domain as certain.",
      recommendation: "confirm-domain-or-start-with-diagnostic",
    });
  }

  if (firstNode && firstContract && input.learnerState === "unknown") {
    const highConfidence = input.domainEvidence.confidence >= HIGH_CONFIDENCE;
    const startsWithScaffoldedPractice = isScaffoldedPractice(firstContract, firstNode);

    if (domainHasScienceSignals(input.domainEvidence) && startsWithScaffoldedPractice) {
      const finding: ActivityPlanFinding = {
        code: highConfidence
          ? "high_confidence_science_starts_with_scaffolded_practice"
          : "low_confidence_domain_starts_with_scaffolded_practice",
        message: highConfidence
          ? "High-confidence science/reading comprehension should not start with scaffolded vocabulary practice."
          : "Low-confidence domain evidence should start with a general diagnostic before scaffolded practice.",
        nodeId: firstNode.id,
        toolId: firstNode.toolId,
        recommendation: highConfidence ? "start-with-concept-check-or-visual-teaching" : "start-with-general-diagnostic",
      };
      if (highConfidence) blockers.push(finding);
      else warnings.push(finding);
    }

    if (
      highConfidence &&
      domainHasSpellingSignals(input.domainEvidence) &&
      startsWithScaffoldedPractice &&
      !isIndependentRecall(firstContract)
    ) {
      blockers.push({
        code: "high_confidence_spelling_requires_independent_recall",
        message: "High-confidence spelling homework should begin with hidden-word independent recall.",
        nodeId: firstNode.id,
        toolId: firstNode.toolId,
        recommendation: "start-with-spelling-recall",
      });
    }

    if (!highConfidence && !startsWithScaffoldedPractice && isEvaluatorOrTeachingStart(firstContract)) {
      info.push({
        code: "low_confidence_domain_starts_with_scaffolded_practice",
        message: "Low-confidence domain evidence is using a safer diagnostic/teaching start.",
        nodeId: firstNode.id,
        toolId: firstNode.toolId,
        recommendation: "continue-domain-discovery",
      });
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    info,
  };
}
