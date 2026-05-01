import type { DomainClassifier } from "../../algorithms/types";
import { spellingDomainClassifier } from "../../algorithms/spellingErrorClassifiers";

export const defaultDomainClassifiers: DomainClassifier[] = [
  spellingDomainClassifier,
];
