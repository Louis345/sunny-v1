import fs from 'node:fs';
import path from 'node:path';
import { seedSpellingLab, writeSpellingPdfFixture, recordedSpellingDiagnostic } from './fixtures/spellingEvidenceFirst';
import { runSpellingDiscoveryIntake } from './ingestHomework';
import { openChart } from '../chart/db';
import type { SpellingProvider } from '../chart/spelling/journey';

/** Explicit synthetic setup for the parent's separate test installation, never a live-child fallback. */
export async function prepareMondayPractice(rootDir: string, chartDir: string): Promise<void> {
 if (fs.existsSync(path.join(rootDir,'children.config.json')) || fs.existsSync(path.join(rootDir,'src/context/practice')) || fs.existsSync(chartDir)) throw new Error('practice_setup_requires_fresh_directory');
 const words=['night','light','right','write','knife','climb'];
 seedSpellingLab(rootDir,words,'/companions/sample.vrm','practice');
 fs.writeFileSync(path.join(rootDir,'src/context/practice/soul.md'),'# Practice\nSynthetic practice profile for parent testing. Age 8, grade 3. Enjoys mysteries and word games. No real child history.\n');
 const source=writeSpellingPdfFixture(rootDir,words);
 const db=openChart('practice',{chartDir});
 const provider:SpellingProvider=async(stage,packet)=>{
  if(stage!=='prior') throw new Error('practice_setup_only_prior');
  const a=packet.assignment!.assignment!;
  return {tags:{assignmentId:a.assignmentId,taxonomyVersion:1,tags:words.map(word=>({word,patterns:['spelling.irregular']}))},priors:words.map(word=>({assignmentId:a.assignmentId,word,pCorrect:0.6,confidence:0.4,expectedError:'Synthetic setup fixture; not a live prediction'}))};
 };
 try {
  await runSpellingDiscoveryIntake({childId:'practice',sourceFile:source,rootDir},{chart:{db,provider},callPlannerModel:async packet=>({draft:{diagnostic:recordedSpellingDiagnostic(packet),title:'Practice spelling — test version',words:words.map(word=>({word,pageNumber:1})),uncertainty:[]}})});
  console.log(' 🎮 [practice-install] [prepared] child=practice answers=0 fixture-priors=true');
 } finally {db.close();}
}
if (require.main===module) prepareMondayPractice(process.cwd(),process.argv[2]).catch(error=>{console.error(' 🎮 [practice-install] [failed]',error);process.exitCode=1;});
