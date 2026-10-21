import "dotenv/config";
import {authorizeCanonicalPlannerRetry} from "../engine/learningCycleRuntime";
import type {LearningCycleRepositoryOptions} from "../engine/learningCycleRepository";

export function authorizePlannerRecoveryFromArgs(args: string[], opts: LearningCycleRepositoryOptions = {}) {
  const value = (flag: string) => args[args.indexOf(flag)+1];
  const flags = ['--child','--homework','--blocked-decision','--reason'];
  if (!args.includes('--approve-retry') || flags.some(flag=>!args.includes(flag) || !value(flag)?.trim() || value(flag).startsWith('--'))
    || args.length!==9 || args.some((arg,index)=>index%2===0 && index<8 && !flags.includes(arg)) || args[8]!=='--approve-retry') {
    throw Error('Usage: npm run sunny:planner:authorize-recovery -- --child CHILD --homework HOMEWORK --blocked-decision ID --reason "Human approval reason" --approve-retry');
  }
  return authorizeCanonicalPlannerRetry({childId:value('--child'),homeworkId:value('--homework'),blockedDecisionId:value('--blocked-decision'),reason:value('--reason')},opts);
}

if (require.main === module) {
  try {
    const cycle=authorizePlannerRecoveryFromArgs(process.argv.slice(2));
    console.log(` 🎮 [canonical-progression] [recovery] [queued] child=${cycle.childId} homework=${cycle.homeworkId} revision=${cycle.revision}. No provider called. The next normal startup can purchase this one authorized next-plan attempt.`);
  } catch (error) {
    console.error(error instanceof Error?error.message:String(error));
    process.exitCode=1;
  }
}
