import { auditDecisionSideDoors } from "../engine/sideDoorAudit";

const report = auditDecisionSideDoors({
  rootDir: process.cwd(),
  write: true,
});

console.log("🎮 [first-principles-audit] [written]", report.outputDir);
console.log(
  `🎮 [first-principles-audit] [summary] blocked=${report.summary.blockedDecisionReaders} legacy=${report.summary.legacyAssignmentInterpreters} deterministic=${report.summary.deterministicEducationRules}`,
);
