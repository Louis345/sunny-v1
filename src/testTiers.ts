import { configDefaults } from "vitest/config";

// Browser and full-flow files: about 29 of the server suite's 32 minutes.
// `npm test` skips them; `npm run test:predeploy` runs them before a Saori deploy;
// `npm run test:all` (CI) runs everything.
export const PREDEPLOY_TESTS = [
  "src/scripts/spellingBrowserAcceptance.test.ts",
  "src/scripts/spellingNextBoardAcceptance.test.ts",
  "src/engine/mathBrowserJourney.test.ts",
  "src/engine/adaptiveMathDiscovery.test.ts",
  "src/scripts/runAdaptiveMathGeneration.test.ts",
  "src/scripts/adaptiveMathBrowserAcceptance.test.ts",
  "src/engine/mathVisualRepairInvariant.test.ts",
  "src/engine/verifierOnlyResume.test.ts",
  "src/scripts/spellingPlannerReceipt.test.ts",
  "src/scripts/replayDiscoveryVerification.test.ts",
  "src/scripts/nativeSpellingConfigBrowser.test.ts",
  "src/scripts/mathIngestionAcceptance.test.ts",
  "src/engine/creatorPlaywrightManifest.test.ts",
  "src/scripts/engineeringLessonBrowserAcceptance.test.ts",
  "src/scripts/spellingMeasurementCorrection.test.ts",
  "src/engine/journeyCaptureTruth.test.ts",
  "src/scripts/spellingWorker.test.ts",
  "src/scripts/chartKioskAcceptance.test.ts",
] as const;

export type TestTier = "everyday" | "predeploy" | "all";

export function testSelection(tier: TestTier, include: string[]): { include: string[]; exclude: string[] } {
  if (tier === "predeploy") return { include: [...PREDEPLOY_TESTS], exclude: [...configDefaults.exclude] };
  if (tier === "all") return { include, exclude: [...configDefaults.exclude] };
  return { include, exclude: [...configDefaults.exclude, ...PREDEPLOY_TESTS] };
}

export function tierFromEnv(value = process.env.SUNNY_TEST_TIER): TestTier {
  return value === "predeploy" || value === "all" ? value : "everyday";
}
