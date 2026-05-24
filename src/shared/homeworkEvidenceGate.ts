import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import type { NodeConfig } from "./adventureTypes";

type HomeworkEvidenceGatePending = {
  homeworkId?: string | null;
  weekOf?: string | null;
  wordList?: string[];
  reinforceWords?: string[];
  contentProfile?: {
    practiceDomain?: string | null;
    contentDomain?: string | null;
    concepts?: string[];
  } | null;
  capturedContent?: {
    words?: string[];
    rawText?: string | null;
    questions?: unknown[];
    assignmentInterpretation?: {
      selectedTargets?: unknown[];
      heldTargets?: unknown[];
      wordGroups?: unknown[];
    } | null;
    wordGroups?: unknown[];
    contentProfile?: {
      practiceDomain?: string | null;
      contentDomain?: string | null;
      concepts?: string[];
    } | null;
  } | null;
};

export type HomeworkEvidenceGate = {
  homeworkId: string;
  domain: string;
  allowedTargetKeys: Set<string>;
};

export type HomeworkEvidenceGateReject = {
  target: string;
  reason: "not_in_active_homework" | "wrong_homework_cycle";
};

export type HomeworkEvidenceGateResult = {
  accepted: string[];
  rejected: HomeworkEvidenceGateReject[];
};

function key(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    const k = key(value);
    if (!value || seen.has(k)) continue;
    seen.add(k);
    out.push(value);
  }
  return out;
}

function domainForPending(pending: HomeworkEvidenceGatePending): string {
  const explicit = String(
    pending.contentProfile?.practiceDomain ??
      pending.capturedContent?.contentProfile?.practiceDomain ??
      pending.contentProfile?.contentDomain ??
      "",
  ).trim().toLowerCase();
  if (explicit) return explicit;
  const id = String(pending.homeworkId ?? pending.weekOf ?? "").toLowerCase();
  if (id.includes("spelling")) return "spelling";
  if (id.includes("reading")) return "reading";
  return "homework";
}

function readingEvidenceTargets(pending: HomeworkEvidenceGatePending): string[] {
  const questions = pending.capturedContent?.questions ?? [];
  return [
    ...(pending.wordList ?? []),
    ...(pending.capturedContent?.words ?? []),
    ...(pending.contentProfile?.concepts ?? []),
    ...(pending.capturedContent?.contentProfile?.concepts ?? []),
    ...questions.flatMap((question) => {
      if (!question || typeof question !== "object" || Array.isArray(question)) {
        return [];
      }
      const q = question as { question?: unknown; correctAnswer?: unknown };
      return [String(q.question ?? ""), String(q.correctAnswer ?? "")];
    }),
  ];
}

function wordsFromAssignmentGroups(groups: unknown[]): string[] {
  return groups.flatMap((group) => {
    if (!group || typeof group !== "object" || Array.isArray(group)) return [];
    const words = (group as { words?: unknown }).words;
    return Array.isArray(words) ? words.map((word) => String(word ?? "")) : [];
  });
}

function spellingEvidenceTargets(pending: HomeworkEvidenceGatePending): string[] {
  const interpretation = pending.capturedContent?.assignmentInterpretation;
  const groupedTargets = unique([
    ...wordsFromAssignmentGroups(Array.isArray(interpretation?.selectedTargets) ? interpretation.selectedTargets : []),
    ...wordsFromAssignmentGroups(Array.isArray(interpretation?.heldTargets) ? interpretation.heldTargets : []),
    ...wordsFromAssignmentGroups(Array.isArray(interpretation?.wordGroups) ? interpretation.wordGroups : []),
    ...wordsFromAssignmentGroups(Array.isArray(pending.capturedContent?.wordGroups) ? pending.capturedContent.wordGroups : []),
  ]);
  return groupedTargets.length > 0
    ? groupedTargets
    : [
        ...(pending.wordList ?? []),
        ...(pending.capturedContent?.words ?? []),
      ];
}

export function createHomeworkEvidenceGate(
  pending: HomeworkEvidenceGatePending | null | undefined,
): HomeworkEvidenceGate | null {
  if (!pending) return null;
  const homeworkId = String(pending.homeworkId ?? pending.weekOf ?? "").trim();
  if (!homeworkId) return null;
  const domain = domainForPending(pending);
  const targetSource =
    domain === "spelling"
      ? spellingEvidenceTargets(pending)
      : readingEvidenceTargets(pending);
  const allowedTargetKeys = new Set(unique(targetSource).map(key));
  if (allowedTargetKeys.size === 0) return null;
  return { homeworkId, domain, allowedTargetKeys };
}

export function filterHomeworkTargets(
  gate: HomeworkEvidenceGate | null,
  candidates: string[],
  opts: {
    logPrefix?: string;
    reason?: HomeworkEvidenceGateReject["reason"];
  } = {},
): HomeworkEvidenceGateResult {
  if (!gate) return { accepted: unique(candidates), rejected: [] };
  const accepted: string[] = [];
  const rejected: HomeworkEvidenceGateReject[] = [];
  for (const candidate of unique(candidates)) {
    if (gate.allowedTargetKeys.has(key(candidate))) {
      accepted.push(candidate);
      continue;
    }
    const reject = {
      target: candidate,
      reason: opts.reason ?? "not_in_active_homework",
    };
    rejected.push(reject);
    if (opts.logPrefix) {
      console.log(
        `${opts.logPrefix} [homework-scope] [rejected] domain=${gate.domain} target=${candidate} reason=${reject.reason} homeworkId=${gate.homeworkId}`,
      );
    }
  }
  return { accepted, rejected };
}

function sanitizeNodeTargets(gate: HomeworkEvidenceGate | null, node: NodeConfig): NodeConfig {
  if (!gate) return node;
  const next: NodeConfig = { ...node };
  if (Array.isArray(next.words) && next.words.length > 0) {
    if (next.type !== "karaoke") {
      next.words = filterHomeworkTargets(gate, next.words, { logPrefix: "  🎮" }).accepted;
    }
  }
  if (Array.isArray(next.wordRadarItems) && next.wordRadarItems.length > 0) {
    const accepted = filterHomeworkTargets(
      gate,
      next.wordRadarItems.map((item) => item.display),
      { logPrefix: "  🎮" },
    ).accepted;
    const acceptedKeys = new Set(accepted.map(key));
    next.wordRadarItems = next.wordRadarItems.filter((item) => acceptedKeys.has(key(item.display)));
  }
  if (Array.isArray(next.choiceOptions) && next.choiceOptions.length > 0) {
    next.choiceOptions = next.choiceOptions.filter((option) => {
      const target = option.label || option.activityId;
      const keep =
        option.activityKind === "dopamine_game" ||
        gate.allowedTargetKeys.has(key(target)) ||
        option.domain === gate.domain;
      if (!keep) {
        console.log(
          `  🎮 [homework-scope] [rejected] domain=${gate.domain} target=${target} reason=not_in_active_homework homeworkId=${gate.homeworkId}`,
        );
      }
      return keep;
    });
  }
  return next;
}

export function sanitizeActiveHomeworkPlanForLaunch(
  pending: HomeworkEvidenceGatePending | null | undefined,
  nodes: NodeConfig[],
): NodeConfig[] {
  const gate = createHomeworkEvidenceGate(pending);
  return nodes.map((node) => sanitizeNodeTargets(gate, node));
}

export function sanitizeActiveSessionPlanTargets(
  pending: HomeworkEvidenceGatePending | null | undefined,
  plan: ActiveSessionPlan,
): ActiveSessionPlan {
  const gate = createHomeworkEvidenceGate(pending);
  if (!gate) return plan;
  return {
    ...plan,
    nodePlan: plan.nodePlan.map((node) => ({
      ...node,
      targets: filterHomeworkTargets(gate, node.targets, { logPrefix: "  🎮" }).accepted,
    })),
  };
}
