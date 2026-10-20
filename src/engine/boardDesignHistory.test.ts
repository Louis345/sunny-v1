import {describe,it,expect,vi,afterEach} from "vitest";
import fs from "node:fs";import os from "node:os";import path from "node:path";
import {authoredJourney} from "../scripts/fixtures/authoredJourney";
vi.mock("./learningCycleRepository",async original=>({...await original<typeof import("./learningCycleRepository")>(),
  getLearningCycle:vi.fn((_child:string,homeworkId:string)=>({homeworkId,boards:[{publishedAt:homeworkId==="hw-new"?"2026-10-18T20:00:00Z":"2026-10-12T20:00:00Z",definition:{...authoredJourney(),pattern:homeworkId==="hw-new"?"octagon ring":"mountain climb"}}]})),
}));
import {readBoardDesignHistory} from "./longitudinalLearning";

// The map artist is told the designs of her earlier boards so each map can be new (human review
// 2026-10-19). Law 12: that history comes through the child chart from canonical cycles.
const roots:string[]=[];
afterEach(()=>roots.splice(0).forEach(root=>fs.rmSync(root,{recursive:true,force:true})));
describe("board design history for the map artist",()=>{
  it("reads the named designs of her published boards from canonical cycles, newest first",()=>{
    const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),"sunny-design-history-"));roots.push(rootDir);
    const cycles=path.join(rootDir,"src","context","lab","homework","cycles");fs.mkdirSync(cycles,{recursive:true});
    for(const id of ["hw-old","hw-new"])fs.writeFileSync(path.join(cycles,`${id}.json`),"{}");
    expect(readBoardDesignHistory("lab",{rootDir}).map(row=>row.pattern)).toEqual(["octagon ring","mountain climb"]);
  });
});
