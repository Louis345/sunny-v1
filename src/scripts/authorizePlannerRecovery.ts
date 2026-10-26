import "dotenv/config";
import {authorizeCanonicalPlannerRetry,replayCanonicalPlannerResponse} from "../engine/learningCycleRuntime";
import type {LearningCycleRepositoryOptions} from "../engine/learningCycleRepository";

function recoveryInput(args:string[],mode:'--approve-retry'|'--replay-received') {
  const value=(flag:string)=>args[args.indexOf(flag)+1];
  const flags=['--child','--homework','--blocked-decision','--reason'];
  if(!args.includes(mode)||flags.some(flag=>!args.includes(flag)||!value(flag)?.trim()||value(flag).startsWith('--'))
    ||args.length!==9||args.some((arg,index)=>index%2===0&&index<8&&!flags.includes(arg))||args[8]!==mode){
    throw Error(`Usage: npm run sunny:planner:authorize-recovery -- --child CHILD --homework HOMEWORK --blocked-decision ID --reason "Human approval reason" ${mode}`);
  }
  return {childId:value('--child'),homeworkId:value('--homework'),blockedDecisionId:value('--blocked-decision'),reason:value('--reason')};
}

export function authorizePlannerRecoveryFromArgs(args:string[],opts:LearningCycleRepositoryOptions={}) {
  return authorizeCanonicalPlannerRetry(recoveryInput(args,'--approve-retry'),opts);
}
export function replayPlannerRecoveryFromArgs(args:string[],opts:LearningCycleRepositoryOptions={}) {
  return replayCanonicalPlannerResponse(recoveryInput(args,'--replay-received'),opts);
}

if(require.main===module){
  void (async()=>{
    const args=process.argv.slice(2),replay=args.includes('--replay-received');
    const cycle=replay?await replayPlannerRecoveryFromArgs(args):authorizePlannerRecoveryFromArgs(args);
    console.log(replay
      ? ` 🎮 [canonical-progression] [recovery] [replayed] child=${cycle.childId} homework=${cycle.homeworkId} revision=${cycle.revision}. Zero provider calls; catalog recommendations remain explicitly pending.`
      : ` 🎮 [canonical-progression] [recovery] [queued] child=${cycle.childId} homework=${cycle.homeworkId} revision=${cycle.revision}. No provider called. The next normal startup can purchase this one authorized next-plan attempt.`);
  })().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
}
