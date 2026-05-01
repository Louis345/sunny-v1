import type { DomainClassifier, SingleAttemptErrorSignal } from "../../algorithms/types";

interface AttemptInput {
  target: string;
  attempt: string;
  domain: string;
}

export function extractErrorSignal(
  input: AttemptInput,
  classifiers: DomainClassifier[],
): SingleAttemptErrorSignal | null {
  const classifier = classifiers.find((c) => c.domain === input.domain);
  return classifier?.classify(input.target, input.attempt) ?? null;
}
