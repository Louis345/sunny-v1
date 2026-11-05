import {expect,it} from 'vitest';
import {createStarterCompanionCarePlan,grantBossDrop} from './companionCareEngine';

// Owner, 2026-11-05: beating the Boss drops loot (the approved unlock-ceremony tiers, 60/25/12/3).
// The drop is a reward after the learning, never a reason for it; it is rolled once per Boss and saved,
// so a refresh or a replay shows the same card and never pays twice.
const plan=()=>createStarterCompanionCarePlan({childId:'demo-pashley',companionId:'elli',nowIso:'2026-11-05T12:00:00.000Z'} as never);
const at='2026-11-05T18:00:00.000Z';

it('rolls the approved tiers and pays their coins once per Boss',()=>{
 for(const [roll,tier] of [[0,'common'],[0.59,'common'],[0.6,'rare'],[0.85,'epic'],[0.97,'legendary']] as const){
  const first=grantBossDrop(plan(),{homeworkId:'hw',bossNodeId:'hw:b9:boss',nowIso:at,roll:()=>roll});
  expect(first.drop.tier).toBe(tier);
  expect(first.granted).toBe(true);
  expect(first.plan.economy.coins).toBe(plan().economy.coins+first.drop.coins);
 }
});

it('shows the same drop again and never pays twice for one Boss',()=>{
 const first=grantBossDrop(plan(),{homeworkId:'hw',bossNodeId:'hw:b9:boss',nowIso:at,roll:()=>0.99});
 const again=grantBossDrop(first.plan,{homeworkId:'hw',bossNodeId:'hw:b9:boss',nowIso:'2026-11-05T19:00:00.000Z',roll:()=>0});
 expect(again.granted).toBe(false);
 expect(again.drop).toEqual(first.drop);
 expect(again.plan.economy.coins).toBe(first.plan.economy.coins);
});
