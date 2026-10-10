import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {it,expect} from "vitest";
import {authoredJourney} from "../scripts/fixtures/authoredJourney";
import {verifyAuthoredBoardCanvas} from "./adventureBoardCanvas";

// The old lab hand-copied board markup and inferred slots. It could pass while
// the real child-facing renderer overlapped controls. Exercise the real renderer.
it("renders both authored shared-activity branches clearly at every release viewport",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"sunny-authored-fork-layout-"));
 try {
  const definition=authoredJourney();
  definition.portals.forEach(portal=>{portal.label=({start:"Start",choose:"Choose your path","learn-a":"Learn first","play-a":"Then play","play-b":"Play first","learn-b":"Then learn",check:"Final check",end:"Adventure complete"} as Record<string,string>)[portal.id];});
  const snapshot=structuredClone(definition);
  const proof=await verifyAuthoredBoardCanvas({definition,directory,rootDir:process.cwd()});
  expect(proof.viewports).toEqual(["1280x720","768x1024","1470x956"]);
  expect(proof.screenshots).toHaveLength(3);
  expect(definition).toEqual(snapshot);
 }finally{rmSync(directory,{recursive:true,force:true});}
},20000);
