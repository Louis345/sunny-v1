/**
 * Worksheet session helpers — re-exports truth module.
 * Pure worksheet utilities that belong here (vs session-manager) can be moved incrementally.
 */

export {
  buildProblemTruth,
  buildSanitizedStorePool,
  buildTruthForCanonicalProblem,
  validateLogWorksheetAttempt,
  validateExtractionAmounts,
  detectWorksheetDomain,
  formatTrustedAmountsSummaryForLearningArc,
  COIN_WORKSHEET_MAX_CENTS,
  type WorksheetProblemTruth,
  type LogAttemptValidation,
  type WorksheetDomain,
  type AmountValidationResult,
} from "./worksheet-truth";
