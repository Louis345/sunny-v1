import {prepareProfileDraft} from '../chart/profileDraft';
if(require.main===module){
 try{
  const [childId,sourceFile]=process.argv.slice(2);
  if(!childId||!sourceFile)throw Error('usage: chartProfileDraft <child-id> <explicit-profile-json>; set SUNNY_CHART_DIR');
  prepareProfileDraft(sourceFile,childId,{env:process.env});
  console.log('Profile draft prepared. Review and confirm it in the kiosk parent screen; no chart facts were written.');
 }catch(error){console.error(' 🎮 [profile-draft] [prepare] [failed]',error instanceof Error?error.message:String(error));process.exitCode=1;}
}
